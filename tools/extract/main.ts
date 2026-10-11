// Asset pipeline: converts an original 三国群英传3 installation into web assets.
//
//   pnpm extract <三国群英传3合集.exe | game dir containing sango3.pak> [data,shape,audio,map] [dir-prefix]
//
// Output goes to public/assets-orig (git-ignored; the original assets are never
// redistributed with the source code). The same conversion runs in the browser
// (src/import) for players who bring their own installer.
import { execFile, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import * as OpenCC from 'opencc-js';
import sharp from 'sharp';
import type { RandomAccess } from '../../src/extract/bytes.ts';
import { Pak } from '../../src/extract/formats.ts';
import { unpackInstaller } from '../../src/extract/installer.ts';
import { ASSET_FORMAT, extractData, extractRaw, musicTracks, packDir, shapeDirs, type Emit, type EncodeImage } from '../../src/extract/pipeline.ts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const OUT = process.env.SG3_OUT ? path.resolve(process.env.SG3_OUT) : path.join(ROOT, 'public/assets-orig');
const CACHE = path.join(ROOT, '.cache');

function log(...a: unknown[]) {
  console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...a);
}

function fileRA(file: string): RandomAccess {
  const fd = fs.openSync(file, 'r');
  return {
    size: fs.fstatSync(fd).size,
    read(off, len) {
      const b = Buffer.alloc(len);
      fs.readSync(fd, b, 0, len, off);
      return b;
    },
  };
}

function findGameDir(src: string): string {
  const st = fs.statSync(src);
  if (st.isFile()) {
    const dst = path.join(CACHE, 'installer');
    if (!fs.existsSync(path.join(dst, 'Sango3y/sango3.pak'))) {
      log('unpacking installer…');
      fs.rmSync(dst, { recursive: true, force: true });
      unpackInstaller(fileRA(src), {
        want: (rel) => /^Sango3y\/(sango3|music)\.pak$/i.test(rel),
        open(rel) {
          const p = path.join(dst, rel);
          fs.mkdirSync(path.dirname(p), { recursive: true });
          const fd = fs.openSync(p, 'w');
          return { write: (c) => void fs.writeSync(fd, c), close: () => fs.closeSync(fd) };
        },
        inflateRaw: (data, dict) => zlib.inflateRawSync(data, dict ? { dictionary: dict } : {}),
      });
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

const emit: Emit = async (rel, data) => {
  const p = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, data instanceof Blob ? Buffer.from(await data.arrayBuffer()) : data);
};

const encode: EncodeImage = async (rgba, w, h, kind, opaque) => {
  const img = sharp(Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength), { raw: { width: w, height: h, channels: 4 } });
  const opts =
    kind === 'page' ? { lossless: true, effort: 4 } : opaque ? { quality: 92, effort: 4 } : { quality: 92, alphaQuality: 100, effort: 4 };
  return { data: await img.webp(opts).toBuffer(), ext: 'webp', type: 'image/webp' };
};

async function extractShapes(pak: Pak, only?: string) {
  const jobs = [...shapeDirs(pak)].filter(([dir]) => !only || dir.startsWith(only));
  let done = 0, failed = 0, next = 0;
  async function worker() {
    while (next < jobs.length) {
      const [dir, files] = jobs[next++];
      failed += (await packDir(pak, dir, files, encode, emit)).failed;
      if (++done % 50 === 0) log(`shapes: ${done}/${jobs.length} dirs`);
    }
  }
  await Promise.all(Array.from({ length: Math.max(2, os.cpus().length - 1) }, worker));
  log(`shapes: ${jobs.length} dirs, ${failed} undecodable`);
}

async function extractMusic(musicPak: Pak) {
  const ff = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0;
  if (!ff) log('ffmpeg not found: keeping music as WAV (large; the game expects .mp3)');
  const mdir = path.join(OUT, 'music');
  fs.mkdirSync(mdir, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sg3-'));
  const list = musicTracks(musicPak);
  let next = 0;
  async function worker() {
    while (next < list.length) {
      const [base, entry] = list[next++];
      if (!ff) {
        fs.writeFileSync(path.join(mdir, base + '.wav'), musicPak.read(entry));
        continue;
      }
      const src = path.join(tmp, base + '.wav');
      fs.writeFileSync(src, musicPak.read(entry));
      await new Promise<void>((res, rej) =>
        execFile('ffmpeg', ['-y', '-loglevel', 'error', '-i', src, '-c:a', 'libmp3lame', '-q:a', '3', path.join(mdir, base + '.mp3')], (e) =>
          e ? rej(e) : res(),
        ),
      );
      fs.rmSync(src);
    }
  }
  await Promise.all(Array.from({ length: Math.max(2, os.cpus().length - 2) }, worker));
  fs.rmSync(tmp, { recursive: true, force: true });
  log(`music: ${list.length} tracks`);
}

async function main() {
  const src = process.argv[2];
  if (!src) {
    console.error('usage: pnpm extract <三国群英传3 installer .exe | game directory>');
    process.exit(1);
  }
  const only = new Set((process.argv[3] ?? 'data,shape,audio,map').split(','));
  const game = findGameDir(path.resolve(src.replace(/^~/, os.homedir())));
  log('game dir:', game);
  const pak = new Pak(fileRA(findCase(game, 'sango3.pak')!));
  const mp = findCase(game, 'music.pak');
  fs.mkdirSync(OUT, { recursive: true });
  if (only.has('data')) log('data:', await extractData(pak, OpenCC.Converter({ from: 'tw', to: 'cn' }), emit));
  if (only.has('audio') || only.has('map')) log('raw:', await extractRaw(pak, emit));
  if (only.has('audio') && mp) await extractMusic(new Pak(fileRA(mp)));
  if (only.has('shape')) await extractShapes(pak, process.argv[4]?.toLowerCase());
  await emit('version.json', JSON.stringify({ format: ASSET_FORMAT, generated: new Date().toISOString() }), 'application/json');
  log('done →', OUT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
