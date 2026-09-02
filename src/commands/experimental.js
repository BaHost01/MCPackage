import { CAPABILITIES, SCRIPT_MODULES } from '../lib/bedrock.js';
import { CliError } from '../lib/errors.js';
import { syncManifests } from '../lib/manifest.js';
import { isInteractive, multiSelect } from '../lib/prompt.js';
import { loadProject } from '../lib/project.js';
import { c, log, printTable } from '../lib/term.js';

const CAPABILITY_KEYS = Object.keys(CAPABILITIES);

export default {
  name: 'experimental',
  aliases: ['capabilities'],
  group: 'Content',
  summary: 'Toggle manifest capabilities and beta script APIs',
  usage: 'mcpackage experimental [options]',
  description: `Manages the "capabilities" array in your manifests and switches the script
modules between stable and beta versions.

Note: world experiments such as "Beta APIs" or "Upcoming Creator Features"
are enabled per-world in Minecraft's world settings, not in the manifest.
Using a *-beta script module version is what makes a pack require the
"Beta APIs" experiment.

Capabilities:
${CAPABILITY_KEYS.map((key) => `  ${key.padEnd(24)} ${CAPABILITIES[key]}`).join('\n')}`,
  options: {
    enable: { type: 'string', description: 'Comma-separated capabilities to add', value: '<list>' },
    disable: { type: 'string', description: 'Comma-separated capabilities to remove', value: '<list>' },
    'beta-apis': { type: 'boolean', description: 'Switch script modules to their beta versions' },
    'stable-apis': { type: 'boolean', description: 'Switch script modules back to stable versions' },
  },
  examples: ['mcpackage experimental', 'mcpackage experimental --beta-apis', 'mcpackage experimental --enable script_eval --disable pbr'],
  async run({ options, cwd }) {
    const project = await loadProject(cwd);
    const current = new Set(project.config.capabilities);
    const wantsFlags = options.enable || options.disable || options['beta-apis'] || options['stable-apis'];

    let capabilities = new Set(current);
    let scriptChannel = null;

    if (wantsFlags) {
      for (const cap of splitList(options.enable)) {
        if (!CAPABILITIES[cap]) throw new CliError(`Unknown capability "${cap}".`, { hint: `Known: ${CAPABILITY_KEYS.join(', ')}`, exitCode: 2 });
        capabilities.add(cap);
      }
      for (const cap of splitList(options.disable)) capabilities.delete(cap);
      if (options['beta-apis'] && options['stable-apis']) throw new CliError('Choose either --beta-apis or --stable-apis.', { exitCode: 2 });
      if (options['beta-apis']) scriptChannel = 'beta';
      if (options['stable-apis']) scriptChannel = 'stable';
    } else if (isInteractive() && !options.json) {
      const picked = await multiSelect(
        'Capabilities to enable',
        CAPABILITY_KEYS.map((key) => ({ value: key, label: key, hint: CAPABILITIES[key] })),
        { default: [...current] },
      );
      capabilities = new Set(picked);
      if (project.config.scripts) {
        const isBeta = Object.values(project.config.scripts.modules).some((v) => /beta/.test(String(v)));
        const channel = await multiSelect('Script API channel', [{ value: 'beta', label: 'Use beta script APIs', hint: 'requires the "Beta APIs" world experiment' }], {
          default: isBeta ? ['beta'] : [],
        });
        scriptChannel = channel.includes('beta') ? 'beta' : 'stable';
      }
    } else {
      // Non-interactive with no flags: just report.
      if (options.json) {
        log.print(JSON.stringify({ capabilities: [...current], scripts: project.config.scripts }, null, 2));
      } else {
        printTable([
          ['capabilities', [...current].join(', ') || c.dim('(none)')],
          ['script modules', project.config.scripts ? Object.entries(project.config.scripts.modules).map(([m, v]) => `${m}@${v}`).join(', ') : c.dim('scripting disabled')],
        ]);
        log.info('Pass --enable/--disable/--beta-apis/--stable-apis to change settings.');
      }
      return;
    }

    const patch = { capabilities: [...capabilities] };
    if (scriptChannel && project.config.scripts) {
      const modules = { ...project.config.scripts.modules };
      for (const moduleName of Object.keys(modules)) {
        const known = SCRIPT_MODULES[moduleName];
        if (!known) continue;
        const target = known[scriptChannel];
        if (target) modules[moduleName] = target;
      }
      patch.scripts = { ...project.config.scripts, modules };
    } else if (scriptChannel && !project.config.scripts) {
      log.warn('This project has no scripts; run `mcpackage add script main` to enable the Script API.');
    }

    await project.save(patch);
    // Capabilities removed from config must also leave the manifests.
    const synced = await syncManifests(project);
    for (const result of synced) {
      const manifest = result.manifest;
      if (Array.isArray(manifest.capabilities)) {
        manifest.capabilities = manifest.capabilities.filter((cap) => capabilities.has(cap));
        if (manifest.capabilities.length === 0) delete manifest.capabilities;
        const { writeJson } = await import('../lib/fs.js');
        await writeJson(result.file, manifest);
      }
    }

    if (options.json) {
      log.print(JSON.stringify({ capabilities: [...capabilities], scripts: project.config.scripts, manifests: synced.map((s) => project.relative(s.file)) }, null, 2));
      return;
    }
    log.ok(`capabilities: ${[...capabilities].join(', ') || c.dim('(none)')}`);
    if (patch.scripts) log.ok(`script modules: ${Object.entries(patch.scripts.modules).map(([m, v]) => `${m}@${v}`).join(', ')}`);
    for (const s of synced) log.item(`synced ${project.relative(s.file)}`);
    if (scriptChannel === 'beta') log.info('Worlds using this pack must enable the "Beta APIs" experiment.');
  },
};

function splitList(value) {
  return String(value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}
