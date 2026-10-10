// 主选单 (title screen).
import { Sprite } from 'pixi.js';
import { shape, shapes } from '../engine/assets';
import { playMusic, setVolumes, settings, sfx, unlockAudio } from '../engine/audio';
import { core, Scene } from '../engine/core';
import { Backdrop } from '../engine/view';
import { listSaves, loadGame } from '../game/save';
import { showHelp } from '../ui/help';
import { Btn, modal, Panel, toast } from '../ui/kit';
import { go } from './registry';

export class TitleScene extends Scene {
  private bg!: Backdrop;
  private fire: Sprite[] = [];
  private t = 0;

  async enter() {
    const main = await shape('mm/base/main');
    this.bg = new Backdrop(main.tex);
    this.root.addChild(this.bg);
    const mm = await shapes('mm');
    const fires = await Promise.all(Array.from({ length: 10 }, (_, i) => mm.load(`logofire${String(i + 1).padStart(2, '0')}`)));
    for (const f of fires) {
      if (!f) continue;
      const s = new Sprite(f.tex);
      s.visible = false;
      s.blendMode = 'add';
      this.fire.push(s);
      this.bg.addChild(s);
    }
    playMusic('mainmenu');
    this.draw();
  }

  frame(dt: number) {
    this.t += dt;
    if (this.fire.length) {
      const k = Math.floor(this.t * 12) % this.fire.length;
      const b = this.bg.box;
      this.fire.forEach((s, i) => {
        s.visible = i === k;
        s.alpha = 0.85;
        s.scale.set(b.scale);
        s.position.set(b.x, b.y);
      });
    }
  }

  resize(w: number, h: number) {
    this.bg?.layout(w, h);
  }

  private draw() {
    const start = () => {
      unlockAudio();
      sfx('accept');
      void go.newGame();
    };
    const load = async () => {
      unlockAudio();
      const slot = await pickSave();
      if (slot >= 0 && loadGame(slot)) void go.strategy();
      else if (slot >= 0) toast('读取失败');
    };
    this.renderUI(
      <div
        class="pass"
        style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end', paddingBottom: '12vh', paddingRight: 'max(3vw, calc(50vw - 66.6vh + 4vh))' }}
        onPointerDown={() => unlockAudio()}
      >
        <div class="col" style={{ gap: '0.7em', alignItems: 'stretch', width: '12em', opacity: 0.94 }}>
          <Btn class="big primary" onClick={start}>
            新的游戏
          </Btn>
          <Btn class="big" onClick={load}>
            读取进度
          </Btn>
          <Btn class="big" onClick={() => { unlockAudio(); void go.createGeneral(); }}>
            自创武将
          </Btn>
          <Btn class="big" onClick={() => void optionsBox()}>
            游戏设定
          </Btn>
          <Btn class="big ghost" onClick={() => void showHelp()}>
            游戏说明
          </Btn>
        </div>
      </div>,
    );
  }
}

export function pickSave(): Promise<number> {
  const saves = listSaves();
  return modal<number>((close) => (
    <Panel title="读取进度" class="modal" style={{ width: 'min(34em, 92vw)' }}>
      <div class="body list" style={{ maxHeight: '60vh' }}>
        <table class="grid">
          <thead>
            <tr>
              <th>存档</th>
              <th>君主</th>
              <th>时间</th>
              <th>城数</th>
              <th>存档时间</th>
            </tr>
          </thead>
          <tbody>
            {saves.map((s, i) => (
              <tr class={s ? 'click' : 'off'} onClick={() => s && close(i)}>
                <td>{i === 0 ? '自动' : `进度 ${i}`}</td>
                <td>{s?.lord ?? '—'}</td>
                <td>{s ? `${s.year}年${s.month}月` : ''}</td>
                <td>{s?.cities ?? ''}</td>
                <td class="mute">{s ? new Date(s.time).toLocaleString() : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div class="actions">
        <Btn onClick={() => close(-1)}>返回</Btn>
      </div>
    </Panel>
  ));
}

export function optionsBox(): Promise<void> {
  let m = settings.music;
  let s = settings.sfx;
  return modal<void>((close) => (
    <Panel title="游戏设定" class="modal">
      <div class="body col" style={{ gap: '1em', minWidth: '20em' }}>
        <label class="row">
          <span style={{ width: '5em' }}>音乐音量</span>
          <input type="range" min="0" max="1" step="0.05" value={m} class="grow"
            onInput={(e) => { m = +(e.target as HTMLInputElement).value; setVolumes(m, s); }} />
        </label>
        <label class="row">
          <span style={{ width: '5em' }}>音效音量</span>
          <input type="range" min="0" max="1" step="0.05" value={s} class="grow"
            onInput={(e) => { s = +(e.target as HTMLInputElement).value; setVolumes(m, s); sfx('touch'); }} />
        </label>
        <label class="row">
          <span style={{ width: '5em' }}>全屏</span>
          <Btn onClick={() => toggleFullscreen()}>切换全屏</Btn>
        </label>
      </div>
      <div class="actions">
        <Btn class="primary" onClick={() => close()}>
          确定
        </Btn>
      </div>
    </Panel>
  ));
}

export function toggleFullscreen() {
  const d = document as Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => void };
  const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
  if (document.fullscreenElement || d.webkitFullscreenElement) (document.exitFullscreen ?? d.webkitExitFullscreen)?.call(document);
  else (el.requestFullscreen ?? el.webkitRequestFullscreen)?.call(el);
}

void core;
