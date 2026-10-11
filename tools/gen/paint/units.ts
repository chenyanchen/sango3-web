// Battle unit sprites: generals (bf/general/NNN), their weapon-trail glows
// (bf/general/light*), mounts (bf/horse/NNN), soldiers with their mounts
// (bf/sol/NNN), gore pieces (bf/sol/body), ground shadows (bf/shadow) and
// projectiles (bf/flyweapon/*). Everything is drawn from a procedural rig:
// keyframed poses per animation → skeleton → ink-wash SVG.
import { C, hash, mix, rng } from '../ink.ts';
import type { FrameJob, PaintOut, Painter } from '../types.ts';
import { drawFigure, WEAPON_GEO, type Look } from './_units_figure.ts';
import { generalLook } from './_units_looks.ts';
import { G, generalPose, generalSlot, READY, type GenFrame } from './_units_poses.ts';
import { add, Canvas, DIMS, len, mul, solve, sub, type Pose, type V } from './_units_rig.ts';
import { paintMount, paintSoldier, soldierMatch } from './_units_sol.ts';
import { paintBody, paintFly, paintShadow, paintLight } from './_units_misc.ts';

const SHORT = (L: Look) => WEAPON_GEO[L.weapon].L < 70;

/** Adapts a polearm pose to the set's weapon (short weapons: one hand). */
export function adaptPose(p: Pose, L: Look, slot: GenFrame): Pose {
  if (!SHORT(L) || p.mode !== 0) return p;
  if (!p.g2) return p;
  const striking = slot.anim.startsWith('attack') && p.lean > 10;
  return { ...p, g2: 0, h2: striking ? [-14, -22] : slot.anim === 'defend' ? [24, -30] : [4, -20] };
}

/** World tip of the weapon for a general pose (used for swooshes and light trails). */
export function tipOf(p: Pose, L: Look, s: number, org: V): V {
  const sk = solve(p, DIMS, org, s);
  const g = WEAPON_GEO[L.weapon === 'none' ? 'spear' : L.weapon];
  return add(sk.W1, mul(sk.wd, (g.L - g.B) * s * 0.92));
}

/** Pose at a fractional frame index of a general animation (for motion arcs). */
export function generalPoseAt(slot: GenFrame, fi: number, L: Look): Pose {
  return adaptPose(generalPose({ ...slot, i: Math.max(0, fi) }), L, slot);
}


/** Pale ink smear following the weapon tip from the previous frame (strike readability). */
export function drawSwoosh(cv: Canvas, pts: V[], s: number, color = C.inkWash, op = 0.42) {
  if (pts.length < 3) return;
  const n = pts.length;
  // crescent: wide at the newest end
  const L: V[] = [], R: V[] = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    const d = sub(b, a);
    const l = len(d) || 1;
    const nx: V = [-d[1] / l, d[0] / l];
    const w = (i / (n - 1)) ** 1.6 * 9 * s;
    L.push(add(pts[i], mul(nx, w * 0.25)));
    R.push(add(pts[i], mul(nx, -w)));
  }
  cv.shape([...L, ...R.reverse()], color, undefined, 0, true, op);
  cv.curve(pts.slice(Math.floor(n * 0.35)), 1.4 * s, C.ink, 0.55);
}

function paintGeneral(job: FrameJob): PaintOut {
  const m = /^(s_)?(com|dom)(\d\d)(\d{4})$/.exec(job.name);
  const set = +job.dir.slice(-3);
  const gl = generalLook(set);
  const L = gl.look;
  const num = m ? +m[4] : 179;
  const slot = generalSlot(num, gl.barb);
  const r = rng(hash(job.dir) ^ num);
  const s = 1;
  const org: V = [0, 0]; // anchor = neutral pelvis (saddle point)
  if (m?.[1]) return deathShadow(slot, L, s);
  const p = adaptPose(generalPose(slot), L, slot);
  const cv = new Canvas();
  const isAtk = slot.anim.startsWith('attack');
  // motion arc on fast frames
  if (isAtk && slot.i > 0 && p.mode === 0) {
    const pts: V[] = [];
    for (let k = 0; k <= 8; k++) pts.push(tipOf(generalPoseAt(slot, slot.i - 1 + k / 8, L), L, s, org));
    let d = 0;
    for (let k = 1; k < pts.length; k++) d += len(sub(pts[k], pts[k - 1]));
    const near = slot.ev >= 0 && slot.i >= slot.ev - 2 && slot.i <= slot.ev + 1;
    if ((near && d > 38) || d > 110) drawSwoosh(cv, pts, s, C.inkWash, Math.min(0.5, 0.18 + d / 400));
  }
  const sk = solve(p, DIMS, org, s);
  const dropped = p.mode === 2 ? droppedWeapon(slot, p, s) : null;
  cv.wash = { seed: hash(job.dir), edge: 1.4, mottle: 0.22 };
  drawFigure(cv, sk, p, L, DIMS, s, r, { t: num / 4, dropped, tassel: L.plumeColor === C.cinnabar ? C.cinnabar : mix(L.armor2, C.cinnabar, 0.5) });
  return cv.out(true, 3, 4, 4, 1);
}

function droppedWeapon(slot: GenFrame, p: Pose, s: number): { at: V; dir: V } {
  // the weapon falls in front and lies on the ground
  const k = Math.min(1, (slot.i - 1) / 3);
  const ground = (G + 1) * s;
  const x0 = slot.anim === 'die2' ? 22 : -14;
  const at: V = [x0 * s, ground - 2 * s - (1 - k) * 30 * s];
  const a = (1 - k) * 1.2 + k * 0.04;
  void p;
  return { at, dir: [Math.cos(a), -Math.sin(a) * 0.4] };
}

/** s_comNNxxxx: flat ink shadow of the dying body on the ground. */
function deathShadow(slot: GenFrame, L: Look, s: number): PaintOut {
  const p = adaptPose(generalPose(slot), L, slot);
  const sk = solve(p, DIMS, [0, 0], s);
  const xs = [sk.H[0], sk.A1[0], sk.A2[0], sk.W1[0], sk.P[0]];
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const cv = new Canvas();
  cv.ellipse([(x0 + x1) / 2, (G + 3) * s], (x1 - x0) / 2 + 8, 5, 0, C.ink, undefined, 0, 0.8);
  return cv.out(true, 1);
}

export const painters: Painter[] = [
  {
    id: 'units-general',
    match: (d) => /^bf\/general\/\d+$/.test(d),
    paint: paintGeneral,
  },
  {
    id: 'units-light',
    match: (d) => d.startsWith('bf/general/light'),
    paint: paintLight,
  },
  {
    id: 'units-mount',
    match: (d) => d.startsWith('bf/horse/'),
    paint: paintMount,
  },
  {
    id: 'units-soldier',
    match: soldierMatch,
    paint: paintSoldier,
  },
  {
    id: 'units-misc',
    match: (d) => d === 'bf/sol/body' || d === 'bf/shadow' || d.startsWith('bf/flyweapon'),
    paint: (j) => (j.dir === 'bf/sol/body' ? paintBody(j) : j.dir === 'bf/shadow' ? paintShadow(j) : paintFly(j)),
  },
];
void READY;
