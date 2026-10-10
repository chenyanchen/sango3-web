// Historical events (历史事件): Event.ini dates + EventCond.ini conditions +
// EventMsg.ini dialogue chains. Effects are not data-driven in the original
// (hard-coded in the exe), so a few well-known ones are re-created here.
import { db } from '../data/db';
import { assignOfficials, city, citiesOf, G, gen, generalsIn, nation, type NationState } from './state';
import { joinNation, isAllied, neighbors } from './rules';

export interface EventLine {
  /** speaker name ('' = narration) */
  name: string;
  text: string;
  /** general id for the portrait, if the speaker is a known general */
  general?: number;
  /** portrait shape path for non-general speakers (emperors) */
  shape?: string;
}

const generalId = (name: string) => db.generalByName.get(name)?.id ?? 0;
const lordNation = (name: string): NationState | undefined => {
  const id = generalId(name);
  return G.nations.find((n) => n.alive && n.lord === id);
};
const nationOfGeneral = (name: string) => {
  const g = G.generals[generalId(name) - 1];
  return g && g.status === 'serving' ? g.nation : 0;
};

type Cond = { _: string; ID?: string; Type?: string; Param?: string[] | string };
let condMap: Map<number, Cond> | null = null;
function conds() {
  if (!condMap) {
    condMap = new Map();
    for (const c of db.raw.EventCond as unknown as Cond[]) condMap.set(parseInt(c.ID ?? '0', 10), c);
  }
  return condMap;
}

/** Evaluates an EventCond id (best-effort interpretation of the original types). */
export function checkCond(id: number, depth = 0): boolean {
  if (!id || depth > 12) return true;
  const c = conds().get(id);
  if (!c || !c.Type) return true;
  const p = Array.isArray(c.Param) ? c.Param : [c.Param ?? '', ''];
  const [a, b] = [String(p[0] ?? '').trim(), String(p[1] ?? '').trim()];
  const n = (s: string) => parseInt(s, 10) || 0;
  switch (parseInt(c.Type, 10)) {
    case 1: // AND
      return checkCond(n(a), depth + 1) && checkCond(n(b), depth + 1);
    case 2: // OR
      return checkCond(n(a), depth + 1) || checkCond(n(b), depth + 1);
    case 4: { // general a is in city b
      const g = G.generals[generalId(a) - 1];
      return !!g && g.city === db.cityByName.get(b)?.id && g.status === 'serving';
    }
    case 6: // a (and b) are ruling lords
      return !!lordNation(a) && (!b || !!lordNation(b));
    case 7: { // a and b serve the same nation
      const x = nationOfGeneral(a);
      return !!x && x === nationOfGeneral(b);
    }
    case 8: { // lord a holds city b
      const na = lordNation(a);
      const cid = db.cityByName.get(b)?.id;
      return !!na && !!cid && city(cid).owner === na.id;
    }
    case 9: { // lord a borders (or is allied to) lord b
      const x = lordNation(a);
      const y = lordNation(b);
      if (!x || !y) return false;
      if (isAllied(x.id, y.id)) return true;
      return citiesOf(x.id).some((c) => neighbors(c.id).some((nb) => city(nb).owner === y.id));
    }
    case 10: // event fired
      return G.firedEvents.includes(n(a));
    case 11: // event not yet fired / unknown — permissive
      return true;
    case 12: // NOT
      return !checkCond(n(a), depth + 1);
  }
  return true;
}

type Msg = { ID: string; Name?: string; Text?: string; Next?: string };
let msgMap: Map<number, Msg> | null = null;
export function eventLines(firstMsg: number): EventLine[] {
  if (!msgMap) {
    msgMap = new Map();
    for (const m of db.raw.EventMsg as unknown as Msg[]) msgMap.set(parseInt(m.ID, 10), m);
  }
  const out: EventLine[] = [];
  const seen = new Set<number>();
  let id = firstMsg;
  while (id && !seen.has(id) && out.length < 60) {
    seen.add(id);
    const m = msgMap.get(id);
    if (!m) break;
    const name = (m.Name ?? '').trim();
    const line: EventLine = { name, text: (m.Text ?? '').trim() };
    const gid = name ? generalId(name) : 0;
    if (gid) line.general = gid;
    else if (name) {
      const e = db.emperors.findIndex((x) => x.name === name);
      if (e >= 0) line.shape = db.emperors[e].shape;
      else if (name === '陈留王') line.shape = db.emperors[2]?.shape;
    }
    if (line.text) out.push(line);
    id = parseInt(m.Next ?? '', 10) || 0;
  }
  return out;
}

/** Events due this month whose conditions hold. Marks them fired. */
export function dueEvents(): { id: number; name: string; lines: EventLine[]; effect: string[] }[] {
  if (!G.options.historicalEvents) return [];
  const out: { id: number; name: string; lines: EventLine[]; effect: string[] }[] = [];
  for (const e of db.events) {
    if (G.firedEvents.includes(e.id)) continue;
    const month = e.month || 1;
    const due = G.year === e.year && G.month === month;
    if (!due) {
      // events from before the scenario start never fire
      if (G.year * 12 + G.month > e.year * 12 + month) G.firedEvents.push(e.id);
      continue;
    }
    G.firedEvents.push(e.id);
    if (!checkCond(e.condition)) continue;
    const lines = e.msg ? eventLines(e.msg) : [];
    const effect = applyEffect(e.id);
    if (lines.length || effect.length) out.push({ id: e.id, name: e.name, lines, effect });
  }
  return out;
}

/** Brings a (hidden/free) general into a lord's nation. */
function summon(genName: string, lordName: string): string | null {
  const na = lordNation(lordName);
  const id = generalId(genName);
  if (!na || !id) return null;
  const g = gen(id);
  if (g.status === 'serving' || g.status === 'dead' || g.status === 'prisoner') return null;
  const cityId = gen(na.lord).city;
  joinNation(g, na.id, cityId, 100);
  return `${genName}加入${na.name}军。`;
}

function applyEffect(id: number): string[] {
  const out: (string | null)[] = [];
  switch (id) {
    case 2: // 桃园三结义
      out.push(summon('关羽', '刘备'), summon('张飞', '刘备'));
      break;
    case 10: { // 美人计
      const wang = nationOfGeneral('王允') ? nation(nationOfGeneral('王允'))?.lord : 0;
      if (wang) out.push(summon('貂蝉', db.generals[wang - 1].name));
      break;
    }
    case 12: { // 陶谦让徐州
      const tao = lordNation('陶谦');
      const liu = lordNation('刘备');
      if (tao && liu && tao.id !== G.player) {
        for (const c of citiesOf(tao.id)) {
          c.owner = liu.id;
          assignOfficials(c);
        }
        for (const g of G.generals) if (g.status === 'serving' && g.nation === tao.id) g.nation = liu.id;
        tao.alive = false;
        for (const c of citiesOf(liu.id)) assignOfficials(c);
        out.push(`陶谦将徐州让给刘备，${tao.name}军并入刘备军。`);
      }
      break;
    }
    case 18: // 反袁术同盟 — 吕雯 appears with 吕布
      out.push(summon('吕雯', '吕布'));
      break;
    case 27: // 三顾茅庐
      out.push(summon('诸葛亮', '刘备'));
      break;
    case 31: // 蜀吴联姻
      out.push(summon('孙仁', '刘备'));
      break;
  }
  for (const c of G.cities) if (c.owner && !generalsIn(c.id, c.owner).length) assignOfficials(c);
  return out.filter((x): x is string => !!x);
}
