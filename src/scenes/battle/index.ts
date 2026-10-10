// 百人战 public API (placeholder — implemented by the battle module).
import type { BattleResult, BattleSetup } from '../../game/contracts';

export async function runBattle(setup: BattleSetup): Promise<BattleResult> {
  return autoBattle(setup);
}

export function autoBattle(setup: BattleSetup): BattleResult {
  const l = setup.left.soldiers, r = setup.right.soldiers;
  return {
    winner: l >= r ? 'left' : 'right',
    left: { soldiersLeft: Math.max(0, l - r / 2) | 0, hp: 50, mp: 0, fled: false, defeated: l < r, kills: 0 },
    right: { soldiersLeft: Math.max(0, r - l / 2) | 0, hp: 50, mp: 0, fled: false, defeated: r <= l, kills: 0 },
  };
}
