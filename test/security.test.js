import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { safeProjectPath } from '../src/core.js';
import { zipDirectory } from '../src/zip.js';

async function tempDir() { return fs.mkdtemp(path.join(os.tmpdir(), 'mcpackage-security-')); }

test('safeProjectPath rejects traversal and absolute escape', () => {
  const root = path.join(os.tmpdir(), 'mcpackage-root');
  assert.throws(() => safeProjectPath(root, '../outside', 'path'), /Unsafe path/);
  assert.throws(() => safeProjectPath(root, path.resolve(root, '..'), 'path'), /Unsafe path/);
  assert.equal(safeProjectPath(root, 'packs/behavior'), path.join(root, 'packs', 'behavior'));
});

test('zipDirectory rejects symlinks and honors ignore rules', async () => {
  const root = await tempDir();
  const out = path.join(root, 'out.zip');
  try {
    await fs.mkdir(path.join(root, 'packs'), { recursive: true });
    await fs.writeFile(path.join(root, 'packs', 'keep.json'), '{}');
    await fs.writeFile(path.join(root, 'secret.txt'), 'secret');
    await fs.writeFile(path.join(root, '.mcpackageignore'), 'secret.txt\n');
    await zipDirectory(root, out);
    const archive = await fs.readFile(out);
    assert.equal(archive.includes(Buffer.from('secret.txt')), false);
    assert.equal(archive.includes(Buffer.from('keep.json')), true);
    const outside = path.join(root, 'outside.txt');
    await fs.writeFile(outside, 'outside');
    await fs.symlink(outside, path.join(root, 'link.txt'));
    await assert.rejects(() => zipDirectory(root, path.join(root, 'symlink.zip')), /Symlink is not allowed/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
