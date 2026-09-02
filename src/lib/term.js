/**
 * Terminal output helpers: colors, symbols, a leveled logger and small
 * formatting utilities. No dependencies; honours NO_COLOR / FORCE_COLOR.
 *
 * Convention: informational output goes to stdout, warnings/errors/debug go to
 * stderr. Commands that support `--json` switch the logger to quiet so stdout
 * contains only machine-readable data.
 */

const env = process.env;

let colorEnabled = detectColor();
let level = 'normal'; // 'quiet' | 'normal' | 'verbose'

function detectColor() {
  if (env.FORCE_COLOR !== undefined && env.FORCE_COLOR !== '') return env.FORCE_COLOR !== '0' && env.FORCE_COLOR !== 'false';
  if (env.NO_COLOR !== undefined && env.NO_COLOR !== '') return false;
  if (env.TERM === 'dumb') return false;
  return Boolean(process.stdout.isTTY);
}

// When stdout is a closed pipe (e.g. `mcpackage stats | head`), writes raise
// EPIPE. That is not an error worth a stack trace: stop quietly.
for (const stream of [process.stdout, process.stderr]) {
  stream.on('error', (err) => {
    if (err && err.code === 'EPIPE') process.exit(0);
    throw err;
  });
}

export function setColorEnabled(value) {
  colorEnabled = Boolean(value);
}

export function isColorEnabled() {
  return colorEnabled;
}

export function setLogLevel(value) {
  level = value;
}

export function getLogLevel() {
  return level;
}

const style = (open, close) => (text) =>
  colorEnabled ? `\u001b[${open}m${text}\u001b[${close}m` : String(text);

/** ANSI color helpers. Each is a function `(text) => string`. */
export const c = {
  bold: style(1, 22),
  dim: style(2, 22),
  underline: style(4, 24),
  red: style(31, 39),
  green: style(32, 39),
  yellow: style(33, 39),
  blue: style(34, 39),
  magenta: style(35, 39),
  cyan: style(36, 39),
  gray: style(90, 39),
  white: style(97, 39),
};

// Legacy Windows consoles (conhost without Windows Terminal) render many glyphs
// as boxes; fall back to ASCII there.
const unicodeOk =
  process.platform !== 'win32' ||
  Boolean(env.WT_SESSION || env.TERM_PROGRAM || env.ConEmuANSI || env.CI);

export const sym = unicodeOk
  ? { ok: '✔', err: '✖', warn: '▲', info: 'ℹ', step: '›', bullet: '•', arrow: '→', dot: '·' }
  : { ok: '+', err: 'x', warn: '!', info: 'i', step: '>', bullet: '-', arrow: '->', dot: '.' };

function out(text) {
  process.stdout.write(`${text}\n`);
}

function err(text) {
  process.stderr.write(`${text}\n`);
}

/** Leveled logger. */
export const log = {
  /** Always printed to stdout (used for data / help). */
  print(text = '') {
    out(text);
  },
  /** Decorative text: printed to stdout unless quiet. */
  text(text = '') {
    if (level !== 'quiet') out(text);
  },
  blank() {
    if (level !== 'quiet') out('');
  },
  info(text) {
    if (level !== 'quiet') out(`${c.cyan(sym.info)} ${text}`);
  },
  ok(text) {
    if (level !== 'quiet') out(`${c.green(sym.ok)} ${text}`);
  },
  step(text) {
    if (level !== 'quiet') out(`${c.magenta(sym.step)} ${c.bold(text)}`);
  },
  item(text) {
    if (level !== 'quiet') out(`  ${c.gray(sym.bullet)} ${text}`);
  },
  warn(text) {
    err(`${c.yellow(sym.warn)} ${text}`);
  },
  error(text) {
    err(`${c.red(sym.err)} ${text}`);
  },
  debug(text) {
    if (level === 'verbose') err(c.gray(`  ${text}`));
  },
};

/** Prints a bold section heading preceded by a blank line. */
export function heading(text) {
  if (level === 'quiet') return;
  out('');
  out(c.bold(text));
}

const ANSI_RE = /\u001b\[[0-9;]*m/g;

export function stripAnsi(text) {
  return String(text).replace(ANSI_RE, '');
}

/**
 * Renders rows of cells as aligned columns.
 * @param {string[][]} rows
 * @param {{ indent?: number, gap?: number }} [options]
 */
export function table(rows, { indent = 2, gap = 2 } = {}) {
  if (rows.length === 0) return '';
  const widths = [];
  for (const row of rows) {
    row.forEach((cell, i) => {
      widths[i] = Math.max(widths[i] || 0, stripAnsi(cell).length);
    });
  }
  const pad = ' '.repeat(indent);
  return rows
    .map((row) =>
      pad +
      row
        .map((cell, i) => {
          if (i === row.length - 1) return cell;
          const visible = stripAnsi(cell).length;
          return cell + ' '.repeat(widths[i] - visible + gap);
        })
        .join('')
        .trimEnd(),
    )
    .join('\n');
}

/** Prints a table (no-op when quiet). */
export function printTable(rows, options) {
  if (level === 'quiet') return;
  out(table(rows, options));
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return '?';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

export function plural(count, singular, pluralForm = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

export function elapsed(startMs) {
  const ms = Date.now() - startMs;
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

export function timestamp(date = new Date()) {
  return date.toTimeString().slice(0, 8);
}
