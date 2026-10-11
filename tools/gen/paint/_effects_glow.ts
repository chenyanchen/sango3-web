// Light effects (mostly drawn with additive blending in the game): ink-splash
// explosions, calligraphic flames, dry-brush lightning, washes of water and ice.
// Under ADD, dark ink would vanish, so these are painted as glowing pigment:
// vermilion/gamboge fire, azurite water, white-gold lightning, gold-leaf light.
import type { PaintOut } from '../types.ts';
import type { Ctx, Rule } from './_effects_ctx.ts';
import { AZURE, CRIMSON, FIRE, GOLD, JADE, VIOLET, type Ramp } from './_effects_kit.ts';
import { arc, bolt, burst, clamp, Cv, ease, erode, flame, Fld, halo, lerp, lit, out, pool, rng, seedNum, smooth, splatter, TAU, type Pt } from './_effects_fx.ts';

export const PALE: Ramp = [
  [0, '#3a3024', 0],
  [0.3, '#7a6a50', 0.6],
  [0.6, '#c8b48a', 0.9],
  [0.85, '#efe4cc', 1],
  [1, '#fffaf0', 1],
];
export const EMBER: Ramp = [
  [0, '#4a2004', 0],
  [0.25, '#9a4a0c', 0.65],
  [0.55, '#e0901e', 0.95],
  [0.8, '#f8d070', 1],
  [1, '#fff8e0', 1],
];
export const ICE: Ramp = [
  [0, '#0c2a3a', 0],
  [0.3, '#2a6a8a', 0.6],
  [0.6, '#6ab8d0', 0.95],
  [0.85, '#c8f0f8', 1],
  [1, '#ffffff', 1],
];

/** A canvas the size of the group's largest box, anchored where that frame is. */
function canvas(c: Ctx) {
  return { w: c.gw, h: c.gh, ax: c.gax, ay: c.gay };
}
const centred = (c: Ctx, ayK = 0.5) => ({ w: c.gw, h: c.gh, ax: c.gw / 2, ay: c.gh * ayK });

// ------------------------------------------------------------------ explosions
function explosion(ramp: Ramp, o: { rays?: number; dots?: number; cloud?: number; heat?: number; rise?: number; thick?: number; sy?: number; pad?: number; glow?: number } = {}) {
  return (c: Ctx): PaintOut => {
    const pad = o.pad ?? 1;
    const w = Math.round(c.gw * pad), h = Math.round(c.gh * pad);
    const cx = w / 2, cy = h * 0.52;
    const R = Math.min(w, h) * 0.46;
    const f = burst(w, h, cx, cy, c.t * 0.9, c.seed, { R, rays: o.rays, dots: o.dots, cloud: o.cloud, heat: (o.heat ?? 1) * 0.85, rise: o.rise, thick: o.thick, sy: o.sy });
    pool(f, Math.max(2, R * 0.12), 0.45);
    const cv = lit(f, ramp, Math.max(2, R * 0.12) * (o.glow ?? 1), 0.45);
    return out(cv, cx, cy);
  };
}

/** Blood: a crimson splash with long droplets thrown sideways (no cloud). */
function blood(c: Ctx): PaintOut {
  const w = c.gw, h = c.gh, cx = w / 2, cy = h / 2;
  const R = Math.min(w, h) * 0.46;
  const r = rng(c.seed);
  const t = c.t * 0.9;
  const f = new Fld(w, h);
  const grow = ease.out(clamp(t * 1.8));
  const decay = 1 - smooth(0.4, 1, t);
  f.dab(cx, cy, R * (0.15 + 0.25 * grow), decay * 0.9, { hard: 0.3, tex: 0.6, texF: 2 });
  for (let k = 0; k < 7; k++) {
    const a = r.next() * TAU;
    const L = R * r.range(0.5, 1) * grow;
    const drop = t * t * R * 0.3;
    f.stroke([[cx + Math.cos(a) * R * 0.1, cy + Math.sin(a) * R * 0.1], [cx + Math.cos(a) * L * 0.6, cy + Math.sin(a) * L * 0.6 + drop * 0.5], [cx + Math.cos(a) * L, cy + Math.sin(a) * L + drop]], R * r.range(0.1, 0.2), decay, { taperIn: 0.1, taperOut: 0.5, dry: 0.2 + 0.5 * t, seed: k, rag: 0.4 });
  }
  splatter(f, cx, cy + t * R * 0.2, R * grow, 22, r, decay, 0.06);
  erode(f, smooth(0.3, 1.05, t), 1.8, 5);
  return out(lit(f, CRIMSON, 2, 0.4), cx, cy);
}

// ------------------------------------------------------------------ flames
/** Looping flame sequence (6 frames): `ramp` colour, filling the group box from the anchor up. */
function flameLoop(ramp: Ramp, o: { tongues?: number; scaleW?: number; scaleH?: number; grow?: boolean; glow?: number } = {}) {
  return (c: Ctx): PaintOut => {
    const w = c.gw, h = c.gh;
    const ax = c.gax, ay = c.gay;
    const f = new Fld(w, h);
    const g = o.grow ? (c.t < 0.3 ? 0.2 + 0.8 * ease.out(c.t / 0.3) : c.t > 0.75 ? 1 - ease.in((c.t - 0.75) / 0.25) * 0.85 : 1) : 1;
    const H = Math.min(ay, h) * 0.95 * (o.scaleH ?? 1) * g;
    const W = Math.min(w * 0.8, H * 0.6) * (o.scaleW ?? 1);
    if (H > 2) flame(f, ax, Math.min(h - 2, ay + H * 0.08), o.grow ? c.t * 2 : c.i / c.n, c.seed, { W, H, tongues: o.tongues ?? 5, sway: 0.6 });
    pool(f, Math.max(2, W * 0.1), 0.4);
    return out(lit(f, ramp, Math.max(2, W * 0.12) * (o.glow ?? 1), 0.5), ax, ay);
  };
}

// ------------------------------------------------------------------ lightning
/** Vertical bolt from top of the box down to the anchor (impact point). */
function lightning(ramp: Ramp, o: { w?: number; forks?: number } = {}) {
  return (c: Ctx): PaintOut => {
    const { w, h } = c.job.box[0] ? { w: c.box[0], h: c.box[1] } : { w: 1, h: 1 };
    const ax = c.box[2], ay = c.box[3];
    const W = w + 24, H = h + 12;
    const f = new Fld(W, H);
    const r = rng(c.seed + c.name);
    bolt(f, [ax + 12 + r.range(-w * 0.2, w * 0.2), 2], [ax + 12, Math.min(H - 2, ay + 6)], r, { w: Math.max(4, (o.w ?? 0.22) * Math.min(60, w)), forks: o.forks ?? 3, jag: 0.06 });
    return out(lit(f, ramp, 5, 0.6), ax + 12, ay + 6);
  };
}

/** Lightning impact: radial sparks around a bright core (ma10004..: grows then fades). */
function shock(ramp: Ramp) {
  return (c: Ctx): PaintOut => {
    const w = c.gw, h = c.gh, cx = w / 2, cy = h / 2;
    const R = Math.min(w, h) * 0.48;
    const r = rng(c.seed);
    const t = c.t;
    const f = new Fld(w, h);
    const g = ease.out(clamp(t * 2));
    const fade = 1 - 0.8 * smooth(0.5, 1, t);
    f.dab(cx, cy, R * 0.25 * (0.5 + g), fade, { hard: 0.3 });
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * TAU + r.range(-0.2, 0.2);
      const rr = rng(c.seed + k + c.i);
      bolt(f, [cx, cy], [cx + Math.cos(a) * R * g * r.range(0.6, 1), cy + Math.sin(a) * R * g * r.range(0.6, 1)], rr, { w: Math.max(2, R * 0.07), forks: 1, jag: 0.18, a: fade });
    }
    return out(lit(f, ramp, 3, 0.6), cx, cy);
  };
}

// ------------------------------------------------------------------ embers (small loose fire bits)
function emberBall(ramp: Ramp) {
  return (c: Ctx): PaintOut => {
    const w = c.box[0], h = c.box[1], ax = c.box[2], ay = c.box[3];
    const f = new Fld(w, h);
    const R = Math.min(w, h) * 0.4;
    const r = rng(c.seed + c.i);
    f.dab(ax, ay, R, 1, { hard: 0.3, tex: 0.5, texF: 3 });
    splatter(f, ax, ay, R * 1.1, 5, r, 0.7, 0.12);
    return out(lit(f, ramp, 2, 0.5), ax, ay);
  };
}

/** Burning ball (bull's torch, fire bits): a hot core with flame tongues licking upward. */
function fireOrb(c: Ctx): PaintOut {
  const w = c.gw + 16, h = c.gh + 24;
  const cx = w / 2, cy = h - c.gh / 2 - 6;
  const R = Math.min(c.gw, c.gh) * 0.42;
  const f = new Fld(w, h);
  f.dab(cx, cy, R, 0.75, { hard: 0.25, tex: 0.4, texF: 3 });
  flame(f, cx, cy + R * 0.5, c.i / c.n, c.seed, { W: R * 1.6, H: R * 2.6, tongues: 4, sway: 0.7 });
  pool(f, 2, 0.3);
  return out(lit(f, FIRE, 3, 0.5), cx, cy);
}

export const glowRules: Rule[] = [
  // explosions (42009..42019, 42034, sg2 fireball)
  { dir: 'magic/bom11', gen: explosion(FIRE, { cloud: 0.6 }) },
  { dir: 'magic/bom12', gen: explosion(EMBER, { cloud: 0.6 }) },
  { dir: 'magic/bom13', gen: explosion(VIOLET, { cloud: 0.6 }) },
  { dir: 'magic/bom21', gen: explosion(PALE, { rays: 10, dots: 22 }) },
  { dir: 'magic/bom22', gen: explosion(CRIMSON, { rays: 10, dots: 22 }) },
  { dir: 'magic/bom23', gen: explosion(FIRE, { rays: 10, dots: 22 }) },
  { dir: 'magic/bom24', gen: explosion(AZURE, { rays: 10, dots: 22 }) },
  { dir: 'magic/bom31', gen: explosion(FIRE, { rays: 7, dots: 10, thick: 1.2 }) },
  { dir: 'magic/bom32', gen: explosion(AZURE, { rays: 7, dots: 10, thick: 1.2 }) },
  { dir: 'magic/bom41', gen: explosion(EMBER, { rays: 8, dots: 16, cloud: 0.3 }) },
  { dir: 'magic/bom42', gen: explosion(VIOLET, { rays: 8, dots: 16, cloud: 0.3 }) },
  { dir: 'magic/067', name: /^bigbom/, gen: explosion(FIRE, { rays: 12, dots: 30, cloud: 1, rise: 0.15, sy: 0.6, thick: 1.3 }) },
  { dir: 'sg2/magic', gen: explosion(FIRE, { rays: 8, dots: 14, cloud: 0.8 }) },
  { dir: 'magic/blood', gen: blood },
  // fires
  { dir: 'magic/manfire', name: /^m000manfire\d\d$/, group: () => 'm000', gen: flameLoop(FIRE) },
  { dir: 'magic/manfire', name: /^m000manfire01[abc]$/, group: () => 'm000s', gen: flameLoop(FIRE, { tongues: 4, scaleW: 0.8 }) },
  { dir: 'magic/manfire', name: /^m02/, group: () => 'm02', gen: flameLoop(EMBER) },
  { dir: 'magic/manfire', name: /^m03/, group: () => 'm03', gen: flameLoop(JADE) },
  { dir: 'magic/manfire', name: /^m04/, group: () => 'm04', gen: flameLoop(VIOLET) },
  { dir: 'magic/manfire', name: /^m05/, group: () => 'm05', gen: flameLoop(AZURE) },
  { dir: 'magic/manfire', name: /^f0/, group: () => 'f', gen: flameLoop(FIRE, { tongues: 6, scaleW: 1.4 }) },
  { dir: 'magic/068', name: /^m027fire/, group: () => 'm027', gen: fireOrb },
  { dir: 'magic/011', name: /^m017f/, group: () => 'm017', gen: flameLoop(FIRE, { tongues: 5, grow: true }) },
  { dir: 'magic/070', gen: flameLoop(FIRE, { tongues: 4, grow: true }) },
  // lightning
  { dir: 'magic/010', name: /^ma1000[1-3]$/, gen: lightning(VIOLET) },
  { dir: 'magic/010', name: /^ma100(0[4-7])$/, group: () => 'shock', gen: shock(VIOLET) },
  { dir: 'magic/010', name: /^ma100(0[89]|1[0-2])$/, group: () => 'puff', gen: explosion(VIOLET, { rays: 6, dots: 14, cloud: 0.5 }) },
  { dir: 'magic/050', name: /^m005thunder/, gen: lightning(VIOLET, { w: 0.25 }) },
  { dir: 'magic/050', name: /^ma50[12]$/, group: () => 'shock', gen: shock(VIOLET) },
  { dir: 'magic/046', name: /^m018ball/, gen: emberBall(GOLD) },
];

export { canvas, centred, explosion, flameLoop, lightning, shock, emberBall, halo, arc, bolt, burst, Cv, lerp, type Pt };
