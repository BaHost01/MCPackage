import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export const VERSION = '4.0.0';
export const CONFIG = 'mcpackage.json';

export async function exists(file) { try { await fs.access(file); return true; } catch { return false; } }
export async function readJson(file) { return JSON.parse(await fs.readFile(file, 'utf8')); }
export async function writeJson(file, value) { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, JSON.stringify(value, null, 2) + '\n'); }
export function uuid() { return randomUUID(); }
export function slug(value) { return String(value).trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'addon'; }
export function identifier(namespace, name) { return `${namespace}:${slug(name).replace(/-/g, '_')}`; }
export function projectFile(cwd) { return path.join(cwd, CONFIG); }

export async function walk(dir, out = []) {
  if (!(await exists(dir))) return out;
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(full, out); else out.push(full);
  }
  return out;
}
