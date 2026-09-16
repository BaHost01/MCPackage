import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { initProject } from '../src/init.js';
import { addContent } from '../src/add.js';
import { lintProject } from '../src/lint.js';
import { build } from '../src/build.js';
import { readJson } from '../src/core.js';

test('init, add, lint and build', async () => {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'mcpackage-'));
  try {
    const projectDir=await initProject(root,'demo');
    await addContent(projectDir,'entity','ghost');
    await addContent(projectDir,'item','ruby');
    const project=await readJson(path.join(projectDir,'mcpackage.json'));
    const result=await lintProject(projectDir,project);
    assert.equal(result.ok,true);
    const built=await build(projectDir);
    assert.match(built.output,/\.mcaddon$/);
    assert.equal(await fs.stat(built.output).then(()=>true),true);
  } finally { await fs.rm(root,{recursive:true,force:true}); }
});
