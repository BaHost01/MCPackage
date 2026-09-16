import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export const VERSION = '4.0.0';
export const CONFIG = 'mcpackage.json';

export async function exists(file) {
  try { await fs.access(file); return true; } catch { return false; }
}

export async function readJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

export async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(value, null, 2) + '\n');
}

export function uuid() { return randomUUID(); }
export function slug(value) { return String(value).trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'addon'; }
export function identifier(namespace, name) { return `${namespace}:${slug(name).replace(/-/g, '_')}`; }
export function projectFile(cwd) { return path.join(cwd, CONFIG); }

// Parallel directory traversal is noticeably faster on large add-ons while
// keeping output deterministic by sorting each directory before descending.
export async function walk(dir, out = []) {
  if (!(await exists(dir))) return out;
  const entries = (await fs.readdir(dir, { withFileTypes: true }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const files = [];
  const directories = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) directories.push(full);
    else files.push(full);
  }
  out.push(...files);
  const nested = await Promise.all(directories.map((child) => walk(child, [])));
  for (const childFiles of nested) out.push(...childFiles);
  return out;
}
