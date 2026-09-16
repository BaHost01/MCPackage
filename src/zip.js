import fs from 'node:fs/promises';
import path from 'node:path';
import { walk, isWithin } from './core.js';

function u16(n) { return Buffer.from([n & 255, (n >>> 8) & 255]); }
function u32(n) { return Buffer.from([n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255]); }
function crc32(buf) { let c = 0xffffffff; for (const b of buf) { c ^= b; for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return (c ^ 0xffffffff) >>> 0; }
function normalizeIgnore(lines) { return lines.map((line) => line.trim()).filter((line) => line && !line.startsWith('#')).map((line) => line.replace(/^\.\//, '').replace(/\/$/, '')); }
function ignored(name, patterns) { return patterns.some((p) => name === p || name.startsWith(`${p}/`) || (p.startsWith('*') && name.endsWith(p.slice(1)))); }

export async function zipFiles(entries, output) {
  const chunks = [], central = []; let offset = 0;
  for (const entry of entries) {
    if (typeof entry.name !== 'string' || entry.name.startsWith('/') || entry.name.split('/').includes('..')) throw new Error(`Unsafe ZIP entry: ${entry.name}`);
    const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data); const nb = Buffer.from(entry.name); const crc = crc32(data);
    const local = Buffer.concat([Buffer.from([80, 75, 3, 4]), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc), u32(data.length), u32(data.length), u16(nb.length), u16(0), nb, data]);
    chunks.push(local);
    central.push(Buffer.concat([Buffer.from([80, 75, 1, 2]), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc), u32(data.length), u32(data.length), u16(nb.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), nb])); offset += local.length;
  }
  const body = Buffer.concat(chunks), cd = Buffer.concat(central); const end = Buffer.concat([Buffer.from([80, 75, 5, 6]), Buffer.alloc(6), u16(entries.length), u16(entries.length), u32(cd.length), u32(body.length), u16(0)]);
  await fs.mkdir(path.dirname(output), { recursive: true }); await fs.writeFile(output, Buffer.concat([body, cd, end])); return output;
}

export async function zipDirectory(root, output, options = {}) {
  const rootPath = path.resolve(root);
  if (!isWithin(rootPath, rootPath)) throw new Error('Invalid ZIP root.');
  const rootStat = await fs.lstat(rootPath);
  if (rootStat.isSymbolicLink()) throw new Error(`Symlink is not allowed as a ZIP root: ${rootPath}`);
  const ignoreFile = path.join(rootPath, options.ignoreFile || '.mcpackageignore');
  let patterns = [];
  try { patterns = normalizeIgnore((await fs.readFile(ignoreFile, 'utf8')).split(/\r?\n/)); } catch {}
  const files = await walk(rootPath, [], { rejectSymlinks: true });
  const entries = [];
  let totalBytes = 0;
  for (const file of files) {
    const name = path.relative(rootPath, file).split(path.sep).join('/');
    if (ignored(name, patterns)) continue;
    const stat = await fs.stat(file);
    if (stat.size > (options.maxFileSize ?? 256 * 1024 * 1024)) throw new Error(`File exceeds the packaging limit: ${name}`);
    totalBytes += stat.size;
    if (totalBytes > (options.maxTotalSize ?? 1024 * 1024 * 1024)) throw new Error('Project exceeds the packaging size limit.');
    entries.push({ name, data: await fs.readFile(file) });
  }
  entries.sort((a, b) => a.name.localeCompare(b.name));
  await zipFiles(entries, output);
  return { output, files: entries.length, bytes: (await fs.stat(output)).size };
}
