// Conversion of the original game data into web assets (public/assets layout).
// Platform-neutral: the Node CLI (tools/extract) and the in-browser importer
// (src/import) supply their own output sink and image/audio encoders.
import { MaxRectsPacker } from 'maxrects-packer';
import { decodeShp, decodeTga, isOpaque, parseIni, trim, type Image, type Pak } from './formats';

/** Writes one asset; `rel` is relative to the assets root, e.g. "data/general.json". */
export type Emit = (rel: string, data: Uint8Array | string | Blob, type: string) => void | Promise<void>;

/** Encodes RGBA pixels; `page` = atlas page (must be lossless), else a large standalone image. */
export type EncodeImage = (
  rgba: Uint8Array,
  w: number,
  h: number,
  kind: 'page' | 'single',
  opaque: boolean,
) => Promise<{ data: Uint8Array | Blob; ext: string; type: string }>;

const basename = (p: string) => p.slice(p.lastIndexOf('/') + 1);
const stripExt = (p: string) => p.replace(/\.[^./]*$/, '');

/** Bumped when the asset layout changes; the runtime re-imports on mismatch. */
export const ASSET_FORMAT = 1;

// ------------------------------------------------------------------ data
export async function extractData(pak: Pak, toCN: (s: string) => string, emit: Emit) {
  const big5 = new TextDecoder('big5');
  const json = (rel: string, v: unknown) => emit(rel, JSON.stringify(v), 'application/json');
  let n = 0;
  for (const e of pak.entries.values()) {
    if (!/^setting\/.*\.ini$/i.test(e.name)) continue;
    await json(`data/${stripExt(basename(e.name))}.json`, parseIni(big5.decode(pak.read(e)), toCN));
    n++;
  }
  // Things.obd: sprite/animation definitions keyed by object sequence id.
  const obd = parseIni(big5.decode(pak.read('Setting/Things.obd')), toCN);
  const objects: Record<string, unknown> = {};
  for (const s of obd) {
    if (s._.toLowerCase() !== 'object') continue;
    const get = (k: string) => {
      const key = Object.keys(s).find((x) => x.toLowerCase() === k);
      return key ? s[key] : undefined;
    };
    const seq = String(get('sequence') ?? '');
    if (!seq) continue;
    const dir = String(get('directory') ?? '').replaceAll('\\', '/').replace(/^\//, '').toLowerCase();
    const flags = String(get('flags') ?? '').split(',').map((x) => x.trim()).filter((x) => x && x !== '0');
    const sprites: Record<string, Anim> = {};
    const raw = get('sprite');
    for (const line of Array.isArray(raw) ? raw : raw ? [raw] : []) {
      const toks = line.split(',').map((t) => t.trim()).filter(Boolean);
      const name = toks.shift();
      if (name) sprites[name.toLowerCase()] = parseAnim(toks);
    }
    objects[seq] = { name: String(get('name') ?? ''), dir, flags, sprites };
  }
  await json('data/objects.json', objects);
  return { ini: n, objects: Object.keys(objects).length };
}

interface Anim {
  frames: { f: string; d: number; ev?: string }[];
  loop: boolean;
}

// "f1,#3,f2,f3,@SP_EVENT_ATTACK,f4,SCROVER": `#n` sets the delay (in ticks) of the
// previous frame and all frames that follow; `@EV` fires when the next frame shows;
// SCROVER marks a one-shot animation; a trailing `#9999` holds the last frame.
function parseAnim(toks: string[]): Anim {
  const frames: Anim['frames'] = [];
  let delay = 4;
  let loop = true;
  let pendingEv: string | undefined;
  for (const t of toks) {
    if (t.startsWith('#')) {
      delay = parseInt(t.slice(1), 10) || 1;
      if (frames.length) frames[frames.length - 1].d = delay;
      if (delay >= 9999) loop = false;
    } else if (t.startsWith('@')) {
      pendingEv = t.slice(1).replace(/^SP_EVENT_/, '').toLowerCase();
      if (frames.length && delay >= 9999) frames[frames.length - 1].ev = pendingEv;
    } else if (t.toUpperCase() === 'SCROVER') {
      loop = false;
    } else {
      const fr: Anim['frames'][number] = { f: t.toLowerCase(), d: delay };
      if (pendingEv) {
        fr.ev = pendingEv;
        pendingEv = undefined;
      }
      frames.push(fr);
    }
  }
  if (pendingEv && frames.length) frames[frames.length - 1].ev = pendingEv;
  return { frames, loop };
}

// ------------------------------------------------------------------ raw copies
/** Sound effects (WAV) and field maps (.blk) are copied unchanged. */
export async function extractRaw(pak: Pak, emit: Emit) {
  let sound = 0, maps = 0;
  for (const e of pak.entries.values()) {
    if (/^sound\/.*\.wav$/i.test(e.name)) {
      await emit(`sound/${basename(e.name).toLowerCase().replace(/\s+/g, '')}`, pak.read(e), 'audio/wav');
      sound++;
    } else if (/^map\/.*\.blk$/i.test(e.name)) {
      await emit(`map/${basename(e.name).toLowerCase()}`, pak.read(e), 'application/octet-stream');
      maps++;
    }
  }
  return { sound, maps };
}

/** Music tracks in music.pak: [output base name, pak entry name]. */
export function musicTracks(musicPak: Pak): [string, string][] {
  return [...musicPak.entries.values()]
    .filter((e) => /\.wav$/i.test(e.name))
    .map((e) => [basename(e.name).toLowerCase().replace(/\.wav$/, ''), e.name]);
}

// ------------------------------------------------------------------ shapes
type Frame = [page: number, x: number, y: number, w: number, h: number, ax: number, ay: number];
type Single = [file: string, w: number, h: number, ax: number, ay: number];

const BIG = 300 * 300;

/** Shape directories (e.g. "bf/general/001") and their files, in pak order. */
export function shapeDirs(pak: Pak): Map<string, string[]> {
  const dirs = new Map<string, string[]>();
  for (const e of pak.entries.values()) {
    const m = /^shape\/(.*)\.(shp|tga)$/i.exec(e.name);
    if (!m) continue;
    const rel = m[1].toLowerCase();
    const i = rel.lastIndexOf('/');
    const dir = i < 0 ? '' : rel.slice(0, i);
    if (!dirs.has(dir)) dirs.set(dir, []);
    dirs.get(dir)!.push(e.name);
  }
  return dirs;
}

export function dirKey(dir: string) {
  return dir ? dir.replaceAll('/', '_') : '_root';
}

/** One frame to pack: standalone image if large, else trimmed into an atlas page. */
export interface NamedImage {
  name: string;
  img: Image;
}

/**
 * Converts one shape directory: small frames are trimmed and packed into
 * atlas pages, large ones become standalone images. Writes the images and
 * `shape/<key>.json`.
 */
export async function packDir(pak: Pak, dir: string, files: string[], encode: EncodeImage, emit: Emit) {
  const images: NamedImage[] = [];
  const seen = new Set<string>();
  let failed = 0;
  for (const f of files) {
    const name = stripExt(basename(f)).toLowerCase();
    if (seen.has(name)) continue;
    seen.add(name);
    const buf = pak.read(f);
    const img = /\.tga$/i.test(f) ? decodeTga(buf) : decodeShp(buf);
    if (img) images.push({ name, img });
    else failed++;
  }
  return { ...(await packImages(dir, images, encode, emit)), failed };
}

export async function packImages(dir: string, images: NamedImage[], encode: EncodeImage, emit: Emit) {
  const key = dirKey(dir);
  const frames: Record<string, Frame> = {};
  const singles: Record<string, Single> = {};
  const small: { name: string; img: Image & { ox: number; oy: number } }[] = [];
  const writes: Promise<unknown>[] = [];
  const put = (name: string, p: ReturnType<EncodeImage>) =>
    writes.push(p.then((r) => emit(`shape/${name}.${r.ext}`, r.data, r.type)).then(() => undefined));
  const ext: Record<string, string> = {};
  for (const { name, img } of images) {
    if (img.w * img.h >= BIG) {
      const base = `${key}__${name}`;
      const p = encode(img.rgba, img.w, img.h, 'single', isOpaque(img.rgba));
      singles[name] = [base, img.w, img.h, img.ax, img.ay];
      writes.push(p.then((r) => (ext[base] = r.ext)));
      put(base, p);
    } else {
      small.push({ name, img: trim(img) });
    }
  }
  const pages: string[] = [];
  if (small.length) {
    const packer = new MaxRectsPacker<{ width: number; height: number; x: number; y: number; data: (typeof small)[number] }>(
      2048, 2048, 2, { smart: true, pot: false, square: false, allowRotation: false },
    );
    for (const s of small) packer.add(s.img.w, s.img.h, s);
    packer.bins.forEach((bin, pi) => {
      const W = bin.width, H = bin.height;
      const px = new Uint8Array(W * H * 4);
      for (const r of bin.rects) {
        const { img, name } = r.data;
        for (let y = 0; y < img.h; y++) px.set(img.rgba.subarray(y * img.w * 4, (y + 1) * img.w * 4), ((r.y + y) * W + r.x) * 4);
        // anchor relative to the trimmed frame's top-left
        frames[name] = [pi, r.x, r.y, img.w, img.h, img.ax - img.ox, img.ay - img.oy];
      }
      const base = `${key}_${pi}`;
      const p = encode(px, W, H, 'page', false);
      pages.push(base);
      writes.push(p.then((r) => (ext[base] = r.ext)));
      put(base, p);
    });
  }
  await Promise.all(writes);
  // file names carry the encoder's extension (webp, or png where WebP encoding is unavailable)
  for (let i = 0; i < pages.length; i++) pages[i] += '.' + ext[pages[i]];
  for (const s of Object.values(singles)) s[0] += '.' + ext[s[0]];
  await emit(`shape/${key}.json`, JSON.stringify({ pages, frames, singles }), 'application/json');
  return { count: Object.keys(frames).length + Object.keys(singles).length };
}
