import path from 'node:path';
import { LATEST_ENGINE_VERSION, NAMESPACE_RE } from '../lib/bedrock.js';
import { CliError } from '../lib/errors.js';
import { ensureDir, exists, slugify, writeIfMissing, writeJson } from '../lib/fs.js';
import { syncManifests } from '../lib/manifest.js';
import { packIcon } from '../lib/png.js';
import { ask, confirm, isInteractive, multiSelect } from '../lib/prompt.js';
import { CONFIG_FILE, DEFAULT_PACKS, createDefaultConfig, loadProject } from '../lib/project.js';
import { parseVersion } from '../lib/semver.js';
import * as t from '../lib/templates.js';
import { c, log } from '../lib/term.js';

export default {
  name: 'init',
  group: 'Project',
  summary: 'Create a new add-on project (interactive)',
  usage: 'mcpackage init [dir] [options]',
  description: `Creates ${CONFIG_FILE}, pack folders with manifests, translation files,
a placeholder pack icon and (optionally) a script entry point. Existing files are
never overwritten.`,
  positionals: [{ name: 'dir', description: 'Folder to create the project in', default: '.' }],
  options: {
    yes: { type: 'boolean', short: 'y', description: 'Accept defaults without prompting' },
    name: { type: 'string', short: 'n', description: 'Add-on display name', value: '<name>' },
    namespace: { type: 'string', description: 'Identifier namespace (lowercase)', value: '<ns>' },
    description: { type: 'string', short: 'd', description: 'Short description', value: '<text>' },
    author: { type: 'string', short: 'a', description: 'Author name', value: '<name>' },
    engine: { type: 'string', description: 'Minimum engine version', value: '<x.y.z>', default: LATEST_ENGINE_VERSION },
    packs: { type: 'string', description: 'Packs to create (comma-separated)', value: '<list>', default: 'behavior,resource' },
    scripts: { type: 'boolean', description: 'Add a scripting entry point to the behavior pack' },
    'no-git': { type: 'boolean', description: 'Do not create a .gitignore' },
  },
  examples: [
    'mcpackage init',
    'mcpackage init my-addon --yes',
    'mcpackage init -n "Cool Mobs" --namespace cool --scripts -y',
  ],
  async run({ options, positionals, cwd }) {
    const targetDir = path.resolve(cwd, positionals[0] ?? '.');
    const existing = await loadProject(targetDir, { required: false });
    if (existing && existing.root === targetDir) {
      throw new CliError(`${path.basename(existing.configFile)} already exists in ${targetDir}.`, {
        hint: 'Use `mcpackage config` to change settings or `mcpackage add` to add content.',
      });
    }

    const interactive = isInteractive() && !options.yes;
    const defaults = {
      name: options.name ?? titleFromDir(targetDir),
      namespace: options.namespace ?? defaultNamespace(options.name ?? path.basename(targetDir)),
      description: options.description ?? 'A Minecraft Bedrock add-on',
      author: options.author ?? (process.env.USER || process.env.USERNAME || ''),
      engine: options.engine ?? LATEST_ENGINE_VERSION,
      packs: options.packs.split(',').map((s) => s.trim()).filter(Boolean),
      scripts: Boolean(options.scripts),
    };

    let answers = defaults;
    if (interactive) {
      log.print(`${c.bold('Creating a new Minecraft Bedrock add-on')} in ${c.cyan(targetDir)}`);
      log.print(c.dim('Press Enter to accept the default shown in parentheses.'));
      log.blank();
      const name = await ask('Add-on name', { default: defaults.name, required: true });
      const namespace = await ask('Namespace (used in identifiers like ns:my_item)', {
        default: defaultNamespace(name),
        validate: (v) => (NAMESPACE_RE.test(v) && v !== 'minecraft' ? true : 'Use lowercase letters, digits and underscores; "minecraft" is reserved.'),
      });
      const description = await ask('Description', { default: defaults.description });
      const author = await ask('Author', { default: defaults.author });
      const engine = await ask('Minimum engine version', {
        default: defaults.engine,
        validate: (v) => (parseVersion(v) ? true : 'Enter a version like 1.26.40'),
      });
      const packs = await multiSelect(
        'Which packs do you need?',
        [
          { value: 'behavior', label: 'Behavior pack', hint: 'entities, items, blocks, recipes, scripts' },
          { value: 'resource', label: 'Resource pack', hint: 'textures, models, sounds, UI' },
        ],
        { default: defaults.packs },
      );
      const scripts = packs.includes('behavior') ? await confirm('Add a JavaScript scripting entry point?', { default: defaults.scripts }) : false;
      answers = { name, namespace, description, author, engine, packs, scripts };
      log.blank();
    }

    for (const kind of answers.packs) {
      if (!DEFAULT_PACKS[kind]) throw new CliError(`Unknown pack type "${kind}". Use behavior and/or resource.`);
    }
    if (answers.packs.length === 0) throw new CliError('At least one pack is required.');
    if (!NAMESPACE_RE.test(answers.namespace) || answers.namespace === 'minecraft') {
      throw new CliError(`Invalid namespace "${answers.namespace}".`, { hint: 'Use lowercase letters, digits and underscores.' });
    }
    if (!parseVersion(answers.engine)) throw new CliError(`Invalid engine version "${answers.engine}".`);

    await ensureDir(targetDir);
    const created = [];
    const track = (file, wasCreated) => wasCreated && created.push(path.relative(targetDir, file).split(path.sep).join('/'));

    // Config
    const config = createDefaultConfig({
      name: answers.name,
      namespace: answers.namespace,
      description: answers.description,
      author: answers.author,
      minEngineVersion: answers.engine,
    });
    config.packs = Object.fromEntries(answers.packs.map((kind) => [kind, DEFAULT_PACKS[kind]]));
    if (answers.scripts) config.scripts = { entry: 'scripts/main.js', modules: t.defaultScriptModules() };
    const configFile = path.join(targetDir, CONFIG_FILE);
    await writeJson(configFile, config);
    track(configFile, true);

    // Packs
    const icon = packIcon(answers.name);
    for (const kind of answers.packs) {
      const dir = path.join(targetDir, DEFAULT_PACKS[kind]);
      await ensureDir(dir);
      track(path.join(dir, 'pack_icon.png'), await writeIfMissing(path.join(dir, 'pack_icon.png'), icon));
      track(path.join(dir, 'texts/languages.json'), await writeIfMissing(path.join(dir, 'texts/languages.json'), t.languagesJson()));
      track(path.join(dir, 'texts/en_US.lang'), await writeIfMissing(path.join(dir, 'texts/en_US.lang'), t.langFile({ ...answers, kind })));
      if (kind === 'resource') {
        track(path.join(dir, 'textures/item_texture.json'), await writeIfMissing(path.join(dir, 'textures/item_texture.json'), t.itemTextureAtlas()));
        track(path.join(dir, 'textures/terrain_texture.json'), await writeIfMissing(path.join(dir, 'textures/terrain_texture.json'), t.terrainTextureAtlas()));
      }
      if (kind === 'behavior' && answers.scripts) {
        track(path.join(dir, 'scripts/main.js'), await writeIfMissing(path.join(dir, 'scripts/main.js'), t.scriptMain({ namespace: answers.namespace, name: 'main.js' })));
      }
    }

    // Manifests (after packs exist so cross-dependencies are wired).
    const project = await loadProject(targetDir);
    const manifests = await syncManifests(project);
    for (const m of manifests) track(m.file, m.created);

    // Repo niceties
    if (!options['no-git']) track(path.join(targetDir, '.gitignore'), await writeIfMissing(path.join(targetDir, '.gitignore'), t.gitignore()));
    track(path.join(targetDir, 'README.md'), await writeIfMissing(path.join(targetDir, 'README.md'), t.readme(answers)));
    if (answers.scripts) {
      track(path.join(targetDir, 'jsconfig.json'), await writeIfMissing(path.join(targetDir, 'jsconfig.json'), t.jsconfig()));
      const pkg = path.join(targetDir, 'package.json');
      if (!(await exists(pkg))) {
        track(pkg, await writeIfMissing(pkg, t.scriptsPackageJson({ namespace: answers.namespace, modules: config.scripts.modules })));
      }
    }

    if (options.json) {
      log.print(JSON.stringify({ root: targetDir, created, config }, null, 2));
      return;
    }
    log.ok(`Created ${c.bold(answers.name)} in ${c.cyan(project.relative(targetDir) === '.' ? targetDir : targetDir)}`);
    for (const file of created) log.item(file);
    log.blank();
    log.print(c.bold('Next steps'));
    const cdHint = path.resolve(cwd) !== targetDir ? `  cd ${path.relative(cwd, targetDir) || '.'}\n` : '';
    log.print(`${cdHint}  mcpackage add entity my_mob     ${c.dim('# scaffold content')}\n  mcpackage lint                  ${c.dim('# check for problems')}\n  mcpackage watch                 ${c.dim('# deploy to Minecraft on every change')}\n  mcpackage build                 ${c.dim('# create dist/*.mcaddon')}`);
    if (answers.scripts) {
      log.blank();
      log.info(`Run ${c.cyan('npm install')} in the project to get editor IntelliSense for @minecraft/server.`);
    }
  },
};

function titleFromDir(dir) {
  const base = path.basename(dir);
  if (!base || base === '.' || base === '/') return 'My Add-On';
  return t.titleCase(base);
}

/** Derives a short, valid namespace from a display name (e.g. "Cool Mobs!" → "coolmobs"). */
function defaultNamespace(name) {
  const slug = slugify(name).replace(/_/g, '').replace(/^\d+/, '').slice(0, 16);
  return slug && slug !== 'minecraft' ? slug : 'custom';
}
