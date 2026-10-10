// 比武大会 — year-end 8-general knockout tournament on the original bracket art
// (Shape/Arena). Each match is a duel (watch / play / skip). Never mutates G.
import { db } from '../../data/db';
import { imageUrl } from '../../engine/assets';
import { playMusic, sfx, unlockAudio } from '../../engine/audio';
import { core, Scene } from '../../engine/core';
import type { DuelResult } from '../../game/contracts';
import { G } from '../../game/state';
import { Portrait } from '../../ui/kit';
import { autoDuel, runDuel } from './index';
import { duelRating, fighterStats } from './rules';
import './duel.css';

export interface ArenaResult {
  winner: number;
  ranking: number[];
}

// ------------------------------------------------------------------ entrants
const score = (id: number) => {
  const g = G?.generals?.[id - 1];
  const d = db.generals[id - 1];
  return (g?.str ?? d.str) * (g?.level ?? 1);
};

/** The 8 strongest available generals (武力×等级), incl. the player's best; bracket-seeded. */
export function pickEntrants(given?: number[]): number[] {
  const eligible = (G?.generals ?? []).filter((g) => g.status === 'serving' || g.status === 'free').map((g) => g.id);
  let ids = [...new Set(given ?? [])].filter((id) => db.generals[id - 1]);
  if (!given) {
    ids = [...eligible].sort((a, b) => score(b) - score(a)).slice(0, 8);
    const mine = (G?.generals ?? []).filter((g) => g.status === 'serving' && g.nation === G.player).sort((a, b) => score(b.id) - score(a.id))[0];
    if (mine && !ids.includes(mine.id)) ids[ids.length - 1] = mine.id;
  }
  if (ids.length < 8) {
    const pool = (eligible.length ? eligible : db.generals.map((d) => d.id)).filter((id) => !ids.includes(id)).sort((a, b) => score(b) - score(a));
    ids.push(...pool.slice(0, 8 - ids.length));
  }
  const seeds = ids.slice(0, 8).sort((a, b) => score(b) - score(a));
  // standard seeding: 1v8, 4v5 | 2v7, 3v6
  return [0, 7, 3, 4, 1, 6, 2, 5].map((k) => seeds[k]).filter((x) => x !== undefined);
}

// ------------------------------------------------------------------ bracket geometry (640×480 art)
const SLOT_X = (i: number) => 18 + 78 * i;
const SLOT_Y = 311;
const SLOT_W = 58;
const SLOT_H = 143;
const LEAF = (i: number) => 47 + 78 * i;
const N1 = (m: number) => 86 + 156 * m;
const N2 = (k: number) => 164 + 312 * k;
const ROUND_NAMES = ['首轮', '准决赛', '决赛'];

interface Match {
  round: number; // 0..2
  index: number; // within round
  a: number;
  b: number;
  winner?: number;
  hpA?: number;
  hpB?: number;
  how?: string;
}

function winPath(m: Match, slots: number[]): string {
  const w = m.winner!;
  if (m.round === 0) {
    const i = slots.indexOf(w);
    return `M${LEAF(i)} ${SLOT_Y} V249 H${N1(m.index)} V185`;
  }
  if (m.round === 1) {
    const src = Math.floor(slots.indexOf(w) / 2);
    return `M${N1(src)} 185 H${N2(m.index)} V121`;
  }
  const src = Math.floor(slots.indexOf(w) / 4);
  return `M${N2(src)} 121 H320 V57`;
}

function nodePos(m: Match): [number, number] {
  if (m.round === 0) return [N1(m.index), 217];
  if (m.round === 1) return [N2(m.index), 153];
  return [320, 89];
}

const pct = (v: number, of: number) => `${(v / of) * 100}%`;

class ArenaScene extends Scene {
  private matches: Match[] = [];
  private cur = 0;
  private mode: 'intro' | 'pick' | 'busy' | 'result' | 'done' = 'intro';
  private skipAll = false;
  private bracketUrl = '';
  private lastMsg = '';
  private alive = true;
  private ranking: number[] = [];

  constructor(
    private slots: number[],
    private done: (r: ArenaResult) => void,
  ) {
    super();
    for (let m = 0; m < 4; m++) this.matches.push({ round: 0, index: m, a: slots[2 * m], b: slots[2 * m + 1] });
  }

  async enter() {
    this.ui.classList.add('arena-root');
    this.bracketUrl = await imageUrl('arena/base/asw_40350').catch(() => '');
    playMusic('arena');
    window.addEventListener('keydown', this.onKey);
    this.draw();
  }

  exit() {
    this.alive = false;
    window.removeEventListener('keydown', this.onKey);
    super.exit();
  }

  resize() {
    this.draw();
  }

  private onKey = (e: KeyboardEvent) => {
    if (core.scene !== this || e.repeat) return;
    const k = e.key.toLowerCase();
    if (k === 'enter' || k === ' ') {
      e.preventDefault();
      if (this.mode === 'intro') this.start();
      else if (this.mode === 'pick') void this.play(this.mineIn(this.matches[this.cur]) ? 'fight' : 'watch');
      else if (this.mode === 'done') this.close();
    } else if (k === 's' && this.mode === 'pick') void this.play('skip');
  };

  private nationName(id: number) {
    const g = G?.generals?.[id - 1];
    if (!g || g.status !== 'serving') return '在野';
    return (G.nations.find((n) => n.id === g.nation)?.name ?? '') + '军';
  }

  private mineIn(m: Match): number {
    const mine = (id: number) => G?.generals?.[id - 1]?.status === 'serving' && G.generals[id - 1].nation === G.player;
    return mine(m.a) ? m.a : mine(m.b) ? m.b : 0;
  }

  private start() {
    unlockAudio();
    sfx('accept');
    this.mode = 'pick';
    this.draw();
    if (this.skipAll) void this.play('skip');
  }

  private async play(how: 'fight' | 'watch' | 'skip') {
    if (this.mode !== 'pick') return;
    unlockAudio();
    const m = this.matches[this.cur];
    this.mode = 'busy';
    this.draw();
    let res: DuelResult;
    let left = m.a;
    let right = m.b;
    const mine = this.mineIn(m);
    if (how === 'fight' && mine === m.b) [left, right] = [m.b, m.a];
    if (how === 'skip') {
      res = autoDuel({ left, right, leftHuman: false, rightHuman: false }, true);
      await this.sleep(this.skipAll ? 260 : 450);
    } else {
      res = await runDuel(
        { left, right, leftHuman: how === 'fight', rightHuman: false },
        {
          fullHp: true,
          title: `比武大会 · ${ROUND_NAMES[m.round]}`,
          music: 'arena',
          background: (['10', '12', '13'] as const)[m.round],
          variant: m.round === 2 ? 2 : 1,
          allowFlee: how === 'fight',
          autoContinue: true,
        },
      );
    }
    if (!this.alive) return;
    // tie-break (time-out draw): remaining HP %, then rating
    let winSide = res.winner;
    if (winSide === 'draw') {
      const pl = res.leftHp / fighterStats(left, true).maxHp;
      const pr = res.rightHp / fighterStats(right, true).maxHp;
      winSide = pl !== pr ? (pl > pr ? 'left' : 'right') : duelRating(left) >= duelRating(right) ? 'left' : 'right';
    }
    const winner = winSide === 'left' ? left : right;
    const loser = winner === left ? right : left;
    m.winner = winner;
    m.hpA = m.a === left ? res.leftHp : res.rightHp;
    m.hpB = m.b === left ? res.leftHp : res.rightHp;
    m.how = res.winner === 'draw' ? '判定' : res.leftHp > 0 && res.rightHp > 0 ? '判定' : '击败';
    this.lastMsg = `${db.generals[winner - 1].name} ${m.how === '击败' ? '击败' : '判定胜'} ${db.generals[loser - 1].name}`;
    sfx('win', { volume: 0.6 });
    this.advance();
  }

  private advance() {
    const m = this.matches[this.cur];
    // schedule the next round's match once both feeders are decided
    if (m.round < 2) {
      const pairIdx = Math.floor(m.index / 2);
      const sib = this.matches.find((x) => x.round === m.round && x.index === (m.index ^ 1));
      if (sib?.winner) {
        const first = m.index % 2 === 0 ? m : sib;
        const second = first === m ? sib : m;
        this.matches.push({ round: m.round + 1, index: pairIdx, a: first.winner!, b: second.winner! });
      }
    }
    this.cur++;
    if (this.cur >= this.matches.length) {
      this.finishTournament();
      return;
    }
    this.mode = 'result';
    this.draw();
    this.sleep(this.skipAll ? 200 : 900).then(() => {
      if (!this.alive) return;
      this.mode = 'pick';
      this.draw();
      if (this.skipAll) void this.play('skip');
    });
  }

  private finishTournament() {
    const fin = this.matches[this.matches.length - 1];
    const champion = fin.winner!;
    const runner = fin.a === champion ? fin.b : fin.a;
    const semis = this.matches.filter((m) => m.round === 1).map((m) => (m.a === m.winner ? m.b : m.a));
    const quarters = this.matches.filter((m) => m.round === 0).map((m) => (m.a === m.winner ? m.b : m.a));
    const byRating = (a: number, b: number) => duelRating(b) - duelRating(a);
    this.ranking = [champion, runner, ...semis.sort(byRating), ...quarters.sort(byRating)];
    this.mode = 'done';
    sfx('level');
    this.draw();
  }

  private close() {
    if (this.mode !== 'done') return;
    this.mode = 'busy';
    this.done({ winner: this.ranking[0], ranking: this.ranking });
  }

  private sleep(ms: number) {
    return new Promise<void>((r) => setTimeout(r, ms));
  }

  // ---------------------------------------------------------------- UI
  private draw() {
    if (!this.alive) return;
    const cur = this.mode === 'pick' || this.mode === 'busy' ? this.matches[this.cur] : undefined;
    const decided = this.matches.filter((m) => m.winner);
    const losers = new Set(decided.map((m) => (m.winner === m.a ? m.b : m.a)));
    const champion = this.mode === 'done' ? this.ranking[0] : 0;
    const year = G ? `${G.year}年` : '';
    const name = (id: number) => db.generals[id - 1]?.name ?? '';
    this.renderUI(
      <div class={`arena-ui ${this.mode}`}>
        <div class="arena-head">
          <div class="arena-title">比武大会</div>
          <div class="arena-sub">{year} 年末擂台 · 天下英雄齐聚</div>
        </div>
        <div class="arena-main">
          <div class="arena-boardwrap">
            <div class="arena-board">
              {this.bracketUrl && <img class="arena-bracket" src={this.bracketUrl} draggable={false} />}
              <svg class="arena-lines" viewBox="0 0 640 480" preserveAspectRatio="none">
                {decided.map((m) => (
                  <path key={`${m.round}-${m.index}`} d={winPath(m, this.slots)} class="won" />
                ))}
              </svg>
              {this.slots.map((id, i) => {
                const active = cur && (cur.a === id || cur.b === id);
                const out = losers.has(id);
                return (
                  <div
                    key={id}
                    class={`arena-slot ${active ? 'active' : ''} ${out ? 'out' : ''} ${champion === id ? 'champ' : ''}`}
                    style={{ left: pct(SLOT_X(i), 640), top: pct(SLOT_Y, 480), width: pct(SLOT_W, 640), height: pct(SLOT_H, 480) }}
                  >
                    <Portrait general={id} class="arena-portrait" />
                    <div class="arena-nm">{name(id)}</div>
                    {out && <div class="arena-stamp">败</div>}
                  </div>
                );
              })}
              {decided.map((m) => {
                const [x, y] = nodePos(m);
                return (
                  <div key={`n${m.round}-${m.index}`} class={`arena-node r${m.round}`} style={{ left: pct(x, 640), top: pct(y, 480) }}>
                    {name(m.winner!)}
                  </div>
                );
              })}
            </div>
          </div>
          <div class="arena-panel">{this.panel(cur)}</div>
        </div>
        {this.mode === 'done' && this.ceremony()}
      </div>,
    );
  }

  private fighterCard(id: number, side: 'l' | 'r') {
    const s = fighterStats(id, true);
    return (
      <div class={`arena-card ${side}`}>
        <Portrait general={id} class="arena-cardportrait" />
        <div class="arena-cardinfo">
          <b>{s.name}</b>
          <span>{this.nationName(id)}</span>
          <span>
            Lv{s.level} · 武{s.str}
          </span>
          <span>体力 {s.maxHp}</span>
        </div>
      </div>
    );
  }

  private panel(cur?: Match) {
    if (this.mode === 'intro') {
      return (
        <div class="arena-intro">
          <p>一年一度的武将擂台赛要开始了，请各路英雄豪杰前来参加吧！</p>
          <p class="dim">天下最强的八位武将将以淘汰赛决出优胜。</p>
          <div class="arena-btns">
            <button class="abtn primary" onClick={() => this.start()}>
              开始比武
            </button>
            <button
              class="abtn"
              onClick={() => {
                this.skipAll = true;
                this.start();
              }}
            >
              直接看结果
            </button>
          </div>
        </div>
      );
    }
    if (this.mode === 'done') return <div class="arena-msg">比武大会结束</div>;
    if (!cur) {
      return <div class="arena-msg">{this.lastMsg}</div>;
    }
    const mine = this.mineIn(cur);
    const nInRound = this.matches.filter((m) => m.round === cur.round).length;
    const label = cur.round === 2 ? '决赛' : `${ROUND_NAMES[cur.round]} · 第${cur.index + 1}场`;
    void nInRound;
    return (
      <div class="arena-match">
        <div class="arena-round">{label}</div>
        <div class="arena-vs">
          {this.fighterCard(cur.a, 'l')}
          <div class="arena-vsmark">VS</div>
          {this.fighterCard(cur.b, 'r')}
        </div>
        {this.lastMsg && <div class="arena-last">上一场：{this.lastMsg}</div>}
        <div class="arena-btns">
          {this.mode === 'busy' ? (
            <div class="arena-msg">比试中…</div>
          ) : (
            <>
              {mine > 0 && (
                <button class="abtn primary" onClick={() => void this.play('fight')}>
                  亲自出战 <kbd>Enter</kbd>
                </button>
              )}
              <button class={`abtn ${mine ? '' : 'primary'}`} onClick={() => void this.play('watch')}>
                观战{!mine && <kbd>Enter</kbd>}
              </button>
              <button class="abtn" onClick={() => void this.play('skip')}>
                跳过 <kbd>S</kbd>
              </button>
              <button
                class="abtn ghost"
                onClick={() => {
                  this.skipAll = true;
                  void this.play('skip');
                }}
              >
                全部跳过
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  private ceremony() {
    const [c, r] = this.ranking;
    const cs = db.generals[c - 1];
    return (
      <div class="arena-ceremony" onClick={() => this.close()}>
        <div class="arena-ceremony-box">
          <div class="arena-ceremony-title">优　胜</div>
          <Portrait general={c} class="arena-ceremony-portrait" />
          <div class="arena-ceremony-name">{cs.name}</div>
          <p>
            宣布这次比赛结果，由{this.nationName(c)}
            <b>{cs.name}</b>
            获得优胜，希望明年大家再接再厉。
          </p>
          <div class="arena-ceremony-rank">
            <span>
              亚军 <b>{db.generals[r - 1].name}</b>
            </span>
            <span>
              四强 <b>{this.ranking.slice(2, 4).map((id) => db.generals[id - 1].name).join('、')}</b>
            </span>
          </div>
          <button class="abtn primary" onClick={(e) => { e.stopPropagation(); this.close(); }}>
            结束 <kbd>Enter</kbd>
          </button>
        </div>
      </div>
    );
  }
}

export async function runArena(entrants?: number[]): Promise<ArenaResult> {
  const slots = pickEntrants(entrants);
  if (slots.length < 2) return { winner: slots[0] ?? 0, ranking: slots };
  if (slots.length < 8) {
    // degenerate: not enough generals — resolve instantly
    const ranking = [...slots].sort((a, b) => duelRating(b) - duelRating(a));
    return { winner: ranking[0], ranking };
  }
  return new Promise<ArenaResult>((resolve) => {
    const scene = new ArenaScene(slots, (r) => {
      void core.pop().then(() => resolve(r));
    });
    void core.push(scene);
  });
}
