import fs from 'node:fs/promises';
import path from 'node:path';
import { exists, readJson, writeJson, slug, uuid, safeProjectPath } from './core.js';
import { syncManifests } from './project.js';
import { McpackageError } from './errors.js';

async function moveIfPresent(from, to) {
  if (!(await exists(from))) return false;
  await fs.mkdir(path.dirname(to), { recursive: true });
  await fs.rename(from, to);
  return true;
}

export async function migrateProject(cwd, options = {}) {
  const root = path.resolve(cwd);
  const legacyFile = path.join(root, 'mc-config.json');
  const modernFile = path.join(root, 'mcpackage.json');
  if (!(await exists(legacyFile))) {
    if (await exists(modernFile)) return { migrated: false, reason: 'already-v4' };
    throw new McpackageError('No legacy mc-config.json was found.', { code: 'LEGACY_CONFIG_NOT_FOUND', hint: 'Run this command from a v2 MCPackage project.' });
  }
  if (await exists(modernFile)) throw new McpackageError('A v4 mcpackage.json already exists.', { code: 'V4_CONFIG_EXISTS', hint: 'Remove or back up the existing v4 configuration before migrating.' });

  let legacy;
  try { legacy = await readJson(legacyFile); } catch (cause) { throw new McpackageError('The legacy configuration is invalid JSON.', { code: 'INVALID_JSON', cause }); }
  const name = String(legacy.name || legacy.displayName || path.basename(root));
  const behavior = safeProjectPath(root, 'packs/behavior', 'behavior pack path');
  const resource = safeProjectPath(root, 'packs/resource', 'resource pack path');
  const project = {
    name,
    namespace: slug(legacy.namespace || name),
    description: legacy.description || 'A Minecraft Bedrock add-on',
    version: legacy.version || '1.0.0',
    versionArray: Array.isArray(legacy.versionArray) ? legacy.versionArray : [1, 0, 0],
    minEngineVersion: Array.isArray(legacy.minEngineVersion) ? legacy.minEngineVersion : [1, 21, 0],
    authors: Array.isArray(legacy.authors) ? legacy.authors : [],
    license: legacy.license || 'MIT',
    packs: { behavior: 'packs/behavior', resource: 'packs/resource' },
    uuids: { behavior: uuid(), resource: uuid() },
  };

  await fs.mkdir(behavior, { recursive: true });
  await fs.mkdir(resource, { recursive: true });
  if (!options.keepLayout) {
    await moveIfPresent(path.join(root, 'behavior_pack'), behavior);
    await moveIfPresent(path.join(root, 'resource_pack'), resource);
  }
  await writeJson(modernFile, project);
  await syncManifests(root, project);
  if (await exists(legacyFile)) await fs.rm(legacyFile, { force: true });
  if (await exists(path.join(root, '.mc-audit.json'))) await fs.rm(path.join(root, '.mc-audit.json'), { force: true });
  return { migrated: true, project: modernFile, layout: options.keepLayout ? 'legacy-kept' : 'v4' };
}
