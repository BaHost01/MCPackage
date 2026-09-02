/**
 * manifest.json generation, syncing and validation.
 */
import fs from 'node:fs';
import path from 'node:path';
import { PACK_TYPES, SCRIPT_MODULES, CAPABILITIES, LATEST_ENGINE_VERSION } from './bedrock.js';
import { exists, readJson, writeJson } from './fs.js';
import { compareVersions, formatVersion, isVersionArray, parseVersion } from './semver.js';
import { isUuid, uuid } from './uuid.js';
import { NAME as GENERATOR, VERSION as GENERATOR_VERSION } from './meta.js';

/**
 * Builds a complete manifest for a pack from project config, preserving the
 * identity (UUIDs) and any extra data of an existing manifest.
 *
 * @param {object} config        normalized project config
 * @param {string} kind          'behavior' | 'resource' | 'skin'
 * @param {object|null} existing existing manifest to preserve UUIDs/extras from
 * @param {{ pairWith?: object|null }} [options]  manifest of the sibling pack (for dependencies)
 */
export function buildManifest(config, kind, existing = null, { pairWith = null } = {}) {
  const type = PACK_TYPES[kind];
  if (!type) throw new Error(`Unknown pack kind "${kind}"`);
  const version = parseVersion(config.version) ?? [1, 0, 0];
  const engine = parseVersion(config.minEngineVersion) ?? parseVersion(LATEST_ENGINE_VERSION);

  const existingHeader = existing?.header ?? {};
  const existingModules = Array.isArray(existing?.modules) ? existing.modules : [];
  const mainModule = existingModules.find((m) => m?.type === type.moduleType);
  const scriptModule = existingModules.find((m) => m?.type === 'script');

  const manifest = {
    format_version: 2,
    header: {
      name: `${config.name} ${type.suffix}`,
      description: config.description || existingHeader.description || '',
      uuid: isUuid(existingHeader.uuid) ? existingHeader.uuid : uuid(),
      version,
      min_engine_version: engine,
    },
    modules: [
      {
        type: type.moduleType,
        uuid: isUuid(mainModule?.uuid) ? mainModule.uuid : uuid(),
        version,
      },
    ],
  };

  // Preserve pack-scoped extras that mcpackage doesn't manage.
  for (const key of ['pack_scope', 'lock_template_options', 'base_game_version', 'allow_random_seed', 'platform_locked']) {
    if (existingHeader[key] !== undefined) manifest.header[key] = existingHeader[key];
  }

  // Scripts (behavior packs only).
  if (kind === 'behavior' && config.scripts) {
    manifest.modules.push({
      type: 'script',
      language: 'javascript',
      uuid: isUuid(scriptModule?.uuid) ? scriptModule.uuid : uuid(),
      version,
      entry: config.scripts.entry,
    });
  }

  // Preserve any modules of other types we don't manage (e.g. world_template).
  for (const module of existingModules) {
    if (!module || module.type === type.moduleType || module.type === 'script') continue;
    manifest.modules.push(module);
  }

  // Dependencies: script modules + the paired pack + anything user-declared.
  const dependencies = [];
  if (kind === 'behavior' && config.scripts) {
    const modules = { '@minecraft/server': SCRIPT_MODULES['@minecraft/server'].stable, ...config.scripts.modules };
    for (const [moduleName, moduleVersion] of Object.entries(modules)) {
      if (moduleVersion === false || moduleVersion == null) continue;
      dependencies.push({ module_name: moduleName, version: String(moduleVersion) });
    }
  }
  if (pairWith?.header?.uuid && isUuid(pairWith.header.uuid)) {
    dependencies.push({ uuid: pairWith.header.uuid, version: parseVersion(pairWith.header.version) ?? version });
  }
  for (const dep of config.dependencies) {
    if (dep && typeof dep === 'object') dependencies.push(dep);
  }
  // Keep user-added dependencies that already live in the manifest but aren't ours.
  if (Array.isArray(existing?.dependencies)) {
    for (const dep of existing.dependencies) {
      if (!dep || typeof dep !== 'object') continue;
      const known = dependencies.some(
        (d) => (d.module_name && d.module_name === dep.module_name) || (d.uuid && d.uuid === dep.uuid),
      );
      const isManagedModule = dep.module_name && dep.module_name.startsWith('@minecraft/');
      const isPairUuid = pairWith?.header?.uuid && dep.uuid === pairWith.header.uuid;
      if (!known && !isManagedModule && !isPairUuid) dependencies.push(dep);
    }
  }
  if (dependencies.length) manifest.dependencies = dependencies;

  // Capabilities.
  const capabilities = new Set([
    ...(Array.isArray(existing?.capabilities) ? existing.capabilities : []),
    ...config.capabilities,
  ]);
  if (capabilities.size) manifest.capabilities = [...capabilities];

  // Metadata.
  const metadata = { ...(existing?.metadata ?? {}) };
  if (config.authors.length) metadata.authors = config.authors;
  if (config.license) metadata.license = config.license;
  if (config.url) metadata.url = config.url;
  const generatedWith = metadata.generated_with && typeof metadata.generated_with === 'object' && !Array.isArray(metadata.generated_with) ? metadata.generated_with : {};
  metadata.generated_with = { ...generatedWith, [GENERATOR]: [GENERATOR_VERSION] };
  manifest.metadata = metadata;

  // Subpacks and other top-level fields are preserved verbatim.
  for (const key of ['subpacks', 'settings']) {
    if (existing?.[key] !== undefined) manifest[key] = existing[key];
  }

  return manifest;
}

/** Reads a manifest, returning null when absent. */
export async function readManifest(manifestFile) {
  if (!(await exists(manifestFile))) return null;
  return readJson(manifestFile);
}

/**
 * Generates or updates the manifests of every existing pack in the project.
 * Behavior packs get a dependency on the resource pack (and vice versa) when both exist.
 * @returns {Promise<{ kind: string, file: string, created: boolean }[]>}
 */
export async function syncManifests(project, { dryRun = false } = {}) {
  const packs = await project.existingPacks();
  const existing = new Map();
  for (const pack of packs) existing.set(pack.kind, await readManifest(pack.manifestFile));

  // First pass: make sure every pack has a header uuid (needed for cross-deps).
  const drafts = new Map();
  for (const pack of packs) {
    drafts.set(pack.kind, buildManifest(project.config, pack.kind, existing.get(pack.kind)));
  }
  // Second pass: wire dependencies between behavior and resource packs.
  const results = [];
  for (const pack of packs) {
    const pairKind = pack.kind === 'behavior' ? 'resource' : pack.kind === 'resource' ? 'behavior' : null;
    const pairWith = pairKind && drafts.has(pairKind) && project.config.build.linkPacks !== false ? drafts.get(pairKind) : null;
    const manifest = buildManifest(project.config, pack.kind, existing.get(pack.kind), { pairWith });
    // Preserve the UUIDs chosen in the first pass so both sides agree.
    manifest.header.uuid = drafts.get(pack.kind).header.uuid;
    const previous = existing.get(pack.kind);
    // Only touch the file when something actually changed, so file watchers
    // (ours included) don't see a spurious modification on every sync.
    const changed = !previous || JSON.stringify(previous) !== JSON.stringify(manifest);
    if (!dryRun && changed) await writeJson(pack.manifestFile, manifest);
    results.push({ kind: pack.kind, file: pack.manifestFile, created: !previous, changed, manifest });
  }
  return results;
}

/**
 * Validates a manifest object. Returns `{ errors, warnings }` message arrays.
 * @param {object} manifest
 * @param {{ kind?: string, file?: string, packDir?: string }} [context]
 */
export function validateManifest(manifest, { kind, packDir } = {}) {
  const errors = [];
  const warnings = [];
  if (!manifest || typeof manifest !== 'object') {
    return { errors: ['manifest is not a JSON object'], warnings };
  }
  if (manifest.format_version !== 2) {
    errors.push(`format_version must be 2 (got ${JSON.stringify(manifest.format_version)})`);
  }
  const header = manifest.header;
  if (!header || typeof header !== 'object') {
    errors.push('header is missing');
  } else {
    if (typeof header.name !== 'string' || !header.name.trim()) errors.push('header.name is required');
    if (!isUuid(header.uuid)) errors.push(`header.uuid is not a valid UUID (${JSON.stringify(header.uuid)})`);
    if (!isVersionArray(header.version)) {
      if (typeof header.version === 'string' && parseVersion(header.version)) {
        warnings.push(`header.version is a string ("${header.version}"); Minecraft expects [major, minor, patch]`);
      } else {
        errors.push(`header.version must be an array like [1, 0, 0] (got ${JSON.stringify(header.version)})`);
      }
    }
    if (header.min_engine_version === undefined) {
      errors.push('header.min_engine_version is required');
    } else if (!isVersionArray(header.min_engine_version)) {
      errors.push(`header.min_engine_version must be an array like [1, 26, 40] (got ${JSON.stringify(header.min_engine_version)})`);
    } else if (compareVersions(header.min_engine_version, '1.13.0') < 0) {
      warnings.push(`header.min_engine_version ${formatVersion(header.min_engine_version)} is very old; format_version 2 manifests need at least 1.13.0`);
    } else if (compareVersions(header.min_engine_version, LATEST_ENGINE_VERSION) > 0) {
      warnings.push(`header.min_engine_version ${formatVersion(header.min_engine_version)} is newer than the latest known release (${LATEST_ENGINE_VERSION})`);
    }
  }

  const modules = manifest.modules;
  const seenUuids = new Set(header?.uuid ? [header.uuid] : []);
  if (!Array.isArray(modules) || modules.length === 0) {
    errors.push('modules must be a non-empty array');
  } else {
    modules.forEach((module, i) => {
      const where = `modules[${i}]`;
      if (!module || typeof module !== 'object') {
        errors.push(`${where} is not an object`);
        return;
      }
      const validTypes = ['data', 'resources', 'script', 'skin_pack', 'world_template', 'javascript', 'client_data', 'interface'];
      if (!validTypes.includes(module.type)) errors.push(`${where}.type "${module.type}" is not a known module type`);
      if (!isUuid(module.uuid)) errors.push(`${where}.uuid is not a valid UUID`);
      else if (seenUuids.has(module.uuid)) errors.push(`${where}.uuid duplicates another UUID in this manifest`);
      seenUuids.add(module.uuid);
      if (!isVersionArray(module.version) && !(typeof module.version === 'string' && parseVersion(module.version))) {
        errors.push(`${where}.version must be an array like [1, 0, 0]`);
      }
      if (module.type === 'script') {
        if (module.language !== 'javascript') errors.push(`${where}.language must be "javascript"`);
        if (typeof module.entry !== 'string' || !module.entry.endsWith('.js')) errors.push(`${where}.entry must point to a .js file`);
        else if (packDir) {
          const entryPath = path.join(packDir, module.entry);
          if (!fs.existsSync(entryPath)) errors.push(`${where}.entry "${module.entry}" does not exist in the pack`);
        }
        const hasServerDep = Array.isArray(manifest.dependencies) && manifest.dependencies.some((d) => d?.module_name === '@minecraft/server');
        if (!hasServerDep) warnings.push('script module present but no "@minecraft/server" dependency declared');
      }
    });
    if (kind) {
      const expected = PACK_TYPES[kind]?.moduleType;
      if (expected && !modules.some((m) => m?.type === expected)) {
        errors.push(`a ${kind} pack must contain a module of type "${expected}"`);
      }
    }
  }

  if (manifest.dependencies !== undefined) {
    if (!Array.isArray(manifest.dependencies)) {
      errors.push('dependencies must be an array');
    } else {
      manifest.dependencies.forEach((dep, i) => {
        const where = `dependencies[${i}]`;
        if (!dep || typeof dep !== 'object') {
          errors.push(`${where} is not an object`);
          return;
        }
        if (dep.module_name) {
          if (!SCRIPT_MODULES[dep.module_name]) warnings.push(`${where}: unknown script module "${dep.module_name}"`);
          if (typeof dep.version !== 'string' || !parseVersion(dep.version)) errors.push(`${where}.version must be a string like "2.9.0"`);
          else if (SCRIPT_MODULES[dep.module_name]) {
            const known = SCRIPT_MODULES[dep.module_name];
            const isBeta = /beta/.test(dep.version);
            const latest = isBeta ? known.beta : known.stable;
            if (latest && compareVersions(dep.version, latest) > 0) {
              warnings.push(`${where}: ${dep.module_name}@${dep.version} is newer than the latest known release (${latest})`);
            }
          }
        } else if (dep.uuid) {
          if (!isUuid(dep.uuid)) errors.push(`${where}.uuid is not a valid UUID`);
          if (!isVersionArray(dep.version)) errors.push(`${where}.version must be an array like [1, 0, 0]`);
        } else {
          errors.push(`${where} needs either "module_name" or "uuid"`);
        }
      });
    }
  }

  if (manifest.capabilities !== undefined) {
    if (!Array.isArray(manifest.capabilities)) {
      errors.push('capabilities must be an array of strings');
    } else {
      for (const cap of manifest.capabilities) {
        if (!CAPABILITIES[cap]) warnings.push(`unknown capability "${cap}"`);
      }
    }
  }

  if (manifest.metadata !== undefined && (typeof manifest.metadata !== 'object' || Array.isArray(manifest.metadata))) {
    errors.push('metadata must be an object');
  }

  return { errors, warnings };
}
