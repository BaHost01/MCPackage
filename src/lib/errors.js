/**
 * Error types shared across the CLI.
 *
 * A `CliError` is an *expected* failure: something the user can fix. The top
 * level prints its message (and optional hint) without a stack trace and exits
 * with `exitCode`. Anything else is treated as a bug and printed in full.
 */
export class CliError extends Error {
  /**
   * @param {string} message
   * @param {{ hint?: string, exitCode?: number, cause?: unknown }} [options]
   */
  constructor(message, { hint, exitCode = 1, cause } = {}) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'CliError';
    this.hint = hint;
    this.exitCode = exitCode;
  }
}

/** Thrown when a JSON (or JSON-with-comments) file cannot be parsed. */
export class JsonParseError extends CliError {
  /**
   * @param {string} file   Path used in messages
   * @param {Error} cause   The underlying SyntaxError
   * @param {string} text   The text that failed to parse (used to locate line/column)
   */
  constructor(file, cause, text = '') {
    const detail = String(cause.message)
      .replace(/ (?:in JSON )?at position \d+.*$/s, '')
      .replace(/,\s*(?:\.\.\.)?".*$/s, '') // V8's `, ..."snippet"... is not valid JSON` tail
      .replace(/\s*\(line \d+ column \d+\)/, '')
      .replace(/\s+is not valid JSON$/, '')
      .trim();
    // Prefer our own scanner for the location: it is exact and independent of
    // how V8 words the message. Fall back to the position V8 reports, if any.
    let index = text ? locateJsonError(text) : -1;
    if (index < 0) {
      const positional = /position (\d+)/.exec(cause.message);
      index = positional ? Number(positional[1]) : null;
    }
    let line;
    let column;
    if (index !== null && index >= 0) {
      const before = text.slice(0, index);
      line = before.split('\n').length;
      column = index - before.lastIndexOf('\n');
    }
    const where = line ? ` (line ${line}, column ${column})` : '';
    super(`${file}: invalid JSON${where}: ${detail}`, { cause });
    this.name = 'JsonParseError';
    this.file = file;
    this.line = line;
    this.column = column;
    this.detail = detail;
  }
}

/**
 * Returns the offset of the first character at which `text` stops being valid
 * JSON (or `text.length` when the input ends too early), or -1 when the text
 * is valid. A small hand-written scanner is used because V8's SyntaxError
 * messages don't always include a position and their wording changes between
 * Node versions. Only runs on the error path.
 */
export function locateJsonError(text) {
  const n = text.length;
  let i = 0;
  const NUMBER = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
  const skipWs = () => {
    while (i < n && (text[i] === ' ' || text[i] === '\n' || text[i] === '\r' || text[i] === '\t')) i += 1;
  };
  const fail = (at) => {
    throw at;
  };
  const string = () => {
    i += 1; // opening quote
    for (;;) {
      if (i >= n) fail(n);
      const ch = text[i];
      if (ch === '"') {
        i += 1;
        return;
      }
      if (ch === '\\') {
        const esc = text[i + 1];
        if (esc === undefined) fail(n);
        if (esc === 'u') {
          if (!/^[0-9a-fA-F]{4}$/.test(text.slice(i + 2, i + 6))) fail(i + 2);
          i += 6;
        } else if ('"\\/bfnrt'.includes(esc)) {
          i += 2;
        } else {
          fail(i + 1);
        }
        continue;
      }
      if (ch.charCodeAt(0) < 0x20) fail(i);
      i += 1;
    }
  };
  const literal = (word) => {
    if (text.startsWith(word, i)) i += word.length;
    else {
      let k = 0;
      while (k < word.length && text[i + k] === word[k]) k += 1;
      fail(i + k);
    }
  };
  const value = () => {
    skipWs();
    if (i >= n) fail(n);
    const ch = text[i];
    if (ch === '{') {
      i += 1;
      skipWs();
      if (text[i] === '}') {
        i += 1;
        return;
      }
      for (;;) {
        skipWs();
        if (text[i] !== '"') fail(i);
        string();
        skipWs();
        if (text[i] !== ':') fail(i);
        i += 1;
        value();
        skipWs();
        if (text[i] === ',') {
          i += 1;
          continue;
        }
        if (text[i] === '}') {
          i += 1;
          return;
        }
        fail(i);
      }
    }
    if (ch === '[') {
      i += 1;
      skipWs();
      if (text[i] === ']') {
        i += 1;
        return;
      }
      for (;;) {
        value();
        skipWs();
        if (text[i] === ',') {
          i += 1;
          continue;
        }
        if (text[i] === ']') {
          i += 1;
          return;
        }
        fail(i);
      }
    }
    if (ch === '"') return string();
    if (ch === 't') return literal('true');
    if (ch === 'f') return literal('false');
    if (ch === 'n') return literal('null');
    NUMBER.lastIndex = i;
    if (NUMBER.test(text)) {
      i = NUMBER.lastIndex;
      return;
    }
    fail(i);
  };
  try {
    value();
    skipWs();
    if (i < n) fail(i);
    return -1;
  } catch (at) {
    if (typeof at === 'number') return Math.min(at, n);
    throw at;
  }
}

/** True when `err` is something we should report tersely rather than as a crash. */
export function isCliError(err) {
  return err instanceof CliError;
}
