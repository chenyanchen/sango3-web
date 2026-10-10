// 单挑 public API (placeholder — implemented by the duel module).
import type { DuelResult, DuelSetup } from '../../game/contracts';

export async function runDuel(setup: DuelSetup): Promise<DuelResult> {
  return autoDuel(setup);
}

export function autoDuel(_setup: DuelSetup): DuelResult {
  return { winner: Math.random() < 0.5 ? 'left' : 'right', leftHp: 0, rightHp: 0 };
}
