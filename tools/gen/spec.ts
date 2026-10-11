// Records the *structure* of the original asset set — shape directories,
// frame names, sizes and anchors, animation frame sequences — so generated
// art can be drop-in compatible with the game code. No pixels, text or
// numbers from the game data are recorded.
//
//   pnpm gen:spec    (needs a `pnpm extract`ed public/assets-orig)
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const SRC = path.join(ROOT, process.env.SG3_ORIG ?? 'public/assets-orig');
const OUT = path.join(import.meta.dirname, 'spec');

type Box = [w: number, h: number, ax: number, ay: number];
const shapes: Record<string, { frames: Record<string, Box>; singles: Record<string, Box> }> = {};
const sdir = path.join(SRC, 'shape');
for (const f of fs.readdirSync(sdir).filter((f) => f.endsWith('.json') && f !== 'index.json').sort()) {
  const m = JSON.parse(fs.readFileSync(path.join(sdir, f), 'utf8')) as {
    frames: Record<string, number[]>;
    singles: Record<string, [string, number, number, number, number]>;
  };
  const key = f.slice(0, -5);
  const frames: Record<string, Box> = {};
  for (const [n, r] of Object.entries(m.frames)) frames[n] = [r[3], r[4], r[5], r[6]];
  const singles: Record<string, Box> = {};
  for (const [n, s] of Object.entries(m.singles)) singles[n] = [s[1], s[2], s[3], s[4]];
  shapes[key] = { frames, singles };
}

// object id → { dir, flags, sprites: anim → { frames: [name, delay, event?][], loop } }
const objs = JSON.parse(fs.readFileSync(path.join(SRC, 'data/objects.json'), 'utf8')) as Record<
  string,
  { dir: string; flags: string[]; sprites: Record<string, { frames: { f: string; d: number; ev?: string }[]; loop: boolean }> }
>;
const objects: Record<string, unknown> = {};
for (const [id, o] of Object.entries(objs)) {
  const sprites: Record<string, unknown> = {};
  for (const [a, s] of Object.entries(o.sprites)) sprites[a] = { frames: s.frames.map((f) => (f.ev ? [f.f, f.d, f.ev] : [f.f, f.d])), loop: s.loop };
  objects[id] = { dir: o.dir, flags: o.flags, sprites };
}

const names = (d: string, ext: string) => fs.readdirSync(path.join(SRC, d)).filter((f) => f.endsWith(ext)).map((f) => f.slice(0, -ext.length)).sort();
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'shapes.json'), JSON.stringify(shapes));
fs.writeFileSync(path.join(OUT, 'objects.json'), JSON.stringify(objects));
fs.writeFileSync(path.join(OUT, 'audio.json'), JSON.stringify({ sound: names('sound', '.wav'), music: names('music', '.mp3') }, null, 1));
console.log(`spec: ${Object.keys(shapes).length} shape dirs, ${Object.keys(objects).length} objects`);
