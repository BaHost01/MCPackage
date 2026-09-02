import os from 'node:os';
import path from 'node:path';
import { LATEST_ENGINE_VERSION, SCRIPT_MODULES, comMojangCandidates } from '../lib/bedrock.js';
import { exists, isDirectory } from '../lib/fs.js';
import { VERSION } from '../lib/meta.js';
import { loadProject } from '../lib/project.js';
import { compareVersions } from '../lib/semver.js';
import { c, log, sym } from '../lib/term.js';

export default {
  name: 'doctor',
  group: 'Quality',
  summary: 'Check your environment: Node version, Minecraft folders, project health',
  usage: 'mcpackage doctor',
  examples: ['mcpackage doctor'],
  async run({ options, cwd }) {
    const checks = [];
    const add = (status, label, detail) => checks.push({ status, label, detail });

    // Runtime
    const nodeMajor = Number(process.versions.node.split('.')[0]);
    add(nodeMajor >= 20 ? 'ok' : 'error', `Node.js ${process.versions.node}`, nodeMajor >= 20 ? undefined : 'mcpackage needs Node.js 20 or newer');
    add('ok', `mcpackage v${VERSION}`, `${process.platform} ${os.arch()}`);
    add('ok', `Latest known Minecraft engine: ${LATEST_ENGINE_VERSION}`, `@minecraft/server ${SCRIPT_MODULES['@minecraft/server'].stable} (beta ${SCRIPT_MODULES['@minecraft/server'].beta})`);

    // Minecraft installation
    for (const preview of [false, true]) {
      const candidates = comMojangCandidates({ preview });
      let found = null;
      for (const candidate of candidates) {
        if (await isDirectory(candidate)) {
          found = candidate;
          break;
        }
      }
      const label = preview ? 'Minecraft Preview com.mojang' : 'Minecraft com.mojang';
      if (found) {
        const devBp = await exists(path.join(found, 'development_behavior_packs'));
        add('ok', label, `${found}${devBp ? '' : ' (development_behavior_packs not created yet — launch the game once)'}`);
      } else if (process.env.MCPACKAGE_COM_MOJANG && !preview) {
        const custom = process.env.MCPACKAGE_COM_MOJANG;
        add((await isDirectory(custom)) ? 'ok' : 'error', 'MCPACKAGE_COM_MOJANG', custom);
      } else {
        add(process.platform === 'win32' && !preview ? 'warn' : 'info', label, process.platform === 'win32' ? 'not found — is Minecraft installed?' : `not available on ${process.platform}; use --target for deploy`);
      }
    }

    // Project
    const project = await loadProject(cwd, { required: false });
    if (!project) {
      add('info', 'No project in this folder', 'run `mcpackage init` to create one');
    } else {
      add('ok', `Project: ${project.config.name} v${project.config.version}`, project.relative(project.configFile));
      if (project.legacy) add('warn', 'Legacy layout (mc-config.json)', 'run `mcpackage migrate` to upgrade to mcpackage.json');
      if (compareVersions(project.config.minEngineVersion, LATEST_ENGINE_VERSION) < 0) {
        add('info', `minEngineVersion ${project.config.minEngineVersion} is behind ${LATEST_ENGINE_VERSION}`, 'run `mcpackage config minEngineVersion ' + LATEST_ENGINE_VERSION + '` if you use newer features');
      }
      for (const pack of project.packs) {
        const dirExists = await isDirectory(pack.dir);
        const manifestExists = dirExists && (await exists(pack.manifestFile));
        if (!dirExists) add('warn', `${pack.kind} pack folder missing`, pack.relDir);
        else if (!manifestExists) add('error', `${pack.kind} pack has no manifest.json`, 'run `mcpackage manifest`');
        else add('ok', `${pack.kind} pack`, pack.relDir);
      }
      if (project.config.scripts) {
        const entry = project.resolve(project.config.packs.behavior ?? '', project.config.scripts.entry);
        add((await exists(entry)) ? 'ok' : 'error', `Script entry ${project.config.scripts.entry}`, (await exists(entry)) ? undefined : 'file does not exist');
        for (const [moduleName, version] of Object.entries(project.config.scripts.modules)) {
          const known = SCRIPT_MODULES[moduleName];
          if (!known) add('warn', `Unknown script module ${moduleName}`, 'check the spelling');
          else {
            const latest = /beta/.test(String(version)) ? known.beta : known.stable;
            if (latest && compareVersions(version, latest) > 0) add('warn', `${moduleName}@${version}`, `newer than the latest known release ${latest}`);
            else add('ok', `${moduleName}@${version}`);
          }
        }
      }
    }

    if (options.json) {
      log.print(JSON.stringify({ checks }, null, 2));
      return;
    }
    const icons = { ok: c.green(sym.ok), warn: c.yellow(sym.warn), error: c.red(sym.err), info: c.blue(sym.info) };
    for (const check of checks) {
      log.print(`${icons[check.status]} ${check.label}${check.detail ? c.dim(`  ${check.detail}`) : ''}`);
    }
    const errors = checks.filter((ch) => ch.status === 'error').length;
    const warnings = checks.filter((ch) => ch.status === 'warn').length;
    log.blank();
    if (errors) log.error(`${errors} problem(s) need attention.`);
    else if (warnings) log.warn(`${warnings} thing(s) worth a look, nothing blocking.`);
    else log.ok('Everything looks good.');
  },
};
