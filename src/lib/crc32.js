/** Table-driven CRC-32 (IEEE 802.3), as used by ZIP and PNG. */

const TABLE = new Int32Array(256);
for (let n = 0; n < 256; n += 1) {
  let value = n;
  for (let k = 0; k < 8; k += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  TABLE[n] = value;
}

/**
 * @param {Uint8Array} bytes
 * @param {number} [seed] previous CRC when hashing incrementally
 * @returns {number} unsigned 32-bit CRC
 */
export function crc32(bytes, seed = 0) {
  let crc = seed ^ -1;
  for (let i = 0; i < bytes.length; i += 1) {
    crc = TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ -1) >>> 0;
}
