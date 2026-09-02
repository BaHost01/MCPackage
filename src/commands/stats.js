import fsp from 'node:fs/promises';
import path from 'node:path';
import { BEHAVIOR_FOLDERS, RESOURCE_FOLDERS } from '../lib/bedrock.js';
import { walk } from '../lib/fs.js';
import { collectPackFiles } from '../lib/build.js';
import { readManifest } from '../lib/manifest.js';
import { loadProject } from '../lib/project.js';
import { c, formatBytes, heading, log, plural, printTable } from '../lib/term.js';

export default {
  name: 'stats',
  aliases: ['info', 'list'],
  group: 'Quality',
  summary: 'Summarize what the project contains (content counts, sizes, scripts)',
  usage: 'mcpackage stats [options]',
  options: {
    files: { type: 'boolean', description: 'Also list every file with its size' },
  },
  examples: ['mcpackage stats', 'mcpackage stats --files', 'mcpackage stats --json'],
  async run({ options, cwd }) {
    const project = await loadProject(cwd);
    const packs = await project.existingPacks();
    const report = {
      name: project.config.name,
      version: project.config.version,
      namespace: project.config.namespace,
      minEngineVersion: project.config.minEngineVersion,
      packs: [],
    };

    for (const pack of packs) {
      const manifest = await readManifest(pack.manifestFile);
      const files = await walk(pack.dir);
      const shipped = new Set(await collectPackFiles(pack, { exclude: project.config.build.exclude }));
      let bytes = 0;
      const byFolder = {};
      const fileList = [];
      for (const file of files) {
        const stat = await fsp.stat(path.join(pack.dir, file));
        bytes += stat.size;
        fileList.push({ file, bytes: stat.size, shipped: shipped.has(file) });
        const folder = file.includes('/') ? file.split('/')[0] : '(root)';
        byFolder[folder] = (byFolder[folder] ?? 0) + 1;
      }
      const folderLabels = pack.kind === 'behavior' ? BEHAVIOR_FOLDERS : RESOURCE_FOLDERS;
      const content = Object.entries(byFolder)
        .filter(([folder]) => folder !== '(root)' && folder !== 'texts')
        .map(([folder, count]) => ({ folder, label: folderLabels[folder] ?? folder, count }))
        .sort((a, b) => b.count - a.count || a.folder.localeCompare(b.folder));

      const scriptModule = manifest?.modules?.find((m) => m?.type === 'script');
      report.packs.push({
        kind: pack.kind,
        dir: pack.relDir,
        manifest: manifest
          ? { name: manifest.header?.name, uuid: manifest.header?.uuid, version: manifest.header?.version, min_engine_version: manifest.header?.min_engine_version }
          : null,
        files: files.length,
        shippedFiles: shipped.size,
        bytes,
        content,
        scripts: scriptModule ? { entry: scriptModule.entry, dependencies: (manifest.dependencies ?? []).filter((d) => d.module_name) } : null,
        fileList: options.files ? fileList : undefined,
      });
    }

    if (options.json) {
      log.print(JSON.stringify(report, null, 2));
      return;
    }

    log.print(`${c.bold(report.name)} ${c.dim(`v${report.version}`)} ${c.dim('·')} namespace ${c.cyan(report.namespace)} ${c.dim('·')} engine ${c.cyan(report.minEngineVersion)}`);
    if (report.packs.length === 0) {
      log.warn(`No pack folders found (expected ${project.packs.map((p) => p.relDir).join(', ')}).`);
      return;
    }
    for (const pack of report.packs) {
      heading(`${capitalize(pack.kind)} pack ${c.dim(pack.dir)}`);
      const rows = [
        ['files', `${pack.files} ${c.dim(`(${pack.shippedFiles} shipped, ${formatBytes(pack.bytes)})`)}`],
        ['manifest', pack.manifest ? `${pack.manifest.name} ${c.dim(`uuid ${pack.manifest.uuid}`)}` : c.red('missing')],
      ];
      if (pack.scripts) {
        rows.push(['scripts', `${pack.scripts.entry} ${c.dim(pack.scripts.dependencies.map((d) => `${d.module_name}@${d.version}`).join(', '))}`]);
      }
      for (const item of pack.content) rows.push([item.label, String(item.count)]);
      printTable(rows);
      if (options.files && pack.fileList) {
        log.blank();
        printTable(
          pack.fileList.map((f) => [
            f.shipped ? c.dim('·') : c.yellow('excluded'),
            f.file,
            c.dim(formatBytes(f.bytes)),
          ]),
          { indent: 4 },
        );
      }
    }
    log.blank();
    const total = report.packs.reduce((sum, p) => sum + p.files, 0);
    const totalBytes = report.packs.reduce((sum, p) => sum + p.bytes, 0);
    log.info(`${plural(total, 'file')}, ${formatBytes(totalBytes)} across ${plural(report.packs.length, 'pack')}.`);
  },
};

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
