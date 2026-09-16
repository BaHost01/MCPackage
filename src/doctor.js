import fs from 'node:fs/promises';
import path from 'node:path';
import { CONFIG, exists, readJson } from './core.js';

export async function doctor(cwd) {
  const checks = [{ name: 'Node.js', ok: Number(process.versions.node.split('.')[0]) >= 20, value: process.versions.node }];
  const config = path.join(cwd, CONFIG); const present = await exists(config); checks.push({ name: CONFIG, ok: present });
  if (present) { try { const p = await readJson(config); checks.push({ name: 'project schema', ok: Boolean(p.name && p.namespace && p.packs?.behavior && p.packs?.resource) }); } catch { checks.push({ name: 'project JSON', ok: false }); } }
  return { ok: checks.every(x => x.ok), checks };
}
