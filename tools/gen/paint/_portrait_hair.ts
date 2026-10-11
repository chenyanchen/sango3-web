// Hair (men's topknots, women's buns, barbarian manes) and beards.
import { C, mix, type Pt } from '../ink.ts';
import type { FaceParts } from './_portrait_face.ts';
import type { Model } from './_portrait_model.ts';
import { along, circ, ell, fill, lerp, P, qpts, stroke } from './_portrait_util.ts';

const isLight = (col: string) => parseInt(col.slice(1, 3), 16) > 0x70;

/** Hair falling behind the shoulders (drawn before the clothes). */
export function hairBack(m: Model, fp: FaceParts) {
  const { hx, a, noseY, r } = m;
  const col = m.hairCol;
  let s = '';
  if (m.female && m.hair !== 'tail') {
    const pts: Pt[] = [[hx - a * 1.05, m.browY], [hx - a * 1.28, noseY + 10], [hx - a * 1.4, 200], [hx - a * 1.55, 245], [hx - a * 0.5, 245], [hx - a * 0.75, noseY + 18], [hx - a * 0.6, noseY]];
    s += fill(P(pts, true), col, 0.95);
    for (let i = 0; i < 6; i++) {
      const x = hx - a * (0.8 + i * 0.12);
      s += stroke([[x, noseY - 4], [x - 4 - i, 200], [x - 6 - i * 2, 245]], 0.8, isLight(col) ? C.inkSoft : '#5a5048', r, 0.4);
    }
  }
  if (!m.female && (m.hair === 'loose' || m.hair === 'wild' || m.hair === 'braids')) {
    const pts: Pt[] = [[hx - a * 1.0, m.browY - 6], [hx - a * 1.25, noseY + 6], [hx - a * 1.35, 215], [hx - a * 1.1, 232], [hx - a * 0.7, 210], [hx - a * 0.6, noseY]];
    s += fill(P(pts, true), col, 0.95);
    if (m.hair === 'wild') for (let i = 0; i < 7; i++) {
      const y = noseY + i * 9;
      s += stroke([[hx - a * 1.1, y], [hx - a * (1.35 + r.range(0, 0.2)), y + 6], [hx - a * (1.45 + r.range(0, 0.25)), y + 2]], 2, col, r, 0.9, { taperIn: 0.1, taperOut: 0.6 });
    }
  }
  void fp;
  return s;
}

/** Main hair mass over the skull (drawn under the face). */
export function hairMass(m: Model, fp: FaceParts) {
  const { hx, a, hairY, browY, eyeY, noseY, r } = m;
  const { X } = fp;
  const top = hairY - (m.female ? 26 : 24);
  const col = m.hairCol;
  const light = isLight(col);
  const big = m.female ? 1.08 : 1;
  let s = '';
  if (m.hair === 'bald') {
    // shiny skull with a fringe of hair at the back and sides
    const skull: Pt[] = [fp.hairline[fp.hairline.length - 1], [hx + a * 0.95, hairY - 4], [hx + a * 0.4, top + 1], [hx - a * 0.4, top + 2], [hx - a * 1.02, hairY], [hx - a * 1.1, browY + 6], [hx - a * 0.9, noseY + 6], [X(-1, eyeY), eyeY], fp.hairline[0]];
    s += fill(P(skull, true), m.skin);
    s += fill(ell(hx - a * 0.1, top + 14, a * 0.5, 8), '#fff6ea', 0.35, 'filter="url(#blur4)"');
    s += fill(P([[hx - a * 1.08, hairY + 2], [hx - a * 1.12, browY + 6], [hx - a * 0.92, noseY + 6], [X(-1, eyeY) + 1, eyeY + 2], [X(-0.88, browY), browY], [hx - a * 0.75, hairY + 8]], true), col, 0.9);
    s += stroke(skull.slice(1, 6), 1.6, m.skinLine, r, 0.8);
    return s;
  }
  const mass: Pt[] = [
    fp.hairline[fp.hairline.length - 1],
    [hx + a * 0.98 * big, hairY - 4],
    [hx + a * 0.62 * big, top + 5],
    [hx - a * 0.05, top - 1],
    [hx - a * 0.7 * big, top + 6],
    [hx - a * 1.06 * big, hairY - 2],
    [hx - a * 1.14 * big, browY + 6],
    [hx - a * 1.02, noseY + 4],
    [hx - a * 0.9, noseY + 9],
    [X(-1, eyeY + 6) - 3, eyeY + 6],
    [X(-0.9, eyeY - 3), eyeY - 3],
    ...fp.hairline.slice(0, -1),
  ];
  const d = P(mass, true, 0.45);
  s += `<g filter="url(#wash)">${fill(d, col, light ? 1 : 0.95)}</g>`;
  // edge darkening and sheen, dry-brush strands combed to the crown
  const crown: Pt = [hx - a * 0.25, top + 2];
  s += `<clipPath id="hairclip"><path d="${d}"/></clipPath>`;
  let inner = '';
  inner += fill(ell(hx - a * 0.05, top + 16, a * 0.62, 11, -10), light ? '#ffffff' : '#a39a90', light ? 0.35 : 0.28, 'filter="url(#blur4)"');
  inner += `<path d="${d}" fill="none" stroke="${light ? '#5a5248' : '#000'}" stroke-width="5" opacity="0.35" filter="url(#blur2)"/>`;
  const strand = light ? mix(col, '#3b342b', 0.5) : mix(col, '#b8b0a6', 0.4);
  for (let i = 0; i < 22; i++) {
    const t = i / 21;
    const st = along(fp.hairline, t);
    const back: Pt = [hx - a * (0.9 + r.range(0, 0.15)), lerp(top + 8, m.browY, r.next())];
    const end = t < 0.25 ? back : crown;
    const c: Pt = [lerp(st[0], end[0], 0.5) + r.range(-2, 4), lerp(st[1], end[1], 0.5) - r.range(4, 9)];
    inner += stroke(qpts([st[0], st[1] - 1], c, [end[0] + r.range(-4, 4), end[1] + r.range(-2, 3)], 7), r.range(0.5, 1.1), strand, r, light ? 0.6 : r.range(0.2, 0.45), { taperIn: 0.4, taperOut: 0.5, jitter: 0.3 });
  }
  s += `<g clip-path="url(#hairclip)">${inner}</g>`;
  // sideburn wisps in front of the ear
  const sb = [X(-0.86, browY), browY] as Pt;
  s += stroke([sb, [sb[0] - 0.5, eyeY + 4], [sb[0] + 1, eyeY + 9]], 2.2, col, r, 0.9, { taperIn: 0.1, taperOut: 0.7 });
  if (m.female) {
    // side lock hanging in front of the ear
    s += stroke([[X(-0.82, browY - 4), browY - 4], [X(-0.98, eyeY + 6), eyeY + 6], [X(-1, noseY + 8) + 1, noseY + 10], [X(-0.98, m.mouthY + 6), m.mouthY + 8]], 3.2, col, r, 0.9, { taperIn: 0.1, taperOut: 0.6 });
  }
  if (m.hair === 'wild' || m.hair === 'braids') {
    for (let i = 0; i < 10; i++) {
      const t = i / 9;
      const ang = lerp(-2.6, -0.4, t);
      const cx = hx - a * 0.15, cy = hairY + 8;
      const R = a * 1.05;
      const p: Pt = [cx + Math.cos(ang) * R, cy + Math.sin(ang) * R * 1.05];
      s += stroke([[cx + Math.cos(ang) * R * 0.75, cy + Math.sin(ang) * R * 0.8], p, [p[0] + Math.cos(ang - 0.5) * 7, p[1] + Math.sin(ang - 0.5) * 7]], 2.4, col, r, 0.95, { taperIn: 0.1, taperOut: 0.7 });
    }
  }
  // contour
  s += stroke(mass.slice(1, 8), 1.4, C.ink, r, light ? 0.6 : 0.4, { taperIn: 0.1, taperOut: 0.2 });
  return s;
}

/** Topknot/buns on top (drawn after the face; hats may sit on them). */
export function hairTop(m: Model, fp: FaceParts) {
  const { hx, a, hairY, r } = m;
  const top = hairY - (m.female ? 26 : 24);
  const col = m.hairCol;
  const light = isLight(col);
  const hk = m.hat.kind;
  const covered = ['helmet', 'lionhelm', 'winghelm', 'peakhelm', 'hequan', 'futou', 'jieze', 'scarf', 'yellowscarf', 'eunuch', 'hood', 'mian'].includes(hk);
  let s = '';
  const knot = (cx: number, cy: number, rx: number, ry: number, rot = 0) => {
    let k = fill(ell(cx, cy, rx, ry, rot), col);
    k += fill(ell(cx - rx * 0.2, cy - ry * 0.35, rx * 0.5, ry * 0.3, rot), light ? '#fff' : '#a39a90', 0.25, 'filter="url(#blur2)"');
    k += stroke([[cx - rx * 0.8, cy + ry * 0.2], [cx - rx * 0.1, cy - ry * 0.75], [cx + rx * 0.7, cy - ry * 0.3]], 1, light ? C.inkSoft : '#8a8178', r, 0.5);
    return k;
  };
  if (!m.female) {
    if (covered || m.hair === 'bald' && hk === 'none') return '';
    if (m.hair === 'wild') return '';
    const bx = hx - a * 0.18, by = top - 6;
    s += knot(bx, by, 10.5, 9);
    if (hk === 'none' || hk === 'headband' || hk === 'feathers') {
      // cloth or ribbon tie and a hairpin
      s += fill(P([[bx - 9, by + 5], [bx + 9, by + 3], [bx + 9.5, by + 7.5], [bx - 8.5, by + 9]], true), m.dress.col2 === C.ink ? '#3a332c' : m.dress.col2, 0.95);
      s += stroke([[bx - 17, by + 3], [bx + 18, by - 3]], 1.8, C.gold, r, 0.95, { taperIn: 0.05, taperOut: 0.05 });
    }
    return s;
  }
  // women's hairstyles
  if (covered) return '';
  const bx = hx - a * 0.1, by = top - 4;
  switch (m.hair) {
    case 'bun': s += knot(bx, by - 6, 18, 14, -8); s += knot(bx - 12, by + 4, 9, 7, -20); break;
    case 'twin': s += knot(hx - a * 0.75, by + 4, 11, 10, -25); s += knot(hx + a * 0.45, by - 2, 10, 9, 20); break;
    case 'side': s += knot(hx - a * 0.75, by + 6, 17, 13, -35); break;
    case 'high': s += knot(bx - 2, by - 14, 11, 20, -10); s += knot(bx + 2, by + 2, 15, 9, 0); break;
    case 'tail': {
      s += knot(bx - 6, by - 2, 11, 9);
      s += fill(P([[bx - 10, by], [bx - 26, by + 18], [hx - a * 1.4, 170], [hx - a * 1.5, 205], [hx - a * 1.15, 175], [bx - 2, by + 4]], true), col, 0.95);
      s += fill(P([[bx - 9, by + 1], [bx - 2, by - 3], [bx, by + 3], [bx - 7, by + 6]], true), C.cinnabar, 0.95);
      break;
    }
    default: s += knot(bx, by - 4, 16, 12);
  }
  // hair ornaments: gold pins with dangling beads (步摇), flower
  const pin: Pt = [hx + a * 0.25, top + 2];
  s += stroke([[pin[0] - 14, pin[1] + 4], pin, [pin[0] + 7, pin[1] - 4]], 1.6, C.gold, r, 0.95, { taperIn: 0.05, taperOut: 0.05 });
  s += circ(pin[0] + 7, pin[1] - 4, 2.4, C.gold);
  for (let i = 0; i < 3; i++) {
    const x = pin[0] + 3 + i * 3, y0 = pin[1] - 2;
    s += `<line x1="${x}" y1="${y0}" x2="${x + 1}" y2="${y0 + 8 + i * 3}" stroke="${C.gold}" stroke-width="0.6"/>`;
    s += circ(x + 1, y0 + 9 + i * 3, 1.2, i === 1 ? '#c4505a' : '#f2ede0');
  }
  if (m.extras.has('flower')) {
    const fx = hx - a * 0.75, fy = top + 12;
    const pc = r.pick(['#d9707e', '#e8a0a8', '#efe6d2', '#c9a24a']);
    for (let i = 0; i < 5; i++) {
      const ang = (i / 5) * Math.PI * 2;
      s += fill(ell(fx + Math.cos(ang) * 4.2, fy + Math.sin(ang) * 4.2, 4, 2.8, (ang * 180) / Math.PI), pc, 0.95);
    }
    s += circ(fx, fy, 2, C.gamboge);
    s += fill(ell(fx + 6, fy + 7, 5, 2, 40), '#4f8a6a', 0.9);
  }
  if (m.extras.has('pearls')) for (let i = 0; i < 7; i++) s += circ(hx - a * 0.6 + i * 6, top + 6 - Math.sin((i / 6) * Math.PI) * 4, 1.4, '#f6f2e8');
  void fp;
  return s;
}

// ------------------------------------------------------------------ beards
export function drawBeard(m: Model, fp: FaceParts) {
  const { X } = fp;
  const { r, noseY, mouthY, chinY, hx, a } = m;
  const kind = m.beard.kind;
  if (kind === 'none') return '';
  const col = m.beardCol;
  const light = isLight(col);
  const line = light ? mix(col, '#3b342b', 0.5) : col;
  const L = m.beard.len;
  let s = '';
  if (kind === 'stubble' || m.look.beard === 'stubble') {
    const d = P([[X(-0.95, noseY + 2), noseY + 2], [X(-0.3, mouthY + 4), mouthY + 4], [X(0, mouthY + 4), mouthY + 4], [X(0.6, mouthY + 2), mouthY + 2], [X(0.9, mouthY + 6), mouthY + 6], fp.chinPt, [X(-0.6, chinY - 3), chinY - 2], [X(-0.98, mouthY + 7), mouthY + 6]], true);
    s += fill(d, '#3d4550', 0.22, 'filter="url(#blur3)"');
    s += fill(P([[X(-0.25, noseY + 3), noseY + 3], [X(0.25, noseY + 3), noseY + 3], [X(0.3, mouthY - 2), mouthY - 2], [X(-0.3, mouthY - 2), mouthY - 2]], true), '#3d4550', 0.2, 'filter="url(#blur2)"');
    if (kind === 'stubble') return s;
  }
  const mo = moustache(m, fp, line);
  if (kind === 'moustache') return s + mo;
  // beard body
  const root = (u: number) => {
    // a point on the lower face where the beard grows
    const y = u < -0.7 ? noseY + 6 + (1 + u) * 20 : u > 0.75 ? mouthY - 2 + (1 - u) * 16 : mouthY + 4 + (1 - Math.abs(u)) * 6;
    return [X(u, y), y] as Pt;
  };
  const tipX = fp.chinPt[0] - 2;
  const soft = (pts: Pt[], op: number) => fill(P(pts, true), col, op, 'filter="url(#blur3)"');
  /** a flowing hair: S-curve from st to en */
  const hairLine = (st: Pt, en: Pt, w: number, sway: number, op = 0.8) => {
    const m1: Pt = [lerp(st[0], en[0], 0.33) + sway, lerp(st[1], en[1], 0.33)];
    const m2: Pt = [lerp(st[0], en[0], 0.66) - sway * 0.6, lerp(st[1], en[1], 0.66)];
    return stroke([st, m1, m2, en], w, line, r, op, { taperIn: 0.3, taperOut: 0.7, jitter: 0.25 });
  };
  if (kind === 'goatee' || kind === 'short') {
    const len = (kind === 'goatee' ? 20 : 15) * L;
    const tip: Pt = [tipX, chinY + len];
    if (kind === 'short') {
      const body: Pt[] = [root(-0.98), [X(-0.95, mouthY + 6), mouthY + 6], [X(-0.6, chinY - 1), chinY + 3], tip, [X(0.55, chinY - 1), chinY + 1], [X(0.92, mouthY + 6), mouthY + 6], root(0.9), [X(0.5, mouthY + 3), mouthY + 4], [X(0, mouthY + 5), mouthY + 5], [X(-0.5, mouthY + 3), mouthY + 4]];
      s += soft(body, light ? 0.7 : 0.55);
      for (let i = 0; i < 22; i++) {
        const t = i / 21;
        const st = root(lerp(-0.96, 0.85, t));
        const en: Pt = [lerp(st[0], tip[0], 0.6) + r.range(-2, 2), lerp(st[1], tip[1], 0.8) - Math.abs(t - 0.5) * 6];
        s += hairLine(st, en, r.range(0.7, 1.1), r.range(-1.5, 1.5), 0.75);
      }
    }
    const gt: Pt[] = [[X(-0.2, mouthY + 5), mouthY + 5], [X(-0.22, chinY - 2), chinY - 2], [tip[0] - 2, tip[1] - 2], tip, [tip[0] + 4, tip[1] - 6], [X(0.22, chinY - 2), chinY - 2], [X(0.18, mouthY + 5), mouthY + 5]];
    s += soft(gt, light ? 0.8 : 0.7);
    for (let i = 0; i < 12; i++) {
      const t = i / 11;
      const st: Pt = [X(lerp(-0.18, 0.16, t), mouthY + 5.5), mouthY + 5.5];
      s += hairLine(st, [tip[0] + lerp(-4, 4, t) + r.range(-1, 1), tip[1] - Math.abs(t - 0.5) * 8], r.range(0.8, 1.3), r.range(-2, 2), 0.85);
    }
    s += fill(ell(X(0, mouthY + 5.5), mouthY + 5.5, 2.4, 1.6), col, 0.8);
  } else if (kind === 'long' || kind === 'five') {
    const len = 54 * L;
    const tip: Pt = [tipX - 3, chinY + len];
    const thick = m.look.role === 'warrior' ? 1 : 0.7;
    const body: Pt[] = [root(-0.85 * thick), [X(-0.55, chinY) - 3, chinY + 4], [lerp(tipX, tip[0], 0.5) - 12 * thick, chinY + len * 0.45], tip, [lerp(tipX, tip[0], 0.5) + 10 * thick, chinY + len * 0.4], [X(0.5, chinY) + 3, chinY + 2], root(0.7 * thick), [X(0.15, mouthY + 4), mouthY + 4], [X(-0.15, mouthY + 4), mouthY + 4]];
    s += soft(body, light ? 0.6 : 0.5);
    const n = Math.round(30 * thick);
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const st = root(lerp(-0.85 * thick, 0.7 * thick, t));
      const en: Pt = [tip[0] + lerp(-9, 7, t) * thick + r.range(-2, 2), tip[1] - Math.pow(Math.abs(t - 0.45), 1.2) * 30 - r.range(0, 8)];
      s += hairLine(st, en, r.range(0.7, 1.3), r.range(-4, 4) + (0.5 - t) * 3, 0.8);
    }
    if (kind === 'five') {
      // side tufts from the sideburns (五绺)
      for (const u of [-0.99, 0.95]) {
        const st: Pt = [X(u, m.eyeY + 14), m.eyeY + 14];
        const en: Pt = [st[0] + (u < 0 ? -2 : 3), st[1] + len * 0.75];
        s += soft([[st[0] - 2, st[1]], [st[0] + 2, st[1]], [en[0] + 1.5, en[1] - 6], en, [en[0] - 2, en[1] - 6]], 0.5);
        for (let k = 0; k < 6; k++) s += hairLine([st[0] + k * 0.7 - 2, st[1]], [en[0] + k * 0.5 - 1.5, en[1] - r.range(0, 6)], 0.8, r.range(-2, 2), 0.8);
      }
    }
  } else {
    // full / curly: covers the jaw from ear to ear
    const curly = kind === 'curly';
    const len = (curly ? 24 : 30) * L;
    const tip: Pt = [tipX - 2, chinY + len];
    const body: Pt[] = [[X(-0.99, mouthY - 5), mouthY - 5], [X(-1, mouthY + 2) - 3, mouthY + 2], [hx - a * 0.72, chinY + len * 0.45], [tip[0] - 10, tip[1] - 4], tip, [tip[0] + 12, tip[1] - 8], [X(0.92, mouthY + 8) + 3, mouthY + 8], [X(0.96, mouthY - 2), mouthY - 2], [X(0.5, mouthY + 1), mouthY + 3], [X(0, mouthY + 4.5), mouthY + 4.5], [X(-0.45, mouthY + 2), mouthY + 2], [X(-0.7, mouthY - 2), mouthY - 2]];
    s += soft(body, light ? 0.75 : 0.7);
    const rim = [body[1], body[2], body[3], body[4], body[5], body[6]];
    const n = curly ? 30 : 34;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const st = root(lerp(-0.98, 0.9, t));
      const e0 = along(rim, t);
      if (curly) {
        const out: Pt = [e0[0] + (e0[0] - st[0]) * 0.22, e0[1] + (e0[1] - st[1]) * 0.18];
        const hook: Pt = [out[0] + (t < 0.5 ? -4 : 4) + r.range(-1, 1), out[1] - 3.5];
        s += stroke([st, [lerp(st[0], out[0], 0.55) + r.range(-2, 2), lerp(st[1], out[1], 0.55)], out, hook], r.range(1.4, 2.2), line, r, 0.85, { taperIn: 0.25, taperOut: 0.6 });
      } else {
        const en: Pt = [e0[0] + r.range(-2, 2), e0[1] + r.range(-2, 2)];
        s += hairLine(st, en, r.range(0.8, 1.4), r.range(-2.5, 2.5), 0.8);
      }
    }
  }
  s += mo;
  return s;
}

function moustache(m: Model, fp: FaceParts, line: string) {
  const { X } = fp;
  const { r, noseY, mouthY } = m;
  const t = m.beard.tash;
  if (t === 'none') return '';
  const col = m.beardCol;
  let s = '';
  for (const sd of [-1, 1]) {
    const st: Pt = [X(sd * 0.04, noseY + 3.2), noseY + 3.2];
    const mid: Pt = [X(sd * 0.2, mouthY - 2.2), mouthY - 2.5];
    const end: Pt =
      t === 'up' ? [X(sd * 0.4, mouthY - 1) + sd * 2, mouthY - 3]
      : t === 'thin' ? [X(sd * 0.36, mouthY + 3), mouthY + 4]
      : [X(sd * 0.38, mouthY + 6), mouthY + 9];
    const w = (t === 'thin' ? 1.8 : 3.4) * (sd > 0 ? 0.8 : 1);
    s += stroke([st, mid, end], w, col, r, 0.95, { taperIn: 0.2, taperOut: 0.7 });
    for (let k = 0; k < 3; k++) s += stroke([[st[0] + sd * k, st[1] + 0.5], [mid[0] + sd * k * 0.5, mid[1] + k * 0.6], [end[0], end[1] - k]], 0.8, line, r, 0.7, { taperIn: 0.3, taperOut: 0.7 });
  }
  return s;
}
