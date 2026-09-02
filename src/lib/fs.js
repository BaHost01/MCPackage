/**
 * File-system helpers built on node:fs — JSON-with-comments parsing, safe
 * writes, recursive walking with ignore patterns, and simple globbing.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { JsonParseError } from './errors.js';

export async function exists(target) {
  try {
    await fsp.access(target);
    return true;
  } catch {
    return false;
  }
}

export async function isDirectory(target) {
  try {
    return (await fsp.stat(target)).isDirectory();
  } catch {
    return false;
  }
}

export async function isFile(target) {
  try {
    return (await fsp.stat(target)).isFile();
  } catch {
    return false;
  }
}

/**
 * Strips `//` and `/* *\/` comments and trailing commas from JSON text while
 * preserving string contents. Bedrock tolerates comments in most files, so the
 * CLI must too.
 */
export function stripJsonComments(text) {
  let out = '';
  let inString = false;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    const next = text[i + 1];
    if (inString) {
      out += ch;
      if (ch === '\\') {
        out += next ?? '';
        i += 2;
        continue;
      }
      if (ch === '"') inString = false;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
      i += 1;
      continue;
    }
    if (ch === '/' && next === '/') {
      while (i < text.length && text[i] !== '\n') i += 1;
      continue;
    }
    if (ch === '/' && next === '*') {
      const end = text.indexOf('*/', i + 2);
      i = end === -1 ? text.length : end + 2;
      continue;
    }
    out += ch;
    i += 1;
  }
  // Trailing commas: `,` followed only by whitespace and a closing bracket.
  return out.replace(/,(\s*[}\]])/g, '$1');
}

/**
 * Parses JSON (with comments/trailing commas allowed). Throws JsonParseError.
 * @param {string} text
 * @param {string} [file] used in error messages
 */
export function parseJson(text, file = '<json>') {
  const clean = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text; // BOM
  try {
    return JSON.parse(clean);
  } catch (strictError) {
    try {
      return JSON.parse(stripJsonComments(clean));
    } catch {
      throw new JsonParseError(file, strictError, clean);
    }
  }
}

export async function readJson(file) {
  const text = await fsp.readFile(file, 'utf8');
  return parseJson(text, file);
}

export function readJsonSync(file) {
  return parseJson(fs.readFileSync(file, 'utf8'), file);
}

/** Reads a JSON file if it exists, otherwise returns `fallback`. */
export async function readJsonIfExists(file, fallback = null) {
  if (!(await exists(file))) return fallback;
  return readJson(file);
}

export async function writeJson(file, data, { indent = 2 } = {}) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, `${JSON.stringify(data, null, indent)}\n`, 'utf8');
}

export async function writeText(file, text) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, text, 'utf8');
}

/** Writes a file only if it does not exist yet. Returns true when written. */
export async function writeIfMissing(file, content) {
  if (await exists(file)) return false;
  if (typeof content === 'string' || Buffer.isBuffer(content)) await writeText(file, content);
  else await writeJson(file, content);
  return true;
}

export async function ensureDir(dir) {
  await fsp.mkdir(dir, { recursive: true });
}

export async function remove(target) {
  await fsp.rm(target, { recursive: true, force: true });
}

/**
 * Copies a directory tree, optionally filtering entries.
 * @param {string} from
 * @param {string} to
 * @param {{ filter?: (relativePath: string, isDir: boolean) => boolean }} [options]
 * @returns {Promise<number>} number of files copied
 */
export async function copyDir(from, to, { filter } = {}) {
  let count = 0;
  await fsp.mkdir(to, { recursive: true });
  const entries = await fsp.readdir(from, { withFileTypes: true });
  for (const entry of entries) {
    const source = path.join(from, entry.name);
    const relative = path.relative(from, source).split(path.sep).join('/');
    const isDir = entry.isDirectory();
    if (filter && !filter(relative, isDir)) continue;
    const target = path.join(to, entry.name);
    if (isDir) {
      count += await copyDir(source, target, {
        filter: filter ? (rel, dir) => filter(`${relative}/${rel}`, dir) : undefined,
      });
    } else if (entry.isFile()) {
      await fsp.copyFile(source, target);
      count += 1;
    }
  }
  return count;
}

// ---------------------------------------------------------------------------
// Globbing
// ---------------------------------------------------------------------------

/**
 * Converts a glob (supports `**`, `*`, `?`, `{a,b}`, `[abc]`) to a RegExp that
 * matches forward-slash relative paths.
 */
export function globToRegExp(glob) {
  let pattern = glob.replace(/\\/g, '/').replace(/^\.\//, '');
  const anchored = pattern.startsWith('/');
  if (anchored) pattern = pattern.slice(1);
  let re = '';
  let i = 0;
  while (i < pattern.length) {
    const ch = pattern[i];
    if (ch === '*') {
      if (pattern[i + 1] === '*') {
        // `**/` matches zero or more directories; trailing `**` matches anything.
        if (pattern[i + 2] === '/') {
          re += '(?:.*/)?';
          i += 3;
        } else {
          re += '.*';
          i += 2;
        }
      } else {
        re += '[^/]*';
        i += 1;
      }
    } else if (ch === '?') {
      re += '[^/]';
      i += 1;
    } else if (ch === '{') {
      const end = pattern.indexOf('}', i);
      if (end === -1) {
        re += '\\{';
        i += 1;
      } else {
        const alternatives = pattern
          .slice(i + 1, end)
          .split(',')
          .map((alt) => globToRegExp(alt).source.replace(/^\^\(\?:\.\*\/\)\?|^\^|\$$/g, ''));
        re += `(?:${alternatives.join('|')})`;
        i = end + 1;
      }
    } else if (ch === '[') {
      const end = pattern.indexOf(']', i);
      if (end === -1) {
        re += '\\[';
        i += 1;
      } else {
        re += pattern.slice(i, end + 1);
        i = end + 1;
      }
    } else {
      re += ch.replace(/[.+^$()|\\]/g, '\\$&');
      i += 1;
    }
  }
  // Un-anchored patterns without a slash match at any depth (like .gitignore).
  const prefix = !anchored && !glob.includes('/') ? '^(?:.*/)?' : '^';
  return new RegExp(`${prefix}${re}$`);
}

/** Builds a matcher from a list of glob patterns. Empty list matches nothing. */
export function createMatcher(patterns = []) {
  const regexes = patterns.filter(Boolean).map(globToRegExp);
  return (relativePath) => {
    const normalized = relativePath.replace(/\\/g, '/');
    return regexes.some((re) => re.test(normalized));
  };
}

/**
 * Recursively walks `root` and returns relative file paths (forward slashes),
 * sorted for deterministic output.
 * @param {string} root
 * @param {{ ignore?: string[], includeDirs?: boolean }} [options]
 */
export async function walk(root, { ignore = [], includeDirs = false } = {}) {
  const ignored = createMatcher(ignore);
  const results = [];

  async function visit(dir, relativeDir) {
    let entries;
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch (err) {
      if (err.code === 'ENOENT') return;
      throw err;
    }
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const entry of entries) {
      const relative = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;
      if (ignored(relative) || ignored(`${relative}/`)) continue;
      if (entry.isDirectory()) {
        if (includeDirs) results.push(`${relative}/`);
        await visit(path.join(dir, entry.name), relative);
      } else if (entry.isFile()) {
        results.push(relative);
      }
    }
  }

  await visit(root, '');
  return results;
}

/**
 * Returns files under `root` matching any of `patterns`.
 * @param {string} root
 * @param {string|string[]} patterns
 * @param {{ ignore?: string[] }} [options]
 */
export async function glob(root, patterns, { ignore = [] } = {}) {
  const list = Array.isArray(patterns) ? patterns : [patterns];
  const matches = createMatcher(list);
  const files = await walk(root, { ignore });
  return files.filter(matches);
}

/** Relative path with forward slashes, for display and archive entries. */
export function toPosix(relativePath) {
  return relativePath.split(path.sep).join('/');
}

/** Converts a human name to a file-system/identifier friendly slug. */
export function slugify(name) {
  return String(name)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/^(\d)/, '_$1') || 'addon';
}
