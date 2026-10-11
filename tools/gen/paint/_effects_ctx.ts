// Shared context for effect rules: a frame's place in its sequence and the
// sequence's bounding box (so all frames of one effect share a canvas size).
import type { Box, FrameJob, PaintOut } from '../types.ts';

export interface Ctx {
  job: FrameJob;
  dir: string;
  name: string;
  box: Box;
  /** sequence (group) key, index and length; t = i / (n - 1) */
  group: string;
  i: number;
  n: number;
  t: number;
  /** max box over the group: w, h and the anchor of the largest frame */
  gw: number;
  gh: number;
  gax: number;
  gay: number;
  /** stable seed for the group */
  seed: string;
}

export type Gen = (c: Ctx) => PaintOut | Promise<PaintOut>;
export interface Rule {
  /** directory (exact) */
  dir: string | string[];
  /** frame name filter */
  name?: RegExp;
  /** group key (default: name without trailing index) */
  group?: (name: string) => string;
  /** index key for ordering inside the group (default: the name) */
  order?: (name: string) => number | string;
  gen: Gen;
}

export const defGroup = (n: string) => n.replace(/\d+[a-z]?$/, '') || n;

/** Builds contexts for all jobs of a dir according to the matching rules. */
export function buildCtx(dir: string, jobs: FrameJob[], rules: Rule[]): Map<string, { ctx: Ctx; rule: Rule }> {
  const out = new Map<string, { ctx: Ctx; rule: Rule }>();
  const groups = new Map<string, { rule: Rule; jobs: FrameJob[] }>();
  for (const j of jobs) {
    const rule = rules.find((r) => (Array.isArray(r.dir) ? r.dir.includes(dir) : r.dir === dir) && (!r.name || r.name.test(j.name)));
    if (!rule) continue;
    const g = (rule.group ?? defGroup)(j.name);
    const key = rules.indexOf(rule) + '|' + g;
    if (!groups.has(key)) groups.set(key, { rule, jobs: [] });
    groups.get(key)!.jobs.push(j);
  }
  for (const [key, { rule, jobs: js }] of groups) {
    const ord = rule.order ?? ((n: string) => n);
    js.sort((a, b) => {
      const x = ord(a.name), y = ord(b.name);
      return x < y ? -1 : x > y ? 1 : 0;
    });
    let big = js[0];
    let gw = 0, gh = 0;
    for (const j of js) {
      gw = Math.max(gw, j.box[0]);
      gh = Math.max(gh, j.box[1]);
      if (j.box[0] * j.box[1] > big.box[0] * big.box[1]) big = j;
    }
    const g = key.slice(key.indexOf('|') + 1);
    js.forEach((j, i) => {
      out.set(j.name, {
        rule,
        ctx: { job: j, dir, name: j.name, box: j.box, group: g, i, n: js.length, t: js.length > 1 ? i / (js.length - 1) : 0, gw, gh, gax: big.box[2], gay: big.box[3], seed: `${dir}/${g}` },
      });
    });
  }
  return out;
}
