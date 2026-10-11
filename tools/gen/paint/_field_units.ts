// 野战 units: the little soldiers of sf/groupicon (4 colours × 6 animations ×
// 5 phases × 8 directions), the boats of sf/ship and the camps of sf/camp.
// Figures are posed in 3D (body-local lateral / forward / up) and projected,
// so every direction is consistent; drawn with ink outlines and colour washes.
import { C, f2, hash, mix, rng, svgDoc, type Pt } from '../ink.ts';
import type { FrameJob, PaintOut } from '../types.ts';

const TEAM: Record<string, string> = { b: '#2c5aa8', r: '#b5302a', g: '#2e7a45', y: '#cf9a1e' };
const TEAM_LT: Record<string, string> = { b: '#6f93cf', r: '#de6a58', g: '#6fb07a', y: '#ecc65a' };

/** GroupIcon direction digit → facing unit vector in ground plane (x right, y towards viewer) */
function facing(d: number): [number, number] {
  // 8=S 1=SW 2=W 3=NW 4=N 5=NE 6=E 7=SE
  const ang: Record<number, number> = { 8: 90, 1: 135, 2: 180, 3: 225, 4: 270, 5: 315, 6: 0, 7: 45 };
  const a = ((ang[d] ?? 90) * Math.PI) / 180;
  return [Math.cos(a), Math.sin(a)];
}

type V3 = [number, number, number]; // lateral (right +), forward, up

class Rig {
  fx: number;
  fy: number;
  constructor(dir: number, readonly ox: number, readonly oy: number) {
    [this.fx, this.fy] = facing(dir);
  }
  /** body-local → [screen x, screen y, depth] */
  p([l, f, u]: V3): [number, number, number] {
    const rx = -this.fy, ry = this.fx; // right-hand side
    const X = rx * l + this.fx * f, Y = ry * l + this.fy * f;
    return [this.ox + X, this.oy + Y * 0.45 - u, Y];
  }
}

function hull(pts: Pt[]): Pt[] {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: Pt[] = [], up: Pt[] = [];
  for (const q of p) {
    while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop();
    lo.push(q);
  }
  for (const q of p.reverse()) {
    while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop();
    up.push(q);
  }
  return [...lo.slice(0, -1), ...up.slice(0, -1)];
}

const pathOf = (pts: Pt[], close = true) => `M${pts.map((q) => `${f2(q[0])},${f2(q[1])}`).join('L')}${close ? 'Z' : ''}`;

interface Pose {
  bob: number; // whole body up offset
  lean: number; // forward lean of the torso (px at shoulders)
  legL: V3; legR: V3; // foot positions
  kneel: number; // 0..1 (lose)
  handL: V3; handR: V3;
  spear: { from: V3; to: V3 } | null; // world-local spear (null = dropped)
  dropped?: boolean;
  sparkle?: number;
  headDown?: number;
}

function pose(group: number, ph: number): Pose {
  const t = (ph / 5) * Math.PI * 2;
  const base: Pose = {
    bob: 0, lean: 0, legL: [-1.8, 0, 0], legR: [1.8, 0, 0], kneel: 0,
    handL: [-3.6, 1.2, 11], handR: [3.8, 1.4, 12], spear: { from: [3.9, 1.6, 1], to: [3.7, 1.0, 31] },
  };
  switch (group) {
    case 0: { // wait: breathing, spear upright
      base.bob = Math.sin(t) * 0.35;
      return base;
    }
    case 1: { // run
      const s = Math.sin(t), c = Math.cos(t);
      base.bob = Math.abs(c) * 1.2;
      base.lean = 1.6;
      base.legL = [-1.6, s * 3.2, Math.max(0, -c) * 1.6];
      base.legR = [1.6, -s * 3.2, Math.max(0, c) * 1.6];
      base.handL = [-3.4, -s * 2.5, 11.5];
      base.handR = [3.6, 2, 13];
      base.spear = { from: [3.7, -6, 8], to: [3.5, 12, 22] };
      return base;
    }
    case 2: { // win: raise the spear, hop
      const up = [0, 2.5, 4, 2.5, 0][ph];
      base.bob = up;
      base.handR = [3.6, 0.5, 23];
      base.handL = [-4.5, 0.5, 20 + (ph % 2)];
      base.spear = { from: [3.7, 0.5, 13], to: [3.5, 0.2, 40] };
      return base;
    }
    case 3: { // lose: slump down to the knees, spear falls
      const k = ph / 4;
      base.kneel = k;
      base.bob = -k * 5;
      base.lean = 1 + k * 2.5;
      base.headDown = k;
      base.handL = [-3.2, 2 + k, 8 - k * 2];
      base.handR = [3.4, 2 + k, 8 - k * 2];
      if (ph >= 2) {
        base.spear = { from: [5, -8, 0.5], to: [6, 14, 0.5] };
        base.dropped = true;
      } else base.spear = { from: [3.9, 1.6 + ph, 1], to: [5.5 + ph * 3, 2 + ph * 3, 29 - ph * 5] };
      return base;
    }
    case 4: { // cast: both hands raised forward, light between them
      const k = [0.3, 0.7, 1, 1, 0.6][ph];
      base.handL = [-2.4, 3 + k * 2, 14 + k * 7];
      base.handR = [2.4, 3 + k * 2, 14 + k * 7];
      base.spear = { from: [5.5, -1, 0.5], to: [5.5, -1, 26] };
      base.sparkle = k;
      return base;
    }
    default: { // fight: spear thrust
      const ext = [-3, 2, 7, 5, 0][ph];
      base.lean = [0.5, 2, 3, 2.5, 1][ph];
      base.legL = [-1.8, 2.2, 0];
      base.legR = [1.8, -2.2, 0];
      base.handR = [2.8, 3 + ext, 14];
      base.handL = [-1.2, 6 + ext, 14.5];
      base.spear = { from: [2.6, -8 + ext, 12.5], to: [2.2, 15 + ext, 16.5] };
      return base;
    }
  }
}

function figure(color: string, group: number, ph: number, dir: number): { svg: string; w: number; h: number; ax: number; ay: number } {
  const W = 30, H = 44, ax = 15, ay = 38;
  const rig = new Rig(dir, ax, ay);
  const P = pose(group, ph);
  const team = TEAM[color], lt = TEAM_LT[color], dk = mix(team, C.ink, 0.45);
  const parts: { z: number; s: string }[] = [];
  const add = (z: number, s: string) => parts.push({ z, s });
  const P2 = (v: V3): Pt => {
    const q = rig.p(v);
    return [q[0], q[1]];
  };
  const D = (v: V3) => rig.p(v)[2];
  const bob = P.bob;
  const hipU = 10 - P.kneel * 4 + bob, shU = 17.5 - P.kneel * 3 + bob;
  const lean = P.lean;
  // shadow under the feet is a separate sprite; legs
  for (const [foot, side] of [[P.legL, -1], [P.legR, 1]] as [V3, number][]) {
    const hip: V3 = [side * 1.6, 0, hipU];
    const kneeF = P.kneel ? 3.5 * P.kneel : (foot[1] * 0.5);
    const knee: V3 = [side * 1.8, kneeF + 0.8, (hipU + foot[2]) / 2 + (P.kneel ? -2.5 * P.kneel : 0.5)];
    const ft: V3 = P.kneel ? [side * 1.8, foot[1] - P.kneel * 1.5, Math.max(foot[2], 0)] : foot;
    const pts = [P2(hip), P2(knee), P2(ft)];
    add(D(knee) - 0.2, `<path d="${pathOf(pts, false)}" fill="none" stroke="${C.ink}" stroke-width="2.9" stroke-linecap="round" stroke-linejoin="round"/><path d="${pathOf(pts, false)}" fill="none" stroke="#3a3a42" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`);
    // boot
    const fp = P2(ft), toe = P2([ft[0], ft[1] + 1.6, ft[2]]);
    add(D(ft) + 0.05, `<path d="M${f2(fp[0])},${f2(fp[1])}L${f2(toe[0])},${f2(toe[1])}" stroke="${C.ink}" stroke-width="2.2" stroke-linecap="round"/>`);
  }
  // torso (box hull) + armour skirt
  const tors: V3[] = [];
  for (const l of [-3.4, 3.4]) for (const f of [-1.7, 1.7]) {
    tors.push([l * 0.9, f, hipU - 1]);
    tors.push([l, f + lean, shU]);
  }
  const torsoPts = hull(tors.map(P2));
  const tz = D([0, 0, hipU]);
  add(tz, `<path d="${pathOf(torsoPts)}" fill="${team}" stroke="${C.ink}" stroke-width="0.9" stroke-linejoin="round"/>`);
  // armour plates: a darker chest band and a belt
  const belt = hull([[-3, -1.6, hipU + 0.8], [3, -1.6, hipU + 0.8], [-3, 1.6, hipU + 0.8], [3, 1.6, hipU + 0.8], [-2.9, -1.6, hipU - 0.4], [2.9, 1.6, hipU - 0.4], [-2.9, 1.6, hipU - 0.4], [2.9, -1.6, hipU - 0.4]].map((v) => P2(v as V3)));
  add(tz + 0.01, `<path d="${pathOf(belt)}" fill="${C.ink}" opacity="0.85"/>`);
  const chest = hull([[-2.6, 1.6 + lean * 0.8, shU - 1], [2.6, 1.6 + lean * 0.8, shU - 1], [-2.4, 1.6 + lean * 0.5, hipU + 3], [2.4, 1.6 + lean * 0.5, hipU + 3]].map((v) => P2(v as V3)));
  if (rig.fy > -0.3) add(tz + 0.02, `<path d="${pathOf(chest)}" fill="${dk}" opacity="0.55"/>`);
  // tassets (skirt) in light team colour
  const skirt = hull([[-3.2, -1.8, hipU], [3.2, -1.8, hipU], [-3.2, 1.8, hipU], [3.2, 1.8, hipU], [-3.6, -2, hipU - 3.5], [3.6, 2, hipU - 3.5], [-3.6, 2, hipU - 3.5], [3.6, -2, hipU - 3.5]].map((v) => P2(v as V3)));
  add(tz - 0.01, `<path d="${pathOf(skirt)}" fill="${lt}" stroke="${C.ink}" stroke-width="0.7" stroke-linejoin="round"/>`);
  // arms
  for (const [hand, side] of [[P.handL, -1], [P.handR, 1]] as [V3, number][]) {
    const sh: V3 = [side * 3.1, lean, shU - 0.8];
    const h2: V3 = [hand[0], hand[1] + lean * 0.5, hand[2] + bob];
    const el: V3 = [(sh[0] + h2[0]) / 2 + side * 0.8, (sh[1] + h2[1]) / 2 - 0.5, (sh[2] + h2[2]) / 2 - 1];
    const pts = [P2(sh), P2(el), P2(h2)];
    const z = D(el) + (D(el) > tz ? 0.1 : -0.1);
    add(z, `<path d="${pathOf(pts, false)}" fill="none" stroke="${C.ink}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/><path d="${pathOf(pts, false)}" fill="none" stroke="${team}" stroke-width="1.3" stroke-linecap="round"/>`);
    const hp = P2(h2);
    add(z + 0.01, `<circle cx="${f2(hp[0])}" cy="${f2(hp[1])}" r="1" fill="${C.skin}" stroke="${C.ink}" stroke-width="0.5"/>`);
  }
  // head + helmet
  const hd: V3 = [0, lean * 1.2 + (P.headDown ?? 0) * 1.5, shU + 3.6 - (P.headDown ?? 0) * 1.5];
  const hp = P2(hd);
  const hz = D(hd) + 0.3;
  const seeFace = rig.fy > -0.2;
  const faceOff = P2([0, lean * 1.2 + 1.2, hd[2]]);
  let head = `<circle cx="${f2(hp[0])}" cy="${f2(hp[1])}" r="2.7" fill="${seeFace ? C.skin : '#2b2622'}" stroke="${C.ink}" stroke-width="0.8"/>`;
  if (seeFace) head += `<circle cx="${f2(faceOff[0] - 0.8 * (1 - Math.abs(rig.fx)))}" cy="${f2(hp[1] + 0.2)}" r="0.35" fill="${C.ink}"/><circle cx="${f2(faceOff[0] + 0.8 * (1 - Math.abs(rig.fx)))}" cy="${f2(hp[1] + 0.2)}" r="0.35" fill="${C.ink}"/>`;
  // helmet cap and plume
  head += `<path d="M${f2(hp[0] - 3)},${f2(hp[1] - 0.2)} Q${f2(hp[0])},${f2(hp[1] - 4.6)} ${f2(hp[0] + 3)},${f2(hp[1] - 0.2)} L${f2(hp[0] + 2.6)},${f2(hp[1] - 1.1)} Q${f2(hp[0])},${f2(hp[1] - 2.4)} ${f2(hp[0] - 2.6)},${f2(hp[1] - 1.1)}Z" fill="#3a3a3e" stroke="${C.ink}" stroke-width="0.6"/>`;
  const pl = P2([0, hd[1] - 0.8, hd[2] + 3.4]);
  head += `<path d="M${f2(hp[0])},${f2(hp[1] - 3.3)} Q${f2(pl[0] - rig.fx * 2)},${f2(pl[1] - 2)} ${f2(pl[0] - rig.fx * 3.2)},${f2(pl[1] + 0.5)}" fill="none" stroke="${C.cinnabar}" stroke-width="1.4" stroke-linecap="round"/>`;
  add(hz, head);
  // spear
  if (P.spear) {
    const a: V3 = [P.spear.from[0], P.spear.from[1] + (P.dropped ? 0 : lean * 0.5), P.spear.from[2] + (P.dropped ? 0 : bob)];
    const b: V3 = [P.spear.to[0], P.spear.to[1] + (P.dropped ? 0 : lean * 0.5), P.spear.to[2] + (P.dropped ? 0 : bob)];
    const pa = P2(a), pb = P2(b);
    const dx = pb[0] - pa[0], dy = pb[1] - pa[1], L = Math.hypot(dx, dy) || 1;
    const tip: Pt = [pb[0] + (dx / L) * 3.2, pb[1] + (dy / L) * 3.2];
    const nx = -dy / L, ny = dx / L;
    const z = P.dropped ? -10 : Math.max(D(a), D(b)) + 0.4;
    add(z, `<path d="M${f2(pa[0])},${f2(pa[1])}L${f2(pb[0])},${f2(pb[1])}" stroke="${C.ink}" stroke-width="1.5" stroke-linecap="round"/><path d="M${f2(pa[0])},${f2(pa[1])}L${f2(pb[0])},${f2(pb[1])}" stroke="#8a6a42" stroke-width="0.7"/>` +
      `<path d="M${f2(pb[0] + nx * 1.1)},${f2(pb[1] + ny * 1.1)}L${f2(tip[0])},${f2(tip[1])}L${f2(pb[0] - nx * 1.1)},${f2(pb[1] - ny * 1.1)}Z" fill="#d8d8d0" stroke="${C.ink}" stroke-width="0.5"/>` +
      (P.dropped ? '' : `<path d="M${f2(pb[0])},${f2(pb[1])} l${f2(nx * 2)},${f2(ny * 2 + 1)}" stroke="${C.cinnabar}" stroke-width="1.1" stroke-linecap="round"/>`));
  }
  if (P.sparkle) {
    const c = P2([0, 5 + lean, 22 + bob]);
    const r = 1.5 + P.sparkle * 2.5;
    add(99, `<circle cx="${f2(c[0])}" cy="${f2(c[1])}" r="${f2(r + 1.5)}" fill="${C.gold}" opacity="0.35"/><path d="M${f2(c[0] - r)},${f2(c[1])}L${f2(c[0] + r)},${f2(c[1])}M${f2(c[0])},${f2(c[1] - r)}L${f2(c[0])},${f2(c[1] + r)}" stroke="#fff6c8" stroke-width="1" stroke-linecap="round"/>`);
  }
  parts.sort((a, b) => a.z - b.z);
  return { svg: svgDoc(W, H, parts.map((p) => p.s).join('')), w: W, h: H, ax, ay };
}

export function paintGroupIcon(job: FrameJob): PaintOut {
  if (job.name === 'shadow') {
    return { svg: svgDoc(18, 8, `<ellipse cx="9" cy="4" rx="8" ry="3.2" fill="${C.ink}" opacity="0.8"/>`), w: 18, h: 8, ax: 9, ay: 4 };
  }
  const m = /^([bgry])(\d{3})(\d)$/.exec(job.name);
  if (!m) return figure(job.name[0] in TEAM ? job.name[0] : 'b', 0, 0, 8);
  const n = +m[2];
  const j = Math.max(0, Math.floor((n - 1) / 2));
  return figure(m[1], Math.min(5, Math.floor(j / 5)), j % 5, +m[3]);
}

// ------------------------------------------------------------------ ships
function ship(color: string, k: number, dir: number): PaintOut {
  const W = 26, H = 26, ax = 13, ay = 18;
  const [fx, fy] = facing(dir);
  const rx = -fy, ry = fx;
  const team = TEAM[color];
  const group = k <= 5 ? 'wait' : k <= 10 ? 'run' : k <= 15 ? 'active' : k <= 20 ? 'lose' : k <= 25 ? 'wait' : 'fight';
  const ph = (k - 1) % 5;
  const bob = group === 'lose' ? ph * 1.2 : Math.sin((ph / 5) * Math.PI * 2) * 0.5;
  const tilt = group === 'lose' ? ph * 0.12 : 0;
  const P = (l: number, f: number, u: number): Pt => [ax + rx * l + fx * f, ay + (ry * l + fy * f) * 0.5 - u + bob];
  const parts: string[] = [];
  // wake
  if (group === 'run') for (let w = 0; w < 2; w++) {
    const a = P(-3 - w * 1.5, -8 - w * 3 - ph, 0), b = P(3 + w * 1.5, -8 - w * 3 - ph, 0), c = P(0, -5, 0);
    parts.push(`<path d="M${f2(a[0])},${f2(a[1])}Q${f2(c[0])},${f2(c[1])} ${f2(b[0])},${f2(b[1])}" fill="none" stroke="${C.white}" stroke-width="0.9" opacity="${f2(0.8 - w * 0.3)}"/>`);
  }
  // hull: pointed bow, square stern, raised sides
  const deck: Pt[] = [P(0, 8, 2), P(2.6, 4, 2), P(2.8, -5, 2.4), P(-2.8, -5, 2.4), P(-2.6, 4, 2)];
  const keel: Pt[] = [P(0, 7, 0), P(1.8, 3.5, -0.5), P(2, -4.5, 0), P(-2, -4.5, 0), P(-1.8, 3.5, -0.5)];
  const hullPts = hull([...deck, ...keel]);
  parts.push(`<path d="${pathOf(hullPts)}" fill="#6a4a30" stroke="${C.ink}" stroke-width="0.8" stroke-linejoin="round"/>`);
  parts.push(`<path d="${pathOf(deck)}" fill="#9a7650" stroke="${C.ink}" stroke-width="0.6" stroke-linejoin="round"/>`);
  // stern cabin
  const cab = hull([P(-2, -4.6, 2.4), P(2, -4.6, 2.4), P(-2, -2, 2.4), P(2, -2, 2.4), P(-2, -4.6, 5), P(2, -4.6, 5), P(-2, -2, 5), P(2, -2, 5)]);
  // mast and battened sail (sail plane perpendicular to the hull, tilts when sinking)
  const mb = P(0, 1, 2.4), mt = P(0 + tilt * 6, 1, 15 - tilt * 4);
  // the sail always shows its face (a billboard on the mast)
  const B = (dx: number, u: number): Pt => [mb[0] + dx, mb[1] - u + 2.4];
  const sail = [B(-4.6 + tilt * 5, 14 - tilt * 4), B(4.6 + tilt * 5, 14.6 - tilt * 4), B(4 + tilt * 3, 5.5), B(-4 + tilt * 3, 5)];
  const behind = fy < 0; // sailing away: sail drawn after cabin
  const cabS = `<path d="${pathOf(cab)}" fill="#7a5a3c" stroke="${C.ink}" stroke-width="0.6"/>`;
  const sailS = `<path d="M${f2(mb[0])},${f2(mb[1])}L${f2(mt[0])},${f2(mt[1])}" stroke="${C.ink}" stroke-width="1"/><path d="${pathOf(sail)}" fill="${group === 'lose' && ph >= 3 ? mix(team, '#555', 0.6) : team}" fill-opacity="0.92" stroke="${C.ink}" stroke-width="0.7" stroke-linejoin="round"/>` +
    [0.33, 0.66].map((f) => { const a = lerp(sail[0], sail[3], f), b = lerp(sail[1], sail[2], f); return `<path d="M${f2(a[0])},${f2(a[1])}L${f2(b[0])},${f2(b[1])}" stroke="${C.ink}" stroke-width="0.4" opacity="0.7"/>`; }).join('');
  parts.push(behind ? sailS + cabS : cabS + sailS);
  if (group === 'fight' || group === 'active') {
    const c = P(0, 8, 4);
    if (group === 'fight' && ph % 2 === 0) parts.push(`<circle cx="${f2(c[0])}" cy="${f2(c[1])}" r="2.2" fill="${C.gold}" opacity="0.8"/>`);
  }
  if (group === 'lose' && ph >= 1) {
    const c = P(0, 0, 8);
    parts.push(`<circle cx="${f2(c[0] - 2)}" cy="${f2(c[1] - ph * 2)}" r="${f2(1.5 + ph * 0.6)}" fill="#555" opacity="0.5"/>`);
  }
  // water line
  const wl = P(0, 0, 0);
  parts.unshift(`<ellipse cx="${f2(wl[0])}" cy="${f2(wl[1] + 1 - bob)}" rx="10" ry="3.2" fill="${C.white}" opacity="0.35"/>`);
  return { svg: svgDoc(W, H, parts.join('')), w: W, h: H, ax, ay };
}
const lerp = (a: Pt, b: Pt, f: number): Pt => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];

export function paintShip(job: FrameJob): PaintOut {
  const m = /^b([bgry])(\d{3})(\d)$/.exec(job.name);
  if (!m) return ship('b', 1, 8);
  return ship(m[1], +m[2], +m[3]);
}

// ------------------------------------------------------------------ camps
export function paintCamp(job: FrameJob): PaintOut {
  const m = /^icon([br])000(\d)$/.exec(job.name);
  const blue = m?.[1] !== 'r';
  const k = +(m?.[2] ?? 1) - 1;
  const W = 112, H = 72, ax = 56, ay = 50;
  const r = rng(hash('camp'));
  const P = (s: number, t: number, z = 0): Pt => [ax + (s - t) * 48, ay + (s + t - 1) * 18 - z];
  const team = blue ? TEAM.b : TEAM.r;
  const parts: string[] = [];
  parts.push(`<ellipse cx="${ax}" cy="${ay + 1}" rx="42" ry="13" fill="#5a4a36" opacity="0.18"/>`);
  // palisade ring (back half first)
  const stakes: { z: number; s: string }[] = [];
  for (let a = 0; a < 26; a++) {
    const ang = (a / 26) * Math.PI * 2;
    const s = 0.5 + Math.cos(ang) * 0.42, t = 0.5 + Math.sin(ang) * 0.42;
    if (Math.abs(ang - Math.PI * 0.25) < 0.3) continue; // the camp gate (front)
    const b = P(s, t), top = P(s, t, 7 + (a % 2));
    stakes.push({ z: s + t, s: `<path d="M${f2(b[0])},${f2(b[1])}L${f2(top[0])},${f2(top[1])}" stroke="#5a4028" stroke-width="1.6" stroke-linecap="round"/>` });
  }
  // tents: ridge tents with ink outlines
  const tent = (s: number, t: number, sz: number, col: string) => {
    const a = P(s - 0.1 * sz, t + 0.08 * sz), b = P(s + 0.1 * sz, t + 0.08 * sz), c = P(s + 0.1 * sz, t - 0.08 * sz);
    const top1 = P(s - 0.1 * sz, t, 11 * sz), top2 = P(s + 0.1 * sz, t, 11 * sz);
    return { z: s + t, s: `<path d="M${f2(a[0])},${f2(a[1])}L${f2(b[0])},${f2(b[1])}L${f2(top2[0])},${f2(top2[1])}L${f2(top1[0])},${f2(top1[1])}Z" fill="${col}" stroke="${C.ink}" stroke-width="0.8" stroke-linejoin="round"/><path d="M${f2(b[0])},${f2(b[1])}L${f2(c[0])},${f2(c[1])}L${f2(top2[0])},${f2(top2[1])}Z" fill="${mix(col, C.ink, 0.25)}" stroke="${C.ink}" stroke-width="0.8" stroke-linejoin="round"/><path d="M${f2((a[0] + b[0]) / 2)},${f2((a[1] + b[1]) / 2)}L${f2((top1[0] + top2[0]) / 2)},${f2((top1[1] + top2[1]) / 2 + 3)}" stroke="${C.ink}" stroke-width="0.6"/>` };
  };
  const items = [...stakes, tent(0.35, 0.4, 1, '#e8dfc6'), tent(0.62, 0.32, 0.85, '#ddd1b2'), tent(0.4, 0.68, 0.85, '#ddd1b2')];
  items.sort((a, b) => a.z - b.z);
  parts.push(...items.map((x) => x.s));
  // the great banner (帥旗), waving through 4 frames
  const pole = P(0.62, 0.62), ptop = P(0.62, 0.62, 44);
  parts.push(`<path d="M${f2(pole[0])},${f2(pole[1])}L${f2(ptop[0])},${f2(ptop[1])}" stroke="${C.ink}" stroke-width="1.8"/>`);
  const wv = [0, 1.6, 0.4, -1.4][k];
  const fx0 = ptop[0] + 1, fy0 = ptop[1] + 1;
  parts.push(`<path d="M${f2(fx0)},${f2(fy0)} Q${f2(fx0 + 9)},${f2(fy0 + wv)} ${f2(fx0 + 19)},${f2(fy0 + 2 - wv)} L${f2(fx0 + 18)},${f2(fy0 + 16 - wv)} Q${f2(fx0 + 9)},${f2(fy0 + 15 + wv)} ${f2(fx0)},${f2(fy0 + 15)}Z" fill="${team}" stroke="${C.ink}" stroke-width="0.9"/>`);
  parts.push(`<path d="M${f2(fx0 + 18)},${f2(fy0 + 2 - wv)} l2,3 -2,3 2,3 -2,3" fill="none" stroke="${C.gold}" stroke-width="1"/>`);
  // a small fire with smoke
  const fp = P(0.52, 0.52);
  parts.push(`<path d="M${f2(fp[0] - 2.5)},${f2(fp[1])} Q${f2(fp[0])},${f2(fp[1] - 6 - (k % 2) * 1.5)} ${f2(fp[0] + 2.5)},${f2(fp[1])}Z" fill="${C.cinnabar}" opacity="0.9"/><circle cx="${f2(fp[0] + k)}" cy="${f2(fp[1] - 10 - k * 2)}" r="${f2(2 + k * 0.5)}" fill="#7a746a" opacity="${f2(0.4 - k * 0.07)}"/>`);
  void r;
  return { svg: svgDoc(W, H, parts.join('')), w: W, h: H, ax, ay };
}
