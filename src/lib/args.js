/**
 * Tiny declarative argument parser (wrapping node:util.parseArgs) plus help
 * rendering, shared by every command.
 *
 * A command definition looks like:
 *
 *   {
 *     name: 'build',
 *     summary: 'Package the project into .mcaddon / .mcpack files',
 *     usage: 'mcpackage build [options]',
 *     positionals: [{ name: 'dir', description: '...', required: false }],
 *     options: {
 *       out: { type: 'string', short: 'o', description: 'Output folder', value: '<dir>' },
 *       force: { type: 'boolean', short: 'f', description: 'Overwrite existing files' },
 *     },
 *     examples: ['mcpackage build --type pack'],
 *     run: async (ctx) => { ... },
 *   }
 */
import { parseArgs } from 'node:util';
import { CliError } from './errors.js';
import { c, table } from './term.js';

/** Options accepted by every command. */
export const GLOBAL_OPTIONS = {
  help: { type: 'boolean', short: 'h', description: 'Show help for this command' },
  cwd: { type: 'string', short: 'C', description: 'Run as if started in this folder', value: '<dir>' },
  verbose: { type: 'boolean', description: 'Print extra diagnostic output' },
  quiet: { type: 'boolean', short: 'q', description: 'Only print warnings and errors' },
  'no-color': { type: 'boolean', description: 'Disable colored output' },
  json: { type: 'boolean', description: 'Print machine-readable JSON instead of text' },
};

/**
 * Parses `argv` for `command`. Returns `{ options, positionals }`.
 * Throws CliError with a helpful message on invalid input.
 */
export function parseCommandArgs(command, argv) {
  const spec = { ...GLOBAL_OPTIONS, ...(command.options ?? {}) };
  const options = {};
  for (const [name, def] of Object.entries(spec)) {
    options[name] = { type: def.type ?? 'boolean', multiple: Boolean(def.multiple) };
    if (def.short) options[name].short = def.short;
    if (def.default !== undefined) options[name].default = def.default;
  }
  let parsed;
  try {
    parsed = parseArgs({ args: argv, options, allowPositionals: true, strict: true });
  } catch (err) {
    const message = String(err.message)
      .replace(/^Unknown option '(.+?)'.*$/s, (_, flag) => `Unknown option ${flag}`)
      .replace(/^Option '(.+?)' argument missing.*$/s, (_, flag) => `Option ${flag} needs a value`)
      .replace(/^Option '(.+?)' does not take an argument.*$/s, (_, flag) => `Option ${flag} does not take a value`);
    throw new CliError(`${message}.`, { hint: `Run \`mcpackage ${command.name} --help\` to see valid options.`, exitCode: 2 });
  }

  const positionalSpec = command.positionals ?? [];
  const variadic = positionalSpec.at(-1)?.variadic;
  if (parsed.positionals.length > positionalSpec.length && !variadic) {
    const extra = parsed.positionals.slice(positionalSpec.length).map((p) => `"${p}"`).join(', ');
    throw new CliError(`Unexpected argument ${extra}.`, {
      hint: `Run \`mcpackage ${command.name} --help\` to see the accepted arguments.`,
      exitCode: 2,
    });
  }
  if (!parsed.values.help) {
    positionalSpec.forEach((pos, i) => {
      if (pos.required && parsed.positionals[i] === undefined) {
        throw new CliError(`Missing required argument <${pos.name}>.`, {
          hint: `Usage: ${command.usage ?? `mcpackage ${command.name}`}`,
          exitCode: 2,
        });
      }
    });
  }

  const values = { ...parsed.values };
  // Validate enumerated choices.
  for (const [name, def] of Object.entries(command.options ?? {})) {
    if (def.choices && values[name] !== undefined && !def.choices.includes(values[name])) {
      throw new CliError(`Invalid value "${values[name]}" for --${name}.`, {
        hint: `Choose one of: ${def.choices.join(', ')}`,
        exitCode: 2,
      });
    }
  }
  return { options: values, positionals: parsed.positionals };
}

/** Renders the help text for a single command. */
export function renderCommandHelp(command) {
  const lines = [];
  lines.push(`${c.bold(command.name)} ${c.dim('—')} ${command.summary}`);
  if (command.description) lines.push('', command.description.trim());
  lines.push('', c.bold('Usage'), `  ${command.usage ?? `mcpackage ${command.name}${command.options ? ' [options]' : ''}`}`);

  const positionals = command.positionals ?? [];
  if (positionals.length) {
    lines.push('', c.bold('Arguments'));
    lines.push(
      table(
        positionals.map((p) => [
          c.cyan(p.required ? `<${p.name}>` : `[${p.name}]`),
          p.description + (p.default !== undefined ? c.dim(` (default: ${p.default})`) : ''),
        ]),
      ),
    );
  }
  const own = Object.entries(command.options ?? {});
  if (own.length) {
    lines.push('', c.bold('Options'), table(own.map(([name, def]) => optionRow(name, def))));
  }
  lines.push('', c.bold('Global options'), table(Object.entries(GLOBAL_OPTIONS).map(([name, def]) => optionRow(name, def))));
  if (command.examples?.length) {
    lines.push('', c.bold('Examples'), ...command.examples.map((ex) => `  ${c.dim('$')} ${ex}`));
  }
  return lines.join('\n');
}

function optionRow(name, def) {
  const flags = [def.short ? `-${def.short}` : null, `--${name}`].filter(Boolean).join(', ');
  const value = def.value ? ` ${def.value}` : def.type === 'string' ? ' <value>' : '';
  let description = def.description ?? '';
  if (def.choices) description += c.dim(` [${def.choices.join('|')}]`);
  if (def.default !== undefined && def.default !== false) description += c.dim(` (default: ${def.default})`);
  return [c.cyan(flags + value), description];
}

/** Renders the top-level help listing all commands grouped by category. */
export function renderGlobalHelp(commands, version) {
  const groups = new Map();
  for (const command of commands) {
    if (command.hidden) continue;
    const group = command.group ?? 'Other';
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(command);
  }
  const lines = [
    `${c.bold('mcpackage')} ${c.dim(`v${version}`)} ${c.dim('—')} Minecraft Bedrock add-on toolkit`,
    '',
    c.bold('Usage'),
    `  mcpackage <command> [options]`,
    `  mcpkg <command> [options]      ${c.dim('(short alias)')}`,
  ];
  for (const [group, list] of groups) {
    lines.push('', c.bold(group), table(list.map((cmd) => [c.cyan(cmd.name), cmd.summary])));
  }
  lines.push(
    '',
    c.bold('Global options'),
    table(Object.entries(GLOBAL_OPTIONS).map(([name, def]) => optionRow(name, def))),
    '',
    `Run ${c.cyan('mcpackage <command> --help')} for details on a command.`,
    `Docs: ${c.underline('https://github.com/BaHost01/MCPackage#readme')}`,
  );
  return lines.join('\n');
}
