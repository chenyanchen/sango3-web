// SFMap.json: the 野战 tile set tables the runtime reads. Only [graphics]
// (graphic index of a .blk record → sf/map frame) is used by the game; the
// [attributes] section documents the terrain attribute numbers (Terrain enum).
import { GRAPHICS } from '../maps/_tiles.ts';
import type { IniSection } from '../types.ts';

const ATTRS: [string, number, string][] = [
  ['p', 1, '土地'], ['g', 2, '草地'], ['f', 3, '森林'], ['d', 4, '沙漠'], ['a', 5, '水区'], ['s', 6, '雪地'], ['r', 7, '街道'],
  ['n', 8, '雪山'], ['m', 9, '山地'], ['w', 10, '城墙'], ['t', 11, '城门'], ['h', 12, '房舍'], ['o', 13, '主城'],
];

export function files(): Record<string, IniSection[]> {
  const attributes: IniSection = { _: 'attributes' };
  for (const [k, n, name] of ATTRS) attributes[`attr_${k}`] = `${n},${name}`;
  const graphics: IniSection = { _: 'graphics' };
  GRAPHICS.forEach((name, i) => (graphics[String(i + 1)] = `${name}.shp`));
  return { SFMap: [attributes, graphics] };
}
