import { CliError } from '../lib/errors.js';
import { syncManifests } from '../lib/manifest.js';
import { loadProject } from '../lib/project.js';
import { bumpVersion, formatVersion } from '../lib/semver.js';
import { c, log } from '../lib/term.js';

export default {
  name: 'version',
  aliases: ['bump'],
  group: 'Project',
  summary: 'Show or bump the add-on version (and sync manifests)',
  usage: 'mcpackage version [major|minor|patch|x.y.z]',
  description: `Without arguments prints the current version. With a bump keyword or an
explicit version, updates mcpackage.json and every manifest.json.`,
  positionals: [{ name: 'bump', description: 'major, minor, patch or an explicit version like 2.1.0' }],
  options: {
    'no-sync': { type: 'boolean', description: 'Only update mcpackage.json, leave manifests alone' },
  },
  examples: ['mcpackage version', 'mcpackage version patch', 'mcpackage version 2.0.0'],
  async run({ options, positionals, cwd }) {
    const project = await loadProject(cwd);
    const [bump] = positionals;
    const current = project.config.version;

    if (!bump) {
      if (options.json) {
        log.print(JSON.stringify({ version: current, minEngineVersion: project.config.minEngineVersion }, null, 2));
      } else {
        log.print(current);
      }
      return;
    }

    let next;
    try {
      next = formatVersion(bumpVersion(current, bump));
    } catch (err) {
      throw new CliError(err.message, { exitCode: 2 });
    }
    await project.save({ version: next });
    const synced = options['no-sync'] ? [] : await syncManifests(project);

    if (options.json) {
      log.print(JSON.stringify({ previous: current, version: next, manifests: synced.map((s) => project.relative(s.file)) }, null, 2));
      return;
    }
    log.ok(`${c.dim(current)} ${c.dim('→')} ${c.bold(next)}`);
    for (const s of synced) log.item(`synced ${project.relative(s.file)}`);
  },
};
