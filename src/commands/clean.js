import fsp from 'node:fs/promises';
import path from 'node:path';
import { exists, remove, walk } from '../lib/fs.js';
import { loadProject } from '../lib/project.js';
import { c, formatBytes, log, plural } from '../lib/term.js';

export default {
  name: 'clean',
  group: 'Build & ship',
  summary: 'Delete build output (dist/ and stray .mcaddon/.mcpack files)',
  usage: 'mcpackage clean [options]',
  options: {
    'dry-run': { type: 'boolean', description: 'List what would be deleted without deleting' },
  },
  examples: ['mcpackage clean', 'mcpackage clean --dry-run'],
  async run({ options, cwd }) {
    const project = await loadProject(cwd);
    const targets = [];

    if (await exists(project.outDir)) {
      const files = await walk(project.outDir);
      let bytes = 0;
      for (const file of files) bytes += (await fsp.stat(path.join(project.outDir, file))).size;
      targets.push({ path: project.outDir, kind: 'dir', files: files.length, bytes });
    }
    // Archives left at the project root by older versions of this tool.
    for (const entry of await fsp.readdir(project.root, { withFileTypes: true })) {
      if (entry.isFile() && /\.(mcaddon|mcpack)$/i.test(entry.name)) {
        const file = path.join(project.root, entry.name);
        targets.push({ path: file, kind: 'file', files: 1, bytes: (await fsp.stat(file)).size });
      }
    }

    if (!options['dry-run']) {
      for (const target of targets) await remove(target.path);
    }

    if (options.json) {
      log.print(JSON.stringify({ dryRun: Boolean(options['dry-run']), removed: targets.map((t) => ({ ...t, path: project.relative(t.path) })) }, null, 2));
      return;
    }
    if (targets.length === 0) {
      log.info('Nothing to clean.');
      return;
    }
    const verb = options['dry-run'] ? 'would remove' : 'removed';
    for (const target of targets) {
      const detail = target.kind === 'dir' ? `${plural(target.files, 'file')}, ${formatBytes(target.bytes)}` : formatBytes(target.bytes);
      log.ok(`${verb} ${c.cyan(project.relative(target.path) + (target.kind === 'dir' ? '/' : ''))} ${c.dim(`(${detail})`)}`);
    }
  },
};
