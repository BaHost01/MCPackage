/**
 * CLI entry: resolves the command, parses arguments, runs it and turns
 * failures into friendly messages + exit codes.
 */
import path from 'node:path';
import { parseCommandArgs, renderCommandHelp, renderGlobalHelp } from './lib/args.js';
import { CliError, isCliError } from './lib/errors.js';
import { BUGS_URL, VERSION } from './lib/meta.js';
import { closePrompts } from './lib/prompt.js';
import { c, log, setColorEnabled, setLogLevel } from './lib/term.js';

import add from './commands/add.js';
import build from './commands/build.js';
import clean from './commands/clean.js';
import config from './commands/config.js';
import deploy from './commands/deploy.js';
import doctor from './commands/doctor.js';
import experimental from './commands/experimental.js';
import init from './commands/init.js';
import inspect from './commands/inspect.js';
import lint from './commands/lint.js';
import manifest from './commands/manifest.js';
import migrate from './commands/migrate.js';
import stats from './commands/stats.js';
import version from './commands/version.js';
import watch from './commands/watch.js';

export const commands = [
  // Project
  init,
  manifest,
  config,
  version,
  migrate,
  // Content
  add,
  experimental,
  // Quality
  lint,
  stats,
  doctor,
  inspect,
  // Build & ship
  build,
  deploy,
  watch,
  clean,
];

const helpCommand = {
  name: 'help',
  group: 'Other',
  hidden: true,
  summary: 'Show help',
  positionals: [{ name: 'command', description: 'Command to show help for' }],
  run({ positionals }) {
    const target = positionals[0] ? findCommand(positionals[0]) : null;
    if (positionals[0] && !target) throw unknownCommand(positionals[0]);
    log.print(target ? renderCommandHelp(target) : renderGlobalHelp(commands, VERSION));
  },
};

export function findCommand(name) {
  return commands.find((cmd) => cmd.name === name || cmd.aliases?.includes(name)) ?? (name === 'help' ? helpCommand : null);
}

function unknownCommand(name) {
  const suggestion = suggest(name);
  return new CliError(`Unknown command "${name}".`, {
    hint: suggestion ? `Did you mean \`mcpackage ${suggestion}\`? Run \`mcpackage --help\` for the full list.` : 'Run `mcpackage --help` for the list of commands.',
    exitCode: 2,
  });
}

function suggest(input) {
  const names = commands.flatMap((cmd) => [cmd.name, ...(cmd.aliases ?? [])]);
  let best = null;
  let bestScore = Infinity;
  for (const name of names) {
    const score = levenshtein(input.toLowerCase(), name);
    if (score < bestScore) {
      bestScore = score;
      best = name;
    }
  }
  return bestScore <= Math.max(2, Math.floor(input.length / 3)) ? best : null;
}

function levenshtein(a, b) {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dist = Array.from({ length: rows }, (_, i) => [i, ...Array(cols - 1).fill(0)]);
  for (let j = 1; j < cols; j += 1) dist[0][j] = j;
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dist[i][j] = Math.min(dist[i - 1][j] + 1, dist[i][j - 1] + 1, dist[i - 1][j - 1] + cost);
    }
  }
  return dist[rows - 1][cols - 1];
}

/**
 * Runs the CLI with the given argv (without node/script). Returns the exit code.
 * Never throws; never calls process.exit (the bin wrapper does that).
 */
export async function run(argv) {
  const args = [...argv];

  // Global flags that make sense before the command name.
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    log.print(renderGlobalHelp(commands, VERSION));
    return 0;
  }
  if (args[0] === '--version' || args[0] === '-v' || args[0] === '-V') {
    log.print(VERSION);
    return 0;
  }

  const name = args.shift();
  const command = findCommand(name);
  if (!command) {
    report(unknownCommand(name));
    return 2;
  }

  let parsed;
  try {
    parsed = parseCommandArgs(command, args);
  } catch (err) {
    report(err);
    return err.exitCode ?? 2;
  }
  const { options, positionals } = parsed;

  if (options['no-color']) setColorEnabled(false);
  if (options.json || options.quiet) setLogLevel('quiet');
  else if (options.verbose) setLogLevel('verbose');

  if (options.help) {
    log.print(renderCommandHelp(command));
    return 0;
  }

  const cwd = options.cwd ? path.resolve(options.cwd) : process.cwd();

  try {
    await command.run({ options, positionals, cwd, argv: args });
    return 0;
  } catch (err) {
    report(err, { verbose: Boolean(options.verbose) });
    return isCliError(err) ? err.exitCode : 1;
  } finally {
    closePrompts();
  }
}

function report(err, { verbose = false } = {}) {
  if (isCliError(err)) {
    if (err.message) log.error(err.message);
    if (err.hint) process.stderr.write(`  ${c.dim(err.hint)}\n`);
    if (verbose && err.cause) process.stderr.write(c.gray(`${err.cause.stack || err.cause}\n`));
    return;
  }
  if (err && (err.code === 'EACCES' || err.code === 'EPERM')) {
    log.error(`Permission denied: ${err.path || err.message}`);
    return;
  }
  if (err && err.code === 'ENOSPC') {
    log.error('The disk is full or the file watcher limit was reached.');
    return;
  }
  log.error(`Unexpected error: ${err?.message ?? err}`);
  if (err?.stack) process.stderr.write(c.gray(`${err.stack.split('\n').slice(1).join('\n')}\n`));
  process.stderr.write(`  ${c.dim(`This looks like a bug in mcpackage. Please report it: ${BUGS_URL}`)}\n`);
}
