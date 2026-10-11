// Sanity check of the rules data: parses files() with the same logic as
// src/data/db.ts and asserts counts / ranges / cross references.
//   pnpm tsx tools/gen/data/_rules_check.ts [--orig]   (--orig: also assert no name is shared with the original set)
import fs from 'node:fs';
import path from 'node:path';
import { files, generalExp } from './rules.ts';
import { ITEM_ICONS, HORSE_LOOKS } from './_rules_items.ts';

type Sec = { _: string } & Record<string, string | string[] | undefined>;
const num = (v: unknown, d = 0) => {
  const n = parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) ? n : d;
};
const str = (v: unknown) => (Array.isArray(v) ? String(v[0] ?? '') : String(v ?? '')).trim();
const list = (v: unknown) => str(v).split(',').map((s) => s.trim()).filter(Boolean);
const nums = (v: unknown) => list(v).map(Number).filter((n) => Number.isFinite(n));

let errors = 0;
const ok = (c: unknown, msg: string) => {
  if (!c) {
    errors++;
    console.error('FAIL', msg);
  }
};

const root = path.resolve(import.meta.dirname, '../../..');
const raw = files() as Record<string, Sec[]>;
// round-trip through JSON like the runner does
for (const k of Object.keys(raw)) raw[k] = JSON.parse(JSON.stringify(raw[k]));

// items
const shapes = JSON.parse(fs.readFileSync(path.join(root, 'tools/gen/spec/shapes.json'), 'utf8'));
const iconFrames = new Set(Object.keys(shapes.ad_things.frames));
const items = raw.Thing.filter((s) => s._ === 'ITEM').map((s, i) => ({
  id: i, name: str(s.Name), type: num(s.Type), icon: str(s.Icon).toLowerCase(), level: num(s.Level), inc: num(s.Increment),
  find: num(s.FindRate), attraction: num(s.Attraction), attribute: num(s.Attribute), desc: str(s.Statement),
}));
ok(new Set(items.map((i) => i.name)).size === items.length, 'item names unique');
for (const it of items) {
  ok(it.type >= 1 && it.type <= 8, `item ${it.name} type`);
  ok(iconFrames.has(it.icon), `item ${it.name} icon ${it.icon} exists in ad_things`);
  ok(it.desc.length > 0, `item ${it.name} desc`);
  if (it.type === 1) ok(it.attribute >= 0 && it.attribute <= 8, `token ${it.name} soldier type`);
  if (it.type === 5) ok(it.attribute >= 2 && it.attribute <= 7, `formation book ${it.name}`);
  if (it.type === 4) ok(it.attribute >= 38001 && it.attribute <= 38014 && it.inc > 0, `horse ${it.name} object/speed`);
  if (it.type === 3) ok([2, 3, 4].includes(it.attribute) && it.inc > 0, `book ${it.name} attribute`);
  if (it.type === 2) ok(it.inc > 0 && it.level <= 25, `weapon ${it.name}`);
  if (it.find > 0) ok(it.level <= 25, `findable ${it.name} level ≤ 25 (city seeding)`);
}
for (let t = 0; t <= 8; t++) ok(items.some((i) => i.type === 1 && i.attribute === t), `token for soldier ${t}`);
for (const f of iconFrames) ok(ITEM_ICONS.some((x) => x.icon === f), `ITEM_ICONS covers frame ${f}`);
for (const x of ITEM_ICONS) ok(iconFrames.has(x.icon), `ITEM_ICONS frame ${x.icon} exists`);
ok(HORSE_LOOKS.length === 14 && new Set(HORSE_LOOKS.map((h) => h.obj)).size === 14, 'horse looks 38001..38014');

// soldiers
const soldiers = raw.Soldier.filter((s) => s._ === 'ITEM').map((s) => ({
  id: num(s.No), name: str(s.Name), adv: str(s.NameAdv), obj: num(s.ResID), hp: num(s.StartHP), ahp: num(s.AddHP), pw: num(s.StartPower), apw: num(s.AddPower),
  hit: Array.from({ length: 10 }, (_, k) => num(s[`HitRate0${k}`], -1)),
}));
ok(soldiers.length === 9, 'soldiers = 9');
soldiers.forEach((s, i) => {
  ok(s.id === i && s.obj === 34010 + 10 * i, `soldier ${i} id/ResID`);
  ok(s.hit.every((h) => h >= 5 && h <= 95), `soldier ${i} hit rates`);
  ok(s.hp > 0 && s.pw > 0 && s.name && s.adv, `soldier ${i} stats`);
});

// BF magic
const bf = raw.BFMagic.filter((s) => s._ === 'BF_MAGIC').map((s) => ({
  id: num(s.No), name: str(s.Name), mp: num(s.MP), power: num(s.Power), level: num(s.Level), merit: num(s.Contribution),
  intUp: num(s.IntUp), intDown: num(s.IntDown), strUp: num(s.StrUp), strDown: num(s.StrDown),
  terr: [...nums(s.GoodTerrain), ...nums(s.BadTerrain)], time: [...nums(s.GoodTimeZone), ...nums(s.BadTimeZone)], wea: [...nums(s.GoodWeather), ...nums(s.BadWeather)],
}));
ok(bf.length === 125, 'BF = 125');
bf.forEach((m, i) => {
  ok(m.id === i + 1, `BF index ${i + 1}`);
  ok(m.name && m.mp > 0 && m.mp <= 70 && m.level >= 1 && m.level <= 60 && m.merit > 0, `BF ${m.id} ${m.name} basics`);
  ok(m.intDown <= m.intUp && m.strDown <= m.strUp && m.intDown <= 95 && m.strDown <= 95, `BF ${m.id} requirements reachable`);
  ok(m.terr.every((t) => t >= 1 && t <= 12) && m.time.every((t) => t >= 1 && t <= 3) && m.wea.every((t) => t >= 1 && t <= 3), `BF ${m.id} codes`);
});
ok(new Set(bf.map((m) => m.name)).size === 125, 'BF names unique');
ok(bf[3].power < 0 && bf[84].power < 0, 'heals (4, 85) have negative power');

// SF magic
const sf = raw.SFMagic.filter((s) => s._ === 'SF_MAGIC').map((s) => ({ id: num(s.No), name: str(s.Name), et: num(s.EnemyType), range: num(s.Range), intDown: num(s.IntDown) }));
ok(sf.length === 23 && sf.every((m, i) => m.id === i + 1), 'SF = 23, ids 1..23');
ok(sf[0].et === 0 && sf[1].et === 0 && sf.slice(2).every((m) => m.et > 0 && m.range >= 1), 'SF weather/targeted');

// formations
const ranks = raw.Rank.filter((s) => /^RANK\d+$/.test(s._)).map((s) => ({
  id: num(s._.slice(4)), name: str(s.Name), gen: nums(s.GeneralPos),
  groups: Array.from({ length: 8 }, (_, k) => nums(s[`GroupPos0${k}`])),
  big: Array.from({ length: 5 }, (_, k) => nums(s[`BigGroup0${k}`])), cost: nums(s.TerrainCost),
}));
ok(ranks.length === 8 && ranks.every((r, i) => r.id === i), 'Rank 0..7');
for (const r of ranks) {
  ok(r.gen.length === 2 && r.groups.every((g) => g.length === 2 && g[0] >= 0 && g[0] <= 55 && g[1] >= 0 && g[1] <= 31), `rank ${r.name} positions`);
  const all = r.big.flat().sort((a, b) => a - b);
  ok(all.join() === '0,1,2,3,4,5,6,7', `rank ${r.name} big groups cover 0..7 once`);
  ok(r.cost.length === 15 && r.cost[10] === 999 && r.cost[8] === 999 && [1, 2, 3, 4, 5, 6, 7, 9, 11, 12, 13].every((t) => r.cost[t] < 999), `rank ${r.name} terrain costs`);
}

// titles
const titles = raw.GenTitle.filter((s) => s._ === 'ITEM').map((s) => ({ id: num(s.No), name: str(s.Name), level: num(s.Level), soldiers: num(s.Soldiers) }));
ok(titles.every((t, i) => t.id === i), 'title ids = index');
ok(titles.every((t, i) => i === 0 || (t.level >= titles[i - 1].level && t.soldiers >= titles[i - 1].soldiers)), 'titles monotonic');
ok(Math.max(...titles.map((t) => t.soldiers)) <= 400, 'soldier cap ≤ 400 (battle performance)');

// exp
const game = raw.Game;
const ge = game.find((s) => s._ === 'GENERALEXP')!;
const exp = [0];
for (let lv = 1; lv <= 99; lv++) exp[lv] = num(ge[String(lv).padStart(2, '0')]);
ok(exp.length === 100 && exp[1] === 0 && exp.every((v, i) => i < 2 || v > exp[i - 1]), 'GENERALEXP 1..99 increasing');
ok(exp[50] === generalExp(50), 'exp fn');

// no name copied from the original set (optional, needs public/assets-orig)
if (process.argv.includes('--orig')) {
  const od = path.join(root, 'public/assets-orig/data');
  const names = (f: string) => new Set((JSON.parse(fs.readFileSync(path.join(od, f + '.json'), 'utf8')) as Sec[]).map((s) => str(s.Name)).filter(Boolean));
  for (const [f, mine] of [['Thing', items.map((i) => i.name)], ['BFMagic', bf.map((m) => m.name)], ['SFMagic', sf.map((m) => m.name)], ['Rank', ranks.map((r) => r.name)], ['Soldier', soldiers.flatMap((s) => [s.name, s.adv])]] as const) {
    const o = names(f);
    const clash = mine.filter((n) => o.has(n));
    if (clash.length) console.log(`note: ${f} names also in the original: ${clash.join(' ')}`);
  }
}

console.log(`items ${items.length}, soldiers ${soldiers.length}, BF ${bf.length}, SF ${sf.length}, ranks ${ranks.length}, titles ${titles.length}; exp L10 ${exp[10]} L20 ${exp[20]} L30 ${exp[30]} L50 ${exp[50]} L99 ${exp[99]}`);
if (errors) {
  console.error(`${errors} check(s) failed`);
  process.exit(1);
}
console.log('rules data OK');
