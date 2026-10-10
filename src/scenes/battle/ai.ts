// Computer-controlled side in 百人战: issues orders and casts 武将技.
import { db } from '../../data/db';
import { rng } from '../../engine/rng';
import type { SkillCtx } from './rules';
import { TICKS_PER_SEC } from './rules';
import { castSkill, SKILL_SPECS, skillState } from './skills';
import type { World } from './world';

export class AI {
  private t = 0;
  private castDelay = rng.int(20, 90);
  private chargeAt: number;
  constructor(readonly w: World, readonly side: 0 | 1, readonly ctx: SkillCtx) {
    // aggressive personalities charge earlier
    this.chargeAt = TICKS_PER_SEC * rng.int(22, 40);
  }

  tick() {
    const w = this.w;
    this.t++;
    const S = w.sides[this.side];
    const E = w.sides[this.side ^ 1];
    const g = S.gen;
    if (!g.alive || S.retreat || g.fled) return;
    if (g.gauge >= 100 && --this.castDelay <= 0) this.tryCast();
    if (this.t % 15) return;
    const hp = g.hp / g.maxHp;
    const mine = S.alive;
    const theirs = E.alive;
    // retreat when hopeless
    if (hp < 0.18 && mine < theirs * 0.35 && E.gen.alive && Math.abs(E.gen.x - g.x) < 500 && rng.next() < 0.25) {
      w.orderAll(this.side, 'retreat');
      return;
    }
    // full charge
    if (!S.charge && (this.t > this.chargeAt || mine > theirs * 1.5 + 10 || theirs === 0)) w.orderAll(this.side, 'charge');
    // general
    const eg = E.gen;
    const dist = Math.abs(eg.x - g.x);
    const strong = g.atk > eg.atk * 1.15 && hp > 0.5;
    if (hp < 0.3 && dist < 350) w.orderGeneral(this.side, 'back');
    else if (strong || (mine < 8 && g.atk >= eg.atk * 0.9) || theirs === 0 || (S.charge && hp > 0.6 && mine >= theirs) || this.t > TICKS_PER_SEC * 60)
      w.orderGeneral(this.side, 'advance');
    else if (mine < 8 && dist < 260) w.orderGeneral(this.side, 'back');
    else {
      // follow behind our troops
      let fx = 0;
      let n = 0;
      for (const u of S.units) if (u.alive) (fx += u.x, n++);
      const front = n ? fx / n : g.x;
      w.orderGeneral(this.side, Math.abs(front - g.x) > 300 ? 'advance' : 'hold');
    }
  }

  private tryCast() {
    const w = this.w;
    const S = w.sides[this.side];
    const E = w.sides[this.side ^ 1];
    const g = S.gen;
    const list = skillState(w, this.side, this.ctx).filter((s) => s.ok);
    this.castDelay = rng.int(15, 60);
    if (!list.length) return;
    const hp = g.hp / g.maxHp;
    let best = -1;
    let bestScore = -1;
    for (const s of list) {
      const sp = SKILL_SPECS[s.id];
      const m = db.bfMagic[s.id - 1];
      let score = m.mp + rng.range(0, 10);
      switch (sp?.k) {
        case 'heal':
          score = hp < 0.55 ? 200 : -1;
          break;
        case 'single':
          score += E.alive < 20 ? 60 : 10;
          break;
        case 'reinforce':
        case 'summon':
          score += S.alive < E.alive ? 40 : 0;
          break;
        case 'lock':
          score += E.alive > 30 ? 30 : -20;
          break;
        case 'nova':
          score += Math.abs(E.gen.x - g.x) < 250 ? 40 : -10;
          break;
        default:
          score += E.alive > 15 ? 30 : -10;
      }
      if (score > bestScore) {
        bestScore = score;
        best = s.id;
      }
    }
    if (best > 0 && bestScore > 0) castSkill(w, this.side, best, this.ctx);
  }
}
