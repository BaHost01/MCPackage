import fs from 'node:fs/promises';
import path from 'node:path';
import { exists, writeJson, slug, uuid, safeProjectPath } from './core.js';
import { syncManifests } from './project.js';
import { getMinecraftVersions } from './minecraft.js';
import { McpackageError } from './errors.js';

export async function initProject(cwd, name = 'my-addon', options = {}) {
  if (!name || name.startsWith('-') || name.includes('/') || name.includes('\\') || name === '.' || name === '..') {
    throw new McpackageError('Please provide a valid project name.', { code: 'INVALID_PROJECT_NAME', hint: 'Use a simple directory name, for example `mcpackage init my-addon`.' });
  }
  const dir = safeProjectPath(cwd, name, 'project destination');
  if (dir === path.resolve(cwd)) throw new McpackageError('The project destination cannot be the current workspace root.', { code: 'INVALID_PROJECT_DESTINATION' });
  if (await exists(dir) && (await fs.readdir(dir)).length) {
    throw new McpackageError('The destination folder is not empty.', { code: 'DIRECTORY_NOT_EMPTY', hint: `Choose another name or empty \`${dir}\` first.` });
  }
  const versions = await getMinecraftVersions({ timeout: options.versionTimeout ?? 2500 });
  const project = {
    name: options.displayName || name,
    namespace: options.namespace || slug(name),
    description: options.description || 'A Minecraft Bedrock add-on',
    version: '1.0.0',
    versionArray: [1, 0, 0],
    minEngineVersion: versions.minEngineVersion,
    minecraftVersion: versions.stable,
    minecraftPreviewVersion: versions.preview,
    minecraftVersionSource: versions.source,
    authors: options.author ? [options.author] : [],
    license: 'MIT',
    packs: { behavior: 'packs/behavior', resource: 'packs/resource' },
  };
  const behaviorDir = safeProjectPath(dir, project.packs.behavior, 'behavior pack path');
  const resourceDir = safeProjectPath(dir, project.packs.resource, 'resource pack path');
  await Promise.all([fs.mkdir(behaviorDir, { recursive: true }), fs.mkdir(resourceDir, { recursive: true })]);
  project.uuids = { behavior: uuid(), resource: uuid() };
  await writeJson(path.join(dir, 'mcpackage.json'), project);
  await syncManifests(dir, project);
  await fs.writeFile(path.join(dir, '.mcpackageignore'), 'dist\nbuild\nnode_modules\n.git\n');
  return { dir, versions };
}
