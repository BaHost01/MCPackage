import { CliError } from '../lib/errors.js';
import { syncManifests } from '../lib/manifest.js';
import { ask, isInteractive } from '../lib/prompt.js';
import { loadProject, normalizeConfig } from '../lib/project.js';
import { parseVersion } from '../lib/semver.js';
import { c, log, printTable } from '../lib/term.js';

const EDITABLE = ['name', 'namespace', 'description', 'version', 'minEngineVersion', 'authors', 'license', 'url', 'build.outDir', 'build.exclude'];

export default {
  name: 'config',
  group: 'Project',
  summary: 'Show or edit mcpackage.json settings',
  usage: 'mcpackage config [key] [value]',
  description: `With no arguments prints the effective configuration. With a key prints that
value; with a key and value sets it (arrays such as authors accept
comma-separated values). Use --edit for an interactive walkthrough.
Manifests are re-synced after every change.

Keys: ${EDITABLE.join(', ')}`,
  positionals: [
    { name: 'key', description: 'Setting to read or write (dot notation, e.g. build.outDir)' },
    { name: 'value', description: 'New value' },
  ],
  options: {
    edit: { type: 'boolean', short: 'e', description: 'Interactively edit the main settings' },
    unset: { type: 'boolean', description: 'Remove the key instead of setting it' },
  },
  examples: ['mcpackage config', 'mcpackage config name "Cool Mobs"', 'mcpackage config authors "Ana, Ben"', 'mcpackage config --edit'],
  async run({ options, positionals, cwd }) {
    const project = await loadProject(cwd);
    const [key, value] = positionals;

    if (options.edit) return editInteractively(project, options);

    if (!key) {
      if (options.json) {
        log.print(JSON.stringify(project.config, null, 2));
        return;
      }
      log.print(c.bold(project.relative(project.configFile)));
      printTable([
        ['name', project.config.name],
        ['namespace', project.config.namespace],
        ['description', project.config.description || c.dim('(none)')],
        ['version', project.config.version],
        ['minEngineVersion', project.config.minEngineVersion],
        ['authors', project.config.authors.join(', ') || c.dim('(none)')],
        ['license', project.config.license || c.dim('(none)')],
        ['url', project.config.url || c.dim('(none)')],
        ['packs', Object.entries(project.config.packs).map(([k, v]) => `${k} → ${v}`).join(', ')],
        ['scripts', project.config.scripts ? `${project.config.scripts.entry} (${Object.entries(project.config.scripts.modules).map(([m, v]) => `${m}@${v}`).join(', ')})` : c.dim('disabled')],
        ['build.outDir', project.config.build.outDir],
        ['build.exclude', project.config.build.exclude.join(', ') || c.dim('(none)')],
      ]);
      return;
    }

    if (!EDITABLE.includes(key)) {
      throw new CliError(`Unknown setting "${key}".`, { hint: `Editable keys: ${EDITABLE.join(', ')}`, exitCode: 2 });
    }

    if (value === undefined && !options.unset) {
      const current = getPath(project.config, key);
      log.print(options.json ? JSON.stringify(current) : Array.isArray(current) ? current.join(', ') : String(current ?? ''));
      return;
    }

    const patch = structuredClone(project.raw);
    delete patch.$schema;
    if (options.unset) {
      unsetPath(patch, key);
    } else {
      const parsed = coerce(key, value);
      setPath(patch, key, parsed);
    }
    // Validate before saving so a bad value never lands on disk.
    normalizeConfig({ ...project.raw, ...patch }, { legacy: project.legacy, root: project.root });
    await project.save(patch);
    const synced = await syncManifests(project);

    if (options.json) {
      log.print(JSON.stringify({ key, value: getPath(project.config, key), manifests: synced.map((s) => project.relative(s.file)) }, null, 2));
      return;
    }
    log.ok(options.unset ? `Removed ${c.bold(key)}` : `${c.bold(key)} = ${c.cyan(JSON.stringify(getPath(project.config, key)))}`);
    if (synced.length) log.item(`synced ${synced.map((s) => project.relative(s.file)).join(', ')}`);
  },
};

function coerce(key, value) {
  if (key === 'authors' || key === 'build.exclude') {
    return value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (key === 'version' || key === 'minEngineVersion') {
    if (!parseVersion(value)) throw new CliError(`"${value}" is not a valid version (expected x.y.z).`, { exitCode: 2 });
  }
  return value;
}

function getPath(object, dotted) {
  return dotted.split('.').reduce((acc, part) => (acc == null ? undefined : acc[part]), object);
}

function setPath(object, dotted, value) {
  const parts = dotted.split('.');
  let cursor = object;
  for (const part of parts.slice(0, -1)) {
    if (!cursor[part] || typeof cursor[part] !== 'object') cursor[part] = {};
    cursor = cursor[part];
  }
  cursor[parts.at(-1)] = value;
}

function unsetPath(object, dotted) {
  const parts = dotted.split('.');
  let cursor = object;
  for (const part of parts.slice(0, -1)) {
    if (!cursor[part] || typeof cursor[part] !== 'object') return;
    cursor = cursor[part];
  }
  delete cursor[parts.at(-1)];
}

async function editInteractively(project, options) {
  if (!isInteractive()) throw new CliError('--edit needs an interactive terminal.', { hint: 'Use `mcpackage config <key> <value>` instead.' });
  const cfg = project.config;
  const answers = {
    name: await ask('Name', { default: cfg.name, required: true }),
    namespace: await ask('Namespace', { default: cfg.namespace, required: true }),
    description: await ask('Description', { default: cfg.description }),
    version: await ask('Version', { default: cfg.version, validate: (v) => (parseVersion(v) ? true : 'Use x.y.z') }),
    minEngineVersion: await ask('Minimum engine version', { default: cfg.minEngineVersion, validate: (v) => (parseVersion(v) ? true : 'Use x.y.z') }),
    authors: (await ask('Authors (comma-separated)', { default: cfg.authors.join(', ') })).split(',').map((s) => s.trim()).filter(Boolean),
    license: await ask('License', { default: cfg.license }),
    url: await ask('Homepage URL', { default: cfg.url }),
  };
  normalizeConfig({ ...project.raw, ...answers }, { legacy: project.legacy, root: project.root });
  await project.save(answers);
  const synced = await syncManifests(project);
  if (options.json) {
    log.print(JSON.stringify(project.config, null, 2));
    return;
  }
  log.ok(`Saved ${project.relative(project.configFile)}`);
  if (synced.length) log.item(`synced ${synced.map((s) => project.relative(s.file)).join(', ')}`);
}
