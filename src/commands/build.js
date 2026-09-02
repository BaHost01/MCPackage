import path from 'node:path';
import { buildProject } from '../lib/build.js';
import { CliError } from '../lib/errors.js';
import { lintProject } from '../lib/lint.js';
import { syncManifests } from '../lib/manifest.js';
import { loadProject } from '../lib/project.js';
import { c, elapsed, formatBytes, log, plural } from '../lib/term.js';

export default {
  name: 'build',
  aliases: ['compile', 'pack'],
  group: 'Build & ship',
  summary: 'Package the project into .mcaddon / .mcpack files',
  usage: 'mcpackage build [options]',
  description: `Lints the project, syncs manifests and zips each pack into dist/.
An .mcaddon bundles every pack; .mcpack files contain a single pack.
Junk files (.DS_Store, Thumbs.db, *.psd, *.bbmodel, …) and anything listed
in build.exclude or a pack's .mcpackageignore are left out.`,
  options: {
    type: { type: 'string', short: 't', description: 'Artifact type', choices: ['addon', 'pack', 'both'], default: 'addon' },
    out: { type: 'string', short: 'o', description: 'Output folder (default: build.outDir or dist)', value: '<dir>' },
    'skip-lint': { type: 'boolean', description: 'Do not lint before building' },
    'no-sync': { type: 'boolean', description: 'Do not sync manifests from mcpackage.json first' },
    reproducible: { type: 'boolean', description: 'Deterministic output (fixed timestamps)' },
    level: { type: 'string', description: 'Compression level 0-9', value: '<n>', default: '6' },
    strict: { type: 'boolean', description: 'Fail the build on lint warnings too' },
  },
  examples: ['mcpackage build', 'mcpackage build --type both --out release', 'mcpackage build --reproducible --strict'],
  async run({ options, cwd }) {
    const started = Date.now();
    const project = await loadProject(cwd);
    const level = Number(options.level);
    if (!Number.isInteger(level) || level < 0 || level > 9) throw new CliError('--level must be an integer from 0 to 9.', { exitCode: 2 });

    if (!options['no-sync']) {
      const synced = await syncManifests(project);
      log.debug(`synced ${synced.length} manifest(s)`);
    }

    if (!options['skip-lint']) {
      log.step('Linting');
      const result = await lintProject(project, { strict: options.strict });
      const shown = result.diagnostics.filter((d) => d.level !== 'info');
      for (const d of shown) {
        const line = `${c.dim(d.file)} ${d.message}`;
        if (d.level === 'error') log.error(line);
        else log.warn(line);
      }
      if (!result.ok) {
        throw new CliError(`Build aborted: ${plural(result.errors.length, 'lint error')}.`, {
          hint: 'Fix the errors above, or pass --skip-lint to build anyway.',
        });
      }
      log.ok(result.warnings.length ? `no errors, ${plural(result.warnings.length, 'warning')}` : 'no problems found');
    }

    log.step(`Building ${options.type === 'both' ? '.mcaddon + .mcpack' : options.type === 'pack' ? '.mcpack' : '.mcaddon'}`);
    const artifacts = await buildProject(project, {
      type: options.type,
      outDir: options.out,
      level,
      reproducible: options.reproducible,
      onProgress: (artifact) => {
        log.ok(`${c.cyan(project.relative(artifact.file))} ${c.dim(`${plural(artifact.entries, 'file')}, ${formatBytes(artifact.bytes)}`)}`);
      },
    });

    if (options.json) {
      log.print(JSON.stringify({ artifacts: artifacts.map((a) => ({ ...a, file: path.resolve(a.file) })), durationMs: Date.now() - started }, null, 2));
      return;
    }
    log.blank();
    log.info(`Done in ${elapsed(started)}. Double-click ${options.type === 'pack' ? 'a .mcpack' : 'the .mcaddon'} to import it into Minecraft, or run ${c.cyan('mcpackage deploy')} for development.`);
  },
};
