// 野战 (field battle) art: sf/map terrain tiles, sf/groupicon unit figures,
// sf/ship boats, sf/camp camps, sf/magic status icons, sf/menu HUD art and
// sf/judge result-screen art. Tile semantics live in ../maps/_tiles.ts.
import { TILES } from '../maps/_tiles.ts';
import type { FrameJob, PaintOut, Painter } from '../types.ts';
import { paintGround, paintMask } from './_field_ground.ts';
import { paintObject } from './_field_objects.ts';
import { paintCamp, paintGroupIcon, paintShip } from './_field_units.ts';
import { paintJudge, paintMagicIcon, paintMenu } from './_field_ui.ts';

function mapTile(job: FrameJob): PaintOut {
  const d = TILES[job.name];
  if (!d) throw new Error(`sf/map: no tile definition for ${job.name}`);
  if (d.kind === 'fill') return paintGround(d.cls, d.cls === 'P' ? 0 : 15, d.variant, job.name);
  if (d.kind === 'edge') return paintGround(d.cls, d.mask, 0, job.name);
  if (d.kind === 'mask') return paintMask(d.name);
  const o = paintObject(d, job.name);
  if (!o) throw new Error(`sf/map: cannot paint ${job.name}`);
  return o;
}

export const painters: Painter[] = [
  { id: 'field-map', match: (d) => d === 'sf/map', paint: mapTile },
  { id: 'field-units', match: (d) => d === 'sf/groupicon', paint: paintGroupIcon },
  { id: 'field-ship', match: (d) => d === 'sf/ship', paint: paintShip },
  { id: 'field-camp', match: (d) => d === 'sf/camp', paint: paintCamp },
  { id: 'field-magic', match: (d) => d === 'sf/magic', paint: paintMagicIcon },
  { id: 'field-menu', match: (d) => d === 'sf/menu', paint: paintMenu },
  { id: 'field-judge', match: (d) => d === 'sf/judge' || d.startsWith('sf/'), paint: paintJudge },
];
