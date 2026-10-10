// Instant 百人战 resolution for computer-vs-computer battles and 委任.
// A coarse 1-second-step model built on the same rules (rules.ts) as the
// real-time battle: soldier matchups (hit rates), soldier HP/power by level,
// general attack, skills (gauge + MP) and morale. It does not mutate G.
import { db } from '../../data/db';
import { Rng } from '../../engine/rng';
import type { BattleResult, BattleSetup, BattleSideResult } from '../../game/contracts';
import {
  genVsGenDamage, genVsSoldierDamage, hitChance, sideInfo, skillAllowed, skillBoost, skillCtx, skillGeneralDamage, skillSoldierDamage,
  solVsGenDamage, solVsSolDamage, TIME_LIMIT, VS_GENERAL, type SideInfo,
} from './rules';
import { SKILL_SPECS } from './skills';

interface S {
  info: SideInfo;
  n: number; // soldiers alive (fractional)
  n0: number;
  hp: number;
  maxHp: number;
  mp: number;
  gauge: number;
  kills: number;
  fled: boolean;
  morale: number;
  ranged: boolean;
}

/** Rough number of soldiers an area skill kills (before HP scaling). */
function skillReach(id: number): number {
  const sp = SKILL_SPECS[id];
  if (!sp) return 10;
  const n = 'n' in sp ? sp.n : 1;
  switch (sp.k) {
    case 'rain': return n * (sp.kind === 'arrow' || sp.kind === 'firearrow' ? 0.9 : 2.6);
    case 'strike': return n * 2.6;
    case 'roll': return n * 6;
    case 'run': return n * 6;
    case 'dragon': return sp.kind === 'fire' ? n * 14 : 45;
    case 'nova': return 10 + n * 1.5;
    case 'ring': return 10;
    case 'quake': return n * 2.8;
    case 'glider': return n * 6;
    case 'vortex': return n * 10;
    case 'single': return 4;
    case 'lock': return 0;
    default: return 0;
  }
}

export function autoBattle(setup: BattleSetup): BattleResult {
  const rng = new Rng((setup.left.general * 7919 + setup.right.general * 104729 + setup.left.soldiers * 31 + setup.right.soldiers) >>> 0);
  const ctx = skillCtx(setup);
  const mk = (side: 0 | 1): S => {
    const def = side === 0 ? setup.left : setup.right;
    const info = sideInfo(side, def);
    return {
      info, n: Math.max(0, def.soldiers), n0: Math.max(0, def.soldiers), hp: info.gs.hp, maxHp: Math.max(1, info.gs.maxHp), mp: info.gs.mp,
      gauge: 0, kills: 0, fled: false, morale: def.morale, ranged: def.soldierType === 1 || def.soldierType === 8,
    };
  };
  const sides = [mk(0), mk(1)];
  let winner: 'left' | 'right' | 'draw' = 'draw';
  let t = 0;
  for (; t < TIME_LIMIT; t++) {
    // contact ramps up after the armies close in (~6 s)
    const contact = Math.max(0, Math.min(1, (t - 5) / 6));
    const charge = t > 30 ? 1 : 0.6;
    const dn = [0, 0];
    const dhp = [0, 0];
    for (const a of [0, 1] as const) {
      const A = sides[a];
      const B = sides[a ^ 1];
      if (A.fled || A.hp <= 0) continue;
      const ta = A.info.soldierType;
      const tb = B.info.soldierType;
      // soldiers vs soldiers: ~0.85 attacks/s for engaged soldiers (ranged also before contact)
      const engagedA = Math.min(A.n, (B.n + 4) * 1.6) * (A.ranged ? Math.max(contact, 0.6) : contact) * 0.5;
      const perHit = solVsSolDamage(A.info.soldierPower, A.morale);
      if (B.n > 0) dn[a ^ 1] += (engagedA * 0.62 * hitChance(ta, tb) * perHit) / B.info.soldierHp;
      // soldiers vs general (only a few can reach him)
      const reachGen = Math.min(A.n * contact, B.n > 5 ? 4 * charge : 9);
      dhp[a ^ 1] += reachGen * 0.8 * hitChance(ta, VS_GENERAL) * solVsGenDamage(A.info.soldierPower, B.info.gs.str);
      // general vs soldiers: ~0.8 swings/s hitting ~2 soldiers
      if (B.n > 0) {
        const kill = Math.min(1, genVsSoldierDamage(A.info.atk) / B.info.soldierHp);
        dn[a ^ 1] += contact * 0.6 * Math.min(B.n, 1.5 + A.info.atk / 100) * 0.88 * kill * (B.n > 8 ? 0.7 : 1);
      }
      // general duel (once the soldiers thin out or when charging)
      if (B.hp > 0 && (B.n < 15 || A.n < 15 || t > 28)) dhp[a ^ 1] += 0.55 * genVsGenDamage(A.info.atk, B.info.gs.str);
      // skills
      A.gauge += 7.2 + contact * 3;
      if (A.gauge >= 100) {
        const list = A.info.gs.bfMagic.map((id) => db.bfMagic[id - 1]).filter((m) => m && skillAllowed(m, ctx) && m.mp <= A.mp);
        const heal = list.find((m) => m.power < 0);
        // same preferences as the real-time AI (ai.ts)
        const dmgSkills = list
          .filter((m) => m.power >= 0 && skillReach(m.id) > 0)
          .map((m) => ({ m, s: m.mp + (SKILL_SPECS[m.id]?.k === 'single' ? (B.n < 20 ? 60 : 10) : B.n > 15 ? 30 : -10) }))
          .sort((x, y) => y.s - x.s)
          .map((x) => x.m);
        if (heal && A.hp < A.maxHp * 0.55) {
          A.mp -= heal.mp;
          A.gauge = 0;
          A.hp = Math.min(A.maxHp, A.hp + Math.abs(heal.power) * 3 + A.info.gs.int * 0.3);
        } else if (dmgSkills.length) {
          const m = dmgSkills[0];
          A.mp -= m.mp;
          A.gauge = 0;
          const boost = skillBoost(m, ctx);
          const kill = Math.min(1, skillSoldierDamage(m, A.info.gs, boost) / B.info.soldierHp);
          dn[a ^ 1] += Math.min(B.n * 0.75, skillReach(m.id) * 1.3 * kill);
          const sp = SKILL_SPECS[m.id];
          dhp[a ^ 1] += skillGeneralDamage(m, A.info.gs, boost, sp?.k === 'single') * (sp?.k === 'single' ? 1 : 0.7);
        }
      }
    }
    for (const b of [0, 1] as const) {
      const B = sides[b];
      const A = sides[b ^ 1];
      const k = Math.min(B.n, dn[b] * rng.range(0.85, 1.15));
      B.n -= k;
      A.kills += k;
      B.hp -= dhp[b] * rng.range(0.85, 1.15);
      // morale: fleeing when losing
      const ratio = B.n0 ? B.n / B.n0 : 1;
      if (B.morale < 60 && ratio < 0.5) B.n -= B.n * ((60 - B.morale) / 60) * (1 - ratio) * 0.06;
    }
    const [L, R] = sides;
    if (L.hp <= 0 || R.hp <= 0) {
      if (L.hp <= 0 && R.hp <= 0) {
        // both fell this second: the one hit harder loses
        if (L.hp < R.hp) R.hp = 1;
        else L.hp = 1;
      }
      winner = L.hp <= 0 ? 'right' : 'left';
      break;
    }
    // hopeless general retreats
    for (const s of [0, 1] as const) {
      const A = sides[s];
      const B = sides[s ^ 1];
      if (A.hp < A.maxHp * 0.18 && A.n < B.n * 0.35 && rng.next() < 0.15) {
        A.fled = true;
        winner = s === 0 ? 'right' : 'left';
      }
    }
    if (L.fled || R.fled) break;
  }
  const out = (A: S): BattleSideResult => ({
    soldiersLeft: Math.max(0, Math.min(A.n0, Math.round(A.n))),
    hp: Math.max(0, Math.round(A.hp)),
    mp: Math.max(0, Math.round(A.mp)),
    fled: A.fled,
    defeated: !A.fled && A.hp <= 0,
    kills: Math.round(A.kills),
  });
  return { winner, left: out(sides[0]), right: out(sides[1]) };
}
