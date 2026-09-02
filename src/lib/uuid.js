import { randomUUID } from 'node:crypto';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Cryptographically random UUID v4. */
export function uuid() {
  return randomUUID();
}

export function isUuid(value) {
  return typeof value === 'string' && UUID_RE.test(value);
}
