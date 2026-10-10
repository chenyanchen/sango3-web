// 野战 public API (placeholder — implemented by the field module).
import type { WarResult, WarSetup } from '../../game/contracts';

export async function runWar(setup: WarSetup): Promise<WarResult> {
  return autoWar(setup);
}

export function autoWar(setup: WarSetup): WarResult {
  return { attackerWon: setup.defenders.length === 0, captured: [], retreated: [], killed: [] };
}
