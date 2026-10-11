// Soldiers (bf/sol/NNN: foot troops, riders with their mounts, riderless
// mounts) and the generals' mounts (bf/horse/NNN).
import { C, hash, mix, rng } from '../ink.ts';
import type { FrameJob, PaintOut } from '../types.ts';
import { BDIM, downPose, drawBeast, gaitPose, STAND, type BeastKind, type BeastLook, type BeastPose } from './_units_beast.ts';
import { drawFigure, WEAPON_GEO } from './_units_figure.ts';
import { soldierKind, TEAM, type SoldierKind } from './_units_looks.ts';
import { G, gallopBob, generalSlot, saddleLeft, soldierPose, type SolFrame } from './_units_poses.ts';
import { add, Canvas, DIMS, len, lerpV, mul, solve, sub, type V } from './_units_rig.ts';

export const soldierMatch = (d: string) => /^bf\/sol\/\d+/.test(d);

// ------------------------------------------------------------------ mounts
// coats follow the horse items (data/_rules_items.ts HORSES, object 38000 + NN)
const HORSE_LOOKS: Record<number, Partial<BeastLook>> = {
  1: { coat: '#8a6a4a', mane: '#3b2f22', cloth: '#7a6a52', trim: '#b8a57a' }, // 驽马
  2: { coat: '#a3aaab', mane: '#2a2520', dapple: '#6f777a' }, // 青骢马
  3: { coat: '#d4ab5a', mane: '#efe2c0', dapple: '#f4ead2' }, // 黄骠马
  4: { coat: '#8e3f2a', mane: '#1a1410' }, // 枣骝马
  5: { coat: '#2e2a26', mane: '#0e0c0a', cloth: '#b13a2a' }, // 乌骓
  6: { coat: '#f0ebe0', mane: '#d2ccbf', cloth: '#34577e' }, // 白龙驹
  7: { coat: '#c4823e', mane: '#7a4a22', cloth: '#3d6e57' }, // 宛驹
  8: { coat: '#2f2a26', mane: '#14110e', socks: true }, // 踏雪
  9: { coat: '#7d3a48', mane: '#3a1420', cloth: C.gold }, // 紫骍马
  10: { coat: '#7a4a2a', mane: '#14110e', socks: true, cloth: '#5c3f68' }, // 西凉马
  11: { coat: '#c8452c', mane: '#e07a2a', cloth: '#2f2c28' }, // 赤骥
  12: { coat: '#d9a83a', mane: '#e8602a', horns: true, cloth: '#b13a2a', barding: false }, // 飞黄
  13: { coat: '#9a4a2c', mane: '#120e0b', cloth: '#34577e', barding: true }, // 骅骝
  14: { coat: '#e2c27a', mane: '#fbf6ea', blaze: true, cloth: '#b13a2a' }, // 逐日
};

function horseLook(set: number): BeastLook {
  return { kind: 'horse', coat: '#8a5a34', mane: '#1f1812', cloth: '#9e3a2c', trim: C.gold, barding: false, socks: false, blaze: false, ...HORSE_LOOKS[set] };
}

/** General mount pose for a rider frame slot. */
function mountPoseForGeneral(kind: BeastKind, anim: string, i: number, n: number): BeastPose {
  const p = STAND(kind);
  const ph = i / Math.max(1, n);
  switch (anim) {
    case 'walk':
      return gaitPose(kind, ph, gallopBob(ph));
    case 'die':
      return downPose(kind, i / (n - 1));
    case 'die2':
      return downPose(kind, i / (n - 1), true);
    case 'hurt':
      return { ...p, neck: 14 * (1 - i / 3), pitch: 2, roar: 1 - i / 3 };
    case 'charge':
      return { ...p, neck: 6 + i * 3, roar: i >= 2 ? 1 : 0, hooves: [i >= 1 ? [p.hooves[0][0] + 6, -10 - i * 2] : p.hooves[0], p.hooves[1], p.hooves[2], p.hooves[3]], trunk: i / 3 };
    case 'defend':
      return { ...p, neck: 6, pitch: -1 };
    default: {
      // idle / attacks: weight shifts, head and tail moving
      const k = Math.sin(i * 0.9 + (anim.length % 5));
      return { ...p, neck: 3 * k, nod: 2 * Math.sin(i * 0.6), tail: 0.15 * k, pitch: anim.startsWith('attack') ? 1.5 * Math.sin((i / n) * Math.PI) : 0, trunk: anim.startsWith('attack') ? 0.5 * Math.sin((i / n) * Math.PI) : 0.1 };
    }
  }
}

export function paintMount(job: FrameJob): PaintOut {
  const set = +job.dir.slice(-3);
  const look = horseLook(set);
  const r = rng(hash(job.dir + job.name));
  let anim = 'wait', i = 0, n = 4;
  const big = /^hs(\d\d)(\d)(\d{4})$/.exec(job.name);
  const small = /^hs(\d\d)(\d{4})$/.exec(job.name);
  if (big) {
    const g = +big[2];
    i = +big[3] - 1;
    [anim, n] = g === 1 ? ['wait', 6] : g === 2 ? ['die2', 10] : g === 3 ? ['die', 10] : ['walk', 12];
  } else if (small) {
    const sl = generalSlot(+small[2], false);
    anim = sl.anim;
    i = sl.i;
    n = sl.n;
  }
  const p = mountPoseForGeneral(look.kind, anim, i, n);
  const cv = new Canvas();
  cv.wash = { seed: hash(job.dir), edge: 1.4, mottle: 0.22 };
  drawBeast(cv, look, p, 1, r, i / n);
  return cv.out(true, 2);
}

// ------------------------------------------------------------------ soldiers
function mountLookFor(k: SoldierKind): { look: BeastLook; s: number } | null {
  if (!k.mount) return null;
  const T = TEAM[k.side];
  const base: BeastLook = { kind: 'horse', coat: '#8a5a34', mane: '#1f1812', cloth: T.main, trim: C.gold, barding: false, socks: false, blaze: false };
  switch (k.mount) {
    case 'horse':
      return { look: { ...base, coat: k.type === 1 ? '#5a3a26' : k.type === 6 ? '#a4673a' : '#8a5a34', blaze: k.type === 1, socks: k.type === 6 }, s: 0.84 };
    case 'barded':
      return { look: { ...base, coat: '#d8d2c6', mane: '#6b6255', barding: true }, s: 0.86 };
    case 'tiger':
      return { look: { ...base, kind: 'tiger', coat: '#d9893a', mane: '#3b342b', stripes: true }, s: 1.0 };
    case 'elephant':
      return { look: { ...base, kind: 'elephant', coat: '#8f8b85', mane: '#3b342b', cloth: T.main }, s: 0.98 };
  }
}

/** Mount pose while carrying a soldier. */
function mountPoseForSoldier(kind: BeastKind, f: SolFrame): BeastPose {
  const p = STAND(kind);
  switch (f.anim) {
    case 'walk':
      return gaitPose(kind, f.i / 12, gallopBob(f.i / 12));
    case 'attack':
    case 'attack2': {
      const e = Math.max(0, 1 - Math.abs(f.i - 8) / 4);
      if (kind === 'tiger') return { ...p, roar: e, neck: 8 * e, hooves: [[p.hooves[0][0] + 8 * e, -12 * e], p.hooves[1], p.hooves[2], p.hooves[3]] };
      if (kind === 'elephant') return { ...p, trunk: e, neck: 6 * e, roar: e };
      return { ...p, pitch: 2 * e, neck: -4 * e, hooves: [[p.hooves[0][0] + 5 * e, -6 * e], p.hooves[1], p.hooves[2], p.hooves[3]] };
    }
    case 'hurt':
      return { ...p, neck: 4 * f.i, roar: f.i / 3, pitch: -0.5 * f.i };
    case 'defend':
      return { ...p, neck: 2 * f.i, pitch: -0.4 * f.i };
    default: {
      const k = Math.sin((f.i / 4) * Math.PI * 2);
      return { ...p, neck: 2 * k, tail: 0.15 * k, trunk: 0.1 + 0.1 * k };
    }
  }
}

function parseSol(name: string): { shadow: boolean; act: string; v: number; mountAnim: number; idx: number } | null {
  const m = /^(s_)?[a-i]([12])([a-z])(\d)(_)?(\d)?(\d{4})$/.exec(name);
  if (!m) return null;
  if (m[5]) return { shadow: !!m[1], act: m[3], v: +m[4], mountAnim: +m[4], idx: +m[7] };
  return { shadow: !!m[1], act: m[3], v: +m[4], mountAnim: 0, idx: +m[7] };
}

function solFrame(act: string, v: number, idx: number): SolFrame {
  const i = idx - 1;
  switch (act) {
    case 'w':
      return { anim: 'wait', i: i % 4, n: 4 };
    case 'r':
      return { anim: 'walk', i: i % 12, n: 12 };
    case 'a':
      return { anim: v === 3 ? 'attack2' : 'attack', i: Math.min(i, 13), n: 14 };
    case 'b':
      return { anim: 'attack2', i: Math.min(i, 13), n: 14 };
    case 'd':
      return { anim: 'defend', i: Math.min(3, i), n: 4 };
    case 'h':
      return { anim: 'hurt', i: Math.min(3, i), n: 4 };
    case 'f':
      return { anim: v === 1 ? 'die2' : v === 2 ? 'die3' : v === 3 ? 'die' : 'die4', i: Math.min(9, i), n: 10 };
  }
  return { anim: 'wait', i: 0, n: 4 };
}

export function paintSoldier(job: FrameJob): PaintOut {
  const dirNum = +(/^bf\/sol\/(\d+)/.exec(job.dir)?.[1] ?? 1);
  const k = soldierKind(dirNum);
  const r = rng(hash(job.dir + job.name));
  const ps = parseSol(job.name);
  const cv = new Canvas();
  if (!job.name.startsWith('s_')) cv.wash = { seed: hash(job.dir), edge: 1.2, mottle: 0.2 };
  if (!ps) return cv.out(true);
  const s = k.s;
  const ml = mountLookFor(k);
  // riderless mount frames (x?f1_ die, f2_/f3_ gallop)
  if (ps.mountAnim) {
    const mlook = ml?.look ?? mountLookFor({ ...k, mount: 'horse' })!.look;
    const ms = ml?.s ?? 0.84;
    const i = ps.idx - 1;
    const p = ps.mountAnim === 1 ? downPose(mlook.kind, i / 9, true) : gaitPose(mlook.kind, i / 10, gallopBob(i / 10));
    drawBeast(cv, mlook, p, ms, r, i / 10);
    return cv.out(true, 2);
  }
  const f = solFrame(ps.act, ps.v, ps.idx);
  const dying = f.anim.startsWith('die');
  const mounted = !!ml && !dying;
  const pose = soldierPose(k.cls, f, !!ml && !dying);
  // pelvis origin
  const footOrg: V = [0, -(G + 1) * s];
  let org = footOrg;
  let mp: { look: BeastLook; p: BeastPose; ms: number } | null = null;
  if (ml) {
    const d = BDIM[ml.look.kind];
    const seat: V = [d.saddleX * ml.s, -d.saddleH * ml.s];
    if (mounted) {
      const p = mountPoseForSoldier(ml.look.kind, f);
      mp = { look: ml.look, p, ms: ml.s };
    } else {
      org = lerpV(footOrg, seat, saddleLeft(f));
    }
  }
  if (ps.shadow) {
    const sk = solve(pose, DIMS, org, s);
    const xs = [sk.H[0], sk.A1[0], sk.A2[0], sk.P[0]];
    const x0 = Math.min(...xs), x1 = Math.max(...xs);
    cv.ellipse([(x0 + x1) / 2, 0], (x1 - x0) / 2 + 6, 3.5, 0, C.ink, undefined, 0, 0.8);
    return cv.out(true, 1);
  }
  const t = f.i / f.n;
  const tassel = TEAM[k.side].main;
  if (mp) {
    // the mount: draw its back layer first, then rider back parts, then mount front, then rider
    const tmp = new Canvas();
    const seatW = drawBeast(tmp, mp.look, mp.p, mp.ms, r, t, 'back').seat;
    const sk = solve(pose, DIMS, add(seatW, [0, 1.5 * s]), s);
    drawBeast(cv, mp.look, mp.p, mp.ms, rng(hash(job.name)), t, 'back');
    drawFigure(cv, sk, pose, k.look, DIMS, s, r, { t, layer: 'back', noFarLeg: true, tassel });
    drawBeast(cv, mp.look, mp.p, mp.ms, rng(hash(job.name)), t, 'front');
    if (f.anim.startsWith('attack')) swoosh(cv, k, f, pose, add(seatW, [0, 1.5 * s]), s, true);
    drawFigure(cv, sk, pose, k.look, DIMS, s, r, { t, layer: 'front', noFarLeg: true, tassel });
    return cv.out(true, 2);
  }
  if (f.anim.startsWith('attack')) swoosh(cv, k, f, pose, org, s, false);
  const sk = solve(pose, DIMS, org, s);
  const dropped = pose.mode === 2 ? { at: [(f.anim === 'die3' || f.anim === 'die4' ? 22 : -14) * s, -3 * s] as V, dir: [f.anim === 'die3' || f.anim === 'die4' ? 1 : -1, 0.04] as V } : null;
  drawFigure(cv, sk, pose, k.look, DIMS, s, r, { t, dropped, tassel });
  return cv.out(true, 2);
}

function swoosh(cv: Canvas, k: SoldierKind, f: SolFrame, pose: ReturnType<typeof soldierPose>, org: V, s: number, mounted: boolean) {
  if (k.cls === 'bow' || k.cls === 'xbow' || f.i === 0 || pose.mode !== 0) return;
  const g = WEAPON_GEO[k.look.weapon];
  const pts: V[] = [];
  for (let q = 0; q <= 6; q++) {
    const p = soldierPose(k.cls, { ...f, i: f.i - 1 + q / 6 }, mounted);
    const sk = solve(p, DIMS, org, s);
    pts.push(add(sk.W1, mul(sk.wd, (g.L - g.B) * s * 0.92)));
  }
  let d = 0;
  for (let q = 1; q < pts.length; q++) d += len(sub(pts[q], pts[q - 1]));
  if (d < 26) return;
  const n = pts.length;
  const L: V[] = [], R: V[] = [];
  for (let q = 0; q < n; q++) {
    const a = pts[Math.max(0, q - 1)], b = pts[Math.min(n - 1, q + 1)];
    const dd = sub(b, a);
    const l = len(dd) || 1;
    const nx: V = [-dd[1] / l, dd[0] / l];
    const w = (q / (n - 1)) ** 1.5 * 7 * s;
    L.push(add(pts[q], mul(nx, w * 0.3)));
    R.push(add(pts[q], mul(nx, -w)));
  }
  cv.shape([...L, ...R.reverse()], mix(C.inkWash, C.paper, 0.2), undefined, 0, true, Math.min(0.5, 0.15 + d / 300));
}
