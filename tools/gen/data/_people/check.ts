// Self-check of the people data: `pnpm tsx tools/gen/data/_people/check.ts`
// Validates names/cities/scenario placements against what src/data/db.ts and
// src/game/{state,events}.ts expect, and prints per-era counts.
import { BUILT, PEOPLE, PORTRAITS, files } from '../people.ts';
import { CITY } from '../geo.ts';
import { UNIT_SETS } from '../unitsets.ts';
import { SCENARIOS } from './scenarios.ts';
import { EVENT_SPEAKERS } from './events.ts';
import spec from '../../spec/shapes.json' with { type: 'json' };

const errs: string[] = [...BUILT.problems];
const f = files();
const names = new Set(PEOPLE.map((p) => p.name));
if (names.size !== PEOPLE.length) errs.push('duplicate general names');
if (PEOPLE.length > 421) errs.push(`too many generals (${PEOPLE.length} > 421 portrait frames)`);

// unique hero sets
const heroUse = new Map<number, string[]>();
for (const p of PEOPLE) if (p.set <= 36) heroUse.set(p.set, [...(heroUse.get(p.set) ?? []), p.name]);
for (let s = 1; s <= 36; s++) if ((heroUse.get(s) ?? []).length !== 1) errs.push(`hero set ${s}: ${heroUse.get(s)?.join(',') ?? 'unused'}`);
for (const p of PEOPLE) if (!UNIT_SETS.some((u) => u.set === p.set)) errs.push(`${p.name}: unknown set ${p.set}`);
for (const p of PEOPLE) {
  const u = UNIT_SETS.find((x) => x.set === p.set)!;
  if (u.sex !== p.sex) errs.push(`${p.name}: set ${p.set} is for sex ${u.sex}`);
}

// portraits exist
const frames = new Set([...Object.keys(spec.portrait.frames), ...Object.keys(spec.portrait.singles)]);
for (const s of PORTRAITS) if (!frames.has(s.frame)) errs.push(`no portrait frame ${s.frame}`);

// events: speakers must be generals or emperors
const emps = (f.Game.find((s) => s._ === 'EMPEROR')!);
const empNames = Object.entries(emps).filter(([k]) => k.startsWith('Name')).map(([, v]) => v);
for (const sp of EVENT_SPEAKERS) if (!names.has(sp) && !empNames.includes(sp) && sp !== '陈留王') errs.push(`event speaker ${sp} unknown`);
for (const c of f.EventCond) for (const v of c.Param as string[]) if (v && isNaN(+v) && !names.has(v) && !CITY.has(v)) errs.push(`cond ${c.ID} param ${v}`);

// scenarios
SCENARIOS.forEach((sc, i) => {
  const flags = sc.nations.map((n) => n.flag % 18);
  if (new Set(flags).size !== flags.length) errs.push(`S${i + 1}: duplicate flag colours`);
  if (sc.nations.length < 2) errs.push(`S${i + 1}: fewer than 2 nations`);
  const owned = new Map<string, string>();
  for (const n of sc.nations) for (const c of Object.keys(n.cities)) {
    if (owned.has(c)) errs.push(`S${i + 1}: ${c} owned by ${owned.get(c)} and ${n.lord}`);
    owned.set(c, n.lord);
  }
  const m = BUILT.place[i];
  const serving = [...m.values()].filter((x) => !x.free).length;
  const free = [...m.values()].filter((x) => x.free).length;
  const per = sc.nations.map((n) => `${n.lord}${Object.keys(n.cities).length}城/${[...m.entries()].filter(([, a]) => !a.free && owned.get(a.city) === n.lord).length}将`);
  console.log(`S${i + 1} ${sc.year}.${sc.month} ${sc.name}: nations ${sc.nations.length}, cities ${owned.size}/61, serving ${serving}, free ${free}\n   ${per.join(' ')}`);
  for (const n of sc.nations) for (const [c, g] of Object.entries(n.cities)) if (!g.trim()) errs.push(`S${i + 1}: ${n.lord} city ${c} has no general`);
});
console.log(`generals ${PEOPLE.length}, female ${PEOPLE.filter((p) => p.sex === 2).length}, events ${f.Event.length}, conds ${f.EventCond.length}, msgs ${f.EventMsg.length}, templates ${f.NewGeneral.length}, portraits ${PORTRAITS.length}`);
console.log(errs.length ? `PROBLEMS (${errs.length}):\n  ${errs.join('\n  ')}` : 'OK');
