// Lazy scene constructors (avoids import cycles between scenes and keeps the
// initial bundle small).
import { core } from '../engine/core';

export const go = {
  title: async () => core.go(new (await import('./title')).TitleScene()),
  newGame: async () => core.go(new (await import('./newgame')).NewGameScene()),
  /** Enter the strategy (内政) map with the current G state. */
  strategy: async () => core.go(new (await import('./strategy')).StrategyScene()),
};
