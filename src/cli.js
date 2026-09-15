import fs from 'node:fs/promises';
import path from 'node:path';
import { CONFIG, exists, readJson, writeJson } from './core.js';
import { loadProject, syncManifests } from './project.js';
import { checkForUpdate } from './update.js';

const VERSION = '4.0.0';
const help = `mcpackage ${VERSION}\n\nUsage: mcpackage <command> [options]\n\nCommands:\n  init [name]       Create a Bedrock add-on project\n  add <type> <name> Generate content (entity/item/block/recipe)\n  migrate           Upgrade a legacy v2 project to the v4 layout\n  lint              Validate project structure and JSON\n  build             Create a .mcaddon archive\n  manifest          Regenerate pack manifests\n  stats             Show project statistics\n  doctor            Diagnose project setup\n  config <key> [v]  Read or write project configuration\n  clean             Remove build output\n  version           Print version\n\nGlobal:\n  --json            Machine-readable output\n  -C, --cwd <dir>  Run in another directory\n  --skip-lint       Skip lint before build\n  --no-update-check Disable the npm update check\n`;

function parse(argv) { const options = {}; const pos = []; for (let i=0;i<argv.length;i++) { const a=argv[i]; if(a==='--json') options.json=true; else if(a==='--skip-lint') options.skipLint=true; else if(a==='--no-update-check') options.noUpdateCheck=true; else if(a==='-y'||a==='--yes') options.yes=true; else if(a==='--keep-layout') options.keepLayout=true; else if(a==='-C'||a==='--cwd') options.cwd=argv[++i]; else pos.push(a); } return { options, pos }; }
function output(value, json) { if(json) console.log(JSON.stringify(value,null,2)); else if(typeof value==='string') console.log(value); else console.log(JSON.stringify(value,null,2)); }

export async function run(argv) {
  const { options, pos } = parse(argv); const cwd = path.resolve(options.cwd || process.cwd()); const command = pos.shift();
  try {
    if (!command || command === '--help' || command === 'help') return output(help, options.json);
    if (command === 'version' || command === '--version') return output(VERSION, options.json);

    if (!options.noUpdateCheck && !options.json) await checkForUpdate(VERSION, { interactive: Boolean(process.stdin.isTTY && process.stdout.isTTY) });

    if (command === 'init') { const { initProject } = await import('./init.js'); return output({ created: await initProject(cwd, pos[0], {}) }, options.json); }
    if (command === 'add') { const { addContent } = await import('./add.js'); if(!pos[0]||!pos[1]) throw new Error('Usage: mcpackage add <type> <name>'); return output(await addContent(cwd,pos[0],pos[1]), options.json); }
    if (command === 'migrate') { const { migrateProject } = await import('./migrate.js'); return output(await migrateProject(cwd, options), options.json); }
    if (command === 'lint') { const { lintProject } = await import('./lint.js'); return output(await lintProject(cwd, await loadProject(cwd)), options.json); }
    if (command === 'build') { const { build } = await import('./build.js'); return output(await build(cwd, options), options.json); }
    if (command === 'manifest') { const p=await loadProject(cwd); await syncManifests(cwd,p); await writeJson(path.join(cwd,CONFIG),p); return output({ synced:true, uuids:p.uuids },options.json); }
    if (command === 'stats') { const { stats }=await import('./stats.js'); return output(await stats(cwd),options.json); }
    if (command === 'doctor') { const { doctor }=await import('./doctor.js'); const r=await doctor(cwd); output(r,options.json); if(!r.ok) process.exitCode=1; return r; }
    if (command === 'config') { const p=await loadProject(cwd); const key=pos[0]; if(!key) return output(p,options.json); if(pos.length===1) return output(p[key],options.json); let v=pos.slice(1).join(' '); try{v=JSON.parse(v)}catch{} p[key]=v; await writeJson(path.join(cwd,CONFIG),p); return output(p[key],options.json); }
    if (command === 'clean') { await fs.rm(path.join(cwd,'dist'),{recursive:true,force:true}); return output({cleaned:true},options.json); }
    throw new Error(`Unknown command: ${command}. Run mcpackage --help`);
  } catch (e) { if(options.json) console.error(JSON.stringify({error:e.message})); else console.error(`Error: ${e.message}`); return 1; }
}
