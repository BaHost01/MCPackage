import fs from 'node:fs/promises';
import path from 'node:path';
import { exists, writeJson, slug, uuid } from './core.js';
import { syncManifests } from './project.js';

export async function initProject(cwd, name = 'my-addon', options = {}) {
  const dir = path.resolve(cwd, name);
  if (await exists(dir) && (await fs.readdir(dir)).length) throw new Error(`Directory is not empty: ${dir}`);
  const project = {
    name: options.displayName || name,
    namespace: options.namespace || slug(name),
    description: options.description || 'A Minecraft Bedrock add-on',
    version: '1.0.0', versionArray: [1, 0, 0], minEngineVersion: [1, 21, 0],
    authors: options.author ? [options.author] : [], license: 'MIT',
    packs: { behavior: 'packs/behavior', resource: 'packs/resource' }
  };
  await fs.mkdir(path.join(dir, project.packs.behavior), { recursive: true });
  await fs.mkdir(path.join(dir, project.packs.resource), { recursive: true });
  project.uuids = { behavior: uuid(), resource: uuid() };
  await writeJson(path.join(dir, 'mcpackage.json'), project);
  await syncManifests(dir, project);
  await fs.writeFile(path.join(dir, '.mcpackageignore'), 'dist\nnode_modules\n.git\n');
  return dir;
}
