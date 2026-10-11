// Nation banners on the strategy map (ad/btn/flag/flagNNKKKK, object 5000+NN):
// frame 0 = disabled (grey), frames 1–5 = waving loop. The cloth colour is
// NATION_COLORS[NN % 18] (src/game/state.ts) so the new-game preview and the
// in-game halo (sampled from the cloth of frame 1, x 3–13 / y 2–12) agree.
import type { FrameJob, PaintOut } from '../types.ts';
import { C, f2, mix, svgDoc } from '../ink.ts';

/** Copy of NATION_COLORS in src/game/state.ts (kept in sync by hand). */
const NATION_COLORS = [
  '#8a8a8a', '#d13b2f', '#2f6fd1', '#2fa84f', '#e0b91f', '#8e3fc2', '#e07a1f', '#1fb5c9', '#c91f7a',
  '#6b4a2b', '#7fbf3f', '#3f3fbf', '#bf3f3f', '#3fbf9f', '#bfa33f', '#5a5a5a', '#d18fbf', '#9fd13b',
];

export function flagColor(n: number) {
  return NATION_COLORS[n % NATION_COLORS.length];
}

export function paintFlag(job: FrameJob): PaintOut {
  const m = /^flag(\d\d)(\d{4})$/.exec(job.name);
  const n = m ? +m[1] : 1;
  const k = m ? +m[2] : 1;
  const W = 23, H = 29;
  const disabled = k === 0;
  const base = disabled ? '#8d877c' : flagColor(n);
  const variant = n > 18 ? 1 : 0;
  const trim = disabled ? '#b9b2a4' : variant ? '#f3ecd8' : C.gold;
  const dark = mix(base, '#000', 0.35);
  const ph = ((k - 1) / 5) * Math.PI * 2;
  // cloth: x 2.6 → 21.5, top edge y≈2, bottom y≈15; edges ripple with the phase
  const x0 = 2.6, x1 = 21.4;
  const amp = (x: number) => ((x - x0) / (x1 - x0)) * 1.5;
  const top = (x: number) => 2 + Math.sin(ph + (x - x0) * 0.42) * amp(x);
  const bot = (x: number) => 15 + Math.sin(ph + (x - x0) * 0.42 - 0.5) * amp(x) * 1.1;
  const N = 10;
  const xs = Array.from({ length: N + 1 }, (_, i) => x0 + ((x1 - x0) * i) / N);
  const topPts = xs.map((x) => `${f2(x)},${f2(top(x))}`);
  // fly edge with swallow-tail notch
  const fx = x1, fy = (top(x1) + bot(x1)) / 2;
  const cloth = `M${topPts.join(' L')} L${f2(fx - 3)},${f2(fy)} L${f2(fx)},${f2(bot(fx))} ${xs.slice().reverse().map((x) => `L${f2(x)},${f2(bot(x))}`).join(' ')}Z`;
  // fold shading bands
  let folds = '';
  for (let i = 0; i < N; i++) {
    const x = xs[i];
    const s = Math.cos(ph + (x - x0) * 0.42);
    if (s < 0) folds += `<rect x="${f2(x)}" y="0" width="${f2((x1 - x0) / N + 0.3)}" height="${H}" fill="#000" opacity="${f2(-s * 0.22)}"/>`;
    else folds += `<rect x="${f2(x)}" y="0" width="${f2((x1 - x0) / N + 0.3)}" height="${H}" fill="#fff" opacity="${f2(s * 0.1)}"/>`;
  }
  // flame-tooth trim along the bottom edge
  let teeth = '';
  for (let i = 0; i < 6; i++) {
    const a = x0 + 0.8 + i * 3, b = a + 3;
    const ya = bot(a), yb = bot(b), ym = bot((a + b) / 2);
    teeth += `M${f2(a)},${f2(ya - 0.2)} L${f2((a + b) / 2)},${f2(ym + 2.4)} L${f2(b)},${f2(yb - 0.2)}Z`;
  }
  // emblem: paper disc with an ink mark, on the fly half (keeps the sampled field pure)
  const ex = 15.2, ey = (top(ex) + bot(ex)) / 2;
  const mark = [
    `<path d="M${f2(ex - 1.6)},${f2(ey)} L${f2(ex + 1.6)},${f2(ey)} M${f2(ex)},${f2(ey - 1.6)} L${f2(ex)},${f2(ey + 1.6)}" stroke="${C.ink}" stroke-width="0.9"/>`,
    `<circle cx="${f2(ex)}" cy="${f2(ey)}" r="1.2" fill="${C.ink}"/>`,
    `<path d="M${f2(ex - 1.6)},${f2(ey - 0.9)} L${f2(ex + 1.6)},${f2(ey - 0.9)} M${f2(ex - 1.6)},${f2(ey + 0.9)} L${f2(ex + 1.6)},${f2(ey + 0.9)}" stroke="${C.ink}" stroke-width="0.8"/>`,
  ][n % 3];
  const id = `cl${n}${k}`;
  const body = `<defs><clipPath id="${id}"><path d="${cloth}"/></clipPath></defs>
<path d="M1.4,2 L1.4,28.4" stroke="#2a160b" stroke-width="1.9" stroke-linecap="round"/>
<path d="M1.0,2.5 L1.0,27.8" stroke="#6a3a1c" stroke-width="0.6"/>
<path d="${cloth}" fill="${base}"/>
<g clip-path="url(#${id})">${folds}</g>
<path d="${teeth}" fill="${trim}" stroke="${dark}" stroke-width="0.4"/>
<path d="${cloth}" fill="none" stroke="${disabled ? '#5a554c' : dark}" stroke-width="0.8" stroke-linejoin="round"/>
<path d="M${f2(x0)},${f2(top(x0) + 0.9)} ${xs.slice(1).map((x) => `L${f2(x)},${f2(top(x) + 0.9)}`).join(' ')}" fill="none" stroke="${trim}" stroke-width="0.7" opacity="0.9"/>
<circle cx="${f2(ex)}" cy="${f2(ey)}" r="3.1" fill="${disabled ? '#d6d0c2' : C.white}" stroke="${dark}" stroke-width="0.5"/>${disabled ? '' : mark}
<path d="M1.4,0.2 L2.6,2.6 L0.2,2.6Z" fill="${C.gold}" stroke="#5a3a10" stroke-width="0.4"/>`;
  return { svg: svgDoc(W, H, body), w: W, h: H, ax: 1, ay: 28 };
}
