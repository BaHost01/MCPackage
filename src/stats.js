import path from 'node:path';
import { loadProject } from './project.js';
import { walk } from './core.js';
import { lintProject } from './lint.js';

export async function stats(cwd) {
  const project = await loadProject(cwd); const files = [];
  for (const type of ['behavior','resource']) files.push(...await walk(path.resolve(cwd, project.packs[type])));
  const lint = await lintProject(cwd, project);
  return { name: project.name, version: project.version, files: files.length, behaviorFiles: (await walk(path.resolve(cwd, project.packs.behavior))).length, resourceFiles: (await walk(path.resolve(cwd, project.packs.resource))).length, errors: lint.errors.length, warnings: lint.warnings.length };
}
