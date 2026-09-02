import { syncManifests, readManifest } from '../lib/manifest.js';
import { loadProject } from '../lib/project.js';
import { c, log } from '../lib/term.js';

export default {
  name: 'manifest',
  group: 'Project',
  summary: 'Generate or sync manifest.json files from mcpackage.json',
  usage: 'mcpackage manifest [options]',
  description: `Writes a manifest.json into every pack folder that exists. Existing UUIDs,
subpacks and unknown fields are preserved; name, version, engine version,
script modules and pack-to-pack dependencies are taken from mcpackage.json.`,
  options: {
    'dry-run': { type: 'boolean', description: 'Show the resulting manifests without writing them' },
    show: { type: 'boolean', description: 'Print the current manifests and exit' },
  },
  examples: ['mcpackage manifest', 'mcpackage manifest --dry-run'],
  async run({ options, cwd }) {
    const project = await loadProject(cwd);

    if (options.show) {
      const packs = await project.existingPacks();
      const output = {};
      for (const pack of packs) output[pack.kind] = await readManifest(pack.manifestFile);
      if (options.json) {
        log.print(JSON.stringify(output, null, 2));
        return;
      }
      for (const [kind, manifest] of Object.entries(output)) {
        log.step(`${project.pack(kind).relDir}/manifest.json`);
        log.print(manifest ? JSON.stringify(manifest, null, 2) : c.dim('(missing)'));
      }
      return;
    }

    const results = await syncManifests(project, { dryRun: options['dry-run'] });
    if (options.json) {
      log.print(JSON.stringify(results.map(({ kind, file, created, changed, manifest }) => ({ kind, file: project.relative(file), created, changed, manifest })), null, 2));
      return;
    }
    if (results.length === 0) {
      log.warn(`No pack folders found (expected ${project.packs.map((p) => p.relDir).join(', ')}).`);
      return;
    }
    for (const result of results) {
      const verb = options['dry-run'] ? (result.changed ? 'would write' : 'unchanged') : result.created ? 'created' : result.changed ? 'updated' : 'up to date';
      log.ok(`${verb} ${c.cyan(project.relative(result.file))} ${c.dim(`(${result.manifest.header.name}, uuid ${result.manifest.header.uuid})`)}`);
      if (options['dry-run'] && result.changed) log.print(JSON.stringify(result.manifest, null, 2));
    }
    if (results.length === 2 && results.every((r) => r.manifest.dependencies?.some((d) => d.uuid))) {
      log.info('Behavior and resource packs are linked: enabling one in a world enables the other.');
    }
  },
};
