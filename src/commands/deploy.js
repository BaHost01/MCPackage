import { deployProject, resolveComMojang } from '../lib/deploy.js';
import { syncManifests } from '../lib/manifest.js';
import { loadProject } from '../lib/project.js';
import { c, elapsed, log, plural } from '../lib/term.js';

export const deployOptions = {
  target: { type: 'string', short: 't', description: 'Path to a com.mojang folder', value: '<dir>' },
  preview: { type: 'boolean', description: 'Deploy to Minecraft Preview instead of the release build' },
  'no-clean': { type: 'boolean', description: 'Do not delete the previous deployment before copying' },
};

export default {
  name: 'deploy',
  aliases: ['install'],
  group: 'Build & ship',
  summary: "Copy packs into Minecraft's development_*_packs folders",
  usage: 'mcpackage deploy [options]',
  description: `Copies each pack into com.mojang/development_behavior_packs and
development_resource_packs so Minecraft picks up changes without importing.
The com.mojang folder is auto-detected on Windows (GDK and legacy UWP builds);
elsewhere pass --target or set MCPACKAGE_COM_MOJANG.`,
  options: {
    ...deployOptions,
    'dry-run': { type: 'boolean', description: 'Show what would be copied without copying' },
  },
  examples: ['mcpackage deploy', 'mcpackage deploy --preview', 'mcpackage deploy --target "D:/Minecraft/com.mojang"'],
  async run({ options, cwd }) {
    const started = Date.now();
    const project = await loadProject(cwd);
    await syncManifests(project);
    const { path: comMojang } = await resolveComMojang({ explicit: options.target, preview: options.preview });
    const results = await deployProject(project, { comMojang, clean: !options['no-clean'], dryRun: options['dry-run'] });

    if (options.json) {
      log.print(JSON.stringify({ comMojang, dryRun: Boolean(options['dry-run']), packs: results }, null, 2));
      return;
    }
    for (const result of results) {
      const verb = options['dry-run'] ? 'would copy' : 'copied';
      log.ok(`${verb} ${c.bold(result.kind)} pack ${c.dim(`(${plural(result.files, 'file')})`)} ${c.dim('→')} ${c.cyan(result.target)}`);
    }
    log.info(`${options['dry-run'] ? 'Dry run finished' : 'Deployed'} in ${elapsed(started)}. In Minecraft, add the packs to a world from the world's Behavior/Resource Packs tab.`);
  },
};
