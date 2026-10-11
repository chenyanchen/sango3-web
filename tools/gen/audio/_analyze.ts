// Listen-free checks for the generated audio: render tracks/sounds, print
// timing, peak/RMS, limiter headroom and loop-seam continuity, and write
// spectrogram PNGs.
//
//   npx tsx tools/gen/audio/_analyze.ts music bf001 mainmenu  [--png outdir]
//   npx tsx tools/gen/audio/_analyze.ts sound hit01 arrow ... [--png outdir]
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { music, track } from './music.ts';

const args = process.argv.slice(2);
const kind = args[0];
const pi = args.indexOf('--png');
const png = pi >= 0 ? args[pi + 1] : null;
const names = args.slice(1).filter((a, i) => a !== '--png' && args[i] !== '--png');

const dB = (x: number) => (20 * Math.log10(Math.max(1e-9, x))).toFixed(1);

async function spectro(file: string, data: Float32Array, rate: number, cols = 900, rows = 256) {
  const N = 1024;
  const img = new Uint8Array(cols * rows * 3);
  const hop = Math.max(1, Math.floor((data.length - N) / cols));
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let c = 0; c < cols; c++) {
    const o = c * hop;
    for (let i = 0; i < N; i++) {
      re[i] = (data[o + i] ?? 0) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
      im[i] = 0;
    }
    fft(re, im);
    for (let r = 0; r < rows; r++) {
      // log frequency axis 40 Hz .. rate/2
      const f = 40 * Math.pow(rate / 2 / 40, r / (rows - 1));
      const bin = Math.min(N / 2 - 1, Math.round((f * N) / rate));
      const m = Math.hypot(re[bin], im[bin]);
      const v = Math.max(0, Math.min(1, (20 * Math.log10(m + 1e-9) - 48 + 80) / 75));
      const p = ((rows - 1 - r) * cols + c) * 3;
      img[p] = Math.round(255 * Math.min(1, v * 1.6));
      img[p + 1] = Math.round(255 * Math.max(0, v * 1.6 - 0.6));
      img[p + 2] = Math.round(255 * Math.min(1, v * 0.6 + (v > 0.8 ? v : 0)));
    }
  }
  await sharp(Buffer.from(img), { raw: { width: cols, height: rows, channels: 3 } }).png().toFile(file);
}

function fft(re: Float64Array, im: Float64Array) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const a = (-2 * Math.PI) / len, wr = Math.cos(a), wi = Math.sin(a);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let j = 0; j < len / 2; j++) {
        const ur = re[i + j], ui = im[i + j];
        const vr = re[i + j + len / 2] * cr - im[i + j + len / 2] * ci;
        const vi = re[i + j + len / 2] * ci + im[i + j + len / 2] * cr;
        re[i + j] = ur + vr; im[i + j] = ui + vi;
        re[i + j + len / 2] = ur - vr; im[i + j + len / 2] = ui - vi;
        const t = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = t;
      }
    }
  }
}

/** energy share per band (dB rel. total) via one-pole splits */
function bands(d: Float32Array, rate: number) {
  const edges = [150, 600, 2500, 6000];
  const ks = edges.map((f) => 1 - Math.exp((-2 * Math.PI * f) / rate));
  const ys = edges.map(() => 0);
  const e = [0, 0, 0, 0, 0];
  for (let i = 0; i < d.length; i++) {
    let prev = 0;
    for (let k = 0; k < edges.length; k++) {
      ys[k] += ks[k] * (d[i] - ys[k]);
      const band = ys[k] - prev;
      e[k] += band * band;
      prev = ys[k];
    }
    const hi = d[i] - prev;
    e[4] += hi * hi;
  }
  const tot = e.reduce((a, b) => a + b, 0);
  return ['<150', '150-600', '600-2.5k', '2.5-6k', '>6k'].map((n, i) => `${n}:${(10 * Math.log10(e[i] / tot)).toFixed(1)}`).join(' ');
}

function stats(d: Float32Array) {
  let p = 0, s = 0, clip = 0;
  for (let i = 0; i < d.length; i++) {
    const a = Math.abs(d[i]);
    if (a > p) p = a;
    if (a > 0.999) clip++;
    s += d[i] * d[i];
  }
  return { peak: p, rms: Math.sqrt(s / d.length), clip };
}

async function main() {
  if (png) fs.mkdirSync(png, { recursive: true });
  if (kind === 'music') {
    const list = names.length ? music.filter((m) => names.some((n) => m.startsWith(n))) : music;
    for (const name of list) {
      const t0 = Date.now();
      const r = track(name)!;
      const ms = Date.now() - t0;
      const L = stats(r.left), R = stats(r.right);
      const n = r.left.length;
      // seam: jump at the loop point vs typical sample-to-sample change
      const jump = Math.abs(r.left[0] - r.left[n - 1]) + Math.abs(r.right[0] - r.right[n - 1]);
      let avg = 0;
      for (let i = 1; i < n; i++) avg += Math.abs(r.left[i] - r.left[i - 1]);
      avg /= n;
      // loudness over 1 s windows: crest + % of time near ceiling
      let near = 0;
      for (let i = 0; i < n; i++) if (Math.abs(r.left[i]) > 0.88) near++;
      console.log(`${name.padEnd(10)} ${(n / r.rate).toFixed(1)}s render ${ms}ms  peak ${dB(Math.max(L.peak, R.peak))} rms L ${dB(L.rms)} R ${dB(R.rms)}  seam ${(jump / 2 / avg).toFixed(2)}x  near-ceiling ${((near / n) * 100).toFixed(3)}%`);
      console.log('           bands', bands(r.left, r.rate));
      if (png) await spectro(path.join(png, `${name}.png`), r.left, r.rate);
    }
  } else {
    const mod = await import('./sfx.ts');
    const list = names.length ? mod.sounds.filter((m: string) => names.some((n) => m.startsWith(n))) : mod.sounds;
    for (const name of list) {
      const t0 = Date.now();
      const r = mod.sound(name)!;
      const s = stats(r.data);
      console.log(`${name.padEnd(14)} ${(r.data.length / r.rate).toFixed(2)}s ${Date.now() - t0}ms peak ${dB(s.peak)} rms ${dB(s.rms)} start ${r.data[0].toFixed(3)} end ${r.data[r.data.length - 1].toFixed(3)}`);
      if (png) await spectro(path.join(png, `${name}.png`), r.data, r.rate, Math.min(600, Math.max(100, Math.round(r.data.length / 128))), 160);
    }
  }
}
main();
