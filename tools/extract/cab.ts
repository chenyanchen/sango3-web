// Minimal Microsoft Cabinet reader for multi-volume sets (MSZIP or stored),
// streaming file data to disk. Used to unpack the installer without external
// tools.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

export interface CabVolume {
  /** reads `len` bytes at `off` within this cabinet */
  read(off: number, len: number): Buffer;
  size: number;
}

interface Folder {
  blocks: { vol: number; off: number; cb: number; uncomp: number }[];
  comp: number;
}

interface FileRec {
  name: string;
  size: number;
  uoff: number;
  folder: number; // global folder index
}

export function extractCabSet(vols: CabVolume[], outDir: string, accept: (name: string) => string | null) {
  const folders: Folder[] = [];
  const files = new Map<string, FileRec>();
  let prevLast = -1; // global index of previous cabinet's last folder

  vols.forEach((v, vi) => {
    const h = v.read(0, 64);
    const coffFiles = h.readUInt32LE(16);
    const cFolders = h.readUInt16LE(26);
    const cFiles = h.readUInt16LE(28);
    const flags = h.readUInt16LE(30);
    let p = 36;
    let cbFolderRes = 0, cbDataRes = 0;
    if (flags & 4) {
      const hdr = v.read(36, 4);
      cbFolderRes = hdr[2];
      cbDataRes = hdr[3];
      p = 40 + hdr.readUInt16LE(0);
    }
    const strz = () => {
      const b = v.read(p, 512);
      const n = b.indexOf(0);
      const s = b.toString('latin1', 0, n);
      p += n + 1;
      return s;
    };
    if (flags & 1) (strz(), strz());
    if (flags & 2) (strz(), strz());

    const local: number[] = [];
    for (let i = 0; i < cFolders; i++) {
      const f = v.read(p, 8);
      p += 8 + cbFolderRes;
      const start = f.readUInt32LE(0), n = f.readUInt16LE(4), comp = f.readUInt16LE(6) & 0xf;
      let gi: number;
      if (i === 0 && flags & 1 && prevLast >= 0) gi = prevLast;
      else {
        gi = folders.length;
        folders.push({ blocks: [], comp });
      }
      local.push(gi);
      let q = start;
      for (let k = 0; k < n; k++) {
        const d = v.read(q, 8);
        const cb = d.readUInt16LE(4), uncomp = d.readUInt16LE(6);
        folders[gi].blocks.push({ vol: vi, off: q + 8 + cbDataRes, cb, uncomp });
        q += 8 + cbDataRes + cb;
      }
    }
    prevLast = local[local.length - 1];

    p = coffFiles;
    for (let i = 0; i < cFiles; i++) {
      const f = v.read(p, 16);
      p += 16;
      const name = strz();
      let fi = f.readUInt16LE(8);
      if (fi === 0xfffd || fi === 0xffff) fi = 0;
      else if (fi === 0xfffe) fi = cFolders - 1;
      const rec: FileRec = { name, size: f.readUInt32LE(0), uoff: f.readUInt32LE(4), folder: local[fi] };
      const key = `${rec.folder}:${rec.uoff}:${name}`;
      if (!files.has(key)) files.set(key, rec);
    }
  });

  // decompress each folder as a stream, writing accepted files
  const byFolder = new Map<number, FileRec[]>();
  for (const f of files.values()) {
    if (!accept(f.name)) continue;
    if (!byFolder.has(f.folder)) byFolder.set(f.folder, []);
    byFolder.get(f.folder)!.push(f);
  }
  for (const [fi, list] of byFolder) {
    list.sort((a, b) => a.uoff - b.uoff);
    const folder = folders[fi];
    const end = Math.max(...list.map((f) => f.uoff + f.size));
    const open = new Map<FileRec, number>();
    let pos = 0;
    let dict: Buffer = Buffer.alloc(0);
    let pending: Buffer[] = [];
    let next = 0;
    for (const b of folder.blocks) {
      if (pos >= end) break;
      const raw = vols[b.vol].read(b.off, b.cb);
      if (b.uncomp === 0) {
        pending.push(raw); // block continues in the next cabinet
        continue;
      }
      const data = pending.length ? Buffer.concat([...pending, raw]) : raw;
      pending = [];
      let out: Buffer;
      if (folder.comp === 0) out = data;
      else if (folder.comp === 1) {
        if (data[0] !== 0x43 || data[1] !== 0x4b) throw new Error('bad MSZIP block');
        out = zlib.inflateRawSync(data.subarray(2), dict.length ? { dictionary: dict } : {});
        dict = out.length >= 32768 ? out.subarray(out.length - 32768) : Buffer.concat([dict, out]).subarray(-32768);
      } else throw new Error(`unsupported cab compression ${folder.comp}`);
      const s = pos, e = pos + out.length;
      for (let i = next; i < list.length; i++) {
        const f = list[i];
        if (f.uoff >= e) break;
        const fs0 = Math.max(s, f.uoff), fe = Math.min(e, f.uoff + f.size);
        if (fe > fs0) {
          let fd = open.get(f);
          if (fd === undefined) {
            const rel = accept(f.name)!;
            const dst = path.join(outDir, rel);
            fs.mkdirSync(path.dirname(dst), { recursive: true });
            fd = fs.openSync(dst, 'w');
            open.set(f, fd);
          }
          fs.writeSync(fd, out, fs0 - s, fe - fs0);
        }
        if (f.uoff + f.size <= e) {
          const fd = open.get(f);
          if (fd !== undefined) fs.closeSync(fd);
          else if (f.size === 0) fs.writeFileSync(path.join(outDir, accept(f.name)!), '');
          open.delete(f);
          if (i === next) next++;
        }
      }
      pos = e;
    }
    for (const fd of open.values()) fs.closeSync(fd);
  }
}
