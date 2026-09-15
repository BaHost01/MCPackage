import fs from 'node:fs/promises';
import path from 'node:path';
import { exists, readJson, walk } from './core.js';

export async function lintProject(cwd, project) {
  const errors = [], warnings = [];
  for (const type of ['behavior','resource']) {
    const root = path.resolve(cwd, project.packs[type]);
    if (!(await exists(root))) { errors.push({ file: project.packs[type], message: `missing ${type} pack` }); continue; }
    for (const file of await walk(root)) {
      if (path.basename(file) === 'manifest.json') {
        try { const m = await readJson(file); if (!m.header?.uuid || !m.header?.version) errors.push({ file, message: 'manifest header requires uuid and version' }); }
        catch (e) { errors.push({ file, message: `invalid JSON: ${e.message}` }); }
      } else if (file.endsWith('.json')) {
        try { JSON.parse(await fs.readFile(file, 'utf8')); } catch (e) { errors.push({ file, message: `invalid JSON: ${e.message}` }); }
      }
      if (path.basename(file) !== path.basename(file).toLowerCase()) warnings.push({ file, message: 'uppercase paths can break on mobile platforms' });
      if (path.basename(file).includes(' ')) warnings.push({ file, message: 'spaces in asset paths are discouraged' });
    }
  }
  return { errors, warnings, ok: errors.length === 0 };
}
