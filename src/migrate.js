import fs from 'node:fs/promises';
import path from 'node:path';
import { CONFIG, exists, readJson, writeJson, identifier } from './core.js';
import { loadProject, syncManifests } from './project.js';

const LEGACY_CONFIG = 'mc-config.json';
const LEGACY_PACKS = { behavior: 'behavior_pack', resource: 'resource_pack' };
const MODERN_PACKS = { behavior: 'packs/behavior', resource: 'packs/resource' };

export async function migrateProject(cwd, options = {}) {
  const root = path.resolve(cwd);
  const modern = path.join(root, CONFIG);
  const legacyFile = path.join(root, LEGACY_CONFIG);

  if (await exists(modern)) return { migrated: false, reason: 'already-modern', config: CONFIG };
  if (!(await exists(legacyFile))) throw new Error(`No ${LEGACY_CONFIG} found. Nothing to migrate.`);

  const legacy = await readJson(legacyFile);
  const moves = [];
  for (const [type, oldDir] of Object.entries(LEGACY_PACKS)) {
    const from = path.join(root, oldDir);
    if (options.keepLayout || !(await exists(from))) continue;
    const to = path.join(root, MODERN_PACKS[type]);
    if (await exists(to)) throw new Error(`Cannot move ${oldDir}/ because ${MODERN_PACKS[type]}/ already exists.`);
    moves.push({ type, from, to });
  }

  const plan = [
    `create ${CONFIG} from ${LEGACY_CONFIG}`,
    ...moves.map((m) => `move ${LEGACY_PACKS[m.type]}/ → ${MODERN_PACKS[m.type]}/`),
    'remove .mc-audit.json if present',
    `remove ${LEGACY_CONFIG}`,
    'regenerate manifests while preserving existing pack UUIDs when available',
  ];

  if (!options.yes && !options.json) {
    console.log('Migration plan:');
    for (const step of plan) console.log(`  • ${step}`);
    const readline = await import('node:readline/promises');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question('Proceed? [Y/n] ');
    rl.close();
    if (!/^y(es)?$/i.test(answer.trim() || 'y')) return { migrated: false, cancelled: true };
  }

  const packs = {};
  for (const [type, oldDir] of Object.entries(LEGACY_PACKS)) {
    if (await exists(path.join(root, oldDir))) packs[type] = options.keepLayout ? oldDir : MODERN_PACKS[type];
  }
  if (!packs.behavior) packs.behavior = MODERN_PACKS.behavior;
  if (!packs.resource) packs.resource = MODERN_PACKS.resource;

  const config = {
    $schema: 'https://raw.githubusercontent.com/BaHost01/MCPackage/master/schema/mcpackage.schema.json',
    name: legacy.name || path.basename(root),
    namespace: String(legacy.namespace || 'custom').toLowerCase().replace(/[^a-z0-9_]/g, '_'),
    description: legacy.description || '',
    version: legacy.version || '1.0.0',
    minEngineVersion: legacy.minEngineVersion || '1.21.0',
    authors: legacy.author ? [legacy.author] : (Array.isArray(legacy.authors) ? legacy.authors : []),
    license: legacy.license || '',
    url: legacy.url || '',
    packs,
    build: { outDir: 'dist', exclude: [] },
  };

  for (const move of moves) {
    await fs.mkdir(path.dirname(move.to), { recursive: true });
    await fs.rename(move.from, move.to);
  }
  await writeJson(modern, config);
  await fs.rm(path.join(root, '.mc-audit.json'), { force: true });
  await fs.rm(legacyFile, { force: true });

  const project = await loadProject(root);
  await syncManifests(root, project);
  await writeJson(modern, project);

  return { migrated: true, root, config: project, moved: moves.map((m) => ({ from: path.relative(root, m.from), to: path.relative(root, m.to) })), plan };
}
