import fs from 'node:fs/promises';
import path from 'node:path';
import { exists, writeJson, slug, uuid } from './core.js';
import { syncManifests } from './project.js';
import { getMinecraftVersions } from './minecraft.js';
import { McpackageError } from './errors.js';

export async function initProject(cwd, name = 'my-addon', options = {}) {
  if (!name || name.startsWith('-')) {
    throw new McpackageError('Please provide a valid project name.', {
      code: 'INVALID_PROJECT_NAME',
      hint: 'Example: `mcpackage init my-addon`.',
    });
  }

  const dir = path.resolve(cwd, name);
  if (await exists(dir) && (await fs.readdir(dir)).length) {
    throw new McpackageError('The destination folder is not empty.', {
      code: 'DIRECTORY_NOT_EMPTY',
      hint: `Choose another name or empty \`${dir}\` first.`,
    });
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

  const behaviorDir = path.join(dir, project.packs.behavior);
  const resourceDir = path.join(dir, project.packs.resource);
  await Promise.all([
    fs.mkdir(behaviorDir, { recursive: true }),
    fs.mkdir(resourceDir, { recursive: true }),
  ]);

  project.uuids = { behavior: uuid(), resource: uuid() };
  await writeJson(path.join(dir, 'mcpackage.json'), project);
  await syncManifests(dir, project);
  await fs.writeFile(path.join(dir, '.mcpackageignore'), 'dist\nbuild\nnode_modules\n.git\n');
  return { dir, versions };
}
