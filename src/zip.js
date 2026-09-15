import fs from 'node:fs/promises';
import path from 'node:path';

function u16(n) { return Buffer.from([n & 255, (n >>> 8) & 255]); }
function u32(n) { return Buffer.from([n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255]); }
function crc32(buf) { let c = 0xffffffff; for (const b of buf) { c ^= b; for (let i=0;i<8;i++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return (c ^ 0xffffffff) >>> 0; }

export async function zipFiles(entries, output) {
  const chunks=[], central=[]; let offset=0;
  for (const entry of entries) {
    const data = entry.data; const nb=Buffer.from(entry.name); const crc=crc32(data);
    const local=Buffer.concat([Buffer.from([80,75,3,4]),u16(20),u16(0),u16(0),u16(0),u16(0),u32(crc),u32(data.length),u32(data.length),u16(nb.length),u16(0),nb,data]);
    chunks.push(local);
    central.push(Buffer.concat([Buffer.from([80,75,1,2]),u16(20),u16(20),u16(0),u16(0),u16(0),u16(0),u32(crc),u32(data.length),u32(data.length),u16(nb.length),u16(0),u16(0),u16(0),u16(0),u32(0),u32(offset),nb])); offset+=local.length;
  }
  const body=Buffer.concat(chunks), cd=Buffer.concat(central); const end=Buffer.concat([Buffer.from([80,75,5,6]),Buffer.alloc(6),u16(entries.length),u16(entries.length),u32(cd.length),u32(body.length),u16(0)]);
  await fs.mkdir(path.dirname(output),{recursive:true}); await fs.writeFile(output,Buffer.concat([body,cd,end])); return output;
}

export async function zipDirectory(root, output) {
  const entries=[];
  async function walk(dir) { for (const e of await fs.readdir(dir,{withFileTypes:true})) { const f=path.join(dir,e.name); if(e.isDirectory()) await walk(f); else entries.push({name:path.relative(root,f).split(path.sep).join('/'),data:await fs.readFile(f)}); } }
  await walk(root); await zipFiles(entries,output); return { output, files: entries.length, bytes:(await fs.stat(output)).size };
}
