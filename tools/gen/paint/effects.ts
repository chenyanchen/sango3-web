// Battle/duel visual effects (dirs magic, magic/*, bf/magic, sg2/magic and the
// root dir): 水墨 ink-splash explosions, calligraphic flames, dry-brush
// lightning, washes, plus the skill props (siege engines, beasts, summoned
// troops). Rules live in the _effects_* helpers; this file dispatches.
import type { FrameJob, PaintOut, Painter } from '../types.ts';
import { buildCtx, type Ctx, type Rule } from './_effects_ctx.ts';
import { Cv, scaled } from './_effects_kit.ts';
import { glowRules } from './_effects_glow.ts';
import { glow2Rules } from './_effects_glow2.ts';
import { propRules } from './_effects_props.ts';
import { machineRules } from './_effects_machines.ts';
import { beastRules } from './_effects_beasts.ts';
import { dragonRules } from './_effects_dragon.ts';
import { figRules } from './_effects_figs.ts';

const RULES: Rule[] = [...glowRules, ...glow2Rules, ...propRules, ...machineRules, ...beastRules, ...dragonRules, ...figRules];

const isMine = (d: string) => d === '' || d === 'magic' || d.startsWith('magic/') || d === 'bf/magic' || d === 'sg2/magic';

const ctxs = new Map<string, Map<string, { ctx: Ctx; rule: Rule }>>();

/** Faint ink dot for frames no rule covers yet (or 1×1 null frames). */
function blank(j: FrameJob): PaintOut {
  const [w, h, ax, ay] = j.box;
  const W = Math.max(1, w), H = Math.max(1, h);
  return { rgba: new Uint8Array(W * H * 4), w: W, h: H, ax, ay };
}

export const painter: Painter = {
  id: 'effects',
  match: isMine,
  prepare(dir, jobs) {
    ctxs.set(dir, buildCtx(dir, jobs, RULES));
  },
  async paint(job) {
    const e = ctxs.get(job.dir)?.get(job.name);
    if (!e) return blank(job);
    const o = await e.rule.gen(e.ctx);
    return 'rgba' in o && (job.uses.length > 0 || !job.single) ? fit(trim(o)) : o;
  },
};

type Raw = Extract<PaintOut, { rgba: Uint8Array }>;
/** Crops transparent margins (keeps the anchor meaning). */
function trim(o: Raw): Raw {
  const { w, h, rgba } = o;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (rgba[(y * w + x) * 4 + 3] > 2) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  if (x1 < 0) return { rgba: new Uint8Array(4), w: 1, h: 1, ax: o.ax, ay: o.ay };
  if (x0 === 0 && y0 === 0 && x1 === w - 1 && y1 === h - 1) return o;
  const W = x1 - x0 + 1, H = y1 - y0 + 1;
  const out = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) out.set(rgba.subarray(((y + y0) * w + x0) * 4, ((y + y0) * w + x0 + W) * 4), y * W * 4);
  return { rgba: out, w: W, h: H, ax: o.ax - x0, ay: o.ay - y0 };
}
/**
 * Animation frames must stay atlas frames (< 300×300 px area); larger ones
 * become standalone images the animation player can't show. Shrink to fit.
 */
const MAX_AREA = 300 * 300 - 400;
function fit(o: Raw): Raw {
  if (o.w * o.h < MAX_AREA) return o;
  const k = Math.sqrt(MAX_AREA / (o.w * o.h)) * 0.99;
  const cv = scaled(Cv.from(o.rgba, o.w, o.h), k);
  return { rgba: cv.rgba(), w: cv.w, h: cv.h, ax: Math.round(o.ax * k), ay: Math.round(o.ay * k) };
}
