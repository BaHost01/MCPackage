/**
 * Project linting: structural checks on packs, JSON syntax, manifests,
 * identifiers, texture references, script entry points and more.
 *
 * Produces a list of diagnostics `{ level, file, message, rule }` where
 * `level` is `error` | `warning` | `info`. Rules are deliberately practical –
 * they target the mistakes that actually make Minecraft reject a pack or
 * silently ignore content.
 */
import fsp from 'node:fs/promises';
import path from 'node:path';
import { IDENTIFIER_RE, JUNK_PATTERNS, BEHAVIOR_FOLDERS, RESOURCE_FOLDERS, CONTENT_FORMAT_VERSION } from './bedrock.js';
import { JsonParseError } from './errors.js';
import { createMatcher, exists, parseJson, walk } from './fs.js';
import { validateManifest } from './manifest.js';
import { compareVersions, parseVersion } from './semver.js';

const JSON_EXT = /\.json$/i;
const IMAGE_EXT = /\.(png|jpg|jpeg|tga)$/i;
const MAX_TEXTURE_SIZE = 4096;

/**
 * @typedef {{ level: 'error'|'warning'|'info', file: string, message: string, rule: string }} Diagnostic
 */

export class LintResult {
  constructor() {
    /** @type {Diagnostic[]} */
    this.diagnostics = [];
    this.filesChecked = 0;
  }

  add(level, file, message, rule) {
    this.diagnostics.push({ level, file, message, rule });
  }

  error(file, message, rule) {
    this.add('error', file, message, rule);
  }

  warning(file, message, rule) {
    this.add('warning', file, message, rule);
  }

  info(file, message, rule) {
    this.add('info', file, message, rule);
  }

  get errors() {
    return this.diagnostics.filter((d) => d.level === 'error');
  }

  get warnings() {
    return this.diagnostics.filter((d) => d.level === 'warning');
  }

  get ok() {
    return this.errors.length === 0;
  }
}

/**
 * Lints the whole project.
 * @param {import('./project.js').Project} project
 * @param {{ strict?: boolean }} [options] treat warnings as errors
 */
export async function lintProject(project, { strict = false } = {}) {
  const result = new LintResult();
  const packs = await project.existingPacks();
  const isJunk = createMatcher(JUNK_PATTERNS);

  if (packs.length === 0) {
    result.error(
      project.relative(project.configFile),
      `no pack folders found (expected ${project.packs.map((p) => p.relDir).join(' or ')})`,
      'project/no-packs',
    );
    return finalize(result, strict);
  }

  const identifiers = new Map(); // identifier -> file (for duplicate detection)
  const manifests = new Map();
  const context = { project, result, identifiers, isJunk, manifests };

  for (const pack of packs) {
    await lintPack(pack, context);
  }
  crossPackChecks(packs, context);
  return finalize(result, strict);
}

function finalize(result, strict) {
  if (strict) {
    for (const d of result.diagnostics) if (d.level === 'warning') d.level = 'error';
  }
  // Stable ordering: errors first, then by file.
  const rank = { error: 0, warning: 1, info: 2 };
  result.diagnostics.sort((a, b) => rank[a.level] - rank[b.level] || a.file.localeCompare(b.file));
  return result;
}

async function lintPack(pack, context) {
  const { project, result, isJunk } = context;
  const rel = (file) => `${pack.relDir}/${file}`;

  // Manifest.
  const manifest = await safeRead(pack.manifestFile, rel('manifest.json'), result);
  if (manifest === undefined) {
    result.error(rel('manifest.json'), 'manifest.json is missing — run `mcpackage manifest` to generate it', 'manifest/missing');
  } else if (manifest !== null) {
    context.manifests.set(pack.kind, manifest);
    const { errors, warnings } = validateManifest(manifest, { kind: pack.kind, packDir: pack.dir });
    for (const message of errors) result.error(rel('manifest.json'), message, 'manifest/invalid');
    for (const message of warnings) result.warning(rel('manifest.json'), message, 'manifest/suspicious');
    const configVersion = parseVersion(project.config.version);
    if (configVersion && manifest.header && compareVersions(manifest.header.version, configVersion) !== 0) {
      result.warning(
        rel('manifest.json'),
        `header.version ${JSON.stringify(manifest.header.version)} differs from project version ${project.config.version} — run \`mcpackage manifest\` to sync`,
        'manifest/out-of-sync',
      );
    }
  }

  // Pack icon.
  if (!(await exists(path.join(pack.dir, 'pack_icon.png')))) {
    result.warning(rel('pack_icon.png'), 'no pack_icon.png — the pack will show a default icon in-game', 'pack/no-icon');
  }

  // Walk files.
  const files = await walk(pack.dir);
  const knownFolders = pack.kind === 'behavior' ? BEHAVIOR_FOLDERS : pack.kind === 'resource' ? RESOURCE_FOLDERS : {};
  const topLevelSeen = new Set();
  const textureFiles = new Set();
  const langKeys = new Map();

  for (const file of files) {
    result.filesChecked += 1;
    const abs = path.join(pack.dir, file);
    const display = rel(file);

    if (isJunk(file)) {
      result.warning(display, 'junk file will be excluded from builds — consider deleting it', 'pack/junk-file');
      continue;
    }
    if (/[A-Z ]/.test(file) && !file.startsWith('texts/')) {
      // Case sensitivity: Bedrock on Android/iOS is case-sensitive, Windows isn't.
      if (/[A-Z]/.test(path.basename(file)) && !/\.(md|txt)$/i.test(file) && file !== 'README.md') {
        result.info(display, 'file name contains uppercase letters; keep paths lowercase to avoid case-sensitivity bugs on mobile', 'pack/uppercase-path');
      }
      if (/ /.test(file)) result.warning(display, 'file path contains spaces, which some devices fail to load', 'pack/space-in-path');
    }

    const top = file.split('/')[0];
    if (file.includes('/')) topLevelSeen.add(top);

    if (IMAGE_EXT.test(file)) {
      if (pack.kind === 'resource' && file.startsWith('textures/')) textureFiles.add(file.replace(/\.[^.]+$/, ''));
      if (/\.png$/i.test(file)) await checkPng(abs, display, result);
      continue;
    }
    if (/\.lang$/i.test(file)) {
      await checkLang(abs, display, result, langKeys);
      continue;
    }
    if (!JSON_EXT.test(file)) continue;

    const data = await safeRead(abs, display, result);
    if (data === null || data === undefined) continue;
    await checkJsonFile({ pack, file, display, data, context, knownFolders });
  }

  for (const folder of topLevelSeen) {
    if (Object.keys(knownFolders).length && !knownFolders[folder] && !['texts', 'subpacks'].includes(folder)) {
      result.info(rel(folder), `"${folder}/" is not a folder Minecraft reads from ${pack.label.toLowerCase()}s — files inside are ignored by the game`, 'pack/unknown-folder');
    }
  }

  if (pack.kind === 'resource') {
    await checkTextureAtlases(pack, textureFiles, context, rel);
  }
  if (pack.kind === 'behavior') {
    await checkScripts(pack, manifest, context, rel);
  }
}

async function safeRead(abs, display, result) {
  let text;
  try {
    text = await fsp.readFile(abs, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return undefined;
    throw err;
  }
  try {
    return parseJson(text, display);
  } catch (err) {
    if (err instanceof JsonParseError) {
      result.error(display, `invalid JSON${err.line ? ` at line ${err.line}, column ${err.column}` : ''}: ${err.detail}`, 'json/syntax');
      return null;
    }
    throw err;
  }
}

async function checkJsonFile({ pack, file, display, data, context, knownFolders }) {
  const { result, identifiers } = context;
  if (file === 'manifest.json') return;
  if (!data || typeof data !== 'object') {
    result.error(display, 'top-level value must be an object', 'json/not-object');
    return;
  }

  const root = file.split('/')[0];
  if (!file.includes('/')) {
    // Root-level files in RP: blocks.json, sounds.json, biomes_client.json, etc.
    if (pack.kind === 'resource' && !['blocks.json', 'sounds.json', 'biomes_client.json', 'sound_definitions.json', 'splashes.json', 'loading_messages.json', 'contents.json', 'textures_list.json'].includes(file)) {
      result.info(display, 'unexpected JSON file at the pack root', 'pack/unexpected-root-file');
    }
    if (pack.kind === 'behavior' && !['contents.json'].includes(file)) {
      result.info(display, 'unexpected JSON file at the pack root', 'pack/unexpected-root-file');
    }
    return;
  }

  // format_version presence for content that requires it.
  const needsFormatVersion = ['entities', 'items', 'blocks', 'recipes', 'spawn_rules', 'animations', 'animation_controllers', 'render_controllers', 'entity', 'attachables', 'particles', 'features', 'feature_rules', 'biomes', 'models', 'fogs', 'cameras'];
  if (needsFormatVersion.includes(root) && data.format_version === undefined && !file.startsWith('models/')) {
    result.error(display, 'missing "format_version"', 'content/no-format-version');
  }

  // Identifier checks for definition files.
  const definitionKeys = {
    entities: 'minecraft:entity',
    items: 'minecraft:item',
    blocks: 'minecraft:block',
    spawn_rules: 'minecraft:spawn_rules',
    entity: 'minecraft:client_entity',
    attachables: 'minecraft:attachable',
    features: null,
    feature_rules: 'minecraft:feature_rules',
    biomes: 'minecraft:biome',
    recipes: null,
  };
  if (root in definitionKeys) {
    const key = definitionKeys[root] ?? Object.keys(data).find((k) => k.startsWith('minecraft:') && k !== 'format_version');
    const body = key ? data[key] : null;
    if (!body || typeof body !== 'object') {
      if (key) result.error(display, `expected a "${key}" object`, 'content/missing-definition');
      return;
    }
    const identifier = body.description?.identifier;
    if (identifier === undefined) {
      result.error(display, 'missing "description.identifier"', 'content/no-identifier');
    } else if (typeof identifier !== 'string' || !IDENTIFIER_RE.test(identifier)) {
      result.error(display, `identifier "${identifier}" must look like "namespace:name" (lowercase letters, digits, _ . -)`, 'content/bad-identifier');
    } else {
      const namespace = identifier.split(':')[0];
      if (namespace === 'minecraft' && !['entity', 'attachables', 'entities'].includes(root)) {
        result.warning(display, `identifier "${identifier}" uses the vanilla "minecraft" namespace; custom content cannot override vanilla definitions`, 'content/vanilla-namespace');
      } else if (namespace !== context.project.config.namespace && namespace !== 'minecraft') {
        result.info(display, `identifier namespace "${namespace}" differs from project namespace "${context.project.config.namespace}"`, 'content/foreign-namespace');
      }
      // Duplicates within the same category (BP entity vs RP client entity are different categories).
      const dupKey = `${root}:${identifier}`;
      if (identifiers.has(dupKey)) {
        result.error(display, `duplicate identifier "${identifier}" (also defined in ${identifiers.get(dupKey)})`, 'content/duplicate-identifier');
      } else {
        identifiers.set(dupKey, display);
      }
    }
    if (['entities', 'items', 'blocks'].includes(root)) {
      if (body.components === undefined) {
        result.warning(display, '"components" is missing (must be present even if empty)', 'content/no-components');
      }
      const fv = data.format_version;
      if (typeof fv === 'string' && parseVersion(fv) && compareVersions(fv, '1.16.0') < 0 && root !== 'entities') {
        result.warning(display, `format_version ${fv} is very old for ${root}; current is ${CONTENT_FORMAT_VERSION}`, 'content/old-format-version');
      }
    }
    if (root === 'items' && body.components?.['minecraft:icon'] !== undefined) {
      const icon = body.components['minecraft:icon'];
      const shortName = typeof icon === 'string' ? icon : icon?.texture ?? icon?.textures?.default;
      if (typeof shortName === 'string') context.itemIcons = (context.itemIcons ?? new Map()).set(shortName, display);
    }
    if (root === 'blocks' && body.components?.['minecraft:material_instances']) {
      for (const instance of Object.values(body.components['minecraft:material_instances'])) {
        const texture = typeof instance === 'string' ? instance : instance?.texture;
        if (typeof texture === 'string') context.blockTextures = (context.blockTextures ?? new Map()).set(texture, display);
      }
    }
  }

  if (root === 'loot_tables' && !Array.isArray(data.pools)) {
    result.warning(display, 'loot table has no "pools" array', 'content/loot-no-pools');
  }
  if (root === 'texts' && file.endsWith('languages.json') && !Array.isArray(data)) {
    result.error(display, 'languages.json must be an array of language codes', 'content/languages-json');
  }
  if (root === 'entity' && pack.kind === 'resource') {
    const description = data['minecraft:client_entity']?.description;
    if (description && !description.render_controllers && !description.scripts) {
      result.warning(display, 'client entity has no render_controllers — it will be invisible', 'content/no-render-controllers');
    }
    if (description?.textures) {
      for (const texture of Object.values(description.textures)) {
        if (typeof texture === 'string') context.entityTextures = (context.entityTextures ?? new Map()).set(texture, display);
      }
    }
  }
  void knownFolders;
}

async function checkPng(abs, display, result) {
  let handle;
  try {
    handle = await fsp.open(abs, 'r');
    const header = Buffer.alloc(24);
    const { bytesRead } = await handle.read(header, 0, 24, 0);
    if (bytesRead < 24 || header.readUInt32BE(0) !== 0x89504e47) {
      result.error(display, 'file is not a valid PNG', 'texture/invalid-png');
      return;
    }
    const width = header.readUInt32BE(16);
    const height = header.readUInt32BE(20);
    if (width > MAX_TEXTURE_SIZE || height > MAX_TEXTURE_SIZE) {
      result.warning(display, `texture is ${width}×${height}; textures above ${MAX_TEXTURE_SIZE}px fail on many devices`, 'texture/too-large');
    }
    if (display.endsWith('pack_icon.png') && width !== height) {
      result.warning(display, `pack_icon.png should be square (got ${width}×${height})`, 'texture/icon-not-square');
    }
  } finally {
    await handle?.close();
  }
}

async function checkLang(abs, display, result, langKeys) {
  const text = await fsp.readFile(abs, 'utf8');
  const seen = new Set();
  text.split(/\r?\n/).forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) return;
    const eq = trimmed.indexOf('=');
    if (eq === -1) {
      result.warning(`${display}:${index + 1}`, `line has no "=" — expected key=value`, 'lang/syntax');
      return;
    }
    const key = trimmed.slice(0, eq).trim();
    if (seen.has(key)) result.warning(`${display}:${index + 1}`, `duplicate translation key "${key}"`, 'lang/duplicate-key');
    seen.add(key);
  });
  langKeys.set(display, seen);
  const dir = path.dirname(abs);
  const languagesJson = path.join(dir, 'languages.json');
  if (!(await exists(languagesJson))) {
    result.warning(`${path.dirname(display)}/languages.json`, 'texts/languages.json is missing — translations may not load', 'lang/no-languages-json');
  }
}

async function checkTextureAtlases(pack, textureFiles, context, rel) {
  const { result } = context;
  const atlases = [
    ['textures/item_texture.json', context.itemIcons],
    ['textures/terrain_texture.json', context.blockTextures],
  ];
  for (const [atlasFile, references] of atlases) {
    const abs = path.join(pack.dir, atlasFile);
    const atlas = await safeRead(abs, rel(atlasFile), result);
    const shortNames = new Set();
    if (atlas && typeof atlas === 'object') {
      const data = atlas.texture_data;
      if (!data || typeof data !== 'object') {
        result.error(rel(atlasFile), 'missing "texture_data" object', 'texture/atlas-no-data');
      } else {
        for (const [shortName, entry] of Object.entries(data)) {
          shortNames.add(shortName);
          const paths = [];
          const value = entry?.textures;
          if (typeof value === 'string') paths.push(value);
          else if (Array.isArray(value)) for (const v of value) paths.push(typeof v === 'string' ? v : v?.path);
          else if (value && typeof value === 'object' && typeof value.path === 'string') paths.push(value.path);
          for (const texturePath of paths) {
            if (typeof texturePath !== 'string') continue;
            // Atlas paths are relative to the pack root and usually omit the extension.
            const known = textureFiles.has(texturePath.replace(/\.[^./]+$/, ''));
            if (!known && !(await textureExists(pack.dir, texturePath))) {
              result.warning(rel(atlasFile), `"${shortName}" points to "${texturePath}" but no such texture exists in this pack`, 'texture/missing-file');
            }
          }
        }
      }
    }
    if (references) {
      for (const [shortName, definedIn] of references) {
        if (shortName.includes('/') || shortName.startsWith('textures/')) continue; // direct path, not a short name
        if (!atlas) {
          if (!shortName.startsWith('minecraft:')) {
            result.warning(definedIn, `texture "${shortName}" is referenced but ${atlasFile} does not exist in the resource pack`, 'texture/no-atlas');
          }
        } else if (!shortNames.has(shortName) && !shortName.startsWith('minecraft:')) {
          result.warning(definedIn, `texture short name "${shortName}" is not defined in ${atlasFile}`, 'texture/undefined-shortname');
        }
      }
    }
  }
  if (context.entityTextures) {
    for (const [texturePath, definedIn] of context.entityTextures) {
      if (texturePath.startsWith('textures/') && !(await textureExists(pack.dir, texturePath))) {
        result.warning(definedIn, `entity texture "${texturePath}" does not exist in this pack (vanilla textures are fine)`, 'texture/missing-file');
      }
    }
  }
}

async function textureExists(packDir, texturePath) {
  const base = path.join(packDir, texturePath);
  if (/\.(png|jpg|jpeg|tga)$/i.test(texturePath)) return exists(base);
  for (const ext of ['.png', '.jpg', '.jpeg', '.tga']) {
    if (await exists(base + ext)) return true;
  }
  return false;
}

async function checkScripts(pack, manifest, context, rel) {
  const { result } = context;
  const scriptsDir = path.join(pack.dir, 'scripts');
  const hasScriptsFolder = await exists(scriptsDir);
  const scriptModule = Array.isArray(manifest?.modules) ? manifest.modules.find((m) => m?.type === 'script') : null;
  if (hasScriptsFolder && !scriptModule) {
    const files = await walk(scriptsDir);
    if (files.some((f) => f.endsWith('.js'))) {
      result.warning(rel('scripts'), 'scripts/ contains JavaScript but the manifest has no "script" module — scripts will not run', 'script/no-module');
    }
  }
  if (scriptModule?.entry) {
    const entry = path.join(pack.dir, scriptModule.entry);
    if (await exists(entry)) {
      const source = await fsp.readFile(entry, 'utf8');
      if (/^\s*(const|let|var)\s+.*=\s*require\(/m.test(source)) {
        result.error(rel(scriptModule.entry), 'uses require(); Bedrock scripts must use ES module import syntax', 'script/require');
      }
      if (/\bfrom\s+['"]mojang-minecraft['"]/.test(source) || /\bfrom\s+['"]mojang-minecraft-ui['"]/.test(source)) {
        result.error(rel(scriptModule.entry), 'imports the removed "mojang-minecraft" module — use "@minecraft/server" instead', 'script/legacy-module');
      }
      if (/\bfrom\s+['"]@minecraft\/server-gametest['"]/.test(source) && !(manifest.dependencies ?? []).some((d) => d?.module_name === '@minecraft/server-gametest')) {
        result.warning(rel(scriptModule.entry), 'imports @minecraft/server-gametest but the manifest does not declare it as a dependency', 'script/undeclared-dependency');
      }
      if (/\bfrom\s+['"]@minecraft\/server-ui['"]/.test(source) && !(manifest.dependencies ?? []).some((d) => d?.module_name === '@minecraft/server-ui')) {
        result.warning(rel(scriptModule.entry), 'imports @minecraft/server-ui but the manifest does not declare it as a dependency', 'script/undeclared-dependency');
      }
    }
  }
}

function crossPackChecks(packs, context) {
  const { result, manifests, project } = context;
  const bp = manifests.get('behavior');
  const rp = manifests.get('resource');
  if (bp && rp && project.config.build.linkPacks !== false) {
    const bpDependsOnRp = (bp.dependencies ?? []).some((d) => d?.uuid === rp.header?.uuid);
    if (!bpDependsOnRp) {
      result.info(
        `${project.pack('behavior').relDir}/manifest.json`,
        'behavior pack does not depend on the resource pack; players can enable one without the other (run `mcpackage manifest` to link them)',
        'manifest/unlinked-packs',
      );
    }
  }
  // Same UUID in two packs = Minecraft treats them as the same pack.
  const seen = new Map();
  for (const [kind, manifest] of manifests) {
    const id = manifest?.header?.uuid;
    if (!id) continue;
    if (seen.has(id)) {
      result.error(`${project.pack(kind).relDir}/manifest.json`, `header.uuid is identical to the ${seen.get(id)} pack's UUID — every pack needs its own`, 'manifest/shared-uuid');
    }
    seen.set(id, kind);
  }
  void packs;
}

/** Convenience for callers that just want counts. */
export function summarize(result) {
  return {
    errors: result.errors.length,
    warnings: result.warnings.length,
    infos: result.diagnostics.filter((d) => d.level === 'info').length,
    files: result.filesChecked,
  };
}
