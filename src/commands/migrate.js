import fsp from 'node:fs/promises';
import path from 'node:path';
import { CliError } from '../lib/errors.js';
import { exists, readJson, remove, writeJson } from '../lib/fs.js';
import { syncManifests } from '../lib/manifest.js';
import { confirm } from '../lib/prompt.js';
import { CONFIG_FILE, CONFIG_SCHEMA_URL, DEFAULT_PACKS, LEGACY_CONFIG_FILE, LEGACY_PACKS, findProjectRoot, loadProject, sanitizeNamespace } from '../lib/project.js';
import { c, log } from '../lib/term.js';

export default {
  name: 'migrate',
  group: 'Project',
  summary: 'Upgrade a v2 project (mc-config.json, behavior_pack/) to the current layout',
  usage: 'mcpackage migrate [options]',
  description: `Converts mc-config.json into mcpackage.json, moves behavior_pack/ and
resource_pack/ under packs/, removes the obsolete .mc-audit.json and
regenerates manifests (UUIDs are kept, so worlds using the packs keep working).`,
  options: {
    'keep-layout': { type: 'boolean', description: 'Keep behavior_pack/ and resource_pack/ where they are' },
    yes: { type: 'boolean', short: 'y', description: 'Do not ask for confirmation' },
  },
  examples: ['mcpackage migrate', 'mcpackage migrate --keep-layout -y'],
  async run({ options, cwd }) {
    const located = await findProjectRoot(cwd);
    if (!located) throw new CliError(`No ${LEGACY_CONFIG_FILE} or ${CONFIG_FILE} found here.`, { hint: 'Run `mcpackage init` to start a new project.' });
    if (!located.legacy) {
      log.info(`This project already uses ${CONFIG_FILE}. Nothing to migrate.`);
      return;
    }
    const root = located.root;
    const legacy = await readJson(located.configFile);

    const plan = [];
    const modernFile = path.join(root, CONFIG_FILE);
    plan.push(`create ${CONFIG_FILE} from ${LEGACY_CONFIG_FILE}`);
    const moves = [];
    for (const [kind, legacyDir] of Object.entries(LEGACY_PACKS)) {
      const from = path.join(root, legacyDir);
      if (!(await exists(from))) continue;
      if (options['keep-layout']) continue;
      const to = path.join(root, DEFAULT_PACKS[kind]);
      if (await exists(to)) throw new CliError(`Cannot move ${legacyDir}/ because ${DEFAULT_PACKS[kind]}/ already exists.`, { hint: 'Merge them by hand or pass --keep-layout.' });
      moves.push({ kind, from, to });
      plan.push(`move ${legacyDir}/ → ${DEFAULT_PACKS[kind]}/`);
    }
    const audit = path.join(root, '.mc-audit.json');
    if (await exists(audit)) plan.push('delete .mc-audit.json (no longer used)');
    plan.push(`delete ${LEGACY_CONFIG_FILE}`);
    plan.push('regenerate manifests (keeping existing UUIDs)');

    if (!options.json) {
      log.print(c.bold('Migration plan'));
      for (const step of plan) log.item(step);
      log.blank();
    }
    if (!options.yes && !options.json) {
      const go = await confirm('Proceed?', { default: true });
      if (!go) {
        log.info('Cancelled.');
        return;
      }
    }

    const packs = {};
    for (const [kind, legacyDir] of Object.entries(LEGACY_PACKS)) {
      if (!(await exists(path.join(root, legacyDir)))) continue;
      packs[kind] = options['keep-layout'] ? legacyDir : DEFAULT_PACKS[kind];
    }
    if (Object.keys(packs).length === 0) packs.behavior = DEFAULT_PACKS.behavior;

    const config = {
      $schema: CONFIG_SCHEMA_URL,
      name: legacy.name || path.basename(root),
      namespace: sanitizeNamespace(legacy.namespace) || 'custom',
      description: legacy.description || '',
      version: legacy.version || '1.0.0',
      minEngineVersion: legacy.minEngineVersion || '1.21.0',
      authors: legacy.author ? [legacy.author] : Array.isArray(legacy.authors) ? legacy.authors : [],
      license: legacy.license || '',
      url: legacy.url || '',
      packs,
      build: { outDir: 'dist', exclude: [] },
    };
    for (const move of moves) {
      await fsp.mkdir(path.dirname(move.to), { recursive: true });
      await fsp.rename(move.from, move.to);
    }
    await writeJson(modernFile, config);
    await remove(audit);
    await remove(located.configFile);

    const project = await loadProject(root);
    const synced = await syncManifests(project);

    // Old versions wrote a bogus `capabilities` object into manifests; syncManifests
    // only keeps arrays, so that is already cleaned up. Also drop the old marker.
    for (const result of synced) {
      const manifest = result.manifest;
      if (manifest.metadata?.generated_with && typeof manifest.metadata.generated_with === 'string') {
        delete manifest.metadata.generated_with;
        await writeJson(result.file, manifest);
      }
    }

    if (options.json) {
      log.print(JSON.stringify({ root, config, moved: moves.map((m) => ({ from: project.relative(m.from), to: project.relative(m.to) })), manifests: synced.map((s) => project.relative(s.file)) }, null, 2));
      return;
    }
    log.ok(`Migrated to ${c.cyan(CONFIG_FILE)}`);
    for (const move of moves) log.item(`moved ${project.relative(move.from)}/ → ${project.relative(move.to)}/`);
    for (const s of synced) log.item(`${s.created ? 'created' : 'updated'} ${project.relative(s.file)}`);
    log.blank();
    log.info(`Run ${c.cyan('mcpackage lint')} to check the project, then ${c.cyan('mcpackage build')} or ${c.cyan('mcpackage deploy')}.`);
  },
};
