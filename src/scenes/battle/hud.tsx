// 百人战 HUD (Preact DOM layer): general cards, timer + radar, command bar,
// 武将技 menu, banners and the result screen.
import { useEffect, useRef, useState } from 'preact/hooks';
import { db } from '../../data/db';
import { frameDataUrl } from '../../engine/assets';
import { core } from '../../engine/core';
import { Portrait } from '../../ui/kit';
import { soldierName } from './rules';
import type { SkillInfo } from './skills';
import { BIG_NAMES, W, type General, type World } from './world';
import type { BattleScene } from './scene';

export interface HudApi {
  scene: BattleScene;
  cmd: (c: string) => void;
  cast: (id: number) => void;
  select: (g: number) => void;
  speed: (v: number) => void;
  pause: () => void;
  jump: (fx: number) => void;
  finish: () => void;
  skills: () => SkillInfo[];
  // set by the component
  banner?: (text: string, kind?: string) => void;
  toggleSkills?: () => void;
  askRetreat?: () => void;
  cycleGroup?: () => void;
  skillsOpen?: () => boolean;
  pickSkill?: (n: number) => void;
  groupList?: () => number[];
  showResult?: () => void;
}

function useImg(path: string) {
  const [u, setU] = useState('');
  useEffect(() => {
    let live = true;
    frameDataUrl(path).then((x) => live && setU(x), () => {});
    return () => {
      live = false;
    };
  }, [path]);
  return u;
}

function Sword(props: { pct: number; right: boolean; style: number; full: boolean }) {
  const st = Math.max(1, Math.min(5, props.style || 1));
  const r = props.right ? 'r' : '';
  const frame = useImg(`bf/menu/bfmagicpgsframe0${st}${r}`);
  const fill = useImg(`bf/menu/bfmagicpgs0${st}-1${r}`);
  const white = useImg(`bf/menu/bfmagicpgs0${st}-2${r}`);
  const pct = Math.max(0, Math.min(100, props.pct));
  return (
    <div class={`bt-sword ${props.right ? 'r' : ''} ${props.full ? 'full' : ''}`}>
      {frame && <img src={frame} class="frame" draggable={false} />}
      {fill && (
        <img
          src={props.full ? white : fill}
          class="fill"
          draggable={false}
          style={props.right ? { clipPath: `inset(0 0 0 ${100 - pct}%)` } : { clipPath: `inset(0 ${100 - pct}% 0 0)` }}
        />
      )}
    </div>
  );
}

function Card(props: { g: General; world: World; side: 0 | 1; api: HudApi }) {
  const { g, world, side } = props;
  const S = world.sides[side];
  const gd = db.generals[g.info.gs.id - 1];
  const alive = S.alive + S.units.filter((u) => u.kind === 2 && u.alive && u.group).length * 0;
  return (
    <div class={`bt-card ${side ? 'right' : 'left'} ${g.alive ? '' : 'dead'}`}>
      <div class="pf" onClick={() => props.api.jump(g.x / W)}>
        <Portrait general={g.info.gs.id} />
      </div>
      <div class="info">
        <div class="nm">
          <b class="kai">{g.info.name}</b>
          <span class="lv">Lv.{g.info.gs.level}</span>
        </div>
        <div class="row2">
          <i class="tg hp">命</i>
          <div class="bar hp">
            <i style={{ width: `${(Math.max(0, g.hp) / g.maxHp) * 100}%` }} />
          </div>
          <span class="num">{Math.max(0, Math.ceil(g.hp))}</span>
        </div>
        <div class="row2">
          <i class="tg mp">技</i>
          <div class="bar mp">
            <i style={{ width: `${(Math.max(0, g.mp) / g.maxMp) * 100}%` }} />
          </div>
          <span class="num">{Math.floor(g.mp)}</span>
        </div>
        <div class="row2 sol">
          <i class="tg sl">兵</i>
          <span class="num big">{alive}</span>
          <span class="mute">/{S.initial}</span>
          <span class="st">{soldierName(S.info.soldierType, S.info.advanced)}</span>
          <span class="mute">武{g.info.gs.str} 智{g.info.gs.int}</span>
        </div>
        <Sword pct={g.gauge} right={side === 1} style={gd?.weaponType ?? 1} full={g.gauge >= 100} />
      </div>
    </div>
  );
}

function Radar(props: { world: World; api: HudApi }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const w = props.world;
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cw = c.clientWidth * dpr;
    const ch = c.clientHeight * dpr;
    if (c.width !== cw) c.width = cw;
    if (c.height !== ch) c.height = ch;
    const g = c.getContext('2d')!;
    g.clearRect(0, 0, cw, ch);
    const sx = cw / (W + 200);
    const y0 = 168;
    const sy = ch / (340 + 20);
    g.fillStyle = 'rgba(255,255,255,0.10)';
    g.fillRect((w.camX + 100) * sx, 0, w.viewW * sx, ch);
    g.strokeStyle = 'rgba(255,240,200,0.6)';
    g.lineWidth = dpr;
    g.strokeRect((w.camX + 100) * sx + 0.5, 0.5, w.viewW * sx - 1, ch - 1);
    const r = Math.max(1.5, dpr * 1.3);
    for (const u of w.units) {
      if (!u.alive || u.isGeneral) continue;
      g.fillStyle = u.side === 0 ? '#5aa8ff' : '#ff5a48';
      g.fillRect((u.x + 100) * sx - r / 2, (u.y - y0 + 10) * sy - r / 2, r, r);
    }
    for (const S of w.sides) {
      const gg = S.gen;
      if (!gg.alive) continue;
      g.fillStyle = gg.side === 0 ? '#bfe2ff' : '#ffd6cf';
      g.strokeStyle = '#000';
      g.beginPath();
      g.arc((gg.x + 100) * sx, (gg.y - y0 + 10) * sy, r * 2.4, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }
  });
  return (
    <canvas
      ref={ref}
      class="bt-radar"
      onPointerDown={(e) => {
        const rc = (e.currentTarget as HTMLCanvasElement).getBoundingClientRect();
        const fx = (e.clientX - rc.left) / rc.width;
        props.api.jump((fx * (W + 200) - 100) / W);
      }}
    />
  );
}

type Banner = { text: string; kind: string; id: number };

export function Hud(props: { api: HudApi; world: World }) {
  const { api, world } = props;
  const [banners, setBanners] = useState<Banner[]>([]);
  const [skillsOpen, setSkillsOpen] = useState(false);
  const [confirmRetreat, setConfirmRetreat] = useState(false);
  const [result, setResult] = useState(false);
  const sel = api.scene.selected;
  const S = world.sides[0];
  const E = world.sides[1];
  const groups = [...new Set(S.groups.filter((g) => g.members.some((u) => u.alive)).map((g) => g.big))].sort((a, b) => a - b);
  const skills = api.skills();
  const ready = S.gen.gauge >= 100 && S.gen.alive && !S.retreat;
  const canCast = skills.some((s) => s.ok);
  const over = world.phase === 'over';
  const locked = over || S.retreat || !S.gen.alive || world.phase !== 'fight';

  api.banner = (text, kind = '') => {
    const id = Math.random();
    setBanners((b) => [...b.slice(-2), { text, kind, id }]);
    setTimeout(() => setBanners((b) => b.filter((x) => x.id !== id)), kind === 'skill' ? 1600 : 1900);
  };
  api.toggleSkills = () => setSkillsOpen((o) => !o);
  api.skillsOpen = () => skillsOpen;
  api.pickSkill = (n) => {
    const s = skills[n - 1];
    if (s?.ok) {
      api.cast(s.id);
      setSkillsOpen(false);
    }
  };
  api.askRetreat = () => setConfirmRetreat(true);
  api.groupList = () => groups;
  api.cycleGroup = () => {
    const all = [-1, ...groups, -2];
    const i = all.indexOf(sel);
    api.select(all[(i + 1) % all.length]);
  };
  api.showResult = () => setResult(true);

  const orderBtns: [string, string, string][] =
    sel === -2
      ? [['advance', '前进', 'Q'], ['back', '后退', 'E'], ['hold', '待命', 'S']]
      : sel === -1
        ? [['advance', '前进', 'Q'], ['back', '后退', 'E'], ['hold', '待命', 'S'], ['center', '集中', 'C'], ['spread', '分散', 'X'], ['up', '上移', 'R'], ['down', '下移', 'F']]
        : [['advance', '前进', 'Q'], ['back', '后退', 'E'], ['hold', '待命', 'S'], ['center', '集中', 'C'], ['spread', '分散', 'X'], ['up', '上移', 'R'], ['down', '下移', 'F']];

  const ordName = (o: number) => (o === 0 ? '进' : o === 1 ? '退' : '待');
  const groupOrder = (big: number) => {
    const g = S.groups.find((x) => x.big === big);
    return g ? ordName(g.order) : '';
  };

  return (
    <div class="bt-hud">
      <div class="bt-top">
        <Card g={S.gen} world={world} side={0} api={api} />
        <div class="bt-mid">
          <div class={`bt-timer ${world.secondsLeft <= 10 ? 'low' : ''}`}>{world.secondsLeft}</div>
          <Radar world={world} api={api} />
        </div>
        <Card g={E.gen} world={world} side={1} api={api} />
      </div>

      <div class="bt-banners">
        {banners.map((b) => (
          <div key={b.id} class={`bt-banner ${b.kind}`}>
            {b.text}
          </div>
        ))}
      </div>

      {!over && (
        <div class="bt-side">
          {[1, 2, 3].map((v) => (
            <button class={`bt-mini ${core.speed === v ? 'on' : ''}`} onClick={() => api.speed(v)}>
              {v}×
            </button>
          ))}
          <button class={`bt-mini ${api.scene.paused2 ? 'on' : ''}`} onClick={() => api.pause()}>
            {api.scene.paused2 ? '▶' : '❚❚'}
          </button>
        </div>
      )}

      {!over && (
        <div class={`bt-bottom ${locked ? 'locked' : ''}`}>
          <div class="bt-sel">
            <button class={`bt-tab ${sel === -1 ? 'on' : ''}`} onClick={() => api.select(-1)}>
              全军
            </button>
            {groups.map((b) => (
              <button class={`bt-tab ${sel === b ? 'on' : ''}`} onClick={() => api.select(b)}>
                {BIG_NAMES[b]}
                <small>{groupOrder(b)}</small>
              </button>
            ))}
            <button class={`bt-tab gen ${sel === -2 ? 'on' : ''}`} onClick={() => api.select(-2)}>
              主将
              <small>{ordName(S.gen.order)}</small>
            </button>
          </div>
          <div class="bt-orders">
            {orderBtns.map(([c, n, k]) => (
              <button class="bt-btn" title={k} onClick={() => api.cmd(c)}>
                {n}
              </button>
            ))}
          </div>
          <div class="bt-global">
            <button class={`bt-btn red ${S.charge ? 'on' : ''}`} title="空格" onClick={() => api.cmd('charge')}>
              全军突击
            </button>
            <button class="bt-btn" title="Z" disabled={S.charge} onClick={() => api.cmd('holdAll')}>
              全军待命
            </button>
            <button class="bt-btn dark" title="T" onClick={() => setConfirmRetreat(true)}>
              撤退
            </button>
          </div>
          <button
            class={`bt-skill ${ready ? 'ready' : ''} ${canCast ? 'can' : ''}`}
            title="M"
            onClick={() => setSkillsOpen(!skillsOpen)}
            style={{ '--g': `${S.gen.gauge}%` } as never}
          >
            <span>武将技</span>
          </button>
        </div>
      )}

      {skillsOpen && !over && (
        <div class="bt-skills" onPointerDown={(e) => e.stopPropagation()}>
          <div class="hd">
            <span class="kai">武将技</span>
            <span class="mute">技力 {Math.floor(S.gen.mp)}/{S.gen.maxMp}</span>
            <button class="x" onClick={() => setSkillsOpen(false)}>
              ✕
            </button>
          </div>
          {!skills.length && <div class="mute empty">尚未习得武将技</div>}
          {!ready && skills.length > 0 && <div class="mute empty">武器条未满，尚不能施展</div>}
          <div class="list">
            {skills.map((s, i) => (
              <button
                class={`sk ${s.ok ? '' : 'off'}`}
                onClick={() => {
                  if (!s.ok) return;
                  api.cast(s.id);
                  setSkillsOpen(false);
                }}
              >
                <span class="k">{i < 9 ? i + 1 : ''}</span>
                <span class="n">{s.name}</span>
                <span class="sp">{s.spec}</span>
                <span class="mp">{s.reason || `${s.mp}`}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {confirmRetreat && !over && (
        <div class="bt-confirm">
          <div class="panel">
            <div class="title">全军撤退</div>
            <div style={{ margin: '0.4em 0 1em' }}>确定要撤退吗？主将须冲出战场边缘方能脱离。</div>
            <div class="row" style={{ justifyContent: 'flex-end' }}>
              <button class="btn" onClick={() => setConfirmRetreat(false)}>
                取消
              </button>
              <button
                class="btn primary"
                onClick={() => {
                  setConfirmRetreat(false);
                  api.cmd('retreat');
                }}
              >
                撤退
              </button>
            </div>
          </div>
        </div>
      )}

      {result && over && <Result world={world} api={api} />}
      <div class="bt-rotate">
        <div>📱↻</div>
        <div class="kai">请将设备横置以获得最佳体验</div>
      </div>
    </div>
  );
}

function Result(props: { world: World; api: HudApi }) {
  const { world, api } = props;
  const r = api.scene.result();
  const human = world.sides[0].human || !world.sides[1].human ? 0 : 1;
  const title = r.winner === 'draw' ? '平 手' : (r.winner === 'left') === (human === 0) ? '胜 利' : '败 北';
  const cls = r.winner === 'draw' ? 'draw' : title === '胜 利' ? 'win' : 'lose';
  const rows: [string, string, string][] = [
    ['武将', world.sides[0].info.name, world.sides[1].info.name],
    ['体力', `${r.left.hp}/${world.sides[0].gen.maxHp}`, `${r.right.hp}/${world.sides[1].gen.maxHp}`],
    ['剩余兵力', `${r.left.soldiersLeft}/${world.sides[0].initial}`, `${r.right.soldiersLeft}/${world.sides[1].initial}`],
    ['歼敌', String(r.left.kills), String(r.right.kills)],
    ['状态', r.left.defeated ? '战败' : r.left.fled ? '撤退' : '—', r.right.defeated ? '战败' : r.right.fled ? '撤退' : '—'],
  ];
  return (
    <div class="bt-result" onPointerDown={(e) => e.stopPropagation()}>
      <div class={`panel ${cls}`}>
        <div class={`ttl kai ${cls}`}>{title}</div>
        <div class="reason">{world.endReason}</div>
        <div class="vs">
          <Portrait general={world.sides[0].info.gs.id} />
          <table class="grid">
            <tbody>
              {rows.map(([a, b, c]) => (
                <tr>
                  <td class="l">{b}</td>
                  <th>{a}</th>
                  <td class="r">{c}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Portrait general={world.sides[1].info.gs.id} />
        </div>
        <div class="row" style={{ justifyContent: 'center', marginTop: '1em' }}>
          <button class="btn primary big" onClick={() => api.finish()}>
            确定
          </button>
        </div>
      </div>
    </div>
  );
}
