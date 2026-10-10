// 野战 public API.
//   runWar  — interactive war on the city's tactical map (pushes FieldScene)
//   autoWar — instant numeric resolution for AI vs AI wars
import { core } from '../../engine/core';
import type { WarResult, WarSetup } from '../../game/contracts';
import { autoWar as autoWarImpl } from './auto';

export async function runWar(setup: WarSetup): Promise<WarResult> {
  if (!setup.defenders.length && !(setup.defenderAllies ?? []).length) return autoWarImpl(setup);
  const { FieldScene } = await import('./scene');
  const scene = new FieldScene(setup);
  if (import.meta.env.DEV) (window as unknown as { __field: unknown }).__field = scene;
  await core.push(scene);
  const result = await scene.done;
  await core.pop();
  return result;
}

export function autoWar(setup: WarSetup): WarResult {
  return autoWarImpl(setup);
}
