// Scenery painter: the large illustrated images — battlefield backgrounds
// (bf/bg), court backdrops (ad/background), title / era selection (mm,
// mm/base), endings and credits (ending), the tournament bracket (arena,
// arena/base), custom-general panels (cg/base) and misc panels (others).
import type { FrameJob, PaintOut, Painter } from '../types.ts';
import { paintArt } from './_scenery_art.ts';
import { paintBg } from './_scenery_bf.ts';

const DIRS = new Set(['bf/bg', 'ad/background', 'mm', 'mm/base', 'ending', 'cg/base', 'arena', 'arena/base', 'others']);

export const painter: Painter = {
  id: 'scenery',
  match: (dir) => DIRS.has(dir),
  paint(job: FrameJob): PaintOut | Promise<PaintOut> {
    if (job.dir === 'bf/bg') return paintBg(job);
    return paintArt(job);
  },
};
