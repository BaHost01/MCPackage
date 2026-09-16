import fs from 'node:fs/promises';
import path from 'node:path';
import { CONFIG, exists, readJson, writeJson, identifier, slug } from './core.js';
import { loadProject } from './project.js';

const factories = {
  entity: (id) => ({ format_version: '1.21.0', 'minecraft:entity': { description: { identifier: id, is_spawnable: true, is_summonable: true }, components: { 'minecraft:type_family': { family: ['mob'] }, 'minecraft:health': { value: 20, max: 20 } } } }),
  item: (id) => ({ format_version: '1.20.0', 'minecraft:item': { description: { identifier: id, menu_category: { category: 'items' } }, components: { 'minecraft:max_stack_size': 64 } } }),
  block: (id) => ({ format_version: '1.21.0', 'minecraft:block': { description: { identifier: id, menu_category: { category: 'nature' } }, components: { 'minecraft:destroy_time': 1 } } }),
  recipe: (id) => ({ format_version: '1.20.10', 'minecraft:recipe_shaped': { description: { identifier: id }, tags: ['crafting_table'], pattern: ['###','###','###'], key: { '#': { item: 'minecraft:stone' } }, result: { item: id, count: 1 } } })
};

export async function addContent(cwd, type, name) {
  const project = await loadProject(cwd); const id = identifier(project.namespace, name); const safe = slug(name);
  const factory = factories[type]; if (!factory) throw new Error(`Unsupported type: ${type}. Use entity, item, block or recipe.`);
  const rel = type === 'entity' ? `entities/${safe}.json` : type === 'item' ? `items/${safe}.json` : type === 'block' ? `blocks/${safe}.json` : `recipes/${safe}.json`;
  const file = path.join(cwd, project.packs.behavior, rel); if (await exists(file)) throw new Error(`Already exists: ${rel}`);
  await fs.mkdir(path.dirname(file), { recursive: true }); await writeJson(file, factory(id));
  return { id, file: path.relative(cwd, file) };
}
