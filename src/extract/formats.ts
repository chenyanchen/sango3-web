// Decoders for the original Sango3 file formats.
import { i32, latin1, u16, u32, type RandomAccess } from './bytes';

// ---------------------------------------------------------------- PAK
// "PAKS" | u32 count | u32 indexOffset | u32 ? | data... | index[count] (64 bytes each)
// index entry: u32 size | u32 offset | 16 bytes reserved | char name[40] (GBK/Big5)
export interface PakEntry {
  name: string; // normalized: forward slashes, original case
  offset: number;
  size: number;
}

export class Pak {
  readonly entries = new Map<string, PakEntry>(); // key: lowercased name

  constructor(private ra: RandomAccess) {
    const head = ra.read(0, 16);
    if (latin1(head, 0, 4) !== 'PAKS') throw new Error('not a PAK file');
    const count = u32(head, 4);
    const indexOff = u32(head, 8);
    const index = ra.read(indexOff, count * 64);
    const dec = new TextDecoder('big5');
    for (let i = 0; i < count; i++) {
      const e = index.subarray(i * 64, i * 64 + 64);
      const raw = e.subarray(24);
      const nul = raw.indexOf(0);
      const name = dec.decode(raw.subarray(0, nul < 0 ? raw.length : nul)).replaceAll('\\', '/');
      this.entries.set(name.toLowerCase(), { name, size: u32(e, 0), offset: u32(e, 4) });
    }
  }

  read(name: string | PakEntry): Uint8Array {
    const e = typeof name === 'string' ? this.entries.get(name.toLowerCase()) : name;
    if (!e) throw new Error(`pak: missing ${name}`);
    return this.ra.read(e.offset, e.size);
  }

  has(name: string): boolean {
    return this.entries.has(name.toLowerCase());
  }
}

// ---------------------------------------------------------------- SHP
// "TLHS" | u32 0 | u32 type(2) | u32 0 | u32 colorKey | i32 w | i32 h | i32 anchorX | i32 anchorY
// u32 rowOffset[h] ; row := { u16 x, u16 n, u16 rgb565[n] }* u16 0xFFFF
export interface Image {
  w: number;
  h: number;
  ax: number;
  ay: number;
  rgba: Uint8Array;
}

const R5 = new Uint8Array(32).map((_, i) => Math.round((i * 255) / 31));
const G6 = new Uint8Array(64).map((_, i) => Math.round((i * 255) / 63));

export function decodeShp(d: Uint8Array): Image | null {
  if (d.length < 0x24 || latin1(d, 0, 4) !== 'TLHS') return null;
  const type = i32(d, 8);
  if (type === 4) return decodeShp32(d);
  if (type !== 2) return null;
  const w = i32(d, 0x14);
  const h = i32(d, 0x18);
  const ax = i32(d, 0x1c);
  const ay = i32(d, 0x20);
  if (w <= 0 || h <= 0 || w > 8192 || h > 8192) return null;
  const rgba = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    let o = u32(d, 0x24 + y * 4);
    for (;;) {
      if (o + 2 > d.length) break;
      const x0 = u16(d, o);
      o += 2;
      if (x0 === 0xffff) break;
      const n = u16(d, o);
      o += 2;
      let k = (y * w + x0) * 4;
      for (let i = 0; i < n && x0 + i < w; i++, o += 2, k += 4) {
        const v = u16(d, o);
        rgba[k] = R5[v >> 11];
        rgba[k + 1] = G6[(v >> 5) & 63];
        rgba[k + 2] = R5[v & 31];
        rgba[k + 3] = 255;
      }
      if (x0 + n > w) o += (x0 + n - w) * 2;
    }
  }
  return { w, h, ax, ay, rgba };
}

// Type 4 (32-bit, only the map flags): header as type 2 but anchor at 0x1c/0x20,
// row table at 0x50; row := u32 n | u32 dataOffset | u16 x | u16 0xFFFF | u32 ?
// pixel data is BGRA.
function decodeShp32(d: Uint8Array): Image | null {
  const w = i32(d, 0x14);
  const h = i32(d, 0x18);
  if (w <= 0 || h <= 0 || w > 4096 || h > 4096 || 0x50 + h * 4 > d.length) return null;
  const rgba = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const r = u32(d, 0x50 + y * 4);
    if (r + 10 > d.length) continue;
    const n = u32(d, r);
    const off = u32(d, r + 4);
    const x0 = u16(d, r + 8);
    for (let i = 0; i < n && x0 + i < w && off + i * 4 + 4 <= d.length; i++) {
      const s = off + i * 4, k = (y * w + x0 + i) * 4;
      rgba[k] = d[s + 2];
      rgba[k + 1] = d[s + 1];
      rgba[k + 2] = d[s];
      rgba[k + 3] = d[s + 3];
    }
  }
  return { w, h, ax: i32(d, 0x1c), ay: i32(d, 0x20), rgba };
}

/** Crops fully transparent borders, adjusting the anchor. */
export function trim(img: Image): Image & { ox: number; oy: number } {
  const { w, h, rgba } = img;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (rgba[(y * w + x) * 4 + 3]) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  if (x1 < 0) return { w: 1, h: 1, ax: img.ax, ay: img.ay, rgba: new Uint8Array(4), ox: 0, oy: 0 };
  if (x0 === 0 && y0 === 0 && x1 === w - 1 && y1 === h - 1) return { ...img, ox: 0, oy: 0 };
  const nw = x1 - x0 + 1, nh = y1 - y0 + 1;
  const out = new Uint8Array(nw * nh * 4);
  for (let y = 0; y < nh; y++) out.set(rgba.subarray(((y + y0) * w + x0) * 4, ((y + y0) * w + x1 + 1) * 4), y * nw * 4);
  return { w: nw, h: nh, ax: img.ax, ay: img.ay, rgba: out, ox: x0, oy: y0 };
}

// ---------------------------------------------------------------- TGA (uncompressed / RLE true-color)
export function decodeTga(d: Uint8Array): Image | null {
  const idLen = d[0], cmapType = d[1], type = d[2];
  if (cmapType !== 0 || (type !== 2 && type !== 10)) return null;
  const w = u16(d, 12), h = u16(d, 14), bpp = d[16], desc = d[17];
  const bytes = bpp / 8;
  if (bytes !== 2 && bytes !== 3 && bytes !== 4) return null;
  const rgba = new Uint8Array(w * h * 4);
  let o = 18 + idLen;
  const px = (i: number) => {
    const y = Math.floor(i / w), x = i % w;
    const yy = desc & 0x20 ? y : h - 1 - y;
    const k = (yy * w + x) * 4;
    if (bytes === 2) {
      const v = u16(d, o);
      rgba[k] = R5[(v >> 10) & 31]; rgba[k + 1] = R5[(v >> 5) & 31]; rgba[k + 2] = R5[v & 31]; rgba[k + 3] = 255;
    } else {
      rgba[k] = d[o + 2]; rgba[k + 1] = d[o + 1]; rgba[k + 2] = d[o]; rgba[k + 3] = bytes === 4 ? d[o + 3] : 255;
    }
  };
  if (type === 2) {
    for (let i = 0; i < w * h; i++, o += bytes) px(i);
  } else {
    let i = 0;
    while (i < w * h) {
      const c = d[o++];
      const n = (c & 0x7f) + 1;
      if (c & 0x80) {
        const save = o;
        for (let j = 0; j < n; j++, i++) { o = save; px(i); }
        o = save + bytes;
      } else {
        for (let j = 0; j < n; j++, i++, o += bytes) px(i);
      }
    }
  }
  return { w, h, ax: 0, ay: 0, rgba };
}

// ---------------------------------------------------------------- INI
// Repeated sections become array items; repeated keys become arrays.
export type IniSection = { _: string } & Record<string, string | string[]>;

export function parseIni(text: string, conv: (s: string) => string): IniSection[] {
  const out: IniSection[] = [];
  let cur: IniSection | null = null;
  for (let line of text.split(/\r?\n/)) {
    line = line.trim();
    if (!line || line.startsWith(';') || line.startsWith('//') || line.startsWith('#')) continue;
    const sec = /^\[(.+?)\]/.exec(line);
    if (sec) {
      cur = { _: sec[1].trim() } as IniSection;
      out.push(cur);
      continue;
    }
    const eq = line.indexOf('=');
    if (eq < 0 || !cur) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1);
    const sc = val.indexOf(';');
    if (sc >= 0) val = val.slice(0, sc);
    val = conv(val.trim());
    const prev = cur[key];
    if (prev === undefined) cur[key] = val;
    else if (Array.isArray(prev)) prev.push(val);
    else cur[key] = [prev, val];
  }
  return out;
}

export function isOpaque(rgba: Uint8Array) {
  for (let i = 3; i < rgba.length; i += 4) if (rgba[i] !== 255) return false;
  return true;
}
