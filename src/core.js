import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export const VERSION = '4.0.0';
export const CONFIG = 'mcpackage.json';

export async function exists(file) {
  try { await fs.access(file); return true; } catch { return false; }
}

export async function readJson(file) { return JSON.parse(await fs.readFile(file, 'utf8')); }
export async function writeJson(file, value) { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, JSON.stringify(value, null, 2) + '\n'); }
export function uuid() { return randomUUID(); }
export function slug(value) { return String(value).trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'addon'; }
export function identifier(namespace, name) { return `${namespace}:${slug(name).replace(/-/g, '_')}`; }
export function projectFile(cwd) { return path.join(cwd, CONFIG); }

export function isWithin(root, target) {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

export function safeProjectPath(root, value, label = 'path') {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Invalid ${label}.`);
  const target = path.resolve(root, value);
  if (!isWithin(root, target)) throw new Error(`Unsafe ${label}: it must stay inside the project directory.`);
  return target;
}

export async function assertNoSymlinkPath(root, target) {
  const rootPath = path.resolve(root);
  const targetPath = path.resolve(target);
  if (!isWithin(rootPath, targetPath)) throw new Error(`Unsafe path: ${targetPath}`);
  const relative = path.relative(rootPath, targetPath);
  let current = rootPath;
  for (const part of relative ? relative.split(path.sep) : []) {
    current = path.join(current, part);
    try {
      const stat = await fs.lstat(current);
      if (stat.isSymbolicLink()) throw new Error(`Symlink is not allowed in project paths: ${current}`);
    } catch (error) {
      if (error?.code === 'ENOENT') break;
      throw error;
    }
  }
}

export async function walk(dir, out = [], { rejectSymlinks = true } = {}) {
  if (!(await exists(dir))) return out;
  const entries = (await fs.readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) {
      if (rejectSymlinks) throw new Error(`Symlink is not allowed in packaged projects: ${full}`);
      continue;
    }
    if (entry.isDirectory()) await walk(full, out, { rejectSymlinks });
    else if (entry.isFile()) out.push(full);
  }
  return out;
}
