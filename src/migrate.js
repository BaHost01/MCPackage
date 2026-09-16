import fs from 'node:fs/promises';
import path from 'node:path';
import { exists, readJson, writeJson, slug, uuid, safeProjectPath } from './core.js';
import { syncManifests } from './project.js';
import { McpackageError } from './errors.js';

async function moveContents(from, to) {
  if (!(await exists(from))) return false;
  const entries = await fs.readdir(from, { withFileTypes: true });
  await fs.mkdir(to, { recursive: true });
  for (const entry of entries) {
    if (entry.isSymbolicLink()) throw new McpackageError(`Symlink is not allowed during migration: ${entry.name}`, { code: 'SYMLINK_NOT_ALLOWED' });
    const source = path.join(from, entry.name);
    const target = path.join(to, entry.name);
    if (await exists(target)) throw new McpackageError(`Migration would overwrite an existing file: ${target}`, { code: 'MIGRATION_CONFLICT' });
    await fs.rename(source, target);
  }
  await fs.rm(from, { recursive: true, force: true });
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
  if (!legacy || typeof legacy !== 'object' || Array.isArray(legacy)) throw new McpackageError('The legacy configuration must contain a JSON object.', { code: 'INVALID_CONFIG' });
  const name = String(legacy.name || legacy.displayName || path.basename(root));
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
  const behavior = safeProjectPath(root, project.packs.behavior, 'behavior pack path');
  const resource = safeProjectPath(root, project.packs.resource, 'resource pack path');
  if (!options.keepLayout) {
    await moveContents(path.join(root, 'behavior_pack'), behavior);
    await moveContents(path.join(root, 'resource_pack'), resource);
  } else {
    await fs.mkdir(behavior, { recursive: true });
    await fs.mkdir(resource, { recursive: true });
  }
  await writeJson(modernFile, project);
  await syncManifests(root, project);
  await fs.rm(legacyFile, { force: true });
  await fs.rm(path.join(root, '.mc-audit.json'), { force: true });
  return { migrated: true, project: modernFile, layout: options.keepLayout ? 'legacy-kept' : 'v4' };
}
