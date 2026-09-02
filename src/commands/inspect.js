import fsp from 'node:fs/promises';
import path from 'node:path';
import { CliError } from '../lib/errors.js';
import { parseJson } from '../lib/fs.js';
import { validateManifest } from '../lib/manifest.js';
import { formatVersion } from '../lib/semver.js';
import { c, formatBytes, heading, log, plural, printTable, sym } from '../lib/term.js';
import { listZipEntries, readZipEntry } from '../lib/zip.js';

export default {
  name: 'inspect',
  group: 'Quality',
  summary: 'Look inside an .mcaddon / .mcpack / .mcworld file and validate its manifests',
  usage: 'mcpackage inspect <file> [options]',
  description: `Lists the packs found in an archive (yours or someone else's), prints their
manifest details and runs the manifest validator on each one. Useful for
checking a build before sharing it or for learning from other add-ons.`,
  positionals: [{ name: 'file', description: 'Archive to inspect', required: true }],
  options: {
    files: { type: 'boolean', description: 'List every entry in the archive' },
  },
  examples: ['mcpackage inspect dist/My_Addon-v1.0.0.mcaddon', 'mcpackage inspect downloaded.mcpack --files'],
  async run({ options, positionals, cwd }) {
    const file = path.resolve(cwd, positionals[0]);
    let buffer;
    try {
      buffer = await fsp.readFile(file);
    } catch (err) {
      if (err.code === 'ENOENT') throw new CliError(`File not found: ${file}`);
      throw err;
    }
    let entries;
    try {
      entries = listZipEntries(buffer);
    } catch (err) {
      throw new CliError(`${path.basename(file)} is not a valid zip archive: ${err.message}`, {
        hint: '.mcaddon, .mcpack and .mcworld files are plain zip files.',
      });
    }

    const fileEntries = entries.filter((e) => !e.name.endsWith('/'));
    const manifests = fileEntries.filter((e) => /(^|\/)manifest\.json$/i.test(e.name));
    const packs = [];
    for (const entry of manifests) {
      const prefix = entry.name.slice(0, entry.name.length - 'manifest.json'.length);
      const packFiles = fileEntries.filter((e) => e.name.startsWith(prefix) && e !== entry);
      let manifest = null;
      let parseError = null;
      try {
        manifest = parseJson(readZipEntry(buffer, entry).toString('utf8'), entry.name);
      } catch (err) {
        parseError = err.message;
      }
      const moduleTypes = Array.isArray(manifest?.modules) ? manifest.modules.map((m) => m?.type).filter(Boolean) : [];
      const kind = moduleTypes.includes('data') ? 'behavior' : moduleTypes.includes('resources') ? 'resource' : moduleTypes.includes('skin_pack') ? 'skin' : moduleTypes.includes('world_template') ? 'world_template' : 'unknown';
      const validation = manifest ? validateManifest(manifest, { kind: ['behavior', 'resource', 'skin'].includes(kind) ? kind : undefined }) : { errors: [parseError], warnings: [] };
      packs.push({
        folder: prefix.replace(/\/$/, '') || '(archive root)',
        kind,
        manifest,
        files: packFiles.length,
        bytes: packFiles.reduce((sum, e) => sum + e.size, 0),
        hasIcon: fileEntries.some((e) => e.name === `${prefix}pack_icon.png`),
        validation,
      });
    }

    const worldFiles = fileEntries.filter((e) => /(^|\/)level\.dat$/.test(e.name));
    const report = {
      file,
      bytes: buffer.length,
      entries: fileEntries.length,
      uncompressedBytes: fileEntries.reduce((sum, e) => sum + e.size, 0),
      type: worldFiles.length ? 'world' : packs.length > 1 ? 'addon' : packs.length === 1 && packs[0].folder === '(archive root)' ? 'pack' : packs.length ? 'addon' : 'unknown',
      packs,
      ...(options.files ? { files: fileEntries.map((e) => ({ name: e.name, bytes: e.size, compressedBytes: e.compressedSize })) } : {}),
    };

    if (options.json) {
      log.print(JSON.stringify(report, null, 2));
      return;
    }

    log.print(`${c.bold(path.basename(file))} ${c.dim(`${formatBytes(report.bytes)} on disk, ${formatBytes(report.uncompressedBytes)} unpacked, ${plural(report.entries, 'entry', 'entries')}`)}`);
    log.text(`  type: ${c.cyan(report.type)}${worldFiles.length ? c.dim(` (contains ${plural(worldFiles.length, 'world')})`) : ''}`);

    if (packs.length === 0) {
      log.warn('No manifest.json found — Minecraft will not import this file as a pack.');
    }
    let problems = 0;
    for (const pack of packs) {
      heading(`${pack.kind} pack ${c.dim(pack.folder)}`);
      const header = pack.manifest?.header ?? {};
      printTable([
        ['name', header.name ?? c.red('missing')],
        ['description', header.description || c.dim('(none)')],
        ['uuid', header.uuid ?? c.red('missing')],
        ['version', header.version ? formatVersion(header.version) : c.red('missing')],
        ['min engine', header.min_engine_version ? formatVersion(header.min_engine_version) : c.red('missing')],
        ['modules', (pack.manifest?.modules ?? []).map((m) => `${m?.type}${m?.entry ? ` (${m.entry})` : ''}`).join(', ') || c.dim('(none)')],
        ['dependencies', (pack.manifest?.dependencies ?? []).map((d) => (d?.module_name ? `${d.module_name}@${d.version}` : `${d?.uuid} ${d?.version ? formatVersion(d.version) : ''}`.trim())).join(', ') || c.dim('(none)')],
        ['files', `${pack.files} ${c.dim(`(${formatBytes(pack.bytes)})`)}${pack.hasIcon ? '' : c.yellow(', no pack_icon.png')}`],
      ]);
      for (const message of pack.validation.errors) {
        log.text(`  ${c.red(`${sym.err} error`)}  ${message}`);
        problems += 1;
      }
      for (const message of pack.validation.warnings) log.text(`  ${c.yellow(`${sym.warn} warning`)}  ${message}`);
    }

    if (options.files) {
      heading('Files');
      printTable(fileEntries.map((e) => [e.name, c.dim(formatBytes(e.size))]));
    }
    log.blank();
    if (problems) {
      log.error(`${plural(problems, 'manifest error')} found.`);
      throw new CliError('', { exitCode: 1 });
    }
    if (packs.length) log.ok(`${plural(packs.length, 'pack')} with valid manifests.`);
  },
};
