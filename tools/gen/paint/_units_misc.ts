// Small battle sprites: weapon-trail glows of charging generals
// (bf/general/light*), flying gore (bf/sol/body), ground shadows (bf/shadow)
// and projectiles (bf/flyweapon/*).
import { C, f2, hash, mix, rng } from '../ink.ts';
import type { FrameJob, PaintOut } from '../types.ts';
import { generalLook } from './_units_looks.ts';
import { generalPose, generalSlot } from './_units_poses.ts';
import { add, Canvas, DIMS, dir, len, mul, norm, perp, rad, solve, sub, type V } from './_units_rig.ts';
import { WEAPON_GEO, type Look } from './_units_figure.ts';

// ------------------------------------------------------------------ light trails
const LIGHT_COL: Record<string, [string, string]> = {
  'light-r': ['#ff6a2a', '#ffd9a0'],
  'light-g': ['#3fd27a', '#d4ffd8'],
  'light-b': ['#3a8cff', '#cfe6ff'],
  'light-n': ['#c9b27a', '#fff4d6'],
  light: ['#e8d6a0', '#ffffff'],
};

let refLook: Look | null = null;
function tipAt(num: number, fi: number): V {
  refLook ??= generalLook(1).look;
  const slot = generalSlot(num, false);
  const p = generalPose({ ...slot, i: Math.max(0, Math.min(slot.n - 1, fi)) });
  const sk = solve(p, DIMS, [0, 0], 1);
  const g = WEAPON_GEO.glaive;
  return add(sk.W1, mul(sk.wd, (g.L - g.B) * 0.8));
}

export function paintLight(job: FrameJob): PaintOut {
  const key = job.dir.split('/').pop()!;
  const [col, core] = LIGHT_COL[key] ?? LIGHT_COL.light;
  const m = /(\d+)$/.exec(job.name);
  const cv = new Canvas();
  if (!m || job.name === 'null') return cv.out(true, 1, 2, 2);
  let num = +m[1];
  if (key === 'light-n') num = [7, 20, 57][(num - 1) % 3];
  const slot = generalSlot(num, false);
  if (!slot.anim.startsWith('attack')) return cv.out(true, 1, 2, 2);
  const pts: V[] = [];
  for (let k = 0; k <= 10; k++) pts.push(tipAt(num, slot.i - 1.6 + (1.6 * k) / 10));
  let d = 0;
  for (let k = 1; k < pts.length; k++) d += len(sub(pts[k], pts[k - 1]));
  const strike = slot.ev === slot.i;
  if (d < 12) {
    // slow frame: a soft glint at the blade
    const t = pts[pts.length - 1];
    cv.circle(t, 9, col, undefined, 0, 0.35);
    cv.circle(t, 4, core, undefined, 0, 0.7);
    return cv.out(true, 2);
  }
  const n = pts.length;
  const band = (wMax: number, color: string, op: number) => {
    const L: V[] = [], R: V[] = [];
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
      const nx = perp(norm(sub(b, a)));
      const w = Math.sin((Math.PI * (i + 0.5)) / n) ** 0.7 * wMax * (0.4 + 0.6 * (i / (n - 1)));
      L.push(add(pts[i], mul(nx, w * 0.45)));
      R.push(add(pts[i], mul(nx, -w)));
    }
    cv.shape([...L, ...R.reverse()], color, undefined, 0, true, op);
  };
  const k = strike ? 1.4 : 1;
  band(22 * k, col, 0.35);
  band(12 * k, col, 0.6);
  band(5 * k, core, 0.9);
  if (strike) {
    const t = pts[n - 1];
    cv.circle(t, 12, col, undefined, 0, 0.4);
    cv.circle(t, 5, core, undefined, 0, 0.9);
  }
  return cv.out(true, 3);
}

// ------------------------------------------------------------------ gore pieces
export function paintBody(job: FrameJob): PaintOut {
  const m = /^([a-z]+)(\d+)$/.exec(job.name);
  const cv = new Canvas();
  if (!m || job.name === 'null') return cv.out(false, 1, 2, 2);
  const kind = m[1], k = +m[2];
  const r = rng(hash(job.name));
  const steps = kind === 'hd' ? 10 : 8;
  const a = ((k - 1) / steps) * 360;
  const R = (v: V): V => {
    const c = Math.cos(rad(a)), s = Math.sin(rad(a));
    return [v[0] * c - v[1] * s, v[0] * s + v[1] * c];
  };
  const ol = 1.3;
  const blood = '#8e1f16';
  switch (kind) {
    case 'hd': {
      // severed head with a soldier's cap
      const c: V = [0, -7];
      const up = R([0, -1]);
      const fw: V = [-up[1], up[0]];
      cv.circle(add(c, mul(up, -5)), 2.8, blood);
      cv.circle(c, 5.6, '#e6c39c', C.ink, ol);
      const cap: V[] = [];
      for (let t = 20; t <= 200; t += 20) cap.push(add(c, add(mul(fw, Math.cos(rad(t)) * 6.4), mul(up, Math.sin(rad(t)) * 6.4))));
      cv.shape(cap, '#3b342b', C.ink, ol * 0.8, true);
      cv.line([add(c, add(mul(fw, 2.4), mul(up, 0.4))), add(c, add(mul(fw, 4), mul(up, 0.4)))], 1.1, C.ink);
      return cv.out(false, 1);
    }
    case 'b': {
      const h = R([0, -8]), l = R([0, 8]);
      cv.line([h, l], 11 + ol * 2, C.ink);
      cv.line([h, l], 11, '#7a7268');
      cv.circle(h, 3.4, blood);
      return cv.out(false, 1);
    }
    case 'h':
    case 'l': {
      const L = kind === 'h' ? 14 : 15;
      const p0 = R([0, -L]), p1 = R([0, L]);
      const w = kind === 'h' ? 5 : 6.5;
      cv.line([p0, p1], w + ol * 2, C.ink);
      cv.line([p0, p1], w, kind === 'h' ? '#bdb2a0' : '#d9d0c0');
      if (kind === 'l') cv.line([mul(p1, 0.6), p1], w, '#3a332c');
      else cv.circle(p1, 2.8, '#e6c39c', C.ink, 0.9);
      cv.circle(p0, 2.6, blood);
      return cv.out(false, 1);
    }
    default: {
      // c: chunk, s: drop of blood
      const sz = kind === 'c' ? 4.2 : 2.4;
      const p: V[] = [];
      for (let i = 0; i < 7; i++) {
        const t = (i / 7) * Math.PI * 2;
        const q = sz * (0.75 + r.next() * 0.45);
        p.push(R([Math.cos(t) * q * 1.3, Math.sin(t) * q]));
      }
      cv.shape(p, kind === 'c' ? '#7a2a1e' : blood, kind === 'c' ? C.ink : undefined, 0.9, true);
      return cv.out(false, 1);
    }
  }
}

// ------------------------------------------------------------------ shadows
export function paintShadow(job: FrameJob): PaintOut {
  const sizes: Record<string, [number, number]> = { soldier: [64, 12], horse: [134, 34], head: [16, 6] };
  const sz = sizes[job.name];
  if (!sz) return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>`, w: 1, h: 1, ax: 0, ay: 0 };
  const [w, h] = sz;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><radialGradient id="g" cx="0.5" cy="0.5" r="0.5">` +
    `<stop offset="0" stop-color="${C.ink}" stop-opacity="0.95"/><stop offset="0.55" stop-color="${C.ink}" stop-opacity="0.75"/><stop offset="1" stop-color="${C.ink}" stop-opacity="0"/></radialGradient></defs>` +
    `<ellipse cx="${w / 2}" cy="${h / 2}" rx="${w / 2}" ry="${h / 2}" fill="url(#g)"/></svg>`;
  return { svg, w, h, ax: Math.round(w / 2), ay: Math.round(h / 2) };
}

// ------------------------------------------------------------------ projectiles
function arrow(cv: Canvas, tip: V, d: V, L: number, r: ReturnType<typeof rng>, trail = true) {
  const tail = add(tip, mul(d, -L));
  const n = perp(d);
  if (trail) cv.brush([add(tail, mul(d, 8)), add(tail, mul(d, -10))], 3.2, C.inkWash, r, 0.35, { taperIn: 0.9, taperOut: 0.05 });
  cv.line([tail, add(tip, mul(d, -4))], 2.6, C.ink);
  cv.line([tail, add(tip, mul(d, -4))], 1.1, '#b8946a');
  cv.shape([tip, add(add(tip, mul(d, -7)), mul(n, 2.4)), add(tip, mul(d, -5.5)), add(add(tip, mul(d, -7)), mul(n, -2.4))], '#2a2520');
  for (const k of [1, -1]) cv.brush([add(tail, mul(d, 8)), add(add(tail, mul(d, 1)), mul(n, 3 * k))], 2.2, k > 0 ? '#e8e0cc' : C.cinnabar, r, 0.95);
}

export function paintFly(job: FrameJob): PaintOut {
  const cv = new Canvas();
  const r = rng(hash(job.dir + job.name));
  const name = job.name;
  let m: RegExpExecArray | null;
  if ((m = /^b1(\d{4})$/.exec(name))) {
    // arrow pointing at angle (k-1)/32 turns, counter-clockwise from +x (screen up); tip at the anchor
    const a = ((+m[1] - 1) / 32) * Math.PI * 2;
    const d: V = [Math.cos(a), -Math.sin(a)];
    arrow(cv, [0, 0], d, 44, r);
    return cv.out(false, 1);
  }
  if ((m = /^broke(\d\d)$/.exec(name))) {
    // a spent arrow (or blade) stuck in the ground at the anchor
    const k = +m[1];
    const a = rad([62, 48, 30, 18][k - 1] ?? 40);
    const d: V = [-Math.cos(a), Math.sin(a)]; // pointing down into the ground
    if (job.dir.endsWith('g1')) {
      const tip: V = [0, 0];
      const hilt = add(tip, mul(d, -18));
      cv.shape([tip, add(hilt, mul(perp(d), 2.4)), add(hilt, mul(perp(d), -2.4))], '#dfe3e2', C.ink, 1);
      cv.line([hilt, add(hilt, mul(d, -7))], 3.4, C.ink);
      cv.line([add(hilt, mul(perp(d), 4)), add(hilt, mul(perp(d), -4))], 2.4, C.ink);
    } else {
      arrow(cv, [0, 0], d, 30 - k * 2, r, false);
      cv.ellipse([0, 0], 4, 1.4, 0, C.inkSoft, undefined, 0, 0.5);
    }
    return cv.out(false, 1);
  }
  if (name === 'g01' || (m = /^g2(\d{4})$/.exec(name))) {
    // throwing blade; g2xxxx spins (30° per frame)
    const k = m ? +m[1] - 1 : 0;
    const a = rad(k * 30);
    const d: V = [Math.cos(a), Math.sin(a)];
    const n = perp(d);
    const tip = mul(d, 18), back = mul(d, -16);
    if (m) cv.circle([0, 0], 14, '#ffe2a0', undefined, 0, 0.25);
    cv.shape([tip, add(mul(d, -4), mul(n, 4.2)), add(mul(d, -8), mul(n, 1.6)), add(mul(d, -8), mul(n, -1.6)), add(mul(d, -4), mul(n, -4.2))], '#e8ecec', C.ink, 1.2);
    cv.line([mul(d, -8), back], 3.4, C.ink);
    cv.line([mul(d, -8), back], 1.6, C.cinnabar);
    cv.brush([back, add(back, add(mul(d, -6), mul(n, 3)))], 2, C.cinnabar, r);
    return cv.out(false, 1);
  }
  if (name === 't1') {
    // crossbow bolt pointing left, tip at the anchor
    const d: V = [-1, 0];
    const tip: V = [0, 0];
    const tail = add(tip, mul(d, -30));
    cv.brush([add(tail, [-2, 0]), add(tail, [10, 0])], 2.6, C.inkWash, r, 0.35);
    cv.line([tail, add(tip, [4, 0])], 2.6, C.ink);
    cv.line([tail, add(tip, [4, 0])], 1.2, '#8a6a44');
    cv.shape([tip, [5, -2], [5, 2]], '#2a2520');
    cv.shape([add(tail, [-1, 0]), add(tail, [-5, -2.4]), add(tail, [3, -1])], C.inkSoft);
    cv.shape([add(tail, [-1, 0]), add(tail, [-5, 2.4]), add(tail, [3, 1])], C.inkSoft);
    return cv.out(false, 0);
  }
  return cv.out(false, 1, 2, 2);
}

void f2;
void mix;
void dir;
