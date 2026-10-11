// Minimal Microsoft Cabinet reader for multi-volume sets (MSZIP or stored),
// streaming file data to writers. Used to unpack the installer without
// external tools, both in Node and in the browser.
import { concat, latin1, u16, u32, type InflateRaw, type RandomAccess, type Writer } from './bytes';

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

export interface CabSink {
  /** Returns a writer for a cabinet entry, or null to skip it. */
  accept(name: string): boolean;
  open(name: string, size: number): Writer;
  /** Called with (bytes produced, total bytes wanted). */
  progress?(done: number, total: number): void;
}

export function extractCabSet(vols: RandomAccess[], sink: CabSink, inflateRaw: InflateRaw) {
  const folders: Folder[] = [];
  const files = new Map<string, FileRec>();
  let prevLast = -1; // global index of previous cabinet's last folder

  vols.forEach((v, vi) => {
    const h = v.read(0, 64);
    const coffFiles = u32(h, 16);
    const cFolders = u16(h, 26);
    const cFiles = u16(h, 28);
    const flags = u16(h, 30);
    let p = 36;
    let cbFolderRes = 0, cbDataRes = 0;
    if (flags & 4) {
      const hdr = v.read(36, 4);
      cbFolderRes = hdr[2];
      cbDataRes = hdr[3];
      p = 40 + u16(hdr, 0);
    }
    const strz = () => {
      const b = v.read(p, Math.min(512, v.size - p));
      const n = b.indexOf(0);
      const s = latin1(b, 0, n);
      p += n + 1;
      return s;
    };
    if (flags & 1) (strz(), strz());
    if (flags & 2) (strz(), strz());

    const local: number[] = [];
    for (let i = 0; i < cFolders; i++) {
      const f = v.read(p, 8);
      p += 8 + cbFolderRes;
      const start = u32(f, 0), n = u16(f, 4), comp = u16(f, 6) & 0xf;
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
        const cb = u16(d, 4), uncomp = u16(d, 6);
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
      let fi = u16(f, 8);
      if (fi === 0xfffd || fi === 0xffff) fi = 0;
      else if (fi === 0xfffe) fi = cFolders - 1;
      const rec: FileRec = { name, size: u32(f, 0), uoff: u32(f, 4), folder: local[fi] };
      const key = `${rec.folder}:${rec.uoff}:${name}`;
      if (!files.has(key)) files.set(key, rec);
    }
  });

  // decompress each folder as a stream, writing accepted files
  const byFolder = new Map<number, FileRec[]>();
  let total = 0, produced = 0;
  for (const f of files.values()) {
    if (!sink.accept(f.name)) continue;
    if (!byFolder.has(f.folder)) byFolder.set(f.folder, []);
    byFolder.get(f.folder)!.push(f);
    total += f.size;
  }
  for (const [fi, list] of byFolder) {
    list.sort((a, b) => a.uoff - b.uoff);
    const folder = folders[fi];
    const end = Math.max(...list.map((f) => f.uoff + f.size));
    const open = new Map<FileRec, Writer>();
    let pos = 0;
    let dict: Uint8Array = new Uint8Array(0);
    let pending: Uint8Array[] = [];
    let next = 0;
    for (const b of folder.blocks) {
      if (pos >= end) break;
      const raw = vols[b.vol].read(b.off, b.cb);
      if (b.uncomp === 0) {
        pending.push(raw); // block continues in the next cabinet
        continue;
      }
      const data = pending.length ? concat([...pending, raw]) : raw;
      pending = [];
      let out: Uint8Array;
      if (folder.comp === 0) out = data;
      else if (folder.comp === 1) {
        if (data[0] !== 0x43 || data[1] !== 0x4b) throw new Error('bad MSZIP block');
        out = inflateRaw(data.subarray(2), dict.length ? dict : undefined);
        dict = out.length >= 32768 ? out.subarray(out.length - 32768) : concat([dict, out]).slice(-32768);
      } else throw new Error(`unsupported cab compression ${folder.comp}`);
      const s = pos, e = pos + out.length;
      for (let i = next; i < list.length; i++) {
        const f = list[i];
        if (f.uoff >= e) break;
        const fs0 = Math.max(s, f.uoff), fe = Math.min(e, f.uoff + f.size);
        if (fe > fs0) {
          let w = open.get(f);
          if (!w) {
            w = sink.open(f.name, f.size);
            open.set(f, w);
          }
          w.write(out.subarray(fs0 - s, fe - s));
          produced += fe - fs0;
        }
        if (f.uoff + f.size <= e) {
          const w = open.get(f);
          if (w) w.close();
          else if (f.size === 0) sink.open(f.name, 0).close();
          open.delete(f);
          if (i === next) next++;
        }
      }
      pos = e;
      sink.progress?.(produced, total);
    }
    for (const w of open.values()) w.close();
  }
}
