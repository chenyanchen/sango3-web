// Contact sheet of a shape directory for visual review.
//
//   pnpm gen:sheet <dir> out.png [--orig] [--filter regex] [--max 120] [--scale 1] [--bg #888]
//
// Reads the generated set (public/assets) or, with --orig, the extracted
// original (public/assets-orig) — the original is for understanding what a
// frame depicts only; never copy or trace it.
import fs from 'node:fs';
import path from 'node:path';
import sharp, { type OverlayOptions } from 'sharp';

const ROOT = path.resolve(import.meta.dirname, '../..');
const args = process.argv.slice(2);
const opt = (k: string, d?: string) => {
  const i = args.indexOf('--' + k);
  return i >= 0 ? args[i + 1] : d;
};
const dir = (args[0] ?? '').replace(/^\/|\/$/g, '').toLowerCase();
const out = args[1] ?? 'sheet.png';
const base = path.join(ROOT, args.includes('--orig') ? 'public/assets-orig' : 'public/assets', 'shape');
const key = dir ? dir.replaceAll('/', '_') : '_root';
const man = JSON.parse(fs.readFileSync(path.join(base, key + '.json'), 'utf8')) as {
  pages: string[];
  frames: Record<string, number[]>;
  singles: Record<string, [string, number, number, number, number]>;
};
const re = new RegExp(opt('filter', '.')!);
const max = +opt('max', '120')!;
const scale = +opt('scale', '1')!;
const bg = opt('bg', '#9a9a9a')!;

const pages = await Promise.all(man.pages.map((p) => sharp(path.join(base, p)).ensureAlpha().raw().toBuffer({ resolveWithObject: true })));
type Tile = { name: string; buf: Buffer; w: number; h: number; ax: number; ay: number };
const tiles: Tile[] = [];
for (const [name, r] of Object.entries(man.frames).sort()) {
  if (!re.test(name) || tiles.length >= max) continue;
  const [p, x, y, w, h, ax, ay] = r;
  const pg = pages[p];
  const buf = await sharp(pg.data, { raw: { width: pg.info.width, height: pg.info.height, channels: 4 } }).extract({ left: x, top: y, width: w, height: h }).png().toBuffer();
  tiles.push({ name, buf, w, h, ax, ay });
}
for (const [name, s] of Object.entries(man.singles).sort()) {
  if (!re.test(name) || tiles.length >= max) continue;
  tiles.push({ name, buf: await sharp(path.join(base, s[0])).png().toBuffer(), w: s[1], h: s[2], ax: s[3], ay: s[4] });
}
if (!tiles.length) throw new Error('no frames');
const cellW = Math.min(1600, Math.max(...tiles.map((t) => t.w))) * scale + 8;
const cellH = Math.min(1200, Math.max(...tiles.map((t) => t.h))) * scale + 22;
const cols = Math.max(1, Math.min(tiles.length, Math.floor(2400 / cellW) || 1));
const rows = Math.ceil(tiles.length / cols);
const comps: OverlayOptions[] = [];
for (let i = 0; i < tiles.length; i++) {
  const t = tiles[i];
  const cx = (i % cols) * cellW + 4, cy = Math.floor(i / cols) * cellH + 4;
  const img = scale === 1 ? t.buf : await sharp(t.buf).resize(Math.max(1, Math.round(t.w * scale)), Math.max(1, Math.round(t.h * scale)), { kernel: 'nearest' }).png().toBuffer();
  const meta = await sharp(img).metadata();
  const iw = Math.min(meta.width!, cellW - 8), ih = Math.min(meta.height!, cellH - 22);
  comps.push({ input: await sharp(img).extract({ left: 0, top: 0, width: iw, height: ih }).png().toBuffer(), left: cx, top: cy });
  // anchor cross + label
  const ax = Math.round(t.ax * scale), ay = Math.round(t.ay * scale);
  const label = `<svg xmlns="http://www.w3.org/2000/svg" width="${cellW}" height="${cellH}">
<path d="M${ax - 4} ${ay}h8M${ax} ${ay - 4}v8" stroke="#f0f" stroke-width="1"/>
<text x="2" y="${cellH - 6}" font-size="11" font-family="Menlo,monospace" fill="#000">${t.name} ${t.w}x${t.h}</text></svg>`;
  comps.push({ input: Buffer.from(label), left: cx, top: cy });
}
await sharp({ create: { width: cols * cellW, height: rows * cellH, channels: 4, background: bg } }).composite(comps).png().toFile(out);
console.log(`${tiles.length} frames → ${out}`);
