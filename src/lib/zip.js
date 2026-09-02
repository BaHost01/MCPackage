/**
 * Small, dependency-free ZIP writer.
 *
 * Produces standard PKZIP archives (deflate or store) that Minecraft accepts
 * as .mcpack / .mcaddon / .mcworld files. Supports deterministic output
 * (fixed timestamps, sorted entries are the caller's responsibility) so that
 * rebuilding an unchanged project yields a byte-identical artifact.
 */
import fs from 'node:fs';
import zlib from 'node:zlib';
import { crc32 } from './crc32.js';

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_END = 0x06054b50;
const VERSION_NEEDED = 20; // 2.0 – deflate
const VERSION_MADE_BY = (3 << 8) | 20; // UNIX, 2.0
const FLAG_UTF8 = 1 << 11;
const METHOD_STORE = 0;
const METHOD_DEFLATE = 8;

/** Fixed timestamp used for reproducible builds (2000-01-01 00:00:00 local). */
export const REPRODUCIBLE_MTIME = new Date(2000, 0, 1, 0, 0, 0);

function dosDateTime(date) {
  const year = Math.min(Math.max(date.getFullYear(), 1980), 2107);
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const day = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, date: day };
}

function normalizeEntryName(name, isDirectory) {
  let entry = String(name).replace(/\\/g, '/').replace(/^\/+/, '');
  if (entry.includes('../') || entry === '..') throw new Error(`Refusing to write unsafe zip entry: ${name}`);
  if (isDirectory && !entry.endsWith('/')) entry += '/';
  return entry;
}

export class ZipWriter {
  /**
   * @param {(chunk: Buffer) => void} write  sink receiving bytes in order
   * @param {{ level?: number, mtime?: Date }} [options]
   */
  constructor(write, { level = 6, mtime } = {}) {
    this.write = write;
    this.level = level;
    this.defaultMtime = mtime;
    this.offset = 0;
    this.central = [];
    this.names = new Set();
    this.finished = false;
  }

  emit(buffer) {
    this.write(buffer);
    this.offset += buffer.length;
  }

  /**
   * Adds a file entry.
   * @param {string} name        entry path inside the archive (forward slashes)
   * @param {Buffer|Uint8Array|string} data
   * @param {{ mtime?: Date, compress?: boolean, mode?: number }} [options]
   */
  addFile(name, data, { mtime, compress = true, mode = 0o644 } = {}) {
    if (this.finished) throw new Error('ZipWriter already finished');
    const entryName = normalizeEntryName(name, false);
    if (this.names.has(entryName)) throw new Error(`Duplicate zip entry: ${entryName}`);
    this.names.add(entryName);

    const content = Buffer.isBuffer(data) ? data : Buffer.from(data);
    const crc = crc32(content);
    let method = METHOD_STORE;
    let payload = content;
    if (compress && this.level > 0 && content.length > 0) {
      const deflated = zlib.deflateRawSync(content, { level: this.level });
      if (deflated.length < content.length) {
        method = METHOD_DEFLATE;
        payload = deflated;
      }
    }
    this.writeEntry(entryName, payload, {
      crc,
      method,
      size: content.length,
      mtime: mtime || this.defaultMtime || new Date(),
      externalAttrs: ((0o100000 | mode) << 16) >>> 0,
    });
  }

  /** Adds an explicit directory entry (optional; most readers infer directories). */
  addDirectory(name, { mtime } = {}) {
    if (this.finished) throw new Error('ZipWriter already finished');
    const entryName = normalizeEntryName(name, true);
    if (this.names.has(entryName)) return;
    this.names.add(entryName);
    this.writeEntry(entryName, Buffer.alloc(0), {
      crc: 0,
      method: METHOD_STORE,
      size: 0,
      mtime: mtime || this.defaultMtime || new Date(),
      externalAttrs: (((0o040000 | 0o755) << 16) | 0x10) >>> 0,
    });
  }

  writeEntry(entryName, payload, { crc, method, size, mtime, externalAttrs }) {
    const nameBytes = Buffer.from(entryName, 'utf8');
    const { time, date } = dosDateTime(mtime);
    const localOffset = this.offset;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(SIG_LOCAL, 0);
    local.writeUInt16LE(VERSION_NEEDED, 4);
    local.writeUInt16LE(FLAG_UTF8, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(payload.length, 18);
    local.writeUInt32LE(size, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28);

    this.emit(local);
    this.emit(nameBytes);
    if (payload.length) this.emit(payload);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(SIG_CENTRAL, 0);
    central.writeUInt16LE(VERSION_MADE_BY, 4);
    central.writeUInt16LE(VERSION_NEEDED, 6);
    central.writeUInt16LE(FLAG_UTF8, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(payload.length, 20);
    central.writeUInt32LE(size, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt16LE(0, 30); // extra length
    central.writeUInt16LE(0, 32); // comment length
    central.writeUInt16LE(0, 34); // disk number
    central.writeUInt16LE(0, 36); // internal attrs
    central.writeUInt32LE(externalAttrs, 38);
    central.writeUInt32LE(localOffset, 42);
    this.central.push(central, nameBytes);
  }

  /** Writes the central directory. Must be called exactly once. */
  finish() {
    if (this.finished) return;
    this.finished = true;
    const start = this.offset;
    for (const chunk of this.central) this.emit(chunk);
    const size = this.offset - start;
    const count = this.names.size;

    const end = Buffer.alloc(22);
    end.writeUInt32LE(SIG_END, 0);
    end.writeUInt16LE(0, 4);
    end.writeUInt16LE(0, 6);
    end.writeUInt16LE(count, 8);
    end.writeUInt16LE(count, 10);
    end.writeUInt32LE(size, 12);
    end.writeUInt32LE(start, 16);
    end.writeUInt16LE(0, 20);
    this.emit(end);
  }

  get entryCount() {
    return this.names.size;
  }

  get bytesWritten() {
    return this.offset;
  }
}

/** Creates a writer that streams to `filePath`. Call `.close()` when done. */
export function createZipFile(filePath, options) {
  const fd = fs.openSync(filePath, 'w');
  const writer = new ZipWriter((chunk) => fs.writeSync(fd, chunk), options);
  writer.close = () => {
    writer.finish();
    fs.closeSync(fd);
    return writer.bytesWritten;
  };
  return writer;
}

/** Creates an in-memory writer. Call `.toBuffer()` to finish and collect. */
export function createZipBuffer(options) {
  const chunks = [];
  const writer = new ZipWriter((chunk) => chunks.push(Buffer.from(chunk)), options);
  writer.toBuffer = () => {
    writer.finish();
    return Buffer.concat(chunks);
  };
  return writer;
}

// ---------------------------------------------------------------------------
// Reading (just enough to list / extract entries for `inspect` and tests)
// ---------------------------------------------------------------------------

/**
 * Lists entries of a ZIP buffer.
 * @param {Buffer} buffer
 * @returns {{ name: string, size: number, compressedSize: number, method: number, offset: number }[]}
 */
export function listZipEntries(buffer) {
  const endOffset = findEndOfCentralDirectory(buffer);
  const count = buffer.readUInt16LE(endOffset + 10);
  let pointer = buffer.readUInt32LE(endOffset + 16);
  const entries = [];
  for (let i = 0; i < count; i += 1) {
    if (buffer.readUInt32LE(pointer) !== SIG_CENTRAL) throw new Error('Corrupt zip: bad central directory entry');
    const method = buffer.readUInt16LE(pointer + 10);
    const crc = buffer.readUInt32LE(pointer + 16);
    const compressedSize = buffer.readUInt32LE(pointer + 20);
    const size = buffer.readUInt32LE(pointer + 24);
    const nameLength = buffer.readUInt16LE(pointer + 28);
    const extraLength = buffer.readUInt16LE(pointer + 30);
    const commentLength = buffer.readUInt16LE(pointer + 32);
    const offset = buffer.readUInt32LE(pointer + 42);
    const name = buffer.toString('utf8', pointer + 46, pointer + 46 + nameLength);
    entries.push({ name, size, compressedSize, method, crc, offset });
    pointer += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

/** Extracts a single entry (by central-directory record) to a Buffer. */
export function readZipEntry(buffer, entry) {
  if (buffer.readUInt32LE(entry.offset) !== SIG_LOCAL) throw new Error('Corrupt zip: bad local header');
  const nameLength = buffer.readUInt16LE(entry.offset + 26);
  const extraLength = buffer.readUInt16LE(entry.offset + 28);
  const start = entry.offset + 30 + nameLength + extraLength;
  const payload = buffer.subarray(start, start + entry.compressedSize);
  if (entry.method === METHOD_STORE) return Buffer.from(payload);
  if (entry.method === METHOD_DEFLATE) return zlib.inflateRawSync(payload);
  throw new Error(`Unsupported zip compression method ${entry.method}`);
}

function findEndOfCentralDirectory(buffer) {
  const min = Math.max(0, buffer.length - 22 - 0xffff);
  for (let i = buffer.length - 22; i >= min; i -= 1) {
    if (buffer.readUInt32LE(i) === SIG_END) return i;
  }
  throw new Error('Not a zip file (end of central directory not found)');
}
