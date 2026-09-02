/**
 * Project model: locating the project root, loading/validating
 * `mcpackage.json`, and resolving which packs exist.
 *
 * Layout of a project:
 *
 *   my-addon/
 *   ├── mcpackage.json          ← project config (this file marks the root)
 *   ├── packs/
 *   │   ├── behavior/           ← behavior pack (manifest.json inside)
 *   │   └── resource/           ← resource pack
 *   └── dist/                   ← build output (.mcaddon / .mcpack)
 *
 * The legacy layout used by v2 of this tool (`behavior_pack/`, `resource_pack/`
 * at the root with `mc-config.json`) is detected and still supported.
 */
import path from 'node:path';
import { CliError } from './errors.js';
import { exists, isDirectory, readJson, writeJson } from './fs.js';
import { LATEST_ENGINE_VERSION, PACK_TYPES, NAMESPACE_RE } from './bedrock.js';
import { isVersionString, parseVersion } from './semver.js';

export const CONFIG_FILE = 'mcpackage.json';
export const LEGACY_CONFIG_FILE = 'mc-config.json';
export const CONFIG_SCHEMA_URL = 'https://raw.githubusercontent.com/BaHost01/MCPackage/master/schema/mcpackage.schema.json';

/** Default pack folder layout. Paths are relative to the project root. */
export const DEFAULT_PACKS = {
  behavior: 'packs/behavior',
  resource: 'packs/resource',
};

export const LEGACY_PACKS = {
  behavior: 'behavior_pack',
  resource: 'resource_pack',
};

/**
 * Walks up from `start` until a config file is found.
 * @returns {Promise<{ root: string, configFile: string, legacy: boolean } | null>}
 */
export async function findProjectRoot(start = process.cwd()) {
  let dir = path.resolve(start);
  for (;;) {
    const modern = path.join(dir, CONFIG_FILE);
    if (await exists(modern)) return { root: dir, configFile: modern, legacy: false };
    const legacy = path.join(dir, LEGACY_CONFIG_FILE);
    if (await exists(legacy)) return { root: dir, configFile: legacy, legacy: true };
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/** Builds a fresh config object with sane defaults. */
export function createDefaultConfig({ name, namespace, description, author, minEngineVersion } = {}) {
  return {
    $schema: CONFIG_SCHEMA_URL,
    name: name || 'My Add-On',
    namespace: namespace || 'custom',
    description: description || 'A Minecraft Bedrock add-on',
    version: '1.0.0',
    minEngineVersion: minEngineVersion || LATEST_ENGINE_VERSION,
    authors: author ? [author] : [],
    license: '',
    url: '',
    packs: { ...DEFAULT_PACKS },
    build: {
      outDir: 'dist',
      exclude: [],
    },
  };
}

/**
 * Normalizes a raw config (modern or legacy) into the canonical shape and
 * validates it. Throws CliError listing every problem found.
 */
export function normalizeConfig(raw, { legacy = false, root = '.' } = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new CliError(`${legacy ? LEGACY_CONFIG_FILE : CONFIG_FILE} must contain a JSON object`);
  }
  const problems = [];
  // v2 never validated the namespace; tolerate whatever it contains so legacy
  // projects still load (migrate writes back a sanitized value).
  const namespace = legacy ? sanitizeNamespace(raw.namespace) || 'custom' : raw.namespace ?? 'custom';
  const config = {
    name: raw.name,
    namespace,
    description: raw.description ?? '',
    version: raw.version ?? '1.0.0',
    minEngineVersion: raw.minEngineVersion ?? raw.min_engine_version ?? LATEST_ENGINE_VERSION,
    authors: Array.isArray(raw.authors) ? raw.authors.slice() : raw.author ? [raw.author] : [],
    license: raw.license ?? '',
    url: raw.url ?? '',
    packs: {},
    build: {
      outDir: raw.build?.outDir ?? 'dist',
      exclude: Array.isArray(raw.build?.exclude) ? raw.build.exclude.slice() : [],
    },
    scripts: raw.scripts ?? null,
    dependencies: Array.isArray(raw.dependencies) ? raw.dependencies : [],
    capabilities: Array.isArray(raw.capabilities) ? raw.capabilities : [],
  };

  const rawPacks = raw.packs && typeof raw.packs === 'object' ? raw.packs : legacy ? LEGACY_PACKS : DEFAULT_PACKS;
  for (const [kind, folder] of Object.entries(rawPacks)) {
    if (!PACK_TYPES[kind]) {
      problems.push(`packs.${kind}: unknown pack type (expected ${Object.keys(PACK_TYPES).join(', ')})`);
      continue;
    }
    if (typeof folder !== 'string' || !folder.trim()) {
      problems.push(`packs.${kind}: must be a relative folder path`);
      continue;
    }
    if (path.isAbsolute(folder) || folder.split(/[\\/]/).includes('..')) {
      problems.push(`packs.${kind}: must stay inside the project (got "${folder}")`);
      continue;
    }
    config.packs[kind] = folder.replace(/\\/g, '/').replace(/\/+$/, '');
  }

  if (typeof config.name !== 'string' || !config.name.trim()) problems.push('name: required (a non-empty string)');
  if (!NAMESPACE_RE.test(String(config.namespace))) {
    problems.push(`namespace: "${config.namespace}" must be lowercase letters, digits or underscores and start with a letter`);
  } else if (config.namespace === 'minecraft') {
    problems.push('namespace: "minecraft" is reserved for vanilla content');
  }
  if (!isVersionString(config.version)) problems.push(`version: "${config.version}" must look like 1.2.3`);
  if (!parseVersion(config.minEngineVersion)) problems.push(`minEngineVersion: "${config.minEngineVersion}" must look like 1.26.40`);
  if (!config.authors.every((a) => typeof a === 'string')) problems.push('authors: must be an array of strings');
  if (typeof config.build.outDir !== 'string' || path.isAbsolute(config.build.outDir)) problems.push('build.outDir: must be a relative path');
  if (config.scripts && typeof config.scripts === 'object') {
    const entry = config.scripts.entry ?? 'scripts/main.js';
    if (typeof entry !== 'string') problems.push('scripts.entry: must be a string path inside the behavior pack');
    config.scripts = {
      entry,
      modules: config.scripts.modules && typeof config.scripts.modules === 'object' ? { ...config.scripts.modules } : {},
    };
  } else if (config.scripts) {
    problems.push('scripts: must be an object like { "entry": "scripts/main.js", "modules": { "@minecraft/server": "2.9.0" } }');
  }

  if (problems.length) {
    throw new CliError(`Invalid ${legacy ? LEGACY_CONFIG_FILE : CONFIG_FILE} in ${root}:\n  - ${problems.join('\n  - ')}`);
  }
  return config;
}

/** Best-effort conversion of arbitrary text into a valid namespace ("Old-NS" → "oldns"). */
export function sanitizeNamespace(value) {
  if (typeof value !== 'string') return '';
  const cleaned = value.toLowerCase().replace(/[^a-z0-9_]/g, '').replace(/^[^a-z]+/, '');
  return cleaned === 'minecraft' ? '' : cleaned;
}

/**
 * Loads the project at or above `cwd`.
 * @returns {Promise<Project>}
 */
export async function loadProject(cwd = process.cwd(), { required = true } = {}) {
  const located = await findProjectRoot(cwd);
  if (!located) {
    if (!required) return null;
    throw new CliError(`No ${CONFIG_FILE} found in ${path.resolve(cwd)} or any parent folder.`, {
      hint: 'Run `mcpackage init` to create a project here.',
    });
  }
  const raw = await readJson(located.configFile);
  const config = normalizeConfig(raw, { legacy: located.legacy, root: located.root });
  return new Project(located.root, located.configFile, config, raw, located.legacy);
}

export class Project {
  constructor(root, configFile, config, raw, legacy) {
    this.root = root;
    this.configFile = configFile;
    this.config = config;
    this.raw = raw;
    this.legacy = legacy;
  }

  /** Absolute path for a project-relative path. */
  resolve(...segments) {
    return path.join(this.root, ...segments);
  }

  /** Project-relative display path. */
  relative(absolute) {
    return path.relative(this.root, absolute).split(path.sep).join('/') || '.';
  }

  get outDir() {
    return this.resolve(this.config.build.outDir);
  }

  /** Configured packs as `{ kind, dir, relDir, manifestFile }`, regardless of existence. */
  get packs() {
    return Object.entries(this.config.packs).map(([kind, relDir]) => ({
      kind,
      relDir,
      dir: this.resolve(relDir),
      manifestFile: this.resolve(relDir, 'manifest.json'),
      ...PACK_TYPES[kind],
    }));
  }

  /** Packs whose folder exists on disk. */
  async existingPacks() {
    const result = [];
    for (const pack of this.packs) {
      if (await isDirectory(pack.dir)) result.push(pack);
    }
    return result;
  }

  pack(kind) {
    return this.packs.find((p) => p.kind === kind) ?? null;
  }

  /** Persists config changes back to disk, preserving unknown keys. */
  async save(patch = {}) {
    const next = { ...this.raw, ...patch };
    if (!this.legacy && !next.$schema) next.$schema = CONFIG_SCHEMA_URL;
    // Keep `$schema` first for readability.
    const ordered = next.$schema ? { $schema: next.$schema, ...Object.fromEntries(Object.entries(next).filter(([k]) => k !== '$schema')) } : next;
    await writeJson(this.configFile, ordered);
    this.raw = ordered;
    this.config = normalizeConfig(ordered, { legacy: this.legacy, root: this.root });
  }

  /** The file name (without extension) used for build artifacts. */
  get artifactBaseName() {
    const slug = this.config.name
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Za-z0-9._-]+/g, '_')
      .replace(/^_+|_+$/g, '');
    return `${slug || 'addon'}-v${this.config.version}`;
  }
}
