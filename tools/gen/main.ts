// Generates the complete, original asset set (art, data, maps, audio) into
// public/assets — no original game files involved. Painters/data/audio/maps
// modules are auto-discovered from the sub-folders (see types.ts).
//
//   pnpm gen                      everything
//   pnpm gen shapes=portrait,bf/  only shape dirs starting with these prefixes
//   pnpm gen data maps            only these parts (shapes | data | maps | audio)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Mp3Encoder } from '@breezystack/lamejs';
import sharp from 'sharp';
import { ASSET_FORMAT, packImages, type EncodeImage, type NamedImage } from '../../src/extract/pipeline.ts';
import type { AudioModule, Box, DataModule, FrameJob, FrameUse, IniSection, MapModule, PaintModule, PaintOut, Painter } from './types.ts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const OUT = process.env.SG3_GEN_OUT ? path.resolve(process.env.SG3_GEN_OUT) : path.join(ROOT, 'public/assets');
const SPEC = path.join(import.meta.dirname, 'spec');

const t0 = Date.now();
const log = (...a: unknown[]) => console.log(`[gen ${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);

function write(rel: string, data: Uint8Array | string) {
  const p = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, data);
}

async function discover<T>(sub: string): Promise<{ file: string; mod: T }[]> {
  const dir = path.join(import.meta.dirname, sub);
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir).filter((f) => /\.tsx?$/.test(f) && !f.startsWith('_') && !f.endsWith('.d.ts')).sort();
  return Promise.all(files.map(async (f) => ({ file: f, mod: (await import(pathToFileURL(path.join(dir, f)).href)) as T })));
}

// ------------------------------------------------------------------ shapes
type ShapeSpec = Record<string, { frames: Record<string, Box>; singles: Record<string, Box> }>;
type ObjSpec = Record<string, { dir: string; flags: string[]; sprites: Record<string, { frames: [string, number, string?][]; loop: boolean }> }>;

export function loadSpec() {
  const shapes = JSON.parse(fs.readFileSync(path.join(SPEC, 'shapes.json'), 'utf8')) as ShapeSpec;
  const objects = JSON.parse(fs.readFileSync(path.join(SPEC, 'objects.json'), 'utf8')) as ObjSpec;
  return { shapes, objects };
}

export const keyDir = (key: string) => (key === '_root' ? '' : key.replaceAll('_', '/'));

/** All frame jobs per shape directory, with animation usage attached. */
export function frameJobs(): Map<string, FrameJob[]> {
  const { shapes, objects } = loadSpec();
  const uses = new Map<string, FrameUse[]>();
  for (const [obj, o] of Object.entries(objects)) {
    for (const [anim, s] of Object.entries(o.sprites)) {
      s.frames.forEach(([f, , ev], i) => {
        const k = `${o.dir}|${f}`;
        if (!uses.has(k)) uses.set(k, []);
        uses.get(k)!.push({ obj, anim, i, n: s.frames.length, ...(ev ? { ev } : {}) });
      });
    }
  }
  const out = new Map<string, FrameJob[]>();
  for (const [key, s] of Object.entries(shapes)) {
    const dir = keyDir(key);
    const jobs: FrameJob[] = [];
    for (const [name, box] of Object.entries(s.frames)) jobs.push({ dir, name, box, single: false, uses: uses.get(`${dir}|${name}`) ?? [] });
    for (const [name, box] of Object.entries(s.singles)) jobs.push({ dir, name, box, single: true, uses: uses.get(`${dir}|${name}`) ?? [] });
    out.set(dir, jobs);
  }
  return out;
}

export async function loadPainters(): Promise<Painter[]> {
  const mods = await discover<PaintModule>('paint');
  const ps: Painter[] = [];
  for (const { mod } of mods) ps.push(...(mod.painters ?? []), ...(mod.painter ? [mod.painter] : []));
  return ps;
}

/** Placeholder for directories no painter owns yet: a soft ink blot in the frame box. */
const placeholder: Painter = {
  id: 'placeholder',
  match: () => true,
  paint: ({ box: [w, h, ax, ay] }) => {
    const W = Math.max(1, w), H = Math.max(1, h);
    return {
      svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><ellipse cx="${W / 2}" cy="${H / 2}" rx="${W * 0.42}" ry="${H * 0.42}" fill="#3b342b" opacity="0.35"/></svg>`,
      w: W, h: H, ax, ay,
    };
  },
};

export async function rasterize(o: PaintOut): Promise<NamedImage['img']> {
  if ('rgba' in o) return { w: o.w, h: o.h, ax: o.ax, ay: o.ay, rgba: o.rgba };
  const { data, info } = await sharp(Buffer.from(o.svg), { density: 72 })
    .resize(o.w, o.h, { fit: 'fill' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { w: info.width, h: info.height, ax: o.ax, ay: o.ay, rgba: new Uint8Array(data.buffer, data.byteOffset, data.byteLength) };
}

const encode: EncodeImage = async (rgba, w, h, kind, opaque) => {
  const img = sharp(Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength), { raw: { width: w, height: h, channels: 4 } });
  const opts = kind === 'page' ? { lossless: true, effort: 4 } : opaque ? { quality: 88, effort: 5 } : { quality: 88, alphaQuality: 100, effort: 5 };
  return { data: await img.webp(opts).toBuffer(), ext: 'webp', type: 'image/webp' };
};

async function pool<T>(items: T[], n: number, fn: (t: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) await fn(items[i++]);
  }));
}

async function genShapes(prefixes: string[] | null) {
  const painters = await loadPainters();
  const all = frameJobs();
  const dirs = [...all.keys()].filter((d) => !prefixes || prefixes.some((p) => d === p || d.startsWith(p)));
  const stats = new Map<string, number>();
  let done = 0;
  await pool(dirs, Math.max(2, os.cpus().length), async (dir) => {
    const p = painters.find((x) => x.match(dir)) ?? placeholder;
    const jobs = all.get(dir)!;
    await p.prepare?.(dir, jobs);
    const images: NamedImage[] = [];
    await pool(jobs, 8, async (j) => {
      try {
        images.push({ name: j.name, img: await rasterize(await p.paint(j)) });
      } catch (e) {
        console.error(`[${p.id}] ${dir}/${j.name}:`, e instanceof Error ? e.message : e);
        images.push({ name: j.name, img: await rasterize(await placeholder.paint(j)) });
      }
    });
    images.sort((a, b) => (a.name < b.name ? -1 : 1));
    await packImages(dir, images, encode, (rel, data) => write(rel, typeof data === 'string' ? data : (data as Uint8Array)));
    stats.set(p.id, (stats.get(p.id) ?? 0) + jobs.length);
    if (++done % 25 === 0) log(`shapes ${done}/${dirs.length}`);
  });
  log('shapes by painter:', Object.fromEntries(stats));
}

// ------------------------------------------------------------------ data
async function genData() {
  const { objects } = loadSpec();
  // animation definitions: the structure of the original object table (no names)
  const objs: Record<string, unknown> = {};
  for (const [id, o] of Object.entries(objects)) {
    const sprites: Record<string, unknown> = {};
    for (const [a, s] of Object.entries(o.sprites))
      sprites[a] = { frames: s.frames.map(([f, d, ev]) => (ev ? { f, d, ev } : { f, d })), loop: s.loop };
    objs[id] = { name: '', dir: o.dir, flags: o.flags, sprites };
  }
  write('data/objects.json', JSON.stringify(objs));
  const files: Record<string, IniSection[]> = {};
  for (const { file, mod } of await discover<DataModule>('data')) {
    if (typeof mod.files !== 'function') continue;
    for (const [k, v] of Object.entries(await mod.files())) {
      // several modules may contribute sections to one file (e.g. Game.json)
      files[k] = [...(files[k] ?? []), ...v];
      void file;
    }
  }
  for (const [k, v] of Object.entries(files)) write(`data/${k}.json`, JSON.stringify(v));
  log(`data: ${Object.keys(files).length} files`);
}

// ------------------------------------------------------------------ maps
async function genMaps() {
  let n = 0;
  for (const { mod } of await discover<MapModule>('maps')) {
    if (typeof mod.maps !== 'function') continue;
    for (const [k, v] of Object.entries(await mod.maps())) {
      write(`map/${k}`, v);
      n++;
    }
  }
  log(`maps: ${n}`);
}

// ------------------------------------------------------------------ audio
export function wav(rate: number, chans: Float32Array[]): Uint8Array {
  const n = chans[0].length, ch = chans.length;
  const b = new DataView(new ArrayBuffer(44 + n * ch * 2));
  const s = (o: number, t: string) => [...t].forEach((c, i) => b.setUint8(o + i, c.charCodeAt(0)));
  s(0, 'RIFF'); b.setUint32(4, 36 + n * ch * 2, true); s(8, 'WAVE'); s(12, 'fmt ');
  b.setUint32(16, 16, true); b.setUint16(20, 1, true); b.setUint16(22, ch, true); b.setUint32(24, rate, true);
  b.setUint32(28, rate * ch * 2, true); b.setUint16(32, ch * 2, true); b.setUint16(34, 16, true); s(36, 'data'); b.setUint32(40, n * ch * 2, true);
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) b.setInt16(44 + (i * ch + c) * 2, Math.max(-1, Math.min(1, chans[c][i])) * 32767, true);
  return new Uint8Array(b.buffer);
}

function mp3(rate: number, left: Float32Array, right: Float32Array, kbps = 128): Uint8Array {
  const enc = new Mp3Encoder(2, rate, kbps);
  const toI16 = (f: Float32Array) => Int16Array.from(f, (v) => Math.max(-1, Math.min(1, v)) * 32767);
  const L = toI16(left), R = toI16(right);
  const parts: Uint8Array[] = [];
  for (let i = 0; i < L.length; i += 1152 * 32) parts.push(enc.encodeBuffer(L.subarray(i, i + 1152 * 32), R.subarray(i, i + 1152 * 32)).slice());
  parts.push(enc.flush().slice());
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of parts) (out.set(p, o), (o += p.length));
  return out;
}

async function genAudio(only: string[] | null) {
  const want = JSON.parse(fs.readFileSync(path.join(SPEC, 'audio.json'), 'utf8')) as { sound: string[]; music: string[] };
  const mods = (await discover<AudioModule>('audio')).map((m) => m.mod);
  let ns = 0, nm = 0;
  for (const name of want.sound) {
    if (only && !only.some((p) => name.startsWith(p))) continue;
    const m = mods.find((x) => x.sounds?.includes(name) && x.sound);
    const r = m?.sound!(name);
    if (r) (write(`sound/${name}.wav`, wav(r.rate, [r.data])), ns++);
  }
  await pool(want.music.filter((n) => !only || only.some((p) => n.startsWith(p))), Math.max(2, os.cpus().length - 1), async (name) => {
    const m = mods.find((x) => x.music?.includes(name) && x.track);
    const r = m?.track!(name);
    if (r) (write(`music/${name}.mp3`, mp3(r.rate, r.left, r.right)), nm++);
  });
  log(`audio: ${ns}/${want.sound.length} sounds, ${nm}/${want.music.length} tracks`);
}

// ------------------------------------------------------------------ main
async function main() {
  const args = process.argv.slice(2);
  const parts = new Set(args.filter((a) => !a.includes('=')));
  const opt = (k: string) => args.find((a) => a.startsWith(k + '='))?.slice(k.length + 1).split(',').filter(Boolean) ?? null;
  const all = parts.size === 0;
  if (all || parts.has('data')) await genData();
  if (all || parts.has('maps')) await genMaps();
  if (all || parts.has('shapes') || opt('shapes')) await genShapes(opt('shapes'));
  if (all || parts.has('audio') || opt('audio')) await genAudio(opt('audio'));
  write('version.json', JSON.stringify({ format: ASSET_FORMAT, generated: true }));
  log('done →', path.relative(ROOT, OUT));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
