import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { crc32 } from '../src/lib/crc32.js';
import { globToRegExp, parseJson, slugify, stripJsonComments } from '../src/lib/fs.js';
import { buildManifest, validateManifest } from '../src/lib/manifest.js';
import { createPng } from '../src/lib/png.js';
import { normalizeConfig } from '../src/lib/project.js';
import { bumpVersion, compareVersions, formatVersion, parseVersion } from '../src/lib/semver.js';
import { isUuid } from '../src/lib/uuid.js';
import { createZipBuffer, listZipEntries, readZipEntry } from '../src/lib/zip.js';
import { comMojangCandidates } from '../src/lib/bedrock.js';
import { formatBytes, stripAnsi, table } from '../src/lib/term.js';

describe('semver', () => {
  it('parses strings, arrays and pre-releases', () => {
    assert.deepEqual(parseVersion('1.26.40'), [1, 26, 40]);
    assert.deepEqual(parseVersion('1.2'), [1, 2, 0]);
    assert.deepEqual(parseVersion('v2.0.0'), [2, 0, 0]);
    assert.deepEqual(parseVersion('2.10.0-beta'), [2, 10, 0]);
    assert.deepEqual(parseVersion([1, 0, 0]), [1, 0, 0]);
    assert.equal(parseVersion('nope'), null);
    assert.equal(parseVersion([1, -1, 0]), null);
    assert.equal(parseVersion('1.2.3.4'), null);
  });
  it('compares and formats', () => {
    assert.ok(compareVersions('1.26.40', '1.21.0') > 0);
    assert.ok(compareVersions([1, 0, 0], '1.0.1') < 0);
    assert.equal(compareVersions('2.9.0', [2, 9, 0]), 0);
    assert.equal(formatVersion([1, 2, 3]), '1.2.3');
  });
  it('bumps', () => {
    assert.deepEqual(bumpVersion('1.2.3', 'patch'), [1, 2, 4]);
    assert.deepEqual(bumpVersion('1.2.3', 'minor'), [1, 3, 0]);
    assert.deepEqual(bumpVersion('1.2.3', 'major'), [2, 0, 0]);
    assert.deepEqual(bumpVersion('1.2.3', '5.0.1'), [5, 0, 1]);
    assert.throws(() => bumpVersion('1.2.3', 'nope'), /Invalid version/);
  });
});

describe('json with comments', () => {
  it('strips comments and trailing commas but keeps strings intact', () => {
    const text = `{
      // line comment
      "a": "http://x//y", /* block */
      "b": [1, 2, ],
      "c": "has // slashes and /* not a comment */",
    }`;
    assert.deepEqual(parseJson(text), { a: 'http://x//y', b: [1, 2], c: 'has // slashes and /* not a comment */' });
    assert.equal(stripJsonComments('"a\\"//b"'), '"a\\"//b"');
  });
  it('handles a BOM', () => {
    assert.deepEqual(parseJson('\uFEFF{"x":1}'), { x: 1 });
  });
  it('reports line and column on failure', () => {
    assert.throws(() => parseJson('{\n  "a": 1,\n  "b": }\n', 'f.json'), (err) => {
      assert.equal(err.name, 'JsonParseError');
      assert.equal(err.line, 3);
      assert.ok(err.message.startsWith('f.json: invalid JSON (line 3'));
      return true;
    });
  });
});

describe('glob', () => {
  const match = (pattern, target) => globToRegExp(pattern).test(target);
  it('matches basenames at any depth when there is no slash', () => {
    assert.ok(match('.DS_Store', '.DS_Store'));
    assert.ok(match('.DS_Store', 'textures/.DS_Store'));
    assert.ok(match('*.psd', 'a/b/c.psd'));
    assert.ok(!match('*.psd', 'a/b/c.png'));
  });
  it('supports ** and braces', () => {
    assert.ok(match('textures/**/*.png', 'textures/a.png'));
    assert.ok(match('textures/**/*.png', 'textures/a/b/c.png'));
    assert.ok(!match('textures/**/*.png', 'models/a.png'));
    assert.ok(match('**/*.{png,tga}', 'x/y.tga'));
    assert.ok(match('node_modules', 'node_modules'));
    assert.ok(match('node_modules', 'a/node_modules'));
  });
  it('escapes regex specials', () => {
    assert.ok(match('a.b', 'a.b'));
    assert.ok(!match('a.b', 'aXb'));
  });
});

describe('slugify', () => {
  it('produces identifier-safe names', () => {
    assert.equal(slugify('Cool Mobs!'), 'cool_mobs');
    assert.equal(slugify('Ação Épica'), 'acao_epica');
    assert.equal(slugify('123abc'), '_123abc');
    assert.equal(slugify('!!!'), 'addon');
  });
});

describe('crc32 / png / zip', () => {
  it('computes the standard CRC-32 check value', () => {
    assert.equal(crc32(Buffer.from('123456789')), 0xcbf43926);
    assert.equal(crc32(Buffer.alloc(0)), 0);
  });
  it('writes a PNG with a valid signature and IHDR', () => {
    const png = createPng(4, 2, () => [1, 2, 3, 255]);
    assert.equal(png.readUInt32BE(0), 0x89504e47);
    assert.equal(png.toString('ascii', 12, 16), 'IHDR');
    assert.equal(png.readUInt32BE(16), 4);
    assert.equal(png.readUInt32BE(20), 2);
    assert.equal(png.toString('ascii', png.length - 8, png.length - 4), 'IEND');
  });
  it('round-trips files through the zip writer/reader', () => {
    const zip = createZipBuffer({ level: 6 });
    const big = Buffer.from('hello world '.repeat(500));
    zip.addFile('dir/a.txt', big);
    zip.addFile('b.bin', Buffer.from([1, 2, 3]), { compress: false });
    zip.addFile('unicode/ção.json', '{"ok":true}');
    const buffer = zip.toBuffer();
    const entries = listZipEntries(buffer);
    assert.deepEqual(entries.map((e) => e.name), ['dir/a.txt', 'b.bin', 'unicode/ção.json']);
    assert.equal(entries[0].method, 8);
    assert.ok(entries[0].compressedSize < big.length);
    assert.equal(entries[1].method, 0);
    assert.ok(readZipEntry(buffer, entries[0]).equals(big));
    assert.deepEqual([...readZipEntry(buffer, entries[1])], [1, 2, 3]);
    assert.equal(readZipEntry(buffer, entries[2]).toString(), '{"ok":true}');
  });
  it('rejects unsafe and duplicate entries', () => {
    const zip = createZipBuffer();
    assert.throws(() => zip.addFile('../evil', 'x'), /unsafe/);
    zip.addFile('a', 'x');
    assert.throws(() => zip.addFile('a', 'y'), /Duplicate/);
  });
  it('is deterministic with a fixed mtime', () => {
    const make = () => {
      const zip = createZipBuffer({ mtime: new Date(2000, 0, 1) });
      zip.addFile('a.txt', 'same');
      return zip.toBuffer();
    };
    assert.ok(make().equals(make()));
  });
});

describe('config normalization', () => {
  it('fills defaults and validates', () => {
    const cfg = normalizeConfig({ name: 'X', namespace: 'x' });
    assert.equal(cfg.version, '1.0.0');
    assert.deepEqual(cfg.packs, { behavior: 'packs/behavior', resource: 'packs/resource' });
    assert.equal(cfg.build.outDir, 'dist');
  });
  it('accepts legacy configs', () => {
    const cfg = normalizeConfig({ name: 'X', author: 'me', minEngineVersion: '1.21.0' }, { legacy: true });
    assert.deepEqual(cfg.authors, ['me']);
    assert.deepEqual(cfg.packs, { behavior: 'behavior_pack', resource: 'resource_pack' });
  });
  it('lists every problem at once', () => {
    assert.throws(
      () => normalizeConfig({ namespace: 'Bad NS', version: 'x', minEngineVersion: 'y', packs: { weird: '../out' } }),
      (err) => {
        assert.match(err.message, /name: required/);
        assert.match(err.message, /namespace:/);
        assert.match(err.message, /version:/);
        assert.match(err.message, /minEngineVersion:/);
        assert.match(err.message, /packs\.weird/);
        return true;
      },
    );
    assert.throws(() => normalizeConfig({ name: 'x', namespace: 'minecraft' }), /reserved/);
    assert.throws(() => normalizeConfig({ name: 'x', packs: { behavior: '/abs' } }), /inside the project/);
  });
});

describe('manifest', () => {
  const config = normalizeConfig({
    name: 'Demo',
    namespace: 'demo',
    description: 'd',
    version: '1.2.3',
    minEngineVersion: '1.26.40',
    authors: ['a'],
    scripts: { entry: 'scripts/main.js', modules: { '@minecraft/server-ui': '2.1.0' } },
  });

  it('builds a valid behavior manifest with scripts and dependencies', () => {
    const rp = buildManifest(config, 'resource');
    const bp = buildManifest(config, 'behavior', null, { pairWith: rp });
    assert.equal(bp.format_version, 2);
    assert.equal(bp.header.name, 'Demo BP');
    assert.deepEqual(bp.header.version, [1, 2, 3]);
    assert.deepEqual(bp.header.min_engine_version, [1, 26, 40]);
    assert.ok(isUuid(bp.header.uuid));
    assert.deepEqual(bp.modules.map((m) => m.type), ['data', 'script']);
    assert.equal(bp.modules[1].entry, 'scripts/main.js');
    const deps = bp.dependencies;
    assert.ok(deps.some((d) => d.module_name === '@minecraft/server' && d.version === '2.9.0'), 'default @minecraft/server dep');
    assert.ok(deps.some((d) => d.module_name === '@minecraft/server-ui' && d.version === '2.1.0'));
    assert.ok(deps.some((d) => d.uuid === rp.header.uuid));
    assert.deepEqual(validateManifest(bp, { kind: 'behavior' }).errors, []);
    assert.deepEqual(validateManifest(rp, { kind: 'resource' }).errors, []);
  });

  it('preserves existing UUIDs, subpacks and foreign dependencies', () => {
    const existing = {
      header: { uuid: '11111111-2222-4333-8444-555555555555', pack_scope: 'world' },
      modules: [{ type: 'data', uuid: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' }],
      dependencies: [{ uuid: '99999999-2222-4333-8444-555555555555', version: [1, 0, 0] }],
      subpacks: [{ folder_name: 'hd', name: 'HD', memory_tier: 2 }],
      capabilities: { bogus: true },
      metadata: { generated_with: 'MC CLI V2' },
    };
    const bp = buildManifest(config, 'behavior', existing);
    assert.equal(bp.header.uuid, existing.header.uuid);
    assert.equal(bp.header.pack_scope, 'world');
    assert.equal(bp.modules[0].uuid, existing.modules[0].uuid);
    assert.ok(bp.dependencies.some((d) => d.uuid === '99999999-2222-4333-8444-555555555555'));
    assert.deepEqual(bp.subpacks, existing.subpacks);
    assert.equal(bp.capabilities, undefined, 'bogus non-array capabilities dropped');
    assert.ok(Array.isArray(bp.metadata.generated_with.mcpackage));
  });

  it('flags invalid manifests', () => {
    const { errors, warnings } = validateManifest({
      format_version: 1,
      header: { name: '', uuid: 'nope', version: '1.0.0' },
      modules: [{ type: 'script', uuid: 'x', version: [1, 0, 0], language: 'python', entry: 'main.py' }],
      dependencies: [{ module_name: '@minecraft/server', version: 'latest' }],
      capabilities: ['nonsense'],
    });
    assert.ok(errors.some((e) => /format_version/.test(e)));
    assert.ok(errors.some((e) => /header\.name/.test(e)));
    assert.ok(errors.some((e) => /header\.uuid/.test(e)));
    assert.ok(errors.some((e) => /min_engine_version is required/.test(e)));
    assert.ok(errors.some((e) => /language/.test(e)));
    assert.ok(errors.some((e) => /entry/.test(e)));
    assert.ok(errors.some((e) => /dependencies\[0\]\.version/.test(e)));
    assert.ok(warnings.some((w) => /header\.version is a string/.test(w)));
    assert.ok(warnings.some((w) => /unknown capability/.test(w)));
  });
});

describe('com.mojang detection', () => {
  it('prefers the GDK folder on Windows and knows about Preview', () => {
    const env = { APPDATA: 'C:\\Users\\me\\AppData\\Roaming', LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local' };
    const [first, second] = comMojangCandidates({ platform: 'win32', env });
    assert.equal(first, 'C:\\Users\\me\\AppData\\Roaming\\Minecraft Bedrock\\Users\\Shared\\games\\com.mojang');
    assert.match(second, /Microsoft\.MinecraftUWP_8wekyb3d8bbwe/);
    const [preview] = comMojangCandidates({ platform: 'win32', env, preview: true });
    assert.match(preview, /Minecraft Bedrock Preview/);
  });
  it('returns mcpelauncher paths on Linux', () => {
    const [first] = comMojangCandidates({ platform: 'linux', home: '/home/u', env: {} });
    assert.equal(first, '/home/u/.local/share/mcpelauncher/games/com.mojang');
  });
});

describe('term helpers', () => {
  it('formats bytes and aligns tables ignoring ANSI codes', () => {
    assert.equal(formatBytes(512), '512 B');
    assert.equal(formatBytes(2048), '2.0 KB');
    assert.equal(formatBytes(5 * 1024 * 1024), '5.0 MB');
    const out = table([['\u001b[31ma\u001b[39m', 'x'], ['long', 'y']], { indent: 0, gap: 1 });
    assert.equal(stripAnsi(out), 'a    x\nlong y');
  });
});
