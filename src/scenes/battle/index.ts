// 百人战 public API.
//   runBattle(setup)  — real-time battle scene (pushed over the current scene)
//   autoBattle(setup) — instant numeric resolution (AI vs AI, 委任)
// Neither function mutates G; the caller applies the BattleResult.
import { core } from '../../engine/core';
import type { BattleResult, BattleSetup } from '../../game/contracts';
import { BattleScene } from './scene';
export { autoBattle } from './auto';

export async function runBattle(setup: BattleSetup): Promise<BattleResult> {
  let resolve!: (r: BattleResult) => void;
  const done = new Promise<BattleResult>((r) => (resolve = r));
  const scene = new BattleScene(setup, resolve);
  await core.push(scene);
  const res = await done;
  await core.pop();
  return res;
}
