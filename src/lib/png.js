/**
 * Generates tiny PNG images without any image library. Used for placeholder
 * pack icons and textures so scaffolded content is immediately valid in-game.
 */
import zlib from 'node:zlib';
import { crc32 } from './crc32.js';

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBytes = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 0);
  return Buffer.concat([length, typeBytes, data, crc]);
}

/**
 * Creates an RGBA PNG from a pixel callback.
 * @param {number} width
 * @param {number} height
 * @param {(x: number, y: number) => [number, number, number, number]} pixel
 */
export function createPng(width, height, pixel) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  let offset = 0;
  for (let y = 0; y < height; y += 1) {
    raw[offset] = 0; // filter: none
    offset += 1;
    for (let x = 0; x < width; x += 1) {
      const [r, g, b, a] = pixel(x, y);
      raw[offset] = r;
      raw[offset + 1] = g;
      raw[offset + 2] = b;
      raw[offset + 3] = a;
      offset += 4;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Deterministic color derived from a string, so each generated asset looks distinct. */
export function colorFromString(text) {
  let hash = 2166136261;
  for (const ch of String(text)) {
    hash ^= ch.charCodeAt(0);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  const hue = hash % 360;
  return hslToRgb(hue / 360, 0.55, 0.5);
}

function hslToRgb(h, s, l) {
  const k = (n) => (n + h * 12) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

/** A 16×16 two-tone checker texture in a color derived from `seed`. */
export function placeholderTexture(seed, size = 16) {
  const [r, g, b] = colorFromString(seed);
  const dark = [Math.round(r * 0.75), Math.round(g * 0.75), Math.round(b * 0.75)];
  return createPng(size, size, (x, y) => {
    const checker = (Math.floor(x / 4) + Math.floor(y / 4)) % 2 === 0;
    const [pr, pg, pb] = checker ? [r, g, b] : dark;
    return [pr, pg, pb, 255];
  });
}

/** A 128×128 pack icon: colored background with a lighter inner square. */
export function packIcon(seed, size = 128) {
  const [r, g, b] = colorFromString(seed);
  const light = [Math.min(255, r + 60), Math.min(255, g + 60), Math.min(255, b + 60)];
  const margin = Math.floor(size / 4);
  return createPng(size, size, (x, y) => {
    const inner = x >= margin && x < size - margin && y >= margin && y < size - margin;
    const [pr, pg, pb] = inner ? light : [r, g, b];
    return [pr, pg, pb, 255];
  });
}

/** A 64×64 entity texture: body area in one shade, head in a lighter one. */
export function entityTexture(seed) {
  const [r, g, b] = colorFromString(seed);
  const light = [Math.min(255, r + 50), Math.min(255, g + 50), Math.min(255, b + 50)];
  return createPng(64, 64, (x, y) => {
    const head = y < 16 && x < 32;
    const [pr, pg, pb] = head ? light : [r, g, b];
    const shade = (x + y) % 8 === 0 ? -20 : 0;
    return [clamp(pr + shade), clamp(pg + shade), clamp(pb + shade), 255];
  });
}

function clamp(v) {
  return Math.max(0, Math.min(255, v));
}
