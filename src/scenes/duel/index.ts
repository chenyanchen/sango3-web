// 单挑 public API.
//
//   runDuel(setup)  — interactive duel scene (pushed over the current scene)
//   autoDuel(setup) — instant resolution with the same rules (AI vs AI)
//   runArena()      — 比武大会 (year-end tournament), see arena.tsx
//
// Neither function mutates G; callers apply the result (HP loss, capture…).
import { core } from '../../engine/core';
import type { DuelResult, DuelSetup } from '../../game/contracts';
import { simulate } from './rules';
import type { DuelOptions } from './scene';

export type { DuelOptions } from './scene';

export async function runDuel(setup: DuelSetup, opts: DuelOptions = {}): Promise<DuelResult> {
  const { DuelScene } = await import('./scene');
  return new Promise<DuelResult>((resolve) => {
    const scene = new DuelScene(setup, opts, (r) => {
      void core.pop().then(() => resolve(r));
    });
    void core.push(scene);
  });
}

export function autoDuel(setup: DuelSetup, fullHp = false): DuelResult {
  return simulate(setup, fullHp);
}

/**
 * 比武大会: 8-general knockout tournament. Defaults to the 8 strongest
 * generals (武力×等级) incl. the player's best. Does not mutate G.
 */
export async function runArena(entrants?: number[]): Promise<{ winner: number; ranking: number[] }> {
  return (await import('./arena')).runArena(entrants);
}
