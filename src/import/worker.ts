// Import worker: unpacks the player's own installer and converts the original
// assets in the browser, writing them into Cache Storage where the service
// worker serves them under ./assets/ (same layout as `pnpm extract`).
import { Mp3Encoder } from '@breezystack/lamejs';
import { inflateSync } from 'fflate';
import * as OpenCC from 'opencc-js/t2cn';
import { latin1, u16, u32, type RandomAccess, type Writer } from '../extract/bytes';
import { Pak } from '../extract/formats';
import { unpackInstaller } from '../extract/installer';
import { extractData, extractRaw, packDir, shapeDirs, type Emit, type EncodeImage } from '../extract/pipeline';
import { ASSET_CACHE, type Job, type WorkerMsg } from './protocol';

// Worker-only APIs (the project compiles against the DOM lib).
declare const self: { postMessage(m: unknown): void; onmessage: ((e: MessageEvent<Job>) => void) | null };
declare class FileReaderSync {
  readAsArrayBuffer(b: Blob): ArrayBuffer;
}
interface FileSystemSyncAccessHandle {
  write(b: Uint8Array, o: { at: number }): number;
  truncate(n: number): void;
  flush(): void;
  close(): void;
}
type SyncFileHandle = FileSystemFileHandle & { createSyncAccessHandle(): Promise<FileSystemSyncAccessHandle> };

const post = (m: WorkerMsg) => self.postMessage(m);

function fileRA(f: Blob): RandomAccess {
  const rd = new FileReaderSync();
  return { size: f.size, read: (off, len) => new Uint8Array(rd.readAsArrayBuffer(f.slice(off, off + len))) };
}

const paks = new WeakMap<Blob, Pak>();
function pakOf(f: Blob) {
  let p = paks.get(f);
  if (!p) paks.set(f, (p = new Pak(fileRA(f))));
  return p;
}

let cache: Promise<Cache> | null = null;
function emitter(base: string): Emit {
  cache ??= caches.open(ASSET_CACHE);
  return async (rel, data, type) => {
    const body = data instanceof Blob ? data : new Blob([data as BlobPart], { type });
    const res = new Response(body, { headers: { 'content-type': type, 'content-length': String(body.size) } });
    await (await cache!).put(new Request(base + rel), res);
  };
}

let webp: boolean | null = null;
const encode: EncodeImage = async (rgba, w, h, kind, opaque) => {
  const cv = new OffscreenCanvas(w, h);
  const ctx = cv.getContext('2d')!;
  ctx.putImageData(new ImageData(new Uint8ClampedArray(rgba.buffer as ArrayBuffer, rgba.byteOffset, rgba.byteLength), w, h), 0, 0);
  // atlas pages must stay lossless: PNG. Large images: WebP where the browser can encode it.
  if (kind === 'single' && webp !== false) {
    const b = await cv.convertToBlob({ type: 'image/webp', quality: opaque ? 0.9 : 0.92 });
    webp = b.type === 'image/webp';
    if (webp) return { data: b, ext: 'webp', type: b.type };
  }
  const b = await cv.convertToBlob({ type: 'image/png' });
  return { data: b, ext: 'png', type: 'image/png' };
};

/** 16-bit PCM WAV → MP3 (128 kbps) with lamejs. */
function wavToMp3(wav: Uint8Array): Blob {
  if (latin1(wav, 0, 4) !== 'RIFF') throw new Error('bad WAV');
  let p = 12, ch = 2, rate = 44100, bits = 16, data: Uint8Array | null = null;
  while (p + 8 <= wav.length) {
    const id = latin1(wav, p, p + 4), n = u32(wav, p + 4);
    if (id === 'fmt ') {
      ch = u16(wav, p + 10);
      rate = u32(wav, p + 12);
      bits = u16(wav, p + 22);
    } else if (id === 'data') data = wav.subarray(p + 8, Math.min(wav.length, p + 8 + n));
    p += 8 + n + (n & 1);
  }
  if (!data || bits !== 16) throw new Error('unsupported WAV');
  const pcm = new Int16Array(data.buffer.slice(data.byteOffset, data.byteOffset + (data.byteLength & ~1)));
  const enc = new Mp3Encoder(ch, rate, 128);
  const out: BlobPart[] = [];
  const frames = pcm.length / ch;
  const STEP = 1152 * 32;
  const l = new Int16Array(STEP), r = new Int16Array(STEP);
  for (let i = 0; i < frames; i += STEP) {
    const n = Math.min(STEP, frames - i);
    for (let k = 0; k < n; k++) {
      l[k] = pcm[(i + k) * ch];
      r[k] = pcm[(i + k) * ch + ch - 1];
    }
    const b = ch === 2 ? enc.encodeBuffer(l.subarray(0, n), r.subarray(0, n)) : enc.encodeBuffer(l.subarray(0, n));
    if (b.length) out.push(b.slice());
  }
  out.push(enc.flush().slice());
  return new Blob(out, { type: 'audio/mpeg' });
}

/** Unpacks Sango3y/sango3.pak and music.pak from the installer into OPFS (or memory). */
async function unpack(exe: File) {
  const want = (rel: string) => /^Sango3y\/(sango3|music)\.pak$/i.test(rel);
  const writers = new Map<string, () => Writer>();
  const results: Record<string, () => Promise<File>> = {};
  let opfs: FileSystemDirectoryHandle | null = null;
  try {
    opfs = await navigator.storage.getDirectory();
  } catch {
    /* no OPFS: keep in memory */
  }
  for (const name of ['sango3.pak', 'music.pak']) {
    let handle: FileSystemSyncAccessHandle | null = null;
    let fh: FileSystemFileHandle | null = null;
    if (opfs) {
      try {
        fh = await opfs.getFileHandle(name, { create: true });
        handle = await (fh as SyncFileHandle).createSyncAccessHandle();
        handle.truncate(0);
      } catch {
        handle = null;
      }
    }
    if (handle && fh) {
      const h = handle, f = fh;
      let at = 0;
      writers.set(name, () => ({ write: (c) => void (at += h.write(c, { at })), close: () => (h.flush(), h.close()) }));
      results[name] = () => f.getFile();
    } else {
      handle?.close();
      const parts: BlobPart[] = [];
      writers.set(name, () => ({ write: (c) => void parts.push(c.slice()), close() {} }));
      results[name] = async () => new File(parts, name);
    }
  }
  const got = unpackInstaller(fileRA(exe), {
    want,
    open: (rel) => writers.get(rel.slice(rel.lastIndexOf('/') + 1).toLowerCase())!(),
    inflateRaw: (data, dict) => inflateSync(data, dict ? { dictionary: dict } : undefined),
    progress: (phase, done, total) => post({ type: 'progress', phase, done, total }),
  });
  if (!got.some((g) => /sango3\.pak$/i.test(g))) throw new Error('安装包里没有找到 Sango3y/sango3.pak（需要原版《三国群英传3》）');
  const hasMusic = got.some((g) => /music\.pak$/i.test(g));
  return { sango: await results['sango3.pak'](), music: hasMusic ? await results['music.pak']() : null };
}

async function run(job: Job) {
  const emit = emitter(job.base);
  switch (job.kind) {
    case 'unpack':
      return unpack(job.exe);
    case 'plan': {
      const dirs = [...shapeDirs(pakOf(job.sango))].map(([dir, files]) => ({ dir, files }));
      const tracks = job.music
        ? [...pakOf(job.music).entries.values()].filter((e) => /\.wav$/i.test(e.name)).map((e) => e.name)
        : [];
      return { dirs, tracks };
    }
    case 'data': {
      const pak = pakOf(job.sango);
      await extractData(pak, OpenCC.Converter({ from: 'tw', to: 'cn' }), emit);
      await extractRaw(pak, emit);
      return null;
    }
    case 'shapes': {
      const pak = pakOf(job.sango);
      for (const d of job.dirs) await packDir(pak, d.dir, d.files, encode, emit);
      return null;
    }
    case 'music': {
      const name = job.track.slice(job.track.lastIndexOf('/') + 1).toLowerCase().replace(/\.wav$/, '');
      await emit(`music/${name}.mp3`, wavToMp3(pakOf(job.music).read(job.track)), 'audio/mpeg');
      return null;
    }
  }
}

self.onmessage = async (e: MessageEvent<Job>) => {
  try {
    post({ type: 'done', result: await run(e.data) });
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
