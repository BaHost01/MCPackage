import path from 'node:path';
import { CliError } from '../lib/errors.js';
import { ensureDir, exists, readJson, writeIfMissing, writeJson, writeText } from '../lib/fs.js';
import { syncManifests } from '../lib/manifest.js';
import { entityTexture, placeholderTexture } from '../lib/png.js';
import { ask, isInteractive, select } from '../lib/prompt.js';
import { DEFAULT_PACKS, loadProject } from '../lib/project.js';
import * as t from '../lib/templates.js';
import { c, log } from '../lib/term.js';

const NAME_RE = /^[a-z][a-z0-9_]*$/;

/**
 * Each generator receives `{ project, namespace, name, bp, rp, options }` and
 * returns a list of `{ file, content }` to write. Files are project-relative.
 * `content` may be a string, Buffer, or an object (written as JSON).
 */
const GENERATORS = {
  entity: {
    summary: 'Custom mob: behavior + client entity, geometry, texture, spawn rules, loot table',
    needs: ['behavior', 'resource'],
    files: ({ namespace, name, bp, rp }) => [
      { file: `${bp}/entities/${name}.json`, content: t.entityBehavior({ namespace, name }) },
      { file: `${bp}/spawn_rules/${name}.json`, content: t.spawnRules({ namespace, name }) },
      { file: `${bp}/loot_tables/entities/${name}.json`, content: t.entityLootTable({ namespace, name }) },
      { file: `${rp}/entity/${name}.entity.json`, content: t.entityClient({ namespace, name }) },
      { file: `${rp}/models/entity/${name}.geo.json`, content: t.entityGeometry({ name }) },
      { file: `${rp}/textures/entity/${name}.png`, content: entityTexture(`${namespace}:${name}`) },
    ],
    lang: ({ namespace, name }) => [
      ['resource', `entity.${namespace}:${name}.name=${t.titleCase(name)}`],
      ['resource', `item.spawn_egg.entity.${namespace}:${name}.name=Spawn ${t.titleCase(name)}`],
    ],
    after: ({ namespace, name }) => `Summon it in-game with ${c.cyan(`/summon ${namespace}:${name}`)} or use the spawn egg in the creative inventory.`,
  },
  item: {
    summary: 'Custom item with icon texture and atlas entry',
    needs: ['behavior', 'resource'],
    files: ({ namespace, name, bp, rp }) => [
      { file: `${bp}/items/${name}.json`, content: t.item({ namespace, name }) },
      { file: `${rp}/textures/items/${name}.png`, content: placeholderTexture(`${namespace}:${name}`) },
    ],
    atlas: ({ namespace, name, rp }) => ({
      file: `${rp}/textures/item_texture.json`,
      create: t.itemTextureAtlas,
      key: `${namespace}:${name}`,
      value: { textures: `textures/items/${name}` },
    }),
    lang: ({ namespace, name }) => [['resource', `item.${namespace}:${name}=${t.titleCase(name)}`]],
    after: ({ namespace, name }) => `Give it in-game with ${c.cyan(`/give @s ${namespace}:${name}`)}.`,
  },
  block: {
    summary: 'Custom block with texture and atlas entry',
    needs: ['behavior', 'resource'],
    files: ({ namespace, name, bp, rp }) => [
      { file: `${bp}/blocks/${name}.json`, content: t.block({ namespace, name }) },
      { file: `${rp}/textures/blocks/${name}.png`, content: placeholderTexture(`${namespace}:${name}`) },
    ],
    atlas: ({ namespace, name, rp }) => ({
      file: `${rp}/textures/terrain_texture.json`,
      create: t.terrainTextureAtlas,
      key: `${namespace}:${name}`,
      value: { textures: `textures/blocks/${name}` },
    }),
    blocksJson: ({ namespace, name }) => ({ key: `${namespace}:${name}`, value: { sound: 'stone' } }),
    lang: ({ namespace, name }) => [['resource', `tile.${namespace}:${name}.name=${t.titleCase(name)}`]],
    after: ({ namespace, name }) => `Place it in-game with ${c.cyan(`/setblock ~ ~ ~ ${namespace}:${name}`)}.`,
  },
  recipe: {
    summary: 'Crafting recipe (shaped by default, --shapeless for shapeless)',
    needs: ['behavior'],
    files: ({ namespace, name, bp, options }) => [
      {
        file: `${bp}/recipes/${name}.json`,
        content: options.shapeless ? t.recipeShapeless({ namespace, name }) : t.recipeShaped({ namespace, name }),
      },
    ],
    after: ({ name }) => `Edit the pattern/ingredients in recipes/${name}.json — the result item must exist.`,
  },
  loot_table: {
    summary: 'Loot table',
    needs: ['behavior'],
    files: ({ name, bp }) => [{ file: `${bp}/loot_tables/${name}.json`, content: t.lootTable() }],
    after: ({ name }) => `Reference it as ${c.cyan(`loot_tables/${name}.json`)} from an entity, block or /loot command.`,
  },
  function: {
    summary: 'Command function (.mcfunction)',
    needs: ['behavior'],
    files: ({ namespace, name, bp }) => [{ file: `${bp}/functions/${name}.mcfunction`, content: t.mcfunction({ namespace, name }) }],
    after: ({ name }) => `Run it in-game with ${c.cyan(`/function ${name}`)}; add it to functions/tick.json to run every tick.`,
  },
  script: {
    summary: 'Enable the Script API and create an entry point',
    needs: ['behavior'],
    files: ({ namespace, name, bp }) => [{ file: `${bp}/scripts/${name}.js`, content: t.scriptMain({ namespace, name: `${name}.js` }) }],
    configure: async ({ project, name, options }) => {
      if (project.config.scripts) return false;
      const modules = t.defaultScriptModules({ beta: Boolean(options.beta) });
      await project.save({ scripts: { entry: `scripts/${name}.js`, modules } });
      return true;
    },
    after: () => `Scripts run in worlds that enable this behavior pack. Beta APIs additionally require the "Beta APIs" experiment on the world.`,
  },
  animation: {
    summary: 'Resource pack animation + animation controller',
    needs: ['resource'],
    files: ({ name, rp }) => [
      { file: `${rp}/animations/${name}.animation.json`, content: t.animation({ name }) },
      { file: `${rp}/animation_controllers/${name}.animation_controllers.json`, content: t.animationController({ name }) },
    ],
    after: ({ name }) => `Reference ${c.cyan(`animation.${name}.idle`)} from a client entity's "animations" and "scripts.animate".`,
  },
  particle: {
    summary: 'Particle effect',
    needs: ['resource'],
    files: ({ namespace, name, rp }) => [{ file: `${rp}/particles/${name}.json`, content: t.particle({ namespace, name }) }],
    after: ({ namespace, name }) => `Spawn it with ${c.cyan(`/particle ${namespace}:${name} ~ ~1 ~`)}.`,
  },
  pack: {
    summary: 'Add a missing behavior or resource pack folder',
    needs: [],
    files: () => [],
  },
};

export default {
  name: 'add',
  group: 'Content',
  summary: 'Scaffold content: entity, item, block, recipe, function, script, …',
  usage: 'mcpackage add <type> [name] [options]',
  description: `Generates ready-to-run files for a piece of content, wires texture atlases and
translation strings, and updates manifests when needed. Types:

${Object.entries(GENERATORS)
  .map(([key, gen]) => `  ${key.padEnd(12)} ${gen.summary}`)
  .join('\n')}`,
  positionals: [
    { name: 'type', description: `One of: ${Object.keys(GENERATORS).join(', ')}`, required: true },
    { name: 'name', description: 'Lowercase identifier name (e.g. ruby_sword)' },
  ],
  options: {
    force: { type: 'boolean', short: 'f', description: 'Overwrite files that already exist' },
    shapeless: { type: 'boolean', description: 'recipe: create a shapeless recipe' },
    beta: { type: 'boolean', description: 'script: use beta script module versions' },
    'no-lang': { type: 'boolean', description: 'Do not append translation strings' },
  },
  examples: [
    'mcpackage add entity ghost',
    'mcpackage add item ruby --force',
    'mcpackage add block ruby_ore',
    'mcpackage add recipe ruby_sword --shapeless',
    'mcpackage add script main',
    'mcpackage add pack resource',
  ],
  async run({ options, positionals, cwd }) {
    const project = await loadProject(cwd);
    const [type, rawName] = positionals;
    const generator = GENERATORS[type];
    if (!generator) {
      throw new CliError(`Unknown content type "${type}".`, { hint: `Use one of: ${Object.keys(GENERATORS).join(', ')}`, exitCode: 2 });
    }

    if (type === 'pack') return addPack(project, rawName, options);

    let name = rawName;
    if (!name) {
      if (!isInteractive()) throw new CliError('Missing <name>.', { hint: `Usage: mcpackage add ${type} <name>`, exitCode: 2 });
      name = await ask(`Name for the new ${type}`, { required: true, validate: validateName });
    }
    const check = validateName(name);
    if (check !== true) throw new CliError(`Invalid name "${name}": ${check}`, { exitCode: 2 });

    // Make sure the packs this generator needs exist.
    for (const kind of generator.needs) {
      const pack = project.pack(kind);
      if (!pack || !(await exists(pack.dir))) {
        throw new CliError(`Adding ${type === 'entity' ? 'an' : 'a'} ${type} needs a ${kind} pack, which this project does not have.`, {
          hint: `Run \`mcpackage add pack ${kind}\` first.`,
        });
      }
    }

    const ctx = {
      project,
      namespace: project.config.namespace,
      name,
      bp: project.pack('behavior')?.relDir,
      rp: project.pack('resource')?.relDir,
      options,
    };

    const written = [];
    const skipped = [];
    const write = async (relFile, content) => {
      const abs = project.resolve(relFile);
      if ((await exists(abs)) && !options.force) {
        skipped.push(relFile);
        return;
      }
      await ensureDir(path.dirname(abs));
      if (typeof content === 'string' || Buffer.isBuffer(content)) await writeText(abs, content);
      else await writeJson(abs, content);
      written.push(relFile);
    };

    for (const { file, content } of generator.files(ctx)) await write(file, content);

    // Texture atlas entries.
    if (generator.atlas) {
      const { file, create, key, value } = generator.atlas(ctx);
      const abs = project.resolve(file);
      const atlas = (await exists(abs)) ? await readJson(abs) : create();
      atlas.texture_data = atlas.texture_data ?? {};
      if (!atlas.texture_data[key] || options.force) {
        atlas.texture_data[key] = value;
        await writeJson(abs, atlas);
        written.push(`${file} ${c.dim(`(+ ${key})`)}`);
      }
    }
    // blocks.json sound entry.
    if (generator.blocksJson) {
      const { key, value } = generator.blocksJson(ctx);
      const abs = project.resolve(ctx.rp, 'blocks.json');
      const blocks = (await exists(abs)) ? await readJson(abs) : t.blocksJson();
      if (!blocks[key] || options.force) {
        blocks[key] = value;
        await writeJson(abs, blocks);
        written.push(`${ctx.rp}/blocks.json ${c.dim(`(+ ${key})`)}`);
      }
    }
    // Translations.
    if (generator.lang && !options['no-lang']) {
      for (const [kind, line] of generator.lang(ctx)) {
        const pack = project.pack(kind);
        if (!pack) continue;
        const langFile = path.join(pack.dir, 'texts', 'en_US.lang');
        const langsFile = path.join(pack.dir, 'texts', 'languages.json');
        await writeIfMissing(langsFile, t.languagesJson());
        const key = line.split('=')[0];
        const current = (await exists(langFile)) ? await (await import('node:fs/promises')).readFile(langFile, 'utf8') : '';
        if (current.split(/\r?\n/).some((l) => l.trim().startsWith(`${key}=`))) continue;
        const next = `${current.replace(/\s*$/, '')}${current ? '\n' : ''}${line}\n`;
        await writeText(langFile, next);
        written.push(`${pack.relDir}/texts/en_US.lang ${c.dim(`(+ ${key})`)}`);
      }
    }
    // Config / manifest updates.
    let manifestsSynced = false;
    if (generator.configure) {
      const changed = await generator.configure(ctx);
      if (changed) {
        await syncManifests(project);
        manifestsSynced = true;
      }
    }

    if (options.json) {
      log.print(JSON.stringify({ type, name, identifier: `${ctx.namespace}:${name}`, written: written.map(stripDim), skipped, manifestsSynced }, null, 2));
      return;
    }
    if (written.length) {
      log.ok(`Added ${type} ${c.bold(`${ctx.namespace}:${name}`)}`);
      for (const file of written) log.item(file);
    }
    if (skipped.length) {
      log.warn(`Skipped ${skipped.length} existing file(s) — pass --force to overwrite:`);
      for (const file of skipped) log.item(file);
    }
    if (manifestsSynced) log.info('Updated mcpackage.json and manifests to enable scripting.');
    if (generator.after && written.length) {
      log.blank();
      log.text(`  ${generator.after(ctx)}`);
    }
  },
};

function validateName(value) {
  if (!NAME_RE.test(value)) return 'use lowercase letters, digits and underscores, starting with a letter (e.g. ruby_sword)';
  if (value.length > 64) return 'keep it under 64 characters';
  return true;
}

function stripDim(text) {
  return text.replace(/\u001b\[[0-9;]*m/g, '').replace(/ \(\+ .*\)$/, '');
}

async function addPack(project, kindArg, options) {
  const available = Object.keys(DEFAULT_PACKS).filter((kind) => !project.pack(kind) || !project.config.packs[kind]);
  const missingOnDisk = [];
  for (const pack of project.packs) if (!(await exists(pack.dir))) missingOnDisk.push(pack.kind);

  let kind = kindArg;
  if (!kind) {
    const choices = [...new Set([...available, ...missingOnDisk])];
    if (choices.length === 0) throw new CliError('This project already has every supported pack.');
    if (!isInteractive()) throw new CliError('Missing pack type.', { hint: `Usage: mcpackage add pack <${choices.join('|')}>`, exitCode: 2 });
    kind = await select('Which pack do you want to add?', choices.map((k) => ({ value: k, label: `${k} pack` })));
  }
  if (!DEFAULT_PACKS[kind]) throw new CliError(`Unknown pack type "${kind}".`, { hint: 'Use behavior or resource.', exitCode: 2 });

  const relDir = project.config.packs[kind] ?? DEFAULT_PACKS[kind];
  const dir = project.resolve(relDir);
  if (await exists(path.join(dir, 'manifest.json'))) {
    throw new CliError(`The ${kind} pack already exists at ${relDir}.`);
  }
  if (!project.config.packs[kind]) {
    await project.save({ packs: { ...project.config.packs, [kind]: relDir } });
  }
  await ensureDir(dir);
  const created = [];
  const { packIcon } = await import('../lib/png.js');
  if (await writeIfMissing(path.join(dir, 'pack_icon.png'), packIcon(project.config.name))) created.push(`${relDir}/pack_icon.png`);
  if (await writeIfMissing(path.join(dir, 'texts/languages.json'), t.languagesJson())) created.push(`${relDir}/texts/languages.json`);
  if (await writeIfMissing(path.join(dir, 'texts/en_US.lang'), t.langFile({ name: project.config.name, description: project.config.description, kind }))) {
    created.push(`${relDir}/texts/en_US.lang`);
  }
  if (kind === 'resource') {
    if (await writeIfMissing(path.join(dir, 'textures/item_texture.json'), t.itemTextureAtlas())) created.push(`${relDir}/textures/item_texture.json`);
    if (await writeIfMissing(path.join(dir, 'textures/terrain_texture.json'), t.terrainTextureAtlas())) created.push(`${relDir}/textures/terrain_texture.json`);
  }
  const fresh = await loadProject(project.root);
  const results = await syncManifests(fresh);
  for (const r of results) if (r.created) created.push(project.relative(r.file));

  if (options.json) {
    log.print(JSON.stringify({ kind, dir: relDir, created }, null, 2));
    return;
  }
  log.ok(`Added ${kind} pack at ${c.cyan(relDir)}`);
  for (const file of created) log.item(file);
}
