// 结局: victory (unification → coronation → staff roll) or defeat.
import { Container, Sprite } from 'pixi.js';
import { db } from '../data/db';
import { shape } from '../engine/assets';
import { playMusic, unlockAudio } from '../engine/audio';
import { core, fit, Scene } from '../engine/core';
import { Backdrop } from '../engine/view';
import { G } from '../game/state';
import { Portrait } from '../ui/kit';
import { go } from './registry';

class EndingScene extends Scene {
  private bg!: Backdrop;
  private roll: Container | null = null;
  private rollSprite: Sprite | null = null;
  private phase: 'intro' | 'roll' | 'done' = 'intro';
  private y = 0;
  private resolve!: () => void;
  readonly finished = new Promise<void>((r) => (this.resolve = r));

  constructor(private victory: boolean) {
    super();
  }

  async enter() {
    const lord = G?.nations.find((n) => n.id === G.player);
    const lordId = lord?.lord ?? 0;
    if (this.victory) {
      const f = await shape('ending/ok');
      this.bg = new Backdrop(f.tex);
      this.root.addChild(this.bg);
      playMusic('ending001');
      this.renderUI(
        <div class="pass" style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: '8vh' }}>
          <div class="panel" style={{ maxWidth: '40em', display: 'flex', gap: '1.2em', alignItems: 'center', animation: 'fadein 1.5s ease' }}>
            {lordId ? <Portrait general={lordId} size="lg" /> : null}
            <div style={{ lineHeight: 1.9 }}>
              <div class="kai gold" style={{ fontSize: '2em', letterSpacing: '0.3em' }}>天下一统</div>
              <div>
                {G?.year}年{G?.month}月，{lord?.name ?? '主公'}平定四海，结束了自黄巾以来的乱世。
                <br />
                群臣拜伏，万民同庆，新的时代就此开启。
              </div>
              <button class="btn primary" style={{ marginTop: '0.8em' }} onClick={() => this.startRoll()}>
                继 续
              </button>
            </div>
          </div>
        </div>,
      );
    } else {
      const f = await shape('ending/failedbg');
      this.bg = new Backdrop(f.tex);
      this.root.addChild(this.bg);
      playMusic('gameover');
      this.renderUI(
        <div class="pass" style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'flex-start', paddingLeft: 'max(4vw, calc(50vw - 66.6vh + 3vh))' }}>
          <div class="panel" style={{ textAlign: 'center', animation: 'fadein 2s ease', minWidth: '22em' }}>
            <div class="kai red" style={{ fontSize: '2.4em', letterSpacing: '0.4em' }}>大势已去</div>
            <div style={{ margin: '0.8em 0 1.2em', lineHeight: 1.8 }}>
              {lord?.name ?? '主公'}的势力于{G?.year}年{G?.month}月灭亡。
              <br />
              胜败乃兵家常事，请重整旗鼓。
            </div>
            <button class="btn primary" onClick={() => this.finish()}>
              回主选单
            </button>
          </div>
        </div>,
      );
    }
  }

  private async startRoll() {
    unlockAudio();
    this.renderUI(null);
    const sky = await shape('ending/successbg');
    const staff = await shape('ending/staff');
    this.bg.destroy();
    this.bg = new Backdrop(sky.tex);
    this.root.addChild(this.bg);
    this.roll = new Container();
    this.rollSprite = new Sprite(staff.tex);
    this.roll.addChild(this.rollSprite);
    this.root.addChild(this.roll);
    this.phase = 'roll';
    this.y = 420; // the staff image starts with ~500px of empty space
    this.layoutRoll();
    this.renderUI(
      <button class="btn ghost" style={{ position: 'absolute', right: '1.5em', bottom: '1.5em' }} onClick={() => this.finish()}>
        跳过
      </button>,
    );
  }

  private layoutRoll() {
    if (!this.roll || !this.rollSprite) return;
    const b = fit(640, 480);
    this.roll.scale.set(b.scale);
    this.roll.x = b.x;
    this.roll.y = core.height - this.y * b.scale;
  }

  frame(dt: number) {
    if (this.phase !== 'roll' || !this.rollSprite) return;
    this.y += dt * 42;
    this.layoutRoll();
    if (this.y > this.rollSprite.height + 480 / 1) this.finish();
  }

  resize(w: number, h: number) {
    this.bg?.layout(w, h);
    this.layoutRoll();
  }

  private finish() {
    if (this.phase === 'done') return;
    this.phase = 'done';
    this.resolve();
    void go.title();
  }
}

/** Shows the ending and returns to the title screen afterwards. */
export async function showEnding(victory: boolean): Promise<void> {
  const s = new EndingScene(victory);
  await core.go(s);
  await s.finished;
}

void db;
