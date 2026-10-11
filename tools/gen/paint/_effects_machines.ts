// Siege engines and war machines of the 武将技 (normal blending, facing
// left, team colour b = indigo / r = cinnabar): blade cart, catapult, fire
// cannon, repeating-crossbow cart, armoured 轒辒 wagon, battering ram, wooden
// beast, siege tower and the 木鸢 glider. Drawn as ink line + mineral washes.
import type { PaintOut } from '../types.ts';
import { mix } from '../ink.ts';
import type { Ctx, Rule } from './_effects_ctx.ts';
import { clamp, ease, lerp, rng, xform, type Pt, type Rng } from './_effects_kit.ts';
import { TAU } from './_effects_fx.ts';
import { C, Ink } from './_effects_paint.ts';

const WOOD = mix(C.ochre, C.paperDark, 0.25);
const WOOD_D = mix(C.ochre, C.ink, 0.35);
const IRON = mix(C.inkWash, C.azurite, 0.2);
const team = (c: Ctx, blueRe: RegExp) => (blueRe.test(c.name) ? C.indigo : C.cinnabar);

/** Simple crew member (ink figure, facing left) standing at foot (x, y). */
export function crew(ink: Ink, x: number, y: number, s: number, col: string, o: { lean?: number; arm?: number; arm2?: number; step?: number } = {}) {
  const lean = o.lean ?? 0, step = o.step ?? 0;
  const hip: Pt = [x + lean * 6 * s, y - 22 * s];
  const neck: Pt = [hip[0] - lean * 14 * s - 1 * s, hip[1] - 17 * s];
  // legs
  ink.line([hip, [x - 4 * s - step * 4 * s, y - 10 * s], [x - 5 * s - step * 6 * s, y]], 4.2 * s, C.inkSoft, 1, { taperIn: 0, taperOut: 0 });
  ink.line([hip, [x + 4 * s + step * 4 * s, y - 10 * s], [x + 5 * s + step * 5 * s, y]], 4.2 * s, C.ink, 1, { taperIn: 0, taperOut: 0 });
  // coat
  const coat: Pt[] = [[neck[0] - 5 * s, neck[1] + 1 * s], [neck[0] + 5 * s, neck[1] + 1 * s], [hip[0] + 7 * s, hip[1] + 6 * s], [hip[0] - 7 * s, hip[1] + 6 * s]];
  ink.fill(coat, col, 1, { tex: 0.2 });
  ink.outline(coat, 1.3 * s, C.ink, 1, { dry: 0.2 });
  // arms toward angle (radians from down, + = forward/left)
  for (const [ang, c2] of [[o.arm ?? 0.8, C.ink], [o.arm2 ?? o.arm ?? 0.8, C.inkSoft]] as [number, string][]) {
    const e: Pt = [neck[0] - Math.sin(ang) * 9 * s, neck[1] + 3 * s + Math.cos(ang) * 9 * s];
    const h: Pt = [e[0] - Math.sin(ang + 0.3) * 8 * s, e[1] + Math.cos(ang + 0.3) * 8 * s];
    ink.line([[neck[0], neck[1] + 2 * s], e, h], 3.4 * s, c2, 1, { taperIn: 0, taperOut: 0 });
    ink.dot(h[0], h[1], 1.8 * s, C.skin);
  }
  // head + headscarf
  const hd: Pt = [neck[0] - 1 * s, neck[1] - 6 * s];
  ink.dot(hd[0], hd[1], 5.2 * s, C.skin, 1, 0.8);
  ink.fill([[hd[0] - 5.5 * s, hd[1] - 1 * s], [hd[0] - 4 * s, hd[1] - 6 * s], [hd[0] + 4 * s, hd[1] - 6 * s], [hd[0] + 6 * s, hd[1] + 1 * s]], col, 1, { tex: 0 });
  ink.outline(Ink.ellPts(hd[0], hd[1], 5.2 * s, 5.2 * s, 0, 14), 1.2 * s, C.ink);
  ink.line([[hd[0] + 5 * s, hd[1] - 3 * s], [hd[0] + 10 * s, hd[1] - 1 * s]], 2 * s, col, 1, { taperIn: 0, taperOut: 0.8 });
}

/** Small swallow-tail banner on a pole. */
function banner(ink: Ink, x: number, y: number, h: number, col: string, ph: number) {
  ink.line([[x, y], [x, y - h]], 2, C.ink, 1, { taperIn: 0, taperOut: 0 });
  const w = h * 0.38, f = Math.sin(ph) * 3;
  const P: Pt[] = [[x, y - h], [x + w, y - h + 2 + f], [x + w * 0.75, y - h + h * 0.18], [x + w, y - h + h * 0.36 + f], [x, y - h + h * 0.34]];
  ink.fill(P, col, 1, { tex: 0.2 });
  ink.outline(P, 1.2, C.ink);
}

/** Collapse transform for "die" sequences: tilt, sink and spread parts. */
function wreck(ink: Ink, t: number, draw: (k: number) => void) {
  draw(t);
  void ink;
}

// ------------------------------------------------------------------ blade cart (40020)
function bladeCart(c: Ctx): PaintOut {
  const W = 150, H = 100, ax = 62, ay = 88;
  const ink = new Ink(W, H);
  const die = c.name !== 'gmac0000' && c.name !== 'gma';
  const t = die ? +c.name.slice(-4) / 240 : 0;
  const tilt = ease.in(clamp(t * 1.3)) * 0.5;
  const sink = t * 18;
  const fade = 1 - smooth01(0.6, 1, t) * 0.6;
  ink.shadow(ax, ay - 1, 56, 6, 0.35);
  ink.ox = ax;
  ink.oy = ay + sink;
  const R = (p: Pt[]) => xform(p, 0, -18, tilt, 1);
  // frame
  ink.shape(R([[-40, -30], [42, -30], [42, -18], [-40, -18]]), WOOD, 2);
  ink.shape(R([[-30, -48], [-22, -48], [-22, -18], [-30, -18]]), WOOD_D, 1.6);
  ink.shape(R([[20, -50], [28, -50], [28, -18], [20, -18]]), WOOD_D, 1.6);
  ink.shape(R([[-34, -54], [34, -54], [34, -46], [-34, -46]]), WOOD, 1.6);
  // forward blades (two tiers), shed one by one when dying
  for (let k = 0; k < 7; k++) {
    if (die && k / 7 < t * 1.4) continue;
    const y = k % 2 ? -38 : -26;
    const x = -38 + (k >> 1) * 4;
    const P = R([[x, y - 2], [x - 30, y - 1], [x - 40, y], [x - 30, y + 1], [x, y + 2]]);
    ink.fill(P, mix(C.white, C.azurite, 0.2), 1, { tex: 0.1 });
    ink.outline(P, 1.1, C.ink);
  }
  // handles at the back
  ink.line(R([[40, -26], [62, -12]]), 3, WOOD_D);
  ink.line(R([[40, -40], [62, -26]]), 3, WOOD_D);
  // wheels
  ink.ox = 0;
  ink.oy = 0;
  const wr = 14 * (1 - t * 0.2);
  ink.wheel(ax - 22 - t * 10, ay - wr + sink * 0.3, wr, t * 3, 2);
  ink.wheel(ax + 22 + t * 12, ay - wr + sink * 0.2, wr, -t * 2, 2);
  ink.cv.fade(fade);
  return ink.out(ax, ay);
}
const smooth01 = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

// ------------------------------------------------------------------ catapult (40610 red 'carb', 40613 blue 'cbfb')
function catapult(c: Ctx): PaintOut {
  const W = 240, H = 170, ax = 108, ay = 154;
  const ink = new Ink(W, H);
  const col = team(c, /^cbfb/);
  const k = +c.name.slice(-4); // 1 = wait, 2..14 = cut
  // arm angle: cocked back (down-right) → swing forward (up-left) → settle
  let q = 0;
  if (k > 1) q = (k - 2) / 12;
  const swing = q < 0.25 ? ease.in(q / 0.25) * 0.15 : q < 0.5 ? 0.15 + ease.out((q - 0.25) / 0.25) * 0.85 : 1 - ease.inout((q - 0.5) / 0.5) * 1;
  const arm = lerp(-0.35, -2.1, swing); // radians from +x (pointing right/down) to up-left
  ink.shadow(ax, ay - 2, 90, 9, 0.35);
  ink.ox = ax;
  ink.oy = ay;
  // base
  ink.shape([[-80, -30], [70, -30], [70, -18], [-80, -18]], WOOD, 2);
  // A-frame
  ink.shape([[-20, -30], [-6, -30], [6, -88], [0, -88]], WOOD_D, 1.8);
  ink.shape([[20, -30], [34, -30], [8, -88], [2, -88]], WOOD_D, 1.8);
  // counterweight box & arm
  const piv: Pt = [4, -86];
  const tip: Pt = [piv[0] + Math.cos(arm) * 95, piv[1] + Math.sin(arm) * 95];
  const back: Pt = [piv[0] - Math.cos(arm) * 28, piv[1] - Math.sin(arm) * 28];
  ink.line([back, tip], 6, WOOD_D, 1, { taperIn: 0, taperOut: 0.3 });
  ink.line([back, tip], 1.5, C.ink, 0.8, { taperIn: 0, taperOut: 0.3 });
  ink.shape(Ink.rect(back[0] - 12, back[1] - 2, 24, 22), IRON, 1.8);
  // sling + stone at the tip (until released)
  if (q < 0.45) {
    const st: Pt = [tip[0] + 6, tip[1] + 10];
    ink.line([tip, st], 1.2, C.ink);
    ink.dot(st[0], st[1], 7, C.inkWash);
    ink.outline(Ink.ellPts(st[0], st[1], 7, 7, 0, 12), 1.5, C.ink);
  }
  ink.dot(piv[0], piv[1], 4, C.ink);
  // wheels
  ink.ox = ink.oy = 0;
  for (const dx of [-60, 48]) ink.wheel(ax + dx, ay - 16, 16, q * 2, 2);
  // crew: one hauling, one with a flag
  crew(ink, ax + 72, ay - 2, 1.1, col, { lean: swing > 0.2 ? -0.5 : 0.3, arm: swing > 0.2 ? -0.6 : 1.4 });
  banner(ink, ax + 66, ay - 30, 70, col, k * 0.7);
  return ink.out(ax, ay);
}

// ------------------------------------------------------------------ fire cannon (40670 red 'carg', 40671 blue 'cgfb')
function cannon(c: Ctx): PaintOut {
  const W = 300, H = 170, ax = 255, ay = 150;
  const ink = new Ink(W, H);
  const col = team(c, /^cgfb/);
  const k = +c.name.slice(-4); // 1 wait, 2..7 rise, 8..12 shoot
  const elev = k <= 1 ? 0 : k <= 7 ? ease.out((k - 1) / 6) : 1;
  const recoil = k >= 8 ? [0, 8, 6, 3, 1][k - 8] ?? 0 : 0;
  ink.shadow(ax - 110, ay - 2, 120, 10, 0.35);
  ink.ox = ax;
  ink.oy = ay;
  // wagon bed
  ink.shape([[-230, -40], [-10, -40], [-4, -26], [-236, -26]], WOOD, 2);
  ink.shape([[-200, -52], [-40, -52], [-40, -40], [-200, -40]], WOOD_D, 1.6);
  // barrel: bronze dragon-mouth tube, pivot near the back, elevating
  const piv: Pt = [-60 + recoil, -58];
  const ang = Math.PI + elev * 0.32; // pointing left, raised
  const L = 170;
  const mouth: Pt = [piv[0] + Math.cos(ang) * L, piv[1] - Math.sin(elev * 0.32) * L];
  const nx = Math.sin(elev * 0.32), ny = Math.cos(elev * 0.32);
  const bw = 13;
  const barrel: Pt[] = [[piv[0] - nx * bw, piv[1] - ny * bw], [mouth[0] - nx * bw * 0.8, mouth[1] - ny * bw * 0.8], [mouth[0] + nx * bw * 0.8, mouth[1] + ny * bw * 0.8], [piv[0] + nx * bw, piv[1] + ny * bw]];
  ink.fill(barrel, mix(C.gold, C.malachite, 0.35), 1, { tex: 0.35 });
  for (let j = 1; j <= 4; j++) {
    const p: Pt = [lerp(piv[0], mouth[0], j / 5), lerp(piv[1], mouth[1], j / 5)];
    ink.line([[p[0] - nx * bw, p[1] - ny * bw], [p[0] + nx * bw, p[1] + ny * bw]], 3, mix(C.malachite, C.ink, 0.4), 1);
  }
  ink.outline(barrel, 2.2, C.ink);
  // dragon mouth rim
  ink.fill(Ink.ellPts(mouth[0], mouth[1], 6, bw * 1.15, -elev * 0.32), mix(C.gold, C.ink, 0.3), 1);
  ink.outline(Ink.ellPts(mouth[0], mouth[1], 6, bw * 1.15, -elev * 0.32), 2, C.ink);
  // muzzle flash + smoke on the shot
  if (k >= 8) {
    const fl = [1, 0.8, 0.5, 0.3, 0.15][k - 8] ?? 0;
    ink.fill(Ink.ellPts(mouth[0] - 22, mouth[1], 26 * fl + 4, 14 * fl + 3), C.gamboge, 0.9 * fl);
    ink.fill(Ink.ellPts(mouth[0] - 14, mouth[1], 14 * fl + 2, 8 * fl + 2), C.white, fl);
    for (let j = 0; j < 4; j++) ink.ell(mouth[0] - 20 - j * 14 * (1 - fl) - 10, mouth[1] - j * 6 * (1 - fl), 12 + 6 * (1 - fl), 9, C.inkWash, 0.35 * (1 - fl * 0.5), 0, 0.3);
  }
  ink.ox = ink.oy = 0;
  for (const dx of [-205, -150, -95, -40]) ink.wheel(ax + dx, ay - 17, 17, k * 0.2, 2, WOOD_D);
  crew(ink, ax + 6, ay - 2, 1.1, col, { lean: k >= 8 ? -0.3 : 0.2, arm: 1.6, arm2: 1.2 });
  banner(ink, ax - 230, ay - 40, 64, col, k * 0.6);
  return ink.out(ax, ay);
}

// ------------------------------------------------------------------ repeating crossbow cart (40140 red 'card', 40141 blue 'cdfb')
function crossbowCart(c: Ctx): PaintOut {
  const W = 316, H = 130, ax = 277, ay = 100;
  const ink = new Ink(W, H);
  const col = team(c, /^cdfb/);
  const k = +c.name.slice(-4);
  const snap = k === 2 || k === 4 ? 1 : 0; // string released frames
  ink.shadow(ax - 120, ay - 2, 130, 8, 0.35);
  ink.ox = ax;
  ink.oy = ay;
  // cart bed
  ink.shape([[-250, -30], [-20, -30], [-14, -18], [-256, -18]], WOOD, 2);
  // stock (long rail) pointing left
  ink.shape([[-268, -52], [-40, -46], [-40, -38], [-268, -44]], WOOD_D, 1.8);
  // bow arms (bent) at the front
  const bx = -230;
  const pull = snap ? 6 : 26;
  ink.line([[bx, -48], [bx + 10, -78], [bx + 22, -96]], 5, WOOD_D, 1, { taperIn: 0, taperOut: 0.4 });
  ink.line([[bx, -48], [bx + 10, -20], [bx + 22, -4]], 5, WOOD_D, 1, { taperIn: 0, taperOut: 0.4 });
  ink.line([[bx + 22, -96], [bx + 22 + pull, -48], [bx + 22, -4]], 1.2, C.ink);
  // bolts in the magazine
  for (let j = 0; j < 3; j++) {
    const y = -52 - j * 4;
    const x0 = bx + 22 + pull - (snap && j === 0 ? 40 : 0);
    ink.line([[x0, y], [x0 - 70, y]], 2, C.inkSoft, 1, { taperIn: 0, taperOut: 0 });
    ink.fill([[x0 - 70, y - 3], [x0 - 80, y], [x0 - 70, y + 3]], C.ink, 1);
  }
  ink.shape([[bx + 30, -70], [bx + 70, -70], [bx + 70, -52], [bx + 30, -52]], WOOD, 1.4);
  // crank wheel at the back
  const cr = 12;
  ink.outline(Ink.ellPts(-40, -60, cr, cr), 2.2, C.ink);
  const ca = k * 0.9;
  ink.line([[-40, -60], [-40 + Math.cos(ca) * cr, -60 + Math.sin(ca) * cr]], 2.5, C.ink);
  ink.ox = ink.oy = 0;
  for (const dx of [-225, -150, -75]) ink.wheel(ax + dx, ay - 14, 14, k * 0.3, 2, WOOD_D);
  crew(ink, ax + 2, ay - 2, 1, col, { lean: 0.4, arm: 1.5 + Math.sin(ca) * 0.4, arm2: 1.2 + Math.cos(ca) * 0.4 });
  return ink.out(ax, ay);
}

// ------------------------------------------------------------------ 轒辒 armoured wagon (40280 blue 'cf?b', 40281 red 'cf?r')
function wagon(c: Ctx): PaintOut {
  const m = /^cf([mok])([br])(\d{4})$/.exec(c.name)!;
  const mode = m[1], col = m[2] === 'b' ? C.indigo : C.cinnabar;
  const n = +m[3];
  const W = 450, H = 200, ax = 200, ay = 172;
  const ink = new Ink(W, H);
  // die: 1, 21, 41 .. 221 → 0..1
  const t = mode === 'k' ? (n - 1) / 220 : 0;
  const open = mode === 'o' ? (n - 1) / 6 : 0;
  const roll = mode === 'm' ? n : 0;
  ink.shadow(ax, ay - 2, 150 + t * 60, 12, 0.35);
  ink.ox = ax;
  ink.oy = ay;
  const tilt = t * 0.12;
  const R = (p: Pt[], spread = 0) => xform(p, 0, -60, tilt, 1, spread, -60 + t * 40);
  // chassis
  ink.shape(R([[-150, -40], [150, -40], [150, -26], [-150, -26]]), WOOD_D, 2);
  // roof: sloped shed covered in hides (planks split apart when wrecked)
  const roofPieces = 5;
  for (let j = 0; j < roofPieces; j++) {
    const x0 = -150 + j * 60, x1 = x0 + 60;
    const off = t * (j - 2) * 40, drop = t * t * (60 + j * 8);
    const rot = t * (j % 2 ? 0.4 : -0.3);
    const yTop = (x: number) => -130 + Math.abs(x) * 0.25;
    const P = xform([[x0, -40], [x0, yTop(x0)], [x1, yTop(x1)], [x1, -40]], (x0 + x1) / 2, -80, rot, 1, (x0 + x1) / 2 + off, -80 + drop);
    ink.fill(P, j % 2 ? mix(C.ochre, C.inkWash, 0.35) : mix(C.ochre, C.inkWash, 0.2), 1, { tex: 0.4 });
    // hide stitching
    ink.line([P[1], P[2]], 2.5, C.ink, 0.9);
    ink.outline(P, 2, C.ink, 1, { dry: 0.25 });
  }
  // team-colour band along the eaves
  if (t < 0.5) ink.fill(R([[-150, -60], [150, -60], [150, -48], [-150, -48]]), col, 1 - t * 2, { tex: 0.2 });
  // side door (ramp) opens downward on 'open'
  if (open > 0 || mode === 'o') {
    const a = open * 1.4;
    const hinge: Pt = [-20, -40];
    const P = xform([[-50, -100], [10, -100], [10, -40], [-50, -40]], hinge[0], hinge[1], 0, 1);
    const Pr = P.map(([x, y]): Pt => [x, hinge[1] + (y - hinge[1]) * Math.cos(a)]).map(([x, y]): Pt => [x, y]);
    ink.fill([[-50, -100], [10, -100], [10, -40], [-50, -40]], C.ink, 0.75 * open);
    ink.shape(Pr.map(([x, y]): Pt => [x - Math.sin(a) * 0, y + Math.sin(a) * (y - hinge[1]) * -0.6]), WOOD, 2);
  }
  ink.ox = ink.oy = 0;
  for (const dx of [-115, -40, 40, 115]) {
    const dd = t * (dx > 0 ? 50 : -40) * (Math.abs(dx) / 100);
    ink.wheel(ax + dx + dd, ay - 20 + t * 8, 20, roll * 0.6 + t * dx * 0.03, 2.2, WOOD_D);
  }
  if (t > 0) ink.cv.fade(1 - smooth01(0.7, 1, t) * 0.5);
  return ink.out(ax, ay);
}

// ------------------------------------------------------------------ battering ram (40800)
function ram(c: Ctx): PaintOut {
  const W = 404, H = 150, ax = 2, ay = 140;
  const ink = new Ink(W, H);
  const k = c.i;
  const swing = Math.sin((k / 3) * TAU) * 6;
  ink.shadow(ax + 220, ay - 2, 170, 10, 0.35);
  ink.ox = ax;
  ink.oy = ay;
  // shed roof
  const roof: Pt[] = [[90, -40], [130, -118], [360, -118], [396, -40]];
  ink.fill(roof, mix(C.ochre, C.inkWash, 0.25), 1, { tex: 0.4 });
  for (let j = 1; j < 8; j++) ink.line([[90 + j * 38, -40], [130 + j * 30, -118]], 1.5, C.inkSoft, 0.7, { dry: 0.4 });
  ink.outline(roof, 2.4, C.ink);
  // uprights
  for (const x of [110, 240, 370]) ink.shape([[x - 4, -40], [x + 4, -40], [x + 4, -100], [x - 4, -100]], WOOD_D, 1.4);
  // ram log hanging from chains, iron tiger head at the front (x ≈ 0)
  const ly = -70;
  ink.line([[180, -112], [160 + swing, ly]], 1.4, C.ink);
  ink.line([[300, -112], [280 + swing, ly]], 1.4, C.ink);
  const log: Pt[] = [[30 + swing, ly - 9], [330 + swing, ly - 10], [330 + swing, ly + 10], [30 + swing, ly + 9]];
  ink.fill(log, WOOD_D, 1, { tex: 0.35 });
  ink.outline(log, 2, C.ink);
  const head: Pt[] = [[2 + swing, ly], [14 + swing, ly - 16], [40 + swing, ly - 16], [40 + swing, ly + 16], [14 + swing, ly + 16]];
  ink.fill(head, IRON, 1, { tex: 0.3 });
  ink.outline(head, 2.2, C.ink);
  ink.dot(16 + swing, ly - 6, 2.4, C.gamboge);
  ink.line([[8 + swing, ly + 6], [20 + swing, ly + 6]], 2, C.ink);
  // base frame
  ink.shape([[80, -40], [396, -40], [396, -28], [80, -28]], WOOD, 2);
  ink.ox = ink.oy = 0;
  for (const dx of [130, 250, 370]) ink.wheel(ax + dx, ay - 18, 18, k * 0.7, 2, WOOD_D);
  return ink.out(ax, ay);
}

// ------------------------------------------------------------------ wooden beast (40820 red 'car_fr/cekr', 40821 blue 'car_fb/cekb')
function beast(c: Ctx): PaintOut {
  const blue = /^(car_fb|cekb)/.test(c.name);
  const col = blue ? C.indigo : C.cinnabar;
  const die = c.name.startsWith('cek');
  const n = +c.name.slice(-4) || +c.name.slice(-2);
  const t = die ? n / 221 : 0;
  const run = die ? 0 : n;
  const W = 410, H = 215, ax = 200, ay = 196;
  const ink = new Ink(W, H);
  ink.shadow(ax, ay - 2, 80 + t * 110, 10, 0.35);
  ink.ox = ax;
  ink.oy = ay;
  const fall = ease.in(clamp(t * 1.2));
  const R = (p: Pt[], part = 0) => xform(p, 0, -60, fall * (part % 2 ? 0.5 : -0.35) * (1 + part * 0.1), 1, part * fall * 28 * (part % 2 ? 1 : -1), -60 + fall * 70);
  const bob = Math.sin(run * 2.1) * 2;
  // platform
  ink.shape(R([[-80, -36], [80, -36], [80, -24], [-80, -24]], 0), WOOD_D, 2);
  // body: crouching lion of painted wood
  const body: Pt[] = [[-56, -40 + bob], [-60, -96 + bob], [-20, -118 + bob], [44, -110 + bob], [66, -84 + bob], [62, -40 + bob]];
  ink.fill(R(body, 1), mix(col, C.paperDark, 0.25), 1, { tex: 0.35 });
  // painted cloud scrolls on the flank
  for (let j = 0; j < 3; j++) {
    const cx = -20 + j * 26, cy = -80 + bob + (j % 2) * 10;
    ink.line(R([[cx - 8, cy], [cx, cy - 8], [cx + 8, cy], [cx + 2, cy + 4]], 1), 2, C.gold, 0.9, { dry: 0.2 });
  }
  ink.outline(R(body, 1), 2.4, C.ink);
  // head with open fiery maw, mane
  const hx = -62, hy = -112 + bob;
  const headP: Pt[] = [[hx + 26, hy + 24], [hx + 18, hy - 14], [hx - 6, hy - 22], [hx - 30, hy - 8], [hx - 34, hy + 10], [hx - 18, hy + 30]];
  for (let j = 0; j < 7; j++) {
    const a = -0.2 + (j / 7) * 2.8;
    ink.line(R([[hx + 10, hy + 2], [hx + 10 + Math.cos(a) * 30, hy + 2 - Math.sin(a) * 30]], 2), 7, mix(C.gold, C.ochre, 0.4), 1, { taperIn: 0.1, taperOut: 0.9, dry: 0.3 });
  }
  ink.fill(R(headP, 2), mix(col, C.paperDark, 0.15), 1, { tex: 0.25 });
  ink.outline(R(headP, 2), 2.2, C.ink);
  ink.fill(R([[hx - 34, hy + 8], [hx - 14, hy + 4], [hx - 18, hy + 24]], 2), C.ink, 1);
  if (!die) ink.fill(R([[hx - 36, hy + 10], [hx - 60 - (run % 3) * 6, hy + 4], [hx - 52, hy + 16], [hx - 64 - (run % 2) * 8, hy + 22], [hx - 20, hy + 20]], 2), C.gamboge, 0.85);
  ink.dot(...R([[hx - 12, hy - 6]], 2)[0], 3.2, C.white);
  ink.dot(...R([[hx - 12, hy - 6]], 2)[0], 1.6, C.ink);
  // legs (blocky)
  for (const [x, ph] of [[-44, 0], [-14, 1], [26, 0.5], [50, 1.5]] as [number, number][]) {
    const sw = die ? 0 : Math.sin(run * 2.1 + ph * 3) * 6;
    ink.shape(R([[x - 7, -60], [x + 7, -60], [x + 7 + sw, -38], [x - 7 + sw, -38]], 3), mix(col, C.ink, 0.25), 1.6);
  }
  ink.ox = ink.oy = 0;
  for (const dx of [-60, 0, 60]) ink.wheel(ax + dx + fall * dx * 0.8, ay - 14 + fall * 4, 14, run * 0.8 + fall * 2, 2, WOOD_D);
  if (die) ink.cv.fade(1 - smooth01(0.6, 1, t) * 0.55);
  return ink.out(ax, ay);
}

// ------------------------------------------------------------------ siege tower (40900 blue 'cacb/cckb', 40901 red 'cacr/cckr')
function tower(c: Ctx): PaintOut {
  const blue = c.name[3] === 'b';
  const col = blue ? C.indigo : C.cinnabar;
  const die = c.name.startsWith('cck');
  const n = +c.name.slice(-4);
  const t = die ? n / 240 : 0;
  const run = die ? 0 : n;
  const W = 360, H = 245, ax = 124, ay = 228;
  const ink = new Ink(W, H);
  ink.shadow(ax + t * 80, ay - 2, 80 + t * 80, 10, 0.35);
  ink.ox = ax;
  ink.oy = ay;
  // topples to the right (backward) about its rear-bottom corner
  const fall = ease.in(clamp(t * 1.15)) * 1.35;
  const R = (p: Pt[]) => xform(p, 70, -20, fall, 1, 70, -20);
  // frame
  const posts: [number, number][] = [[-70, -60], [70, -60]];
  for (const [x] of posts) ink.shape(R([[x - 6, -26], [x + 6, -26], [x + 4, -200], [x - 4, -200]]), WOOD_D, 1.8);
  for (const y of [-60, -110, -160]) ink.line(R([[-70, y], [70, y]]), 4, WOOD_D);
  ink.line(R([[-70, -60], [70, -110]]), 3, WOOD_D, 0.9);
  ink.line(R([[70, -110], [-70, -160]]), 3, WOOD_D, 0.9);
  // hide-covered front screen
  const scr: Pt[] = [[-78, -150], [-78, -30], [-66, -30], [-66, -150]];
  ink.shape(R(scr), mix(C.ochre, C.inkWash, 0.3), 1.8);
  // archers' platform and parapet with team band
  const top: Pt[] = [[-84, -214], [84, -214], [84, -196], [-84, -196]];
  ink.shape(R(top), WOOD, 2);
  ink.fill(R([[-84, -206], [84, -206], [84, -200], [-84, -200]]), col, 1, { tex: 0.1 });
  // crenels
  for (let j = 0; j < 6; j++) ink.shape(R(Ink.rect(-80 + j * 28, -226, 14, 12)), WOOD, 1.4);
  // archer heads peeking
  if (!die) for (const x of [-40, 20]) {
    ink.dot(...R([[x, -232]])[0], 6, C.skin);
    ink.fill(R([[x - 6, -234], [x - 4, -240], [x + 4, -240], [x + 6, -234]]), col, 1);
    ink.line(R([[x - 8, -236], [x - 18, -250]]), 1.5, C.ink);
  }
  banner(ink, 0, 0, 0, col, 0); // no-op keep signature
  ink.ox = ink.oy = 0;
  if (!die) banner(ink, ax + 60, ay - 214, 46, col, run);
  for (const dx of [-55, 0, 55]) ink.wheel(ax + dx + fall * 40, ay - 16, 16, run * 0.7, 2, WOOD_D);
  if (die) ink.cv.fade(1 - smooth01(0.65, 1, t) * 0.5);
  return ink.out(ax, ay);
}

// ------------------------------------------------------------------ 木鸢 glider (40690 red 'kite', 40691 blue 'kitb')
function glider(c: Ctx): PaintOut {
  const col = c.name.startsWith('kitb') ? C.indigo : C.cinnabar;
  const W = 108, H = 72, ax = 42, ay = 68;
  const ink = new Ink(W, H);
  const flap = Math.sin((c.i / 4) * TAU);
  ink.ox = ax;
  ink.oy = ay - 34;
  // far wing
  const fw: Pt[] = [[-4, 0], [18, -22 - flap * 8], [36, -24 - flap * 8], [28, -2]];
  ink.fill(fw, mix(C.paper, C.ochre, 0.3), 1, { tex: 0.3 });
  for (let j = 0; j < 4; j++) ink.line([[2 + j * 6, -1], [16 + j * 6, -20 - flap * 8]], 1, C.inkSoft, 0.7);
  ink.outline(fw, 1.4, C.ink);
  // body: bamboo bird with tail fan
  const body: Pt[] = [[-30, 0], [-22, -6], [30, -5], [44, -10], [50, -2], [44, 6], [30, 5], [-22, 6]];
  ink.fill(body, WOOD, 1, { tex: 0.3 });
  ink.fill([[-22, -2], [30, -2], [30, 2], [-22, 2]], col, 1);
  ink.outline(body, 1.6, C.ink);
  // beak / head
  ink.fill([[-30, 0], [-40, 2], [-30, 4]], C.ink, 1);
  ink.dot(-24, -2, 1.6, C.ink);
  // pilot crouched on top
  ink.dot(8, -11, 4, C.skin);
  ink.fill([[3, -12], [5, -16], [11, -16], [13, -12]], col, 1);
  ink.fill([[2, -8], [16, -8], [14, -4], [4, -4]], C.inkSoft, 1);
  // near wing
  const nw: Pt[] = [[-6, 2], [10, 26 + flap * 10], [34, 30 + flap * 10], [26, 4]];
  ink.fill(nw, mix(C.paper, C.ochre, 0.15), 1, { tex: 0.3 });
  for (let j = 0; j < 4; j++) ink.line([[0 + j * 6, 3], [12 + j * 6, 26 + flap * 10]], 1, C.inkSoft, 0.7);
  ink.outline(nw, 1.4, C.ink);
  // ground shadow at the anchor (the glider flies high; the game sets z)
  ink.ox = ink.oy = 0;
  return ink.out(ax, ay);
}

export const machineRules: Rule[] = [
  { dir: 'magic/002', gen: bladeCart, group: () => 'cart' },
  { dir: 'magic/061', name: /^(carb|cbfb)/, group: (n) => n.slice(0, 4), gen: catapult },
  { dir: 'magic/067', name: /^(carg|cgfb)/, group: (n) => n.slice(0, 4), gen: cannon },
  { dir: 'magic/014', group: (n) => n.slice(0, 4), gen: crossbowCart },
  { dir: 'magic/028', group: (n) => n.slice(0, 4), gen: wagon },
  { dir: 'magic/080', gen: ram },
  { dir: 'magic/082', group: (n) => n.replace(/\d+$/, ''), gen: beast },
  { dir: 'magic/090', group: (n) => n.slice(0, 4), gen: tower },
  { dir: 'magic/069', group: (n) => n.slice(0, 4), gen: glider },
];

void [wreck, rng];
export type { Rng };
