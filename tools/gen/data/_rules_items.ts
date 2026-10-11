// Items (Thing.json) of the generated set: names, descriptions and numbers are
// our own design. Exports ITEM_ICONS (what each ad/things icon must depict) and
// HORSE_LOOKS (what each bf/horse/NNN mount looks like) for the painters, and
// the item names for the people data (General01 Weapon/Horse/Book).
//
// Field meanings (see src/game/rules.ts doGiveItem/canEquip, src/game/state.ts,
// src/scenes/battle/rules.ts, src/scenes/field/war.ts, src/scenes/duel/rules.ts):
//   Type 1 兵符    Attribute = soldier type 0..8 learned
//   Type 2 武器    Increment = 武力 bonus (battle attack gets it twice); Attribute = weapon kind (1剑 2枪 3刀 4戟 5斧锤)
//   Type 3 书      Attribute 2 = 智力 +Increment, 3 = 体力上限 +Increment, 4 = 技力上限 +Increment
//   Type 4 马      Increment = speed (野战 move +6+2·inc, 单挑 agility); Attribute = mount object 38001..38014
//   Type 5 阵法书  Attribute = formation 0..7 learned
//   Type 6 宝物    Increment = 忠诚 gained; 招揽 value = Attraction + 3·Increment
//   Type 7 人参    Increment = permanent 体力上限 bonus (and full heal)
//   Type 8 灵芝    Increment = permanent 技力上限 bonus (and full MP)
// Level = level needed to equip (weapons/books/horses). FindRate = weight for
// city search seeding (0 = never found; only Level ≤ 25 items are seeded).
// Attraction = value when offered in 招揽 (treasure method).
import type { IniSection } from '../types.ts';

export interface ItemSpec {
  name: string;
  type: number;
  icon: string;
  desc: string;
  level: number;
  inc: number;
  find: number;
  attract: number;
  attr: number;
  count: number;
}

const SOLDIER_TOKEN_NAMES = ['刀盾', '弓手', '长枪', '轻骑', '技击', '山蛮', '藤甲', '女兵', '强弩'];

// ------------------------------------------------------------------ 兵符
const tokens: ItemSpec[] = SOLDIER_TOKEN_NAMES.map((n, t) => ({
  name: `${n}虎符`, type: 1, icon: 'A01', desc: `铜铸虎符，持之可统率${n}之兵。`,
  level: 1, inc: 0, find: 0, attract: 30, attr: t, count: 999,
}));

// ------------------------------------------------------------------ 阵法书 (formations 2..7; 0 and 1 are known by everyone)
const FORMATION_BOOKS: [string, number, string, number][] = [
  ['锋矢阵图', 2, '以精兵为锋、两翼随后的突击阵法图。', 40],
  ['雁行阵图', 3, '斜列如雁群，便于展开侧击的阵法图。', 35],
  ['鱼鳞阵图', 4, '层层相叠、中军厚实的阵法图。', 30],
  ['鹤翼阵图', 5, '两翼前张、包抄敌军的阵法图。', 30],
  ['长蛇阵图', 6, '首尾相应、善走险路的行军阵图。', 25],
  ['偃月阵图', 7, '主将居前、弧形推进的攻坚阵图。', 18],
];
const formationBooks: ItemSpec[] = FORMATION_BOOKS.map(([name, f, desc, find]) => ({
  name, type: 5, icon: 'B01', desc, level: 1, inc: 0, find, attract: 45, attr: f, count: 999,
}));

// ------------------------------------------------------------------ 武器
// [name, icon, kind, level, inc, find, desc, look (for the icon painter)]
type W = [string, string, number, number, number, number, string, string];
const WEAPONS: W[] = [
  // tier 1 — common iron
  ['环首铁刀', 'WEP001', 1, 1, 1, 70, '汉军制式的环首直刀，结实耐用。', 'plain iron single-edged straight sabre with a ring pommel'],
  ['白蜡杆枪', 'WEP002', 2, 1, 1, 70, '白蜡木为杆，韧而不折的步卒长枪。', 'plain spear with pale wooden shaft and small iron leaf head'],
  ['樵夫斧', 'WEP003', 5, 1, 1, 65, '山中樵夫的斧头，改作兵器。', 'humble woodcutter axe, short handle, plain iron head'],
  // tier 2
  ['百炼钢剑', 'WEP004', 1, 4, 2, 60, '反复锻打百次的钢剑，刃口明亮。', 'straight double-edged steel jian, bronze guard, dark grip'],
  ['点钢矛', 'WEP005', 2, 4, 2, 60, '矛头以钢点刃，可破皮甲。', 'long spear with steel-tipped broad leaf head and red tassel'],
  ['劈山刀', 'WEP006', 3, 4, 2, 55, '刀背厚重的长柄大刀。', 'long-handled heavy glaive with thick broad blade'],
  ['短铁戟', 'WEP007', 4, 4, 2, 55, '一手可使的短戟，攻守兼备。', 'short iron ji halberd: spear tip plus one side blade'],
  // tier 3
  ['寒铁剑', 'WEP008', 1, 7, 3, 50, '以北地寒铁铸成，剑身泛青。', 'jian with bluish cold-steel blade and black lacquer scabbard'],
  ['虎头枪', 'WEP009', 2, 7, 3, 50, '枪头下铸有虎首吞口。', 'spear whose head sits in a bronze tiger-head socket'],
  ['柳叶刀', 'WEP010', 3, 7, 3, 45, '刀尖上挑如眉，劈刺皆宜。', 'glaive with slender upturned eyebrow-shaped blade'],
  ['双刃戟', 'WEP011', 4, 7, 3, 45, '左右各有月刃的长戟。', 'long ji with two crescent side blades'],
  ['宣花斧', 'WEP012', 5, 7, 3, 45, '斧面錾有花纹的长柄大斧。', 'long-handled broad axe with engraved floral pattern'],
  // tier 4
  ['秋水剑', 'WEP013', 1, 10, 4, 38, '剑光如秋水，冷冽照人。', 'elegant jian with shimmering water-like blade, jade guard'],
  ['梨花枪', 'WEP014', 2, 10, 4, 38, '枪缨雪白，舞动时如梨花纷落。', 'spear with large snow-white tassel'],
  ['雁翎刀', 'WEP015', 3, 10, 4, 35, '刀身修长似雁翎。', 'long glaive with slim feather-shaped curved blade'],
  ['新月戟', 'WEP016', 4, 10, 4, 35, '一侧月牙刃，可勾可啄。', 'ji halberd with a single large crescent moon blade'],
  ['开山钺', 'WEP017', 5, 10, 4, 32, '形如巨斧的青铜钺。', 'large bronze yue battle-axe with round blade and green patina'],
  // tier 5
  ['龙泉剑', 'WEP018', 1, 13, 5, 26, '龙泉名匠所铸，锋利无比。', 'fine jian with dragon-engraved guard and silver blade'],
  ['蛇首矛', 'WEP019', 2, 13, 5, 26, '矛锋蜿蜒如蛇首。', 'spear with wavy serpentine blade'],
  ['九环刀', 'WEP020', 3, 13, 5, 24, '刀背穿九枚铁环，挥动作响。', 'broad sabre with nine iron rings along the spine'],
  ['盘螭戟', 'WEP021', 4, 13, 5, 24, '戟杆缠铸螭龙纹。', 'ji halberd with hornless-dragon coiling around the shaft top'],
  ['钉头棒', 'WEP022', 5, 13, 5, 24, '棒头密布铁钉，势大力沉。', 'heavy club with a head studded with iron spikes'],
  // tier 6
  ['青锋剑', 'WEP023', 1, 16, 6, 18, '青光凛凛，斩铁如泥。', 'jian with cyan-glinting blade and long silk tassel'],
  ['破阵枪', 'WEP024', 2, 16, 6, 18, '专为冲阵所制的重枪。', 'heavy lance with long thick steel head and black shaft'],
  ['断水刀', 'WEP025', 3, 16, 6, 16, '传说可一刀断开江水。', 'great glaive with wide wave-patterned blade'],
  ['方天戟', 'WEP026', 4, 16, 6, 16, '两侧皆有月刃的重戟。', 'heavy ji with symmetrical twin crescent blades and red tassel'],
  ['飞星锤', 'WEP027', 5, 16, 6, 16, '铁链系双锤，飞击如流星。', 'pair of iron meteor hammers on a chain'],
  // tier 7
  ['七星剑', 'WEP028', 1, 19, 7, 10, '剑身嵌七颗铜星，如北斗。', 'jian with seven inlaid golden stars in a Big Dipper line'],
  ['追风枪', 'WEP029', 2, 19, 7, 10, '轻而长，出手快如疾风。', 'long light spear with streaming white ribbons'],
  ['镇岳刀', 'WEP030', 3, 19, 7, 9, '刀重如山，非力士不能用。', 'massive glaive with mountain motif on the blade'],
  ['凤翅戟', 'WEP031', 4, 19, 7, 9, '戟刃如凤凰展翅。', 'ji halberd with blades shaped like spread phoenix wings, gold'],
  ['碎岳锤', 'WEP032', 5, 19, 7, 9, '一锤可碎山石的大铜锤。', 'huge bronze melon hammer on a long handle'],
  // tier 8
  ['紫电剑', 'WEP033', 1, 22, 8, 5, '剑出时紫光如电。', 'jian with violet lightning glow along the blade'],
  ['蟠龙枪', 'WEP034', 2, 22, 8, 5, '枪杆盘绕金龙。', 'spear with a golden dragon coiling up the shaft'],
  ['冷月刀', 'WEP035', 3, 22, 9, 4, '刀如寒月，夜战尤利。', 'glaive with pale crescent-moon blade, cold silver sheen'],
  ['裂天戟', 'WEP036', 4, 22, 9, 4, '戟锋开刃三尺，威震三军。', 'enormous ji halberd, red shaft, gleaming triple blade'],
  ['金蘸斧', 'WEP037', 5, 22, 8, 4, '斧刃蘸金，光耀夺目。', 'gilded great axe with gold-dipped edge'],
  // tier 9 — legendary
  ['赤霄', 'WEP038', 1, 25, 12, 1, '相传汉高祖斩蛇起义之剑。', 'ancient imperial jian with red glow, gold dragon guard'],
  ['天狼枪', 'WEP039', 2, 25, 11, 1, '枪头寒星一点，所向无前。', 'black spear with a star-like white glint at the tip, wolf-head socket'],
  ['惊鸿刀', 'WEP040', 3, 25, 11, 1, '刀光一闪，如惊鸿掠影。', 'graceful long glaive with white-crane motif, flowing ribbon'],
  ['霸王戟', 'WEP041', 4, 25, 12, 1, '戟重百斤，唯盖世猛将能挥。', 'colossal black-iron ji with gold inlay, tiger engraving'],
];
const weapons: ItemSpec[] = WEAPONS.map(([name, icon, kind, level, inc, find, desc]) => ({
  name, type: 2, icon, desc: `${desc}武力+${inc}。`, level, inc, find,
  attract: 18 + inc * 8, attr: kind, count: find >= 30 ? 400 : find >= 10 ? 100 : 10,
}));

// ------------------------------------------------------------------ 书
// [name, icon, attr (2智 3体 4技), level, inc, find, desc, look]
type B = [string, string, number, number, number, number, string, string];
const BOOKS: B[] = [
  ['司马法', 'BOOK01', 2, 1, 2, 55, '古司马之兵法，论军礼与治军。', 'bamboo-slip scroll tied with red cord'],
  ['尉缭子', 'BOOK02', 2, 5, 3, 40, '论兵农相兼、重刑严令之书。', 'rolled bamboo slips with indigo cord'],
  ['吴子', 'BOOK03', 2, 9, 4, 28, '吴起所著，论料敌治兵之要。', 'thick bundle of bamboo slips, cinnabar title tag'],
  ['三略', 'BOOK04', 2, 12, 5, 16, '上中下三略，论御将驭众之术。', 'three silk scrolls in a lacquered tray'],
  ['六韬', 'BOOK05', 2, 15, 6, 8, '文武龙虎豹犬六韬，兵家大成。', 'six bound volumes stacked, tiger mark on cover'],
  ['孙子', 'BOOK06', 2, 20, 8, 2, '兵家至典，十三篇言简意深。', 'ancient revered bamboo-slip book with gold cord and seal'],
  ['黄帝内经', 'BOOK07', 3, 3, 30, 35, '医家经典，调养气血，体力上限+30。', 'yellow-covered thread-bound medical book with herb sprig'],
  ['导引图', 'BOOK08', 3, 12, 60, 10, '绘有导引行气诸式，体力上限+60。', 'unrolled silk painting with small figures doing exercises'],
  ['太平经', 'BOOK09', 4, 5, 20, 30, '道家经书，静心养气，技力上限+20。', 'indigo-covered taoist scripture with yin-yang mark'],
  ['参同契', 'BOOK10', 4, 15, 40, 8, '论炼丹养性之书，技力上限+40。', 'scroll beside a small bronze alchemy cauldron'],
];
const books: ItemSpec[] = BOOKS.map(([name, icon, attr, level, inc, find, desc]) => ({
  name, type: 3, icon, desc: attr === 2 ? `${desc}智力+${inc}。` : desc, level, inc, find,
  attract: 30 + (attr === 2 ? inc * 9 : inc), attr, count: find >= 30 ? 300 : find >= 10 ? 100 : 20,
}));

// ------------------------------------------------------------------ 马
// [name, icon/object NN, level, inc, find, desc, coat (for the icon + bf/horse painters)]
type H = [string, number, number, number, number, string, string];
const HORSES: H[] = [
  ['驽马', 1, 1, 1, 65, '寻常驮马，聊胜于无。', 'plain dull-brown work horse, shaggy mane'],
  ['青骢马', 2, 4, 2, 55, '青白杂毛的健马。', 'blue-grey dappled horse, dark mane'],
  ['黄骠马', 3, 8, 3, 45, '黄毛白点，耐力极佳。', 'yellow horse with small white spots, pale mane'],
  ['枣骝马', 4, 10, 3, 40, '枣红色骏马，性情温顺。', 'reddish-brown (jujube) horse with black mane and tail'],
  ['乌骓', 5, 20, 6, 3, '通体乌黑，相传为西楚霸王坐骑。', 'jet-black stallion with glossy coat, long black mane'],
  ['白龙驹', 6, 12, 4, 25, '雪白骏马，奔驰如游龙。', 'pure white horse, flowing white mane'],
  ['宛驹', 7, 16, 5, 8, '大宛良驹，奔跑时汗出如血。', 'slender chestnut-gold Ferghana horse with shining coat'],
  ['踏雪', 8, 14, 4, 18, '黑身白蹄，如踏雪而行。', 'black horse with four white socks/hooves'],
  ['紫骍马', 9, 17, 5, 8, '紫红毛色，神骏非凡。', 'purplish-red horse with dark burgundy mane'],
  ['西凉马', 10, 6, 3, 45, '凉州所产战马，高大剽悍。', 'tall sturdy bay horse with tufted fetlocks, northwestern steppe breed'],
  ['赤骥', 11, 22, 7, 2, '穆王八骏之一，赤如烈火。', 'blazing bright-red horse, fiery mane'],
  ['飞黄', 12, 25, 8, 1, '传说中的神马，背生双角，日行万里。', 'legendary golden horse with two small horns, mane like flames'],
  ['骅骝', 13, 19, 6, 4, '赤身黑鬣的千里马。', 'red-bay horse with black mane and tail, very muscular'],
  ['逐日', 14, 23, 7, 2, '奔若追日，影不能及。', 'pale-gold palomino with white mane streaming like sun rays'],
];
const horses: ItemSpec[] = HORSES.map(([name, nn, level, inc, find, desc]) => ({
  name, type: 4, icon: `HOR${String(nn).padStart(3, '0')}`, desc: `${desc}速度+${inc}。`, level, inc, find,
  attract: 25 + inc * 9, attr: 38000 + nn, count: find >= 30 ? 500 : find >= 8 ? 100 : 1,
}));

// ------------------------------------------------------------------ 宝物 / 人参 / 灵芝
// [name, icon, type, inc, find, attract, desc, look]
type T = [string, string, number, number, number, number, string, string];
const TREASURES: T[] = [
  ['蜀锦', 'C05', 6, 4, 60, 34, '成都织造的彩锦，赐之可增忠诚4点。', 'folded bolt of richly patterned red-gold brocade silk'],
  ['玉璧', 'C04', 6, 6, 45, 46, '温润白玉所琢之璧，赐之可增忠诚6点。', 'round flat white-green jade bi disc with central hole'],
  ['明珠', 'C03', 6, 8, 30, 60, '夜里自放光华的大珠，赐之可增忠诚8点。', 'large luminous pearl glowing on a small stand'],
  ['金饼', 'C02', 6, 10, 22, 74, '汉制马蹄金饼一盒，赐之可增忠诚10点。', 'small open box of round Han gold cakes'],
  ['博山炉', 'C01', 6, 14, 10, 96, '错金铜香炉，形如仙山，赐之可增忠诚14点。', 'gilt bronze incense burner shaped like misty mountains, smoke'],
  ['山参', 'G01', 7, 15, 25, 30, '深山野参，体力全复，体力上限+15。', 'single ginseng root with fine rootlets and leaves'],
  ['赤芝', 'G02', 8, 10, 25, 30, '红褐色灵芝，技力全复，技力上限+10。', 'red-brown glossy lingzhi mushroom'],
  ['千年参王', 'G03', 7, 40, 3, 90, '形如人身的千年老参，体力上限+40。', 'huge old human-shaped ginseng root tied with red string'],
  ['紫芝', 'G04', 8, 25, 3, 90, '罕见紫色仙芝，技力上限+25。', 'rare glowing purple lingzhi with cloud-like cap'],
];
const treasures: ItemSpec[] = TREASURES.map(([name, icon, type, inc, find, attract, desc]) => ({
  name, type, icon, desc, level: 1, inc, find, attract, attr: 0, count: 999,
}));

export const ITEMS: ItemSpec[] = [...tokens, ...formationBooks, ...weapons, ...books, ...horses, ...treasures];

export function thingSections(): IniSection[] {
  return ITEMS.map((it) => ({
    _: 'ITEM', Name: it.name, Type: String(it.type), Count: String(it.count), Statement: it.desc, Icon: it.icon,
    Level: String(it.level), Increment: String(it.inc), Increment2: '0', Increment3: '0',
    FindRate: String(it.find), Attraction: String(it.attract), Attribute: String(it.attr),
  }));
}

/** What every ad/things icon must depict (for the UI painter). Icon names are lower-case frame names. */
export const ITEM_ICONS: { icon: string; name: string; type: number; desc: string }[] = [
  { icon: 'a01', name: '虎符', type: 1, desc: 'bronze tiger tally (hu fu): crouching tiger-shaped token split in two halves, inscribed' },
  { icon: 'b01', name: '阵图', type: 5, desc: 'unrolled scroll showing a battle formation diagram of dots and lines' },
  ...WEAPONS.map(([name, icon, , , , , , look]) => ({ icon: icon.toLowerCase(), name, type: 2, desc: look })),
  ...BOOKS.map(([name, icon, , , , , , look]) => ({ icon: icon.toLowerCase(), name, type: 3, desc: look })),
  ...HORSES.map(([name, nn, , , , , coat]) => ({ icon: `hor${String(nn).padStart(3, '0')}`, name, type: 4, desc: `horse head-and-neck portrait: ${coat}` })),
  ...TREASURES.map(([name, icon, type, , , , , look]) => ({ icon: icon.toLowerCase(), name, type, desc: look })),
];

/** Mount looks for the battle horse sprites bf/horse/NNN (object 38000 + NN). */
export const HORSE_LOOKS: { obj: number; dir: string; name: string; coat: string }[] = HORSES.map(([name, nn, , , , , coat]) => ({
  obj: 38000 + nn, dir: `bf/horse/${String(nn).padStart(3, '0')}`, name, coat,
}));

export const WEAPON_NAMES = WEAPONS.map((w) => w[0]);
export const HORSE_NAMES = HORSES.map((h) => h[0]);
export const BOOK_NAMES = BOOKS.map((b) => b[0]);
