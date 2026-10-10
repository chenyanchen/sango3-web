// Contracts between the game layers. Implementations live in:
//   - 百人战 battle  → src/scenes/battle/index.ts  (runBattle / autoBattle)
//   - 单挑 duel      → src/scenes/duel/index.ts    (runDuel / autoDuel)
//   - 野战 war       → src/scenes/field/index.ts   (runWar / autoWar)
// The strategy layer (src/scenes/strategy) only talks to these functions.

/** 野战 terrain attributes (SFMap.ini [attributes]); 0 = unknown/plain. */
export const enum Terrain {
  Plain = 1, // 土地
  Grass = 2, // 草地
  Forest = 3, // 森林
  Desert = 4, // 沙漠
  Water = 5, // 水区
  Snow = 6, // 雪地
  Road = 7, // 街道
  SnowMountain = 8, // 雪山
  Mountain = 9, // 山地
  Wall = 10, // 城墙
  Gate = 11, // 城门
  House = 12, // 房舍
  Castle = 13, // 主城
}

/** 0 早晨, 1 黄昏, 2 夜晚 */
export type TimeOfDay = 0 | 1 | 2;
/** 0 晴, 1 阴, 2 雨, 3 雪, 4 风 */
export type Weather = 0 | 1 | 2 | 3 | 4;

// ------------------------------------------------------------------ 百人战
export interface BattleSide {
  general: number; // general id (GeneralState in G)
  /** soldiers taking part (defaults to the general's current soldiers) */
  soldiers: number;
  soldierType: number;
  formation: number;
  /** controlled by the human player */
  human: boolean;
  /** 0..100 morale/training of the troops */
  morale: number;
}

export interface BattleSetup {
  left: BattleSide; // shown on the left (player side when human involved)
  right: BattleSide;
  terrain: Terrain;
  time: TimeOfDay;
  weather: Weather;
  /** optional fixed background id (BF/BG "NN"), otherwise derived from terrain */
  background?: number;
}

export interface BattleSideResult {
  soldiersLeft: number;
  hp: number;
  mp: number;
  /** general fled (全军撤退) */
  fled: boolean;
  /** general defeated (HP 0) — candidate for capture */
  defeated: boolean;
  /** enemy soldiers killed */
  kills: number;
}

export interface BattleResult {
  winner: 'left' | 'right' | 'draw';
  left: BattleSideResult;
  right: BattleSideResult;
}

// ------------------------------------------------------------------ 单挑
export interface DuelSetup {
  left: number; // general id
  right: number;
  leftHuman: boolean;
  rightHuman: boolean;
}
export interface DuelResult {
  winner: 'left' | 'right' | 'draw';
  leftHp: number;
  rightHp: number;
}

// ------------------------------------------------------------------ 野战
export interface WarSetup {
  /** city under attack */
  city: number;
  /** attacking nation */
  attacker: number;
  /** attacking generals (ids) with their soldiers, max 10 */
  attackers: number[];
  /** city the attack came from (retreat target) */
  from: number;
  /** defending generals (ids); empty = undefended */
  defenders: number[];
  /** allied reinforcements, optional */
  attackerAllies?: number[];
  defenderAllies?: number[];
}

export interface WarResult {
  /** true when the attacker conquered the city */
  attackerWon: boolean;
  /** generals captured by the winner, ids (to be handled by 俘虏处理) */
  captured: number[];
  /** generals that retreated (moved back to their origin city by the war layer) */
  retreated: number[];
  /** generals killed in battle (rare) */
  killed: number[];
}
