// Battle sprite sets (bf/general/NNN, object 30000 + set). Shared contract:
// the units painter draws each set to this description, and the people data
// gives every general a BFShape (set) and WeaponType that fit them.

/** WeaponType (also picks the HUD gauge style 1..5). */
export const WEAPON = { sword: 1, spear: 2, glaive: 3, halberd: 4, axe: 5 } as const;
export type WeaponKind = keyof typeof WEAPON;

export interface UnitSet {
  set: number;
  weapon: WeaponKind | 'fan' | 'twinblades' | 'club';
  sex: 1 | 2;
  /** unique hero look (1–36) or generic archetype (37–43, 80–83) */
  kind: 'hero' | 'generic' | 'barbarian';
  /** armour colour family for the painter (team colour is added at runtime by flags / position) */
  hue: 'red' | 'green' | 'blue' | 'black' | 'white' | 'gold' | 'purple' | 'brown';
  note: string;
}

const H = (set: number, weapon: UnitSet['weapon'], hue: UnitSet['hue'], note: string, sex: 1 | 2 = 1): UnitSet => ({ set, weapon, sex, kind: 'hero', hue, note });

// prettier-ignore
export const UNIT_SETS: UnitSet[] = [
  // unique heroes: the people data assigns one famous general to each
  H(1, 'glaive', 'green', '青袍长髯，青龙偃月刀'),
  H(2, 'spear', 'black', '黑甲虎须，丈八蛇矛'),
  H(3, 'spear', 'white', '白袍银甲，亮银枪'),
  H(4, 'halberd', 'red', '雉尾金冠，方天画戟'),
  H(5, 'spear', 'white', '白甲狮盔，锦袍长枪'),
  H(6, 'glaive', 'gold', '老将金甲，大刀'),
  H(7, 'axe', 'brown', '赤膊巨汉，双铁戟'),
  H(8, 'sword', 'purple', '紫袍金冠，倚天剑（霸主）'),
  H(9, 'twinblades', 'green', '绿袍，双股剑（仁君）'),
  H(10, 'sword', 'red', '红袍少年君主，古锭刀'),
  H(11, 'fan', 'white', '纶巾鹤氅，羽扇'),
  H(12, 'spear', 'blue', '蓝甲独眼，长枪'),
  H(13, 'glaive', 'black', '黑甲虬髯，大斧刀'),
  H(14, 'sword', 'gold', '金甲，宝剑（江东少主）'),
  H(15, 'spear', 'red', '红袍锦帆，长枪'),
  H(16, 'halberd', 'blue', '蓝甲，戟'),
  H(17, 'club', 'brown', '藤甲南蛮，铁蒺藜骨朵'),
  H(18, 'sword', 'white', '白衣都督，长剑'),
  H(19, 'spear', 'gold', '金甲，长枪'),
  H(20, 'glaive', 'red', '红甲，大刀'),
  H(21, 'axe', 'black', '黑甲，开山斧'),
  H(22, 'spear', 'green', '绿甲，长枪'),
  H(23, 'halberd', 'gold', '金甲，戟'),
  H(24, 'halberd', 'black', '黑甲，戟'),
  H(25, 'spear', 'purple', '紫甲，长枪'),
  H(26, 'sword', 'blue', '蓝袍，剑'),
  H(27, 'axe', 'red', '红甲，大斧'),
  H(28, 'twinblades', 'red', '红衣女将，双刀', 2),
  H(29, 'spear', 'brown', '褐甲，长枪'),
  H(30, 'sword', 'black', '黑袍，剑'),
  H(31, 'fan', 'blue', '蓝袍文士，羽扇'),
  H(32, 'sword', 'purple', '紫袍谋士，剑'),
  H(33, 'sword', 'green', '青衫，剑'),
  H(34, 'halberd', 'red', '红甲，戟'),
  H(35, 'glaive', 'blue', '蓝甲，大刀'),
  H(36, 'spear', 'white', '白袍女将，枪', 2),
  // generic archetypes for everyone else
  { set: 37, weapon: 'spear', sex: 1, kind: 'generic', hue: 'blue', note: '持枪武将' },
  { set: 38, weapon: 'sword', sex: 1, kind: 'generic', hue: 'brown', note: '持剑武将' },
  { set: 39, weapon: 'glaive', sex: 1, kind: 'generic', hue: 'green', note: '持大刀武将' },
  { set: 40, weapon: 'halberd', sex: 1, kind: 'generic', hue: 'red', note: '持戟武将' },
  { set: 41, weapon: 'axe', sex: 1, kind: 'generic', hue: 'black', note: '持斧武将' },
  { set: 42, weapon: 'fan', sex: 1, kind: 'generic', hue: 'white', note: '文官谋士' },
  { set: 43, weapon: 'sword', sex: 2, kind: 'generic', hue: 'purple', note: '女将' },
  { set: 80, weapon: 'club', sex: 1, kind: 'barbarian', hue: 'brown', note: '南蛮首领' },
  { set: 81, weapon: 'axe', sex: 1, kind: 'barbarian', hue: 'black', note: '山越首领' },
  { set: 82, weapon: 'spear', sex: 1, kind: 'barbarian', hue: 'gold', note: '羌胡首领' },
  { set: 83, weapon: 'sword', sex: 2, kind: 'barbarian', hue: 'red', note: '南蛮女王' },
];

/** WeaponType for a set (fan/twinblades/club map onto the nearest gauge style). */
export function weaponTypeOf(set: number): number {
  const w = UNIT_SETS.find((u) => u.set === set)?.weapon ?? 'sword';
  return w === 'fan' || w === 'twinblades' ? WEAPON.sword : w === 'club' ? WEAPON.axe : WEAPON[w];
}
