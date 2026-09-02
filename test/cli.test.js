import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { exists, initProject, mcpackage, readJson, tmpdir, writeJson } from './helpers.js';
import { listZipEntries, readZipEntry } from '../src/lib/zip.js';

describe('cli basics', () => {
  it('prints version and help', async () => {
    const version = await mcpackage(['--version']);
    assert.equal(version.code, 0);
    assert.match(version.stdout.trim(), /^\d+\.\d+\.\d+$/);
    const help = await mcpackage(['--help']);
    assert.equal(help.code, 0);
    assert.match(help.stdout, /Usage/);
    assert.match(help.stdout, /\binit\b/);
    assert.match(help.stdout, /\bbuild\b/);
    const sub = await mcpackage(['build', '--help']);
    assert.equal(sub.code, 0);
    assert.match(sub.stdout, /--type/);
  });
  it('suggests commands for typos and exits 2 on usage errors', async () => {
    const typo = await mcpackage(['biuld']);
    assert.equal(typo.code, 2);
    assert.match(typo.stderr, /Did you mean `mcpackage build`/);
    const badOpt = await mcpackage(['lint', '--nope']);
    assert.equal(badOpt.code, 2);
    assert.match(badOpt.stderr, /Unknown option --nope/);
    const badChoice = await mcpackage(['build', '--type', 'zip']);
    assert.equal(badChoice.code, 2);
    assert.match(badChoice.stderr, /addon, pack, both/);
  });
  it('fails clearly outside a project', async () => {
    const dir = await tmpdir();
    const result = await mcpackage(['lint'], { cwd: dir });
    assert.equal(result.code, 1);
    assert.match(result.stderr, /No mcpackage\.json found/);
    assert.match(result.stderr, /mcpackage init/);
  });
});

describe('init', () => {
  let dir;
  before(async () => {
    dir = await tmpdir();
  });

  it('scaffolds a complete project non-interactively', async () => {
    const result = await mcpackage(['init', 'proj', '-y', '-n', 'Cool Mobs', '--namespace', 'cool', '--scripts', '--json'], { cwd: dir });
    assert.equal(result.code, 0, result.stderr);
    const root = path.join(dir, 'proj');
    assert.equal(result.json.root, root);
    for (const file of [
      'mcpackage.json',
      'packs/behavior/manifest.json',
      'packs/behavior/pack_icon.png',
      'packs/behavior/scripts/main.js',
      'packs/behavior/texts/en_US.lang',
      'packs/behavior/texts/languages.json',
      'packs/resource/manifest.json',
      'packs/resource/textures/item_texture.json',
      'packs/resource/textures/terrain_texture.json',
      '.gitignore',
      'README.md',
      'jsconfig.json',
      'package.json',
    ]) {
      assert.ok(await exists(path.join(root, file)), `${file} should exist`);
    }
    const config = await readJson(path.join(root, 'mcpackage.json'));
    assert.equal(config.name, 'Cool Mobs');
    assert.equal(config.namespace, 'cool');
    assert.equal(config.scripts.entry, 'scripts/main.js');

    const bp = await readJson(path.join(root, 'packs/behavior/manifest.json'));
    const rp = await readJson(path.join(root, 'packs/resource/manifest.json'));
    assert.notEqual(bp.header.uuid, rp.header.uuid);
    assert.ok(bp.dependencies.some((d) => d.uuid === rp.header.uuid), 'BP depends on RP');
    assert.ok(rp.dependencies.some((d) => d.uuid === bp.header.uuid), 'RP depends on BP');
    assert.ok(bp.modules.some((m) => m.type === 'script' && m.entry === 'scripts/main.js'));

    const lint = await mcpackage(['lint'], { cwd: root });
    assert.equal(lint.code, 0, lint.stderr);
  });

  it('refuses to re-init and validates inputs', async () => {
    const again = await mcpackage(['init', 'proj', '-y'], { cwd: dir });
    assert.equal(again.code, 1);
    assert.match(again.stderr, /already exists/);
    const badNs = await mcpackage(['init', 'other', '-y', '--namespace', 'Bad NS'], { cwd: dir });
    assert.equal(badNs.code, 1);
    assert.match(badNs.stderr, /Invalid namespace/);
    const onlyBp = await mcpackage(['init', 'bp-only', '-y', '--packs', 'behavior'], { cwd: dir });
    assert.equal(onlyBp.code, 0, onlyBp.stderr);
    assert.ok(!(await exists(path.join(dir, 'bp-only/packs/resource'))));
    const bp = await readJson(path.join(dir, 'bp-only/packs/behavior/manifest.json'));
    assert.equal(bp.dependencies, undefined, 'no dependency on a pack that does not exist');
  });

  it('derives sensible defaults from the folder name', async () => {
    const result = await mcpackage(['init', 'my-epic-addon', '-y', '--json'], { cwd: dir });
    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.json.config.name, 'My Epic Addon');
    assert.equal(result.json.config.namespace, 'myepicaddon');
  });
});

describe('add', () => {
  let root;
  before(async () => {
    root = await initProject(await tmpdir());
  });

  it('scaffolds an entity across both packs and wires translations', async () => {
    const result = await mcpackage(['add', 'entity', 'ghost', '--json'], { cwd: root });
    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.json.identifier, 'test:ghost');
    for (const file of [
      'packs/behavior/entities/ghost.json',
      'packs/behavior/spawn_rules/ghost.json',
      'packs/behavior/loot_tables/entities/ghost.json',
      'packs/resource/entity/ghost.entity.json',
      'packs/resource/models/entity/ghost.geo.json',
      'packs/resource/textures/entity/ghost.png',
    ]) {
      assert.ok(await exists(path.join(root, file)), file);
    }
    const lang = await fsp.readFile(path.join(root, 'packs/resource/texts/en_US.lang'), 'utf8');
    assert.match(lang, /^entity\.test:ghost\.name=Ghost$/m);
    assert.match(lang, /^item\.spawn_egg\.entity\.test:ghost\.name=Spawn Ghost$/m);
    const entity = await readJson(path.join(root, 'packs/behavior/entities/ghost.json'));
    assert.equal(entity['minecraft:entity'].description.identifier, 'test:ghost');
  });

  it('scaffolds items and blocks with atlas entries', async () => {
    assert.equal((await mcpackage(['add', 'item', 'ruby'], { cwd: root })).code, 0);
    assert.equal((await mcpackage(['add', 'block', 'ruby_ore'], { cwd: root })).code, 0);
    const items = await readJson(path.join(root, 'packs/resource/textures/item_texture.json'));
    assert.deepEqual(items.texture_data['test:ruby'], { textures: 'textures/items/ruby' });
    const terrain = await readJson(path.join(root, 'packs/resource/textures/terrain_texture.json'));
    assert.deepEqual(terrain.texture_data['test:ruby_ore'], { textures: 'textures/blocks/ruby_ore' });
    const blocks = await readJson(path.join(root, 'packs/resource/blocks.json'));
    assert.equal(blocks['test:ruby_ore'].sound, 'stone');
    const lang = await fsp.readFile(path.join(root, 'packs/resource/texts/en_US.lang'), 'utf8');
    assert.match(lang, /^item\.test:ruby=Ruby$/m);
    assert.match(lang, /^tile\.test:ruby_ore\.name=Ruby Ore$/m);
  });

  it('does not overwrite without --force and does not duplicate lang keys', async () => {
    await fsp.writeFile(path.join(root, 'packs/behavior/items/ruby.json'), '{"custom":true}');
    const skip = await mcpackage(['add', 'item', 'ruby', '--json'], { cwd: root });
    assert.equal(skip.code, 0);
    assert.ok(skip.json.skipped.includes('packs/behavior/items/ruby.json'));
    assert.equal(await fsp.readFile(path.join(root, 'packs/behavior/items/ruby.json'), 'utf8'), '{"custom":true}');
    const lang = await fsp.readFile(path.join(root, 'packs/resource/texts/en_US.lang'), 'utf8');
    assert.equal(lang.match(/^item\.test:ruby=/gm).length, 1);
    const force = await mcpackage(['add', 'item', 'ruby', '--force', '--json'], { cwd: root });
    assert.equal(force.code, 0);
    assert.ok(force.json.written.includes('packs/behavior/items/ruby.json'));
  });

  it('adds recipes, functions, loot tables, animations and particles', async () => {
    for (const [type, name] of [['recipe', 'ruby'], ['function', 'hello'], ['loot_table', 'treasure'], ['animation', 'ghost'], ['particle', 'sparkle']]) {
      const result = await mcpackage(['add', type, name], { cwd: root });
      assert.equal(result.code, 0, `${type}: ${result.stderr}`);
    }
    const shapeless = await mcpackage(['add', 'recipe', 'ruby_alt', '--shapeless'], { cwd: root });
    assert.equal(shapeless.code, 0);
    const recipe = await readJson(path.join(root, 'packs/behavior/recipes/ruby_alt.json'));
    assert.ok(recipe['minecraft:recipe_shapeless']);
  });

  it('enables scripting via add script', async () => {
    const result = await mcpackage(['add', 'script', 'main', '--json'], { cwd: root });
    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.json.manifestsSynced, true);
    const config = await readJson(path.join(root, 'mcpackage.json'));
    assert.equal(config.scripts.entry, 'scripts/main.js');
    const bp = await readJson(path.join(root, 'packs/behavior/manifest.json'));
    assert.ok(bp.modules.some((m) => m.type === 'script'));
    assert.ok(bp.dependencies.some((d) => d.module_name === '@minecraft/server'));
  });

  it('project still lints clean after all additions', async () => {
    const lint = await mcpackage(['lint', '--json'], { cwd: root });
    assert.equal(lint.code, 0, lint.stdout);
    assert.equal(lint.json.errors, 0);
    assert.equal(lint.json.warnings, 0);
  });

  it('validates names and types', async () => {
    assert.equal((await mcpackage(['add', 'item', 'Bad Name'], { cwd: root })).code, 2);
    assert.equal((await mcpackage(['add', 'widget', 'x'], { cwd: root })).code, 2);
    assert.equal((await mcpackage(['add', 'item'], { cwd: root })).code, 2);
  });

  it('requires the right packs', async () => {
    const bpOnly = await initProject(await tmpdir(), ['--packs', 'behavior']);
    const result = await mcpackage(['add', 'entity', 'x'], { cwd: bpOnly });
    assert.equal(result.code, 1);
    assert.match(result.stderr, /needs a resource pack/);
    const addPack = await mcpackage(['add', 'pack', 'resource'], { cwd: bpOnly });
    assert.equal(addPack.code, 0, addPack.stderr);
    assert.ok(await exists(path.join(bpOnly, 'packs/resource/manifest.json')));
    assert.equal((await mcpackage(['add', 'entity', 'x'], { cwd: bpOnly })).code, 0);
  });
});

describe('lint', () => {
  let root;
  before(async () => {
    root = await initProject(await tmpdir(), ['--scripts']);
    await mcpackage(['add', 'item', 'ruby'], { cwd: root });
  });

  it('accepts JSON with comments and trailing commas', async () => {
    await fsp.writeFile(
      path.join(root, 'packs/behavior/items/commented.json'),
      `// comment\n{\n  "format_version": "1.26.40",\n  "minecraft:item": {\n    "description": { "identifier": "test:commented", "menu_category": { "category": "items" } },\n    "components": {},\n  },\n}\n`,
    );
    const result = await mcpackage(['lint', '--json'], { cwd: root });
    assert.equal(result.json.errors, 0, JSON.stringify(result.json.diagnostics));
  });

  it('reports the important mistakes', async () => {
    await fsp.writeFile(path.join(root, 'packs/behavior/items/broken.json'), '{ "a": ');
    await fsp.writeFile(
      path.join(root, 'packs/behavior/items/dup.json'),
      JSON.stringify({ format_version: '1.26.40', 'minecraft:item': { description: { identifier: 'test:ruby' }, components: { 'minecraft:icon': 'test:nope' } } }),
    );
    await fsp.writeFile(
      path.join(root, 'packs/behavior/items/badid.json'),
      JSON.stringify({ format_version: '1.26.40', 'minecraft:item': { description: { identifier: 'Bad Id' }, components: {} } }),
    );
    await fsp.writeFile(path.join(root, 'packs/resource/textures/fake.png'), 'nope');
    await fsp.writeFile(path.join(root, 'packs/resource/.DS_Store'), '');
    await fsp.appendFile(path.join(root, 'packs/behavior/scripts/main.js'), '\nconst fs = require("fs");\n');

    const result = await mcpackage(['lint', '--json'], { cwd: root });
    assert.equal(result.code, 1);
    const rules = new Set(result.json.diagnostics.map((d) => d.rule));
    for (const rule of ['json/syntax', 'content/duplicate-identifier', 'content/bad-identifier', 'texture/undefined-shortname', 'texture/invalid-png', 'pack/junk-file', 'script/require']) {
      assert.ok(rules.has(rule), `expected rule ${rule}, got ${[...rules].join(', ')}`);
    }
    const syntax = result.json.diagnostics.find((d) => d.rule === 'json/syntax');
    assert.match(syntax.message, /line 1/);
  });

  it('--strict turns warnings into errors and --rule filters output', async () => {
    const clean = await initProject(await tmpdir());
    await fsp.rm(path.join(clean, 'packs/resource/pack_icon.png'));
    const normal = await mcpackage(['lint', '--json'], { cwd: clean });
    assert.equal(normal.code, 0);
    assert.equal(normal.json.warnings, 1);
    const strict = await mcpackage(['lint', '--strict', '--json'], { cwd: clean });
    assert.equal(strict.code, 1);
    assert.equal(strict.json.errors, 1);
    const filtered = await mcpackage(['lint', '--rule', 'manifest/', '--json'], { cwd: clean });
    assert.equal(filtered.json.diagnostics.length, 0);
  });

  it('detects manifest problems', async () => {
    const proj = await initProject(await tmpdir());
    const manifestFile = path.join(proj, 'packs/resource/manifest.json');
    const manifest = await readJson(manifestFile);
    manifest.header.uuid = 'not-a-uuid';
    manifest.modules = [];
    await writeJson(manifestFile, manifest);
    const result = await mcpackage(['lint', '--json'], { cwd: proj });
    assert.equal(result.code, 1);
    assert.ok(result.json.diagnostics.some((d) => d.rule === 'manifest/invalid' && /uuid/.test(d.message)));
    assert.ok(result.json.diagnostics.some((d) => d.rule === 'manifest/invalid' && /modules/.test(d.message)));
    // Same UUID in both packs.
    const bpFile = path.join(proj, 'packs/behavior/manifest.json');
    const bp = await readJson(bpFile);
    const rp = await readJson(manifestFile);
    rp.header.uuid = bp.header.uuid;
    rp.modules = [{ type: 'resources', uuid: '12345678-1234-4123-8123-123456789abc', version: [1, 0, 0] }];
    await writeJson(manifestFile, rp);
    const shared = await mcpackage(['lint', '--json'], { cwd: proj });
    assert.ok(shared.json.diagnostics.some((d) => d.rule === 'manifest/shared-uuid'));
  });
});

describe('build / inspect / clean', () => {
  let root;
  before(async () => {
    root = await initProject(await tmpdir(), ['--scripts']);
    await mcpackage(['add', 'entity', 'ghost'], { cwd: root });
    await mcpackage(['add', 'item', 'ruby'], { cwd: root });
    await fsp.writeFile(path.join(root, 'packs/resource/.DS_Store'), 'junk');
    await fsp.writeFile(path.join(root, 'packs/resource/textures/source.psd'), 'junk');
    await fsp.writeFile(path.join(root, 'packs/behavior/notes.md'), 'junk');
    await fsp.writeFile(path.join(root, 'packs/behavior/.mcpackageignore'), 'scratch/**\n');
    await fsp.mkdir(path.join(root, 'packs/behavior/scratch'));
    await fsp.writeFile(path.join(root, 'packs/behavior/scratch/wip.json'), '{}');
  });

  it('builds addon + packs, excluding junk, and inspect validates them', async () => {
    const result = await mcpackage(['build', '--type', 'both', '--json'], { cwd: root });
    assert.equal(result.code, 0, result.stderr);
    const files = result.json.artifacts.map((a) => path.basename(a.file)).sort();
    assert.deepEqual(files, ['Test_Addon-v1.0.0-BP.mcpack', 'Test_Addon-v1.0.0-RP.mcpack', 'Test_Addon-v1.0.0.mcaddon']);

    const addon = await fsp.readFile(path.join(root, 'dist/Test_Addon-v1.0.0.mcaddon'));
    const entries = listZipEntries(addon).map((e) => e.name);
    assert.ok(entries.includes('Test_Addon_BP/manifest.json'));
    assert.ok(entries.includes('Test_Addon_RP/manifest.json'));
    assert.ok(entries.includes('Test_Addon_BP/scripts/main.js'));
    assert.ok(entries.includes('Test_Addon_RP/textures/entity/ghost.png'));
    assert.ok(!entries.some((e) => /\.DS_Store|\.psd$|notes\.md|scratch\/|\.mcpackageignore/.test(e)), `junk leaked: ${entries.join(', ')}`);

    const rpPack = await fsp.readFile(path.join(root, 'dist/Test_Addon-v1.0.0-RP.mcpack'));
    const rpEntries = listZipEntries(rpPack);
    assert.ok(rpEntries.some((e) => e.name === 'manifest.json'), 'mcpack has manifest at root');
    const manifest = JSON.parse(readZipEntry(rpPack, rpEntries.find((e) => e.name === 'manifest.json')).toString());
    assert.equal(manifest.header.name, 'Test Addon RP');

    const inspect = await mcpackage(['inspect', 'dist/Test_Addon-v1.0.0.mcaddon', '--json'], { cwd: root });
    assert.equal(inspect.code, 0, inspect.stderr);
    assert.equal(inspect.json.type, 'addon');
    assert.deepEqual(inspect.json.packs.map((p) => p.kind).sort(), ['behavior', 'resource']);
    assert.ok(inspect.json.packs.every((p) => p.validation.errors.length === 0));
  });

  it('refuses to build when lint finds errors unless --skip-lint', async () => {
    await fsp.writeFile(path.join(root, 'packs/behavior/items/broken.json'), '{');
    const fail = await mcpackage(['build'], { cwd: root });
    assert.equal(fail.code, 1);
    assert.match(fail.stderr, /Build aborted/);
    const forced = await mcpackage(['build', '--skip-lint'], { cwd: root });
    assert.equal(forced.code, 0, forced.stderr);
    await fsp.rm(path.join(root, 'packs/behavior/items/broken.json'));
  });

  it('reproducible builds are byte-identical', async () => {
    await mcpackage(['build', '--reproducible', '--out', 'r1'], { cwd: root });
    await mcpackage(['build', '--reproducible', '--out', 'r2'], { cwd: root });
    const a = await fsp.readFile(path.join(root, 'r1/Test_Addon-v1.0.0.mcaddon'));
    const b = await fsp.readFile(path.join(root, 'r2/Test_Addon-v1.0.0.mcaddon'));
    assert.ok(a.equals(b));
  });

  it('clean removes dist and stray archives', async () => {
    await fsp.writeFile(path.join(root, 'old.mcpack'), 'x');
    const dry = await mcpackage(['clean', '--dry-run', '--json'], { cwd: root });
    assert.ok(await exists(path.join(root, 'dist')));
    assert.ok(dry.json.removed.some((r) => r.path === 'old.mcpack'));
    const result = await mcpackage(['clean', '--json'], { cwd: root });
    assert.equal(result.code, 0);
    assert.ok(!(await exists(path.join(root, 'dist'))));
    assert.ok(!(await exists(path.join(root, 'old.mcpack'))));
  });

  it('inspect rejects non-archives', async () => {
    const result = await mcpackage(['inspect', 'mcpackage.json'], { cwd: root });
    assert.equal(result.code, 1);
    assert.match(result.stderr, /not a valid zip/);
  });
});

describe('deploy', () => {
  it('copies packs into development folders and cleans stale files', async () => {
    const root = await initProject(await tmpdir());
    await mcpackage(['add', 'item', 'ruby'], { cwd: root });
    const comMojang = await tmpdir('com.mojang-');
    const first = await mcpackage(['deploy', '--target', comMojang, '--json'], { cwd: root });
    assert.equal(first.code, 0, first.stderr);
    const bpTarget = path.join(comMojang, 'development_behavior_packs', 'Test_Addon_BP');
    assert.ok(await exists(path.join(bpTarget, 'manifest.json')));
    assert.ok(await exists(path.join(bpTarget, 'items/ruby.json')));
    assert.ok(await exists(path.join(comMojang, 'development_resource_packs', 'Test_Addon_RP', 'textures/items/ruby.png')));

    await fsp.rm(path.join(root, 'packs/behavior/items/ruby.json'));
    await mcpackage(['deploy', '--target', comMojang], { cwd: root });
    assert.ok(!(await exists(path.join(bpTarget, 'items/ruby.json'))), 'stale file removed by clean deploy');

    const dry = await mcpackage(['deploy', '--target', comMojang, '--dry-run', '--json'], { cwd: root });
    assert.equal(dry.json.dryRun, true);
  });

  it('honours MCPACKAGE_COM_MOJANG and errors when nothing is found', async () => {
    const root = await initProject(await tmpdir());
    const comMojang = await tmpdir('com.mojang-');
    const viaEnv = await mcpackage(['deploy', '--json'], { cwd: root, env: { MCPACKAGE_COM_MOJANG: comMojang } });
    assert.equal(viaEnv.code, 0, viaEnv.stderr);
    assert.equal(viaEnv.json.comMojang, comMojang);
    const missing = await mcpackage(['deploy', '--target', path.join(comMojang, 'nope')], { cwd: root, env: { MCPACKAGE_COM_MOJANG: '' } });
    assert.equal(missing.code, 1);
    assert.match(missing.stderr, /Could not find a com\.mojang folder/);
  });
});

describe('version / config / manifest / experimental', () => {
  let root;
  before(async () => {
    root = await initProject(await tmpdir(), ['--scripts']);
  });

  it('bumps versions and syncs manifests', async () => {
    assert.equal((await mcpackage(['version'], { cwd: root })).stdout.trim(), '1.0.0');
    const bump = await mcpackage(['version', 'minor', '--json'], { cwd: root });
    assert.equal(bump.code, 0, bump.stderr);
    assert.equal(bump.json.version, '1.1.0');
    const bp = await readJson(path.join(root, 'packs/behavior/manifest.json'));
    assert.deepEqual(bp.header.version, [1, 1, 0]);
    assert.ok(bp.modules.every((m) => m.version.join('.') === '1.1.0'));
    const rp = await readJson(path.join(root, 'packs/resource/manifest.json'));
    assert.deepEqual(rp.dependencies.find((d) => d.uuid === bp.header.uuid).version, [1, 1, 0]);
    assert.equal((await mcpackage(['version', '2.0.0'], { cwd: root })).code, 0);
    assert.equal((await mcpackage(['version'], { cwd: root })).stdout.trim(), '2.0.0');
    assert.equal((await mcpackage(['version', 'nope'], { cwd: root })).code, 2);
  });

  it('reads and writes config keys', async () => {
    const set = await mcpackage(['config', 'authors', 'Ana, Ben', '--json'], { cwd: root });
    assert.equal(set.code, 0, set.stderr);
    assert.deepEqual(set.json.value, ['Ana', 'Ben']);
    const bp = await readJson(path.join(root, 'packs/behavior/manifest.json'));
    assert.deepEqual(bp.metadata.authors, ['Ana', 'Ben']);
    assert.equal((await mcpackage(['config', 'name'], { cwd: root })).stdout.trim(), 'Test Addon');
    assert.equal((await mcpackage(['config', 'minEngineVersion', 'bad'], { cwd: root })).code, 2);
    assert.equal((await mcpackage(['config', 'bogus', 'x'], { cwd: root })).code, 2);
    const nested = await mcpackage(['config', 'build.outDir', 'out', '--json'], { cwd: root });
    assert.equal(nested.json.value, 'out');
    const all = await mcpackage(['config', '--json'], { cwd: root });
    assert.equal(all.json.build.outDir, 'out');
    const unset = await mcpackage(['config', 'license', '--unset', '--json'], { cwd: root });
    assert.equal(unset.code, 0);
  });

  it('manifest sync is idempotent and preserves UUIDs', async () => {
    const before = await readJson(path.join(root, 'packs/behavior/manifest.json'));
    const first = await mcpackage(['manifest', '--json'], { cwd: root });
    assert.equal(first.code, 0);
    assert.ok(first.json.every((r) => r.changed === false), 'second sync should be a no-op');
    const after = await readJson(path.join(root, 'packs/behavior/manifest.json'));
    assert.deepEqual(after, before);
    const dry = await mcpackage(['manifest', '--dry-run'], { cwd: root });
    assert.equal(dry.code, 0);
  });

  it('toggles capabilities and beta script modules', async () => {
    const beta = await mcpackage(['experimental', '--beta-apis', '--enable', 'script_eval', '--json'], { cwd: root });
    assert.equal(beta.code, 0, beta.stderr);
    assert.deepEqual(beta.json.capabilities, ['script_eval']);
    assert.match(beta.json.scripts.modules['@minecraft/server'], /beta/);
    let bp = await readJson(path.join(root, 'packs/behavior/manifest.json'));
    assert.deepEqual(bp.capabilities, ['script_eval']);
    assert.match(bp.dependencies.find((d) => d.module_name === '@minecraft/server').version, /beta/);

    const stable = await mcpackage(['experimental', '--stable-apis', '--disable', 'script_eval', '--json'], { cwd: root });
    assert.equal(stable.code, 0, stable.stderr);
    bp = await readJson(path.join(root, 'packs/behavior/manifest.json'));
    assert.equal(bp.capabilities, undefined);
    assert.equal(bp.dependencies.find((d) => d.module_name === '@minecraft/server').version, '2.9.0');
    assert.equal((await mcpackage(['experimental', '--enable', 'nonsense'], { cwd: root })).code, 2);
  });

  it('stats and doctor produce reports', async () => {
    const stats = await mcpackage(['stats', '--json'], { cwd: root });
    assert.equal(stats.code, 0, stats.stderr);
    assert.equal(stats.json.packs.length, 2);
    assert.ok(stats.json.packs.find((p) => p.kind === 'behavior').scripts);
    const doctor = await mcpackage(['doctor', '--json'], { cwd: root });
    assert.equal(doctor.code, 0, doctor.stderr);
    assert.ok(doctor.json.checks.some((ch) => /Node\.js/.test(ch.label) && ch.status === 'ok'));
  });
});

describe('migrate', () => {
  it('upgrades a v2 project keeping UUIDs', async () => {
    const dir = await tmpdir();
    await writeJson(path.join(dir, 'mc-config.json'), { name: 'Old Addon', namespace: 'Old-NS', description: 'v2', version: '1.2.3', minEngineVersion: '1.21.0', author: 'someone' });
    await writeJson(path.join(dir, 'behavior_pack/manifest.json'), {
      format_version: 2,
      header: { name: 'Old Addon BP', uuid: '11111111-2222-4333-8444-555555555555', version: [1, 2, 3], min_engine_version: [1, 21, 0] },
      modules: [{ type: 'data', uuid: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', version: [1, 2, 3] }],
      capabilities: { gametest: true },
      metadata: { generated_with: 'MC CLI V2' },
    });
    await writeJson(path.join(dir, 'behavior_pack/items/thing.json'), { format_version: '1.21.0', 'minecraft:item': { description: { identifier: 'oldns:thing' }, components: {} } });
    await fsp.mkdir(path.join(dir, 'resource_pack'));
    await writeJson(path.join(dir, '.mc-audit.json'), { version: 2.1 });

    // Legacy layout is usable before migrating, and lint spots what v2 got wrong.
    const preLint = await mcpackage(['lint', '--json'], { cwd: dir });
    const preRules = preLint.json.diagnostics.filter((d) => d.level === 'error').map((d) => `${d.rule}:${d.file}`).sort();
    assert.deepEqual(preRules, ['manifest/invalid:behavior_pack/manifest.json', 'manifest/missing:resource_pack/manifest.json']);
    assert.ok(preLint.json.diagnostics.some((d) => /capabilities must be an array/.test(d.message)));

    const result = await mcpackage(['migrate', '-y', '--json'], { cwd: dir });
    assert.equal(result.code, 0, result.stderr);
    assert.ok(await exists(path.join(dir, 'mcpackage.json')));
    assert.ok(!(await exists(path.join(dir, 'mc-config.json'))));
    assert.ok(!(await exists(path.join(dir, '.mc-audit.json'))));
    assert.ok(!(await exists(path.join(dir, 'behavior_pack'))));
    assert.ok(await exists(path.join(dir, 'packs/behavior/items/thing.json')));
    const config = await readJson(path.join(dir, 'mcpackage.json'));
    assert.equal(config.namespace, 'oldns');
    assert.deepEqual(config.authors, ['someone']);
    const bp = await readJson(path.join(dir, 'packs/behavior/manifest.json'));
    assert.equal(bp.header.uuid, '11111111-2222-4333-8444-555555555555');
    assert.equal(bp.modules[0].uuid, 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee');
    assert.equal(bp.capabilities, undefined);
    assert.ok(await exists(path.join(dir, 'packs/resource/manifest.json')));
    const postLint = await mcpackage(['lint', '--json'], { cwd: dir });
    assert.equal(postLint.json.errors, 0, 'migration leaves a valid project');
    const again = await mcpackage(['migrate', '-y'], { cwd: dir });
    assert.equal(again.code, 0);
    assert.match(again.stdout, /Nothing to migrate/);
  });

  it('can keep the old folder layout', async () => {
    const dir = await tmpdir();
    await writeJson(path.join(dir, 'mc-config.json'), { name: 'Keep', version: '1.0.0', minEngineVersion: '1.21.0' });
    await fsp.mkdir(path.join(dir, 'behavior_pack'));
    const result = await mcpackage(['migrate', '-y', '--keep-layout', '--json'], { cwd: dir });
    assert.equal(result.code, 0, result.stderr);
    assert.deepEqual(result.json.config.packs, { behavior: 'behavior_pack' });
    assert.ok(await exists(path.join(dir, 'behavior_pack/manifest.json')));
  });
});

after(() => {
  // Temp directories are left for the OS to clean; they are tiny.
});
