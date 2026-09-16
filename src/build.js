import fs from 'node:fs/promises';
import path from 'node:path';
import { loadProject } from './project.js';
import { lintProject } from './lint.js';
import { zipDirectory, zipFiles } from './zip.js';
import { safeProjectPath } from './core.js';

export async function build(cwd, options = {}) {
  const project = await loadProject(cwd);
  if (!options.skipLint) {
    const result = await lintProject(cwd, project);
    if (!result.ok) throw new Error(`Lint failed with ${result.errors.length} error(s)`);
  }
  const out = safeProjectPath(cwd, options.outDir || project.build?.outDir || 'dist', 'build output path');
  if (out === path.resolve(cwd)) throw new Error('Build output cannot be the project root.');
  await fs.rm(out, { recursive: true, force: true });
  await fs.mkdir(out, { recursive: true });

  const packs = [];
  for (const type of ['behavior', 'resource']) {
    const dir = safeProjectPath(cwd, project.packs[type], `${type} pack path`);
    const file = path.join(out, `${project.namespace}-${type}.mcpack`);
    await zipDirectory(dir, file);
    packs.push({ name: path.basename(file), data: await fs.readFile(file) });
  }
  const addon = path.join(out, `${project.namespace}-${project.version}.mcaddon`);
  await zipFiles(packs, addon);
  await Promise.all(packs.map((p) => fs.rm(path.join(out, p.name), { force: true })));
  return { output: addon, files: 2, bytes: (await fs.stat(addon)).size };
}
