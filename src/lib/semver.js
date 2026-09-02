/**
 * Minimal version helpers for the `[major, minor, patch]` arrays Bedrock uses
 * in manifests and the `"x.y.z"` strings used in config files.
 */

const NUMERIC_RE = /^\d+(\.\d+){0,2}$/;

/**
 * Parses a version into a 3-integer array. Accepts `"1.2.3"`, `"1.2"`, `[1,2,3]`
 * and pre-release strings such as `"2.10.0-beta"` (suffix is dropped).
 * @returns {number[] | null}
 */
export function parseVersion(input) {
  if (Array.isArray(input)) {
    if (input.length < 1 || input.length > 3) return null;
    if (!input.every((n) => Number.isInteger(n) && n >= 0)) return null;
    return [input[0] ?? 0, input[1] ?? 0, input[2] ?? 0];
  }
  if (typeof input === 'number' && Number.isInteger(input)) return [input, 0, 0];
  if (typeof input !== 'string') return null;
  const core = input.trim().replace(/^v/i, '').split(/[-+]/)[0];
  if (!NUMERIC_RE.test(core)) return null;
  const parts = core.split('.').map(Number);
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
}

/** `[1, 2, 3]` → `"1.2.3"` */
export function formatVersion(version) {
  const parsed = parseVersion(version);
  return parsed ? parsed.join('.') : String(version);
}

/** Negative if a < b, positive if a > b, 0 if equal. Unparseable values sort first. */
export function compareVersions(a, b) {
  const va = parseVersion(a);
  const vb = parseVersion(b);
  if (!va && !vb) return 0;
  if (!va) return -1;
  if (!vb) return 1;
  for (let i = 0; i < 3; i += 1) {
    if (va[i] !== vb[i]) return va[i] - vb[i];
  }
  return 0;
}

/**
 * Bumps a version. `kind` is `"major" | "minor" | "patch"` or an explicit
 * version such as `"2.0.0"`.
 * @returns {number[]}
 */
export function bumpVersion(current, kind) {
  const version = parseVersion(current) ?? [0, 0, 0];
  switch (kind) {
    case 'major':
      return [version[0] + 1, 0, 0];
    case 'minor':
      return [version[0], version[1] + 1, 0];
    case 'patch':
      return [version[0], version[1], version[2] + 1];
    default: {
      const explicit = parseVersion(kind);
      if (!explicit) {
        throw new Error(`Invalid version "${kind}". Use major, minor, patch or an explicit x.y.z version.`);
      }
      return explicit;
    }
  }
}

/** True for a well-formed `[int, int, int]` array. */
export function isVersionArray(value) {
  return Array.isArray(value) && value.length === 3 && value.every((n) => Number.isInteger(n) && n >= 0);
}

/** True for `"x.y.z"` style strings (optionally with a pre-release suffix). */
export function isVersionString(value) {
  return typeof value === 'string' && /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(value);
}
