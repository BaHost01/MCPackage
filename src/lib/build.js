/**
 * Build engine: packages packs into .mcpack / .mcaddon archives.
 *
 * - `.mcpack`  – a single pack (zip with manifest.json at the root)
 * - `.mcaddon` – a bundle: zip containing one folder per pack
 *
 * Builds are deterministic when `reproducible` is set (fixed timestamps,
 * sorted entries) so CI can diff artifacts.
 */
import fsp from 'node:fs/promises';
import path from 'node:path';
import { JUNK_PATTERNS } from './bedrock.js';
import { CliError } from './errors.js';
import { ensureDir, exists, walk } from './fs.js';
import { REPRODUCIBLE_MTIME, createZipFile } from './zip.js';

const DEFAULT_EXCLUDES = [...JUNK_PATTERNS, '*.md', '.gitignore', '.mcpackageignore'];

/**
 * Collects the files of a pack that should be shipped.
 * @returns {Promise<string[]>} relative paths (posix)
 */
export async function collectPackFiles(pack, { exclude = [] } = {}) {
  const ignoreFile = path.join(pack.dir, '.mcpackageignore');
  const fromFile = (await exists(ignoreFile))
    ? (await fsp.readFile(ignoreFile, 'utf8'))
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#'))
    : [];
  const files = await walk(pack.dir, { ignore: [...DEFAULT_EXCLUDES, ...exclude, ...fromFile] });
  return files;
}

/**
 * Builds artifacts for the project.
 *
 * @param {import('./project.js').Project} project
 * @param {{
 *   type?: 'addon'|'pack'|'both',
 *   outDir?: string,
 *   level?: number,
 *   reproducible?: boolean,
 *   onProgress?: (event: { kind: string, file: string, entries: number, bytes: number }) => void,
 * }} [options]
 * @returns {Promise<{ file: string, kind: string, packs: string[], entries: number, bytes: number }[]>}
 */
export async function buildProject(project, { type = 'addon', outDir, level = 6, reproducible = false, onProgress } = {}) {
  const packs = await project.existingPacks();
  if (packs.length === 0) {
    throw new CliError('Nothing to build: no pack folders exist.', {
      hint: `Expected one of: ${project.packs.map((p) => p.relDir).join(', ')}. Run \`mcpackage init\` or add packs with \`mcpackage add pack\`.`,
    });
  }
  for (const pack of packs) {
    if (!(await exists(pack.manifestFile))) {
      throw new CliError(`${pack.relDir}/manifest.json is missing.`, { hint: 'Run `mcpackage manifest` to generate manifests.' });
    }
  }

  const target = outDir ? path.resolve(project.root, outDir) : project.outDir;
  await ensureDir(target);
  const mtime = reproducible ? REPRODUCIBLE_MTIME : undefined;
  const artifacts = [];

  const packFiles = new Map();
  for (const pack of packs) packFiles.set(pack.kind, await collectPackFiles(pack, { exclude: project.config.build.exclude }));

  if (type === 'addon' || type === 'both') {
    const file = path.join(target, `${project.artifactBaseName}.mcaddon`);
    const zip = createZipFile(file, { level, mtime });
    let entries = 0;
    for (const pack of packs) {
      const folder = archiveFolderName(project, pack);
      for (const rel of packFiles.get(pack.kind)) {
        const data = await fsp.readFile(path.join(pack.dir, rel));
        const stat = reproducible ? null : await fsp.stat(path.join(pack.dir, rel));
        zip.addFile(`${folder}/${rel}`, data, { mtime: stat?.mtime, compress: shouldCompress(rel) });
        entries += 1;
      }
    }
    const bytes = zip.close();
    const artifact = { file, kind: 'addon', packs: packs.map((p) => p.kind), entries, bytes };
    artifacts.push(artifact);
    onProgress?.(artifact);
  }

  if (type === 'pack' || type === 'both') {
    for (const pack of packs) {
      const file = path.join(target, `${project.artifactBaseName}-${pack.suffix}.mcpack`);
      const zip = createZipFile(file, { level, mtime });
      let entries = 0;
      for (const rel of packFiles.get(pack.kind)) {
        const data = await fsp.readFile(path.join(pack.dir, rel));
        const stat = reproducible ? null : await fsp.stat(path.join(pack.dir, rel));
        zip.addFile(rel, data, { mtime: stat?.mtime, compress: shouldCompress(rel) });
        entries += 1;
      }
      const bytes = zip.close();
      const artifact = { file, kind: 'pack', packs: [pack.kind], entries, bytes };
      artifacts.push(artifact);
      onProgress?.(artifact);
    }
  }

  return artifacts;
}

/** Folder name used for a pack inside an .mcaddon and inside com.mojang. */
export function archiveFolderName(project, pack) {
  const slug = project.config.name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'addon';
  return `${slug}_${pack.suffix}`;
}

/** PNG/JPEG/OGG are already compressed; storing them is faster and not larger. */
function shouldCompress(file) {
  return !/\.(png|jpg|jpeg|ogg|mp3|fsb|zip|mcstructure)$/i.test(file);
}
