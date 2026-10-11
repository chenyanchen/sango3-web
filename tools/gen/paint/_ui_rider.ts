// Map rider (ad/sprite, object 5100): a tiny mounted general in ink, facing
// right, anchored at the hooves. wait (w) / run (r, gallop) / fight (a, spear
// swing and thrust) / win (v, raising a banner).
import type { FrameJob, PaintOut } from '../types.ts';
import { C, f2, svgDoc } from '../ink.ts';

const HORSE = '#2a221c';
const HORSE_HI = '#5a4636';
const CLOAK = '#b8322a';
const ARMOR = '#3f5f86';

type Pose = { bob: number; legs: [number, number, number, number]; knee: number; tail: number; head: number; spear: number; thrust: number; banner: number; lean: number };

function leg(hx: number, hy: number, a: number, knee: number) {
  // two segments, angle a (deg from vertical, + = forward)
  const r = (d: number) => (d * Math.PI) / 180;
  const k: [number, number] = [hx + Math.sin(r(a)) * 4.6, hy + Math.cos(r(a)) * 4.6];
  const b = a - knee * Math.sign(a || 1);
  const f: [number, number] = [k[0] + Math.sin(r(b)) * 4.4, k[1] + Math.cos(r(b)) * 4.4];
  return `<path d="M${f2(hx)},${f2(hy)} L${f2(k[0])},${f2(k[1])} L${f2(f[0])},${f2(f[1])}" fill="none" stroke="${HORSE}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>`;
}

function rider(p: Pose) {
  const by = -11 + p.bob;
  let s = '';
  // far legs (lighter), tail, body, neck/head, near legs
  s += `<g opacity="0.75">${leg(4.5, by + 2, p.legs[1], p.knee)}${leg(-5, by + 2, p.legs[3], p.knee)}</g>`;
  s += `<path d="M-7,${f2(by - 1)} Q${f2(-11 - p.tail)},${f2(by - 1)} ${f2(-11.5 - p.tail * 1.5)},${f2(by + 5)}" fill="none" stroke="${HORSE}" stroke-width="2" stroke-linecap="round"/>`;
  s += `<ellipse cx="0" cy="${f2(by)}" rx="7.6" ry="3.7" fill="${HORSE}"/>`;
  s += `<path d="M-5,${f2(by - 2.2)} Q0,${f2(by - 3.8)} 5,${f2(by - 2.2)}" fill="none" stroke="${HORSE_HI}" stroke-width="0.9"/>`;
  const hy = by - 7 + p.head;
  s += `<path d="M4.5,${f2(by - 2.5)} L${f2(8.2)},${f2(hy)} L${f2(10.2)},${f2(hy - 0.4)} L${f2(13.2)},${f2(hy + 3)} L${f2(12.4)},${f2(hy + 4.1)} L${f2(9.6)},${f2(hy + 2.6)} L7.6,${f2(by + 1)}Z" fill="${HORSE}"/>`;
  s += `<path d="M8.4,${f2(hy - 0.4)} L9,${f2(hy - 2.2)} L9.8,${f2(hy - 0.2)}Z" fill="${HORSE}"/>`;
  s += `<path d="M5.4,${f2(by - 3)} Q7,${f2(hy - 1)} 8.6,${f2(hy - 0.8)}" fill="none" stroke="#120e0a" stroke-width="1.4"/>`;
  // saddle cloth
  s += `<path d="M-3.5,${f2(by - 3.2)} L2.5,${f2(by - 3.2)} L2,${f2(by + 1.2)} L-3,${f2(by + 1.2)}Z" fill="${CLOAK}"/>`;
  s += `${leg(5.5, by + 2, p.legs[0], p.knee)}${leg(-4, by + 2, p.legs[2], p.knee)}`;
  // rider
  const rx = -0.5 + p.lean, ry = by - 3.5;
  s += `<path d="M${f2(rx - 1.5)},${f2(ry)} Q${f2(rx - 6 - p.tail)},${f2(ry - 2)} ${f2(rx - 7 - p.tail * 1.4)},${f2(ry + 2)} L${f2(rx - 1)},${f2(ry + 1)}Z" fill="${CLOAK}"/>`;
  s += `<path d="M${f2(rx - 1.6)},${f2(ry + 0.5)} L${f2(rx + p.lean * 0.3 - 0.4)},${f2(ry - 6)} L${f2(rx + p.lean * 0.3 + 2)},${f2(ry - 6)} L${f2(rx + 1.6)},${f2(ry + 0.5)}Z" fill="${ARMOR}" stroke="${C.ink}" stroke-width="0.5"/>`;
  s += `<circle cx="${f2(rx + p.lean * 0.3 + 0.9)}" cy="${f2(ry - 7.6)}" r="1.6" fill="${C.skin}" stroke="${C.ink}" stroke-width="0.4"/>`;
  s += `<path d="M${f2(rx + p.lean * 0.3 - 0.8)},${f2(ry - 8)} Q${f2(rx + p.lean * 0.3 + 0.9)},${f2(ry - 10.6)} ${f2(rx + p.lean * 0.3 + 2.6)},${f2(ry - 8)}Z" fill="${C.ink}"/>`;
  s += `<path d="M${f2(rx + p.lean * 0.3 + 0.9)},${f2(ry - 10)} L${f2(rx + p.lean * 0.3 + 0.6)},${f2(ry - 12)}" stroke="${CLOAK}" stroke-width="0.9"/>`;
  // weapon / banner from the hand
  const hx = rx + 2 + p.thrust, hyy = ry - 3.5;
  if (p.banner > 0) {
    const top = hyy - p.banner;
    s += `<path d="M${f2(hx)},${f2(hyy + 4)} L${f2(hx)},${f2(top)}" stroke="#4a2a14" stroke-width="1"/>`;
    s += `<path d="M${f2(hx)},${f2(top + 0.5)} L${f2(hx - 7)},${f2(top + 1.5)} L${f2(hx - 5.5)},${f2(top + 3.8)} L${f2(hx - 7)},${f2(top + 6)} L${f2(hx)},${f2(top + 5.5)}Z" fill="${CLOAK}" stroke="${C.ink}" stroke-width="0.4"/>`;
  } else {
    const a = (p.spear * Math.PI) / 180;
    const L1 = 9, L2 = 6;
    const tx = hx + Math.cos(a) * L1, ty = hyy - Math.sin(a) * L1;
    const bx = hx - Math.cos(a) * L2, byy = hyy + Math.sin(a) * L2;
    s += `<path d="M${f2(bx)},${f2(byy)} L${f2(tx)},${f2(ty)}" stroke="#4a2a14" stroke-width="0.9"/>`;
    s += `<path d="M${f2(tx)},${f2(ty)} L${f2(tx + Math.cos(a) * 2.6)},${f2(ty - Math.sin(a) * 2.6)}" stroke="#d8dde0" stroke-width="1.5" stroke-linecap="round"/>`;
  }
  s += `<circle cx="${f2(hx)}" cy="${f2(hyy)}" r="0.9" fill="${C.skin}"/>`;
  return s;
}

function pose(kind: string, i: number, n: number): Pose {
  const t = (i / n) * Math.PI * 2;
  const base: Pose = { bob: 0, legs: [4, -4, -4, 6], knee: 6, tail: 0, head: 0, spear: 62, thrust: 0, banner: 0, lean: 0 };
  if (kind === 'w') return { ...base, head: Math.sin(t) * 0.7, tail: Math.sin(t) * 0.6, bob: 0 };
  if (kind === 'r') {
    return { ...base, bob: -Math.abs(Math.sin(t)) * 1.4, legs: [Math.sin(t) * 42, Math.sin(t + 0.6) * 42, Math.sin(t + Math.PI) * 38, Math.sin(t + Math.PI + 0.6) * 38], knee: 22 + Math.cos(t) * 12, tail: 2 + Math.sin(t) * 1, head: Math.sin(t) * 1, spear: 20, lean: 1 };
  }
  if (kind === 'a') {
    // wind up (raise), strike down, thrust forward (frame 8), recover
    const k = i / (n - 1);
    const spear = k < 0.45 ? 30 + k * 200 : k < 0.6 ? 120 - (k - 0.45) * 800 : k < 0.75 ? 0 : (k - 0.75) * 120;
    const thrust = k > 0.55 && k < 0.75 ? 5 : 0;
    return { ...base, spear, thrust, lean: thrust ? 1.6 : -0.5, legs: [10 + Math.sin(t) * 10, -6, -8, 4], head: -0.5 + Math.sin(t), tail: 1 + Math.sin(t * 2) };
  }
  // victory: banner raised higher each frame
  return { ...base, banner: 9 + i * 2.6, head: -1, tail: 1 };
}

export function paintRider(job: FrameJob): PaintOut {
  const m = /^([wrav])(\d{4})$/.exec(job.name);
  if (!m) return { svg: svgDoc(1, 1, ''), w: 1, h: 1, ax: 0, ay: 0 };
  const kind = m[1], i = +m[2] - 1;
  const n = kind === 'w' || kind === 'v' ? 4 : 12;
  const W = 36, H = 44, ax = 16, ay = 42;
  const body = `<ellipse cx="${ax}" cy="${ay}" rx="9" ry="1.6" fill="${C.ink}" opacity="0.25"/><g transform="translate(${ax} ${ay})">${rider(pose(kind, i, n))}</g>`;
  return { svg: svgDoc(W, H, body), w: W, h: H, ax, ay };
}
