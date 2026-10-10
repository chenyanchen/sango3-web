// 内政 strategy map scene (placeholder — implemented by the strategy module).
import { Scene } from '../../engine/core';
import { G } from '../../game/state';

export class StrategyScene extends Scene {
  enter() {
    this.renderUI(<div class="loading">{G.year}年{G.month}月 — 内政画面施工中</div>);
  }
}
