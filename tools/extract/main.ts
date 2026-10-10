// Asset pipeline: converts an original 三国群英传3 installation into web assets.
//
//   pnpm extract <三国群英传3合集.exe | game dir containing sango3.pak>
//
// Output goes to public/assets (git-ignored; the original assets are never
// redistributed with the source code).
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MaxRectsPacker } from 'maxrects-packer';
import * as OpenCC from 'opencc-js';
import sharp from 'sharp';
import { decodeShp, decodeTga, Pak, parseIni, trim, type Image } from './formats.ts';
import { unpackInstaller } from './installer.ts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const OUT = path.join(ROOT, 'public/assets');
const CACHE = path.join(ROOT, '.cache');

const toCN = OpenCC.Converter({ from: 'tw', to: 'cn' });
const big5 = new TextDecoder('big5');

function log(...a: unknown[]) {
  console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...a);
}

function findGameDir(src: string): string {
  const st = fs.statSync(src);
  if (st.isFile()) {
    const dst = path.join(CACHE, 'installer');
    if (!fs.existsSync(path.join(dst, 'Sango3y/sango3.pak'))) {
      log('unpacking installer (needs `cabextract`)…');
      fs.rmSync(dst, { recursive: true, force: true });
      unpackInstaller(src, dst);
    }
    return path.join(dst, 'Sango3y');
  }
  const cands = [src, path.join(src, 'Sango3y'), path.join(src, 'Sango3')];
  for (const c of cands) if (findCase(c, 'sango3.pak')) return c;
  throw new Error(`no sango3.pak under ${src}`);
}

function findCase(dir: string, name: string): string | null {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return null;
  const f = fs.readdirSync(dir).find((n) => n.toLowerCase() === name.toLowerCase());
  return f ? path.join(dir, f) : null;
}

function writeJson(rel: string, v: unknown) {
  const p = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(v));
}

// ------------------------------------------------------------------ data
function extractData(pak: Pak) {
  const names: string[] = [];
  for (const e of pak.entries.values()) {
    if (!/^setting\/.*\.ini$/i.test(e.name)) continue;
    const base = path.basename(e.name, path.extname(e.name));
    const text = big5.decode(pak.read(e));
    writeJson(`data/${base}.json`, parseIni(text, toCN));
    names.push(base);
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
  writeJson('data/objects.json', objects);
  log(`data: ${names.length} ini files, ${Object.keys(objects).length} objects`);
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

// ------------------------------------------------------------------ shapes
type Frame = [page: number, x: number, y: number, w: number, h: number, ax: number, ay: number];
type Single = [file: string, w: number, h: number, ax: number, ay: number];

const BIG = 300 * 300;

async function extractShapes(pak: Pak) {
  const byDir = new Map<string, { name: string; entry: ReturnType<Pak['read']> extends Buffer ? string : never }[]>();
  const dirs = new Map<string, string[]>();
  for (const e of pak.entries.values()) {
    const m = /^shape\/(.*)\.(shp|tga)$/i.exec(e.name);
    if (!m) continue;
    const rel = m[1].toLowerCase();
    const dir = path.posix.dirname(rel) === '.' ? '' : path.posix.dirname(rel);
    if (!dirs.has(dir)) dirs.set(dir, []);
    dirs.get(dir)!.push(e.name);
  }
  void byDir;
  fs.mkdirSync(path.join(OUT, 'shape'), { recursive: true });
  const index: Record<string, number> = {};
  let done = 0, failed = 0;
  const jobs = [...dirs.entries()];
  const pool = Math.max(2, os.cpus().length - 1);
  let next = 0;
  async function worker() {
    while (next < jobs.length) {
      const [dir, files] = jobs[next++];
      const r = await packDir(pak, dir, files);
      index[dir] = r.count;
      failed += r.failed;
      done++;
      if (done % 50 === 0) log(`shapes: ${done}/${jobs.length} dirs`);
    }
  }
  await Promise.all(Array.from({ length: pool }, worker));
  writeJson('shape/index.json', index);
  log(`shapes: ${jobs.length} dirs, ${failed} undecodable`);
}

function dirKey(dir: string) {
  return dir ? dir.replaceAll('/', '_') : '_root';
}

async function packDir(pak: Pak, dir: string, files: string[]) {
  const key = dirKey(dir);
  const frames: Record<string, Frame> = {};
  const singles: Record<string, Single> = {};
  const small: { name: string; img: Image & { ox: number; oy: number } }[] = [];
  let failed = 0;
  const writes: Promise<unknown>[] = [];
  for (const f of files) {
    const name = path.posix.basename(f).replace(/\.(shp|tga)$/i, '').toLowerCase();
    if (frames[name] || singles[name]) continue;
    const buf = pak.read(f);
    const img = /\.tga$/i.test(f) ? decodeTga(buf) : decodeShp(buf);
    if (!img) {
      failed++;
      continue;
    }
    if (img.w * img.h >= BIG) {
      const file = `${key}__${name}.webp`;
      singles[name] = [file, img.w, img.h, img.ax, img.ay];
      const opaque = isOpaque(img.rgba);
      writes.push(
        sharp(Buffer.from(img.rgba), { raw: { width: img.w, height: img.h, channels: 4 } })
          .webp(opaque ? { quality: 92, effort: 4 } : { quality: 92, alphaQuality: 100, effort: 4 })
          .toFile(path.join(OUT, 'shape', file)),
      );
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
      const file = `${key}_${pi}.webp`;
      pages.push(file);
      writes.push(
        sharp(Buffer.from(px), { raw: { width: W, height: H, channels: 4 } })
          .webp({ lossless: true, effort: 4 })
          .toFile(path.join(OUT, 'shape', file)),
      );
    });
  }
  await Promise.all(writes);
  writeJson(`shape/${key}.json`, { pages, frames, singles });
  return { count: Object.keys(frames).length + Object.keys(singles).length, failed };
}

function isOpaque(rgba: Uint8Array) {
  for (let i = 3; i < rgba.length; i += 4) if (rgba[i] !== 255) return false;
  return true;
}

// ------------------------------------------------------------------ audio
function hasFfmpeg() {
  return spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0;
}

async function extractAudio(pak: Pak, musicPak: Pak | null) {
  const sdir = path.join(OUT, 'sound');
  fs.mkdirSync(sdir, { recursive: true });
  let n = 0;
  for (const e of pak.entries.values()) {
    if (!/^sound\/.*\.wav$/i.test(e.name)) continue;
    const name = path.posix.basename(e.name).toLowerCase().replace(/\s+/g, '');
    fs.writeFileSync(path.join(sdir, name), pak.read(e));
    n++;
  }
  log(`sound: ${n} effects`);
  if (!musicPak) return;
  const mdir = path.join(OUT, 'music');
  fs.mkdirSync(mdir, { recursive: true });
  const ff = hasFfmpeg();
  if (!ff) log('ffmpeg not found: keeping music as WAV (large)');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sg3-'));
  const list = [...musicPak.entries.values()].filter((e) => /\.wav$/i.test(e.name));
  const pool = Math.max(2, os.cpus().length - 2);
  let next = 0;
  async function worker() {
    while (next < list.length) {
      const e = list[next++];
      const base = path.posix.basename(e.name).toLowerCase().replace(/\.wav$/, '');
      if (!ff) {
        fs.writeFileSync(path.join(mdir, base + '.wav'), musicPak!.read(e));
        continue;
      }
      const src = path.join(tmp, base + '.wav');
      fs.writeFileSync(src, musicPak!.read(e));
      await new Promise<void>((res, rej) => {
        const p = execFileAsync('ffmpeg', ['-y', '-loglevel', 'error', '-i', src, '-c:a', 'libmp3lame', '-q:a', '3', path.join(mdir, base + '.mp3')]);
        p.then(() => res(), rej);
      });
      fs.rmSync(src);
    }
  }
  await Promise.all(Array.from({ length: pool }, worker));
  fs.rmSync(tmp, { recursive: true, force: true });
  log(`music: ${list.length} tracks`);
}

function execFileAsync(cmd: string, args: string[]) {
  return new Promise<void>((res, rej) => {
    import('node:child_process').then(({ execFile }) =>
      execFile(cmd, args, (err) => (err ? rej(err) : res())),
    );
  });
}

// ------------------------------------------------------------------ maps
function extractMaps(pak: Pak) {
  const dir = path.join(OUT, 'map');
  fs.mkdirSync(dir, { recursive: true });
  let n = 0;
  for (const e of pak.entries.values()) {
    if (!/^map\/.*\.blk$/i.test(e.name)) continue;
    fs.writeFileSync(path.join(dir, path.posix.basename(e.name).toLowerCase()), pak.read(e));
    n++;
  }
  log(`maps: ${n}`);
}

// ------------------------------------------------------------------ main
async function main() {
  const src = process.argv[2];
  if (!src) {
    console.error('usage: pnpm extract <三国群英传3 installer .exe | game directory>');
    process.exit(1);
  }
  const only = new Set((process.argv[3] ?? 'data,shape,audio,map').split(','));
  const game = findGameDir(path.resolve(src.replace(/^~/, os.homedir())));
  log('game dir:', game);
  const pak = new Pak(findCase(game, 'sango3.pak')!);
  const mp = findCase(game, 'music.pak');
  const musicPak = mp ? new Pak(mp) : null;
  fs.mkdirSync(OUT, { recursive: true });
  if (only.has('data')) extractData(pak);
  if (only.has('map')) extractMaps(pak);
  if (only.has('audio')) await extractAudio(pak, musicPak);
  if (only.has('shape')) await extractShapes(pak);
  writeJson('version.json', { generated: new Date().toISOString() });
  log('done →', OUT);
  void execFileSync;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
