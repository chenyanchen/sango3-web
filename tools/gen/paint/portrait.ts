// Portraits (shape dir "portrait"): 水墨人物 bust portraits painted from a
// parametric face/costume model. Each frame's Look comes from the people data
// (tools/gen/data/people.ts → PORTRAITS); without it, looks are seeded from
// the frame name. Rendered at 1.5× the original 100×120 box: the DOM UI shows
// portraits with `background-size: cover`, so the extra pixels only add
// crispness on HiDPI screens (2× would double the lossless atlas size).
import { C, f2, hash, inkBleed, mix, paper, rng, washTexture } from '../ink.ts';
import type { FrameJob, Look, Painter, PortraitSlot } from '../types.ts';
import { drawEar, drawFace, drawNeck, faceParts } from './_portrait_face.ts';
import { drawBeard, hairBack, hairMass, hairTop } from './_portrait_hair.ts';
import { buildModel, CW, CH, type Model } from './_portrait_model.ts';
import { ell, fill } from './_portrait_util.ts';
import { drawDress, drawFan, hatBack, hatFront } from './_portrait_wear.ts';
import { earPlate, isHelm } from './_portrait_helm.ts';

const OUT_W = 150, OUT_H = 180;
const ZOOM = 1.36;

let slots: Map<string, PortraitSlot> | null = null;
async function loadSlots() {
  if (slots) return slots;
  slots = new Map();
  try {
    const mod = (await import('../data/people.ts')) as { PORTRAITS?: PortraitSlot[] };
    for (const s of mod.PORTRAITS ?? []) slots.set(s.frame.toLowerCase(), s);
  } catch {
    // people data not available: seeded looks
  }
  return slots;
}

/** A plausible look for a frame without people data. */
export function seededLook(frame: string): Look {
  const r = rng('look:' + frame);
  if (frame.startsWith('emperor')) {
    const n = +frame.slice(7);
    return { sex: 1, age: n >= 3 ? 'young' : 'adult', build: 'normal', role: 'emperor', beard: n >= 3 ? 'none' : 'short', face: 'noble', hat: 'crown' };
  }
  if (frame.startsWith('wface')) {
    return { sex: 2, age: r.pick(['young', 'young', 'adult'] as const), build: 'slim', role: r.chance(0.3) ? 'warrior' : 'beauty', beard: 'none', face: r.pick(['gentle', 'noble', 'stern', 'cunning'] as const), skin: r.pick(['pale', 'normal'] as const) };
  }
  const role = r.pick(['warrior', 'warrior', 'warrior', 'strategist', 'lord', 'scholar', 'barbarian', 'warrior', 'scholar'] as const);
  const age = r.pick(['young', 'adult', 'adult', 'old'] as const);
  return {
    sex: 1, age, role,
    build: r.pick(['slim', 'normal', 'normal', 'stout'] as const),
    beard: age === 'young' ? r.pick(['none', 'none', 'stubble'] as const) : r.pick(['short', 'long', 'full', 'stubble', 'short', 'long'] as const),
    face: role === 'warrior' ? r.pick(['fierce', 'stern', 'noble'] as const) : r.pick(['gentle', 'cunning', 'noble', 'stern'] as const),
    skin: role === 'barbarian' ? 'dark' : r.pick(['pale', 'normal', 'normal', 'ruddy', 'dark'] as const),
  };
}

const FILTERS = [2, 3, 4, 5].map((n) => `<filter id="blur${n}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${n * 0.9}"/></filter>`).join('');
const PATTERNS =
  `<pattern id="scales" width="8" height="6" patternUnits="userSpaceOnUse"><path d="M0,0 Q4,7.5 8,0" fill="none" stroke="#1b1712" stroke-width="1" opacity="0.75"/><path d="M-4,3 Q0,10 4,3 M4,3 Q8,10 12,3" fill="none" stroke="#fff" stroke-width="0.6" opacity="0.25"/></pattern>` +
  `<pattern id="lam" width="6" height="5" patternUnits="userSpaceOnUse"><path d="M0,4.5 H6 M3,0 V4.5" fill="none" stroke="#1b1712" stroke-width="0.8" opacity="0.7"/></pattern>`;

function background(m: Model, seed: number) {
  const pp = paper(CW, CH, seed, mix(C.paper, m.bgHue, 0.18));
  const defs = pp.defs + washTexture('wash', seed, 0.035, 0.22) + inkBleed('bleed', seed, 1.4, 0.09) +
    `<radialGradient id="vig" cx="0.45" cy="0.4" r="0.75"><stop offset="0.55" stop-color="#5a4630" stop-opacity="0"/><stop offset="1" stop-color="#5a4630" stop-opacity="0.45"/></radialGradient>` +
    `<radialGradient id="halo" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="${m.bgHue}" stop-opacity="0.55"/><stop offset="1" stop-color="${m.bgHue}" stop-opacity="0"/></radialGradient>`;
  let body = pp.body;
  body += `<ellipse cx="${f2(m.hx + 10)}" cy="${f2(m.hy - 5)}" rx="105" ry="110" fill="url(#halo)"/>`;
  // a couple of loose wash strokes behind the figure
  const r = m.r;
  const y0 = r.range(20, 70);
  body += fill(ell(r.chance(0.5) ? 25 : 175, y0, r.range(30, 50), r.range(10, 18), r.range(-25, 25)), mix(m.bgHue, '#3b342b', 0.3), 0.18, 'filter="url(#blur5)"');
  body += `<rect width="${CW}" height="${CH}" fill="url(#vig)"/>`;
  return { defs, body };
}

export function paintPortrait(frame: string, name: string, look: Look) {
  const m = buildModel(frame, name, look);
  const fp = faceParts(m);
  const bg = background(m, hash(frame));
  let fig = '';
  fig += hairBack(m, fp);
  fig += drawNeck(m, fp);
  fig += `<g filter="url(#wash)">${drawDress(m)}</g>`;
  let head = '';
  head += hatBack(m, fp);
  head += hairMass(m, fp);
  const helm = isHelm(m.hat.kind) && m.hat.kind !== 'hequan';
  if (!helm) head += drawEar(m, fp);
  head += drawFace(m, fp);
  if (helm) head += earPlate(m, fp);
  head += drawBeard(m, fp);
  head += hairTop(m, fp);
  head += hatFront(m, fp);
  fig += `<g transform="rotate(${f2(m.tilt)} ${f2(m.hx)} ${f2(m.chinY + 30)})">${head}</g>`;
  if (m.extras.has('fan')) fig += drawFan(m);
  const flip = m.flip ? ` transform="translate(${CW} 0) scale(-1 1)"` : '';
  // camera: frame the bust close, like a painted portrait album leaf
  const z = ZOOM, cy = 108;
  const cam = `translate(${f2(m.hx)} ${cy}) scale(${z}) translate(${f2(-m.hx)} ${-cy})`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${OUT_W}" height="${OUT_H}" viewBox="0 0 ${CW} ${CH}"><defs>${FILTERS}${PATTERNS}${bg.defs}</defs><g${flip}>${bg.body}<g transform="${cam}"><g filter="url(#bleed)">${fig}</g></g></g></svg>`;
  return svg;
}

export const painter: Painter = {
  id: 'portrait',
  match: (dir) => dir === 'portrait',
  async prepare() {
    await loadSlots();
  },
  async paint(job: FrameJob) {
    const s = (await loadSlots()).get(job.name);
    const look = s?.look ?? seededLook(job.name);
    return { svg: paintPortrait(job.name, s?.name ?? '', look), w: OUT_W, h: OUT_H, ax: 0, ay: 0 };
  },
};
