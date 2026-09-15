import fs from 'node:fs/promises';
import path from 'node:path';
import { CONFIG, exists, readJson, uuid, identifier } from './core.js';

export async function loadProject(cwd) {
  const file = path.join(cwd, CONFIG);
  if (!(await exists(file))) throw new Error(`No ${CONFIG} found. Run \"mcpackage init\" first.`);
  const project = await readJson(file);
  if (!project.name || !project.namespace) throw new Error(`${CONFIG} requires name and namespace`);
  return project;
}

export function manifest(project, type, dependency) {
  const name = project.name;
  const description = project.description || `${name} ${type} pack`;
  const header = { name, description, uuid: project.uuids[type] || uuid(), version: project.versionArray || [1, 0, 0], min_engine_version: project.minEngineVersion || [1, 21, 0] };
  const modules = type === 'behavior' ? [{ type: project.scripts ? 'script' : 'data', uuid: uuid(), version: header.version }] : [{ type: 'resources', uuid: uuid(), version: header.version }];
  const result = { format_version: 2, header, modules };
  if (dependency) result.dependencies = [{ uuid: dependency, version: header.version }];
  if (type === 'behavior' && project.scripts) modules[0].language = 'javascript';
  return result;
}

export async function syncManifests(cwd, project) {
  const behavior = path.join(cwd, project.packs.behavior, 'manifest.json');
  const resource = path.join(cwd, project.packs.resource, 'manifest.json');
  await fs.mkdir(path.dirname(behavior), { recursive: true });
  await fs.mkdir(path.dirname(resource), { recursive: true });
  const rp = manifest(project, 'resource');
  const bp = manifest(project, 'behavior', rp.header.uuid);
  rp.dependencies = [{ uuid: bp.header.uuid, version: rp.header.version }];
  project.uuids = { behavior: bp.header.uuid, resource: rp.header.uuid };
  await fs.writeFile(behavior, JSON.stringify(bp, null, 2) + '\n');
  await fs.writeFile(resource, JSON.stringify(rp, null, 2) + '\n');
  return project;
}

export function contentPath(project, type, category, name) {
  return path.join(project.packs[type], category, `${identifier(project.namespace, name).split(':')[1]}.json`);
}
