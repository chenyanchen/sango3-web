// Reusable strategy-layer dialogs: general tables/pickers, general detail,
// list pickers, number input, court-scene backdrop, speech boxes.
import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { db } from '../../data/db';
import { imageUrl } from '../../engine/assets';
import { sfx } from '../../engine/audio';
import {
  cname, formationName, gname, intOf, isLord, ITEM_TYPE_NAME, nname, soldierName, strOf, titleName,
} from '../../game/rules';
import { G, gen, maxSoldiers, expToNext, type GeneralState } from '../../game/state';
import { Bar, Btn, modal, Panel, Portrait, ShapeImg } from '../../ui/kit';

// ------------------------------------------------------------------ court backdrop
const bgCache: Record<number, string> = {};
export function Court(props: { bg?: number; children: ComponentChildren }) {
  const n = props.bg ?? 1;
  const [url, setUrl] = useState(bgCache[n] ?? '');
  useEffect(() => {
    if (!url) void imageUrl(`ad/background/bg00${n}`).then((u) => { bgCache[n] = u; setUrl(u); }, () => {});
  }, [n]);
  return (
    <div class="sg-court" style={url ? { backgroundImage: `url(${url})` } : undefined}>
      {props.children}
    </div>
  );
}

/** Title art from ad/static if available, else plain text. */
export function CmdTitle(props: { art?: string; text: string }) {
  return (
    <span class="sg-cmdtitle">
      {props.art ? <ShapeImg path={`ad/static/${props.art}`} class="sg-titleart" /> : null}
      <span class={props.art ? 'sr' : ''}>{props.text}</span>
    </span>
  );
}

/** A speech box with portrait (general speaking). */
export function say(gid: number | undefined, text: string, title?: string, bg?: number): Promise<void> {
  return modal<void>((close) => {
    const body = (
      <Panel title={title ?? (gid ? gname(gid) : '提示')} class="modal sg-say">
        <div class="body row" style={{ alignItems: 'flex-start', gap: '1em' }}>
          {gid ? <Portrait general={gid} /> : null}
          <div class="sg-saytext">{text}</div>
        </div>
        <div class="actions">
          <Btn class="primary" onClick={() => close()}>确定</Btn>
        </div>
      </Panel>
    );
    return bg ? <Court bg={bg}>{body}</Court> : body;
  });
}

export function sayShape(shape: string | undefined, gid: number | undefined, name: string, text: string, bg = 1): Promise<boolean> {
  return modal<boolean>((close) => (
    <Court bg={bg}>
      <Panel title={name || '　'} class="modal sg-say sg-event">
        <div class="body row" style={{ alignItems: 'flex-start', gap: '1em' }}>
          {gid ? <Portrait general={gid} /> : shape ? <Portrait shape={shape} /> : null}
          <div class="sg-saytext">{text}</div>
        </div>
        <div class="actions">
          <Btn onClick={() => close(false)}>略过</Btn>
          <Btn class="primary" onClick={() => close(true)}>继续</Btn>
        </div>
      </Panel>
    </Court>
  ));
}

// ------------------------------------------------------------------ general table
export type Col = 'name' | 'level' | 'str' | 'int' | 'hp' | 'mp' | 'sol' | 'type' | 'loy' | 'title' | 'merit' | 'city' | 'acted' | 'nation';
export const DEFAULT_COLS: Col[] = ['name', 'level', 'str', 'int', 'hp', 'sol', 'type', 'loy'];
const HEAD: Record<Col, string> = {
  name: '武将', level: '等级', str: '武力', int: '智力', hp: '体力', mp: '技力', sol: '兵数', type: '兵种', loy: '忠诚',
  title: '官职', merit: '功勋', city: '所在', acted: '状态', nation: '势力',
};
function cell(g: GeneralState, c: Col): ComponentChildren {
  switch (c) {
    case 'name':
      return (
        <span class="sg-gname">
          {gname(g.id)}
          {isLord(g) ? <i class="sg-badge lord">君</i> : null}
          {G.cities[g.city - 1]?.governor === g.id && !isLord(g) ? <i class="sg-badge gov">守</i> : null}
          {G.cities[g.city - 1]?.advisor === g.id ? <i class="sg-badge adv">师</i> : null}
        </span>
      );
    case 'level': return g.level;
    case 'str': return strOf(g);
    case 'int': return intOf(g);
    case 'hp': return <span class={g.hp < g.maxHp * 0.4 ? 'red' : ''}>{g.hp}/{g.maxHp}</span>;
    case 'mp': return `${g.mp}/${g.maxMp}`;
    case 'sol': return <span class={g.soldiers < maxSoldiers(g) * 0.5 ? 'dim' : ''}>{g.soldiers}/{maxSoldiers(g)}</span>;
    case 'type': return soldierName(g.soldierType);
    case 'loy': return isLord(g) ? '—' : <span class={g.loyalty < 50 ? 'red' : ''}>{g.loyalty}</span>;
    case 'title': return titleName(g);
    case 'merit': return g.merit;
    case 'city': return cname(g.city);
    case 'acted': return g.status === 'prisoner' ? <span class="red">俘虏</span> : g.acted ? <span class="mute">已出动</span> : <span class="gold">待命</span>;
    case 'nation': return g.status === 'prisoner' ? (g.origNation ? nname(g.origNation) : '在野') : nname(g.nation);
  }
}

export function GeneralTable(props: {
  gens: GeneralState[];
  cols?: Col[];
  sel?: Set<number>;
  disabled?: (g: GeneralState) => string | null;
  onRow?: (g: GeneralState) => void;
  onInfo?: (g: GeneralState) => void;
  check?: boolean;
  rowClass?: (g: GeneralState) => string;
}) {
  const cols = props.cols ?? DEFAULT_COLS;
  if (!props.gens.length) return <div class="sg-empty">无武将</div>;
  return (
    <table class="grid sg-gtable">
      <thead>
        <tr>
          {props.check ? <th /> : null}
          {cols.map((c) => <th>{HEAD[c]}</th>)}
          {props.onInfo ? <th /> : null}
        </tr>
      </thead>
      <tbody>
        {props.gens.map((g) => {
          const why = props.disabled?.(g) ?? null;
          const on = props.sel?.has(g.id);
          return (
            <tr class={`${why ? 'off' : props.onRow ? 'click' : ''} ${on ? 'sel' : ''} ${props.rowClass?.(g) ?? ''}`} title={why ?? ''} onClick={() => !why && props.onRow?.(g)}>
              {props.check ? <td class="sg-check">{why ? '' : on ? '☑' : '☐'}</td> : null}
              {cols.map((c, i) => (
                <td>
                  {cell(g, c)}
                  {i === 0 && why ? <small class="sg-why">{why}</small> : null}
                </td>
              ))}
              {props.onInfo ? (
                <td>
                  <button class="sg-info" onClick={(e) => { e.stopPropagation(); props.onInfo!(g); }}>详</button>
                </td>
              ) : null}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export interface PickOpts {
  title: ComponentChildren;
  prompt?: string;
  gens: GeneralState[];
  multi?: boolean;
  max?: number;
  min?: number;
  cols?: Col[];
  disabled?: (g: GeneralState) => string | null;
  /** extra content under the list, gets the current selection */
  footer?: (sel: number[]) => ComponentChildren;
  okText?: string;
  preselect?: number[];
  bg?: number;
}

/** Choose one or several generals. Resolves null when cancelled. */
export function pickGenerals(o: PickOpts): Promise<number[] | null> {
  return modal<number[] | null>((close) => <GenPicker o={o} close={close} />);
}

function GenPicker(props: { o: PickOpts; close: (v: number[] | null) => void }) {
  const { o, close } = props;
  const [sel, setSel] = useState<number[]>(o.preselect ?? []);
  const max = o.max ?? (o.multi ? 99 : 1);
  const toggle = (g: GeneralState) => {
    sfx('touch', { volume: 0.4 });
    if (!o.multi) {
      close([g.id]);
      return;
    }
    if (sel.includes(g.id)) setSel(sel.filter((x) => x !== g.id));
    else if (sel.length < max) setSel([...sel, g.id]);
  };
  const enabled = o.gens.filter((g) => !o.disabled?.(g));
  const body = (
    <Panel title={o.title} class="modal sg-picker">
      {o.prompt ? <div class="sg-prompt">{o.prompt}</div> : null}
      <div class="list sg-scroll">
        <GeneralTable gens={o.gens} cols={o.cols} sel={new Set(sel)} disabled={o.disabled} onRow={toggle} check={o.multi} onInfo={(g) => void showGeneral(g.id)} />
      </div>
      {o.footer?.(sel)}
      <div class="actions">
        {o.multi ? (
          <span class="dim grow" style={{ alignSelf: 'center' }}>
            已选 {sel.length}{max < 99 ? `/${max}` : ''}
            {enabled.length > 1 ? (
              <button class="sg-link" onClick={() => setSel(sel.length ? [] : enabled.slice(0, max).map((g) => g.id))}>
                {sel.length ? '清除' : '全选'}
              </button>
            ) : null}
          </span>
        ) : null}
        <Btn onClick={() => close(null)}>取消</Btn>
        {o.multi ? (
          <Btn class="primary" disabled={sel.length < (o.min ?? 1)} onClick={() => close(sel)}>
            {o.okText ?? '确定'}
          </Btn>
        ) : null}
      </div>
    </Panel>
  );
  return o.bg ? <Court bg={o.bg}>{body}</Court> : body;
}

// ------------------------------------------------------------------ generic list picker
export interface ListItem {
  key: number;
  cells: ComponentChildren[];
  disabled?: string | null;
  icon?: string;
}
export function pickList(title: ComponentChildren, head: string[], items: ListItem[], prompt?: string, bg?: number): Promise<number> {
  return modal<number>((close) => {
    const body = (
      <Panel title={title} class="modal sg-picker">
        {prompt ? <div class="sg-prompt">{prompt}</div> : null}
        <div class="list sg-scroll">
          {items.length ? (
            <table class="grid">
              <thead>
                <tr>{head.map((h) => <th>{h}</th>)}</tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr class={it.disabled ? 'off' : 'click'} title={it.disabled ?? ''} onClick={() => { if (!it.disabled) { sfx('touch', { volume: 0.4 }); close(it.key); } }}>
                    {it.cells.map((c, i) => (
                      <td>
                        {i === 0 && it.icon ? <ShapeImg path={it.icon} class="sg-icon" /> : null}
                        {c}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div class="sg-empty">无</div>
          )}
        </div>
        <div class="actions">
          <Btn onClick={() => close(-1)}>取消</Btn>
        </div>
      </Panel>
    );
    return bg ? <Court bg={bg}>{body}</Court> : body;
  });
}

// ------------------------------------------------------------------ number input
export function askNumber(title: string, prompt: ComponentChildren, min: number, max: number, init: number, step = 1): Promise<number | null> {
  return modal<number | null>((close) => <NumberBox title={title} prompt={prompt} min={min} max={max} init={init} step={step} close={close} />);
}
function NumberBox(p: { title: string; prompt: ComponentChildren; min: number; max: number; init: number; step: number; close: (v: number | null) => void }) {
  const [v, setV] = useState(Math.max(p.min, Math.min(p.max, p.init)));
  return (
    <Panel title={p.title} class="modal">
      <div class="body col" style={{ gap: '0.8em', minWidth: '18em' }}>
        <div>{p.prompt}</div>
        <div class="row">
          <input type="range" class="grow" min={p.min} max={p.max} step={p.step} value={v} onInput={(e) => setV(+(e.target as HTMLInputElement).value)} />
          <b class="gold" style={{ minWidth: '4em', textAlign: 'right' }}>{v}</b>
        </div>
        <div class="row" style={{ justifyContent: 'center' }}>
          <Btn class="ghost" onClick={() => setV(p.min)}>最少</Btn>
          <Btn class="ghost" onClick={() => setV(Math.round((p.min + p.max) / 2))}>一半</Btn>
          <Btn class="ghost" onClick={() => setV(p.max)}>最多</Btn>
        </div>
      </div>
      <div class="actions">
        <Btn onClick={() => p.close(null)}>取消</Btn>
        <Btn class="primary" onClick={() => p.close(v)}>确定</Btn>
      </div>
    </Panel>
  );
}

// ------------------------------------------------------------------ general detail
export function itemIcon(id: number) {
  const it = db.items[id];
  return it && it.icon && it.icon !== 'null' ? `ad/things/${it.icon}` : '';
}

export function ItemSlot(props: { id: number; label: string }) {
  const it = db.items[props.id];
  return (
    <div class="sg-slot" title={it ? `${it.name}：${it.desc}` : ''}>
      {it && itemIcon(props.id) ? <ShapeImg path={itemIcon(props.id)} class="sg-icon" /> : <span class="sg-icon empty" />}
      <div>
        <div class="mute" style={{ fontSize: '0.8em' }}>{props.label}</div>
        <div>{it ? it.name : '—'}</div>
      </div>
    </div>
  );
}

export function showGeneral(gid: number): Promise<void> {
  return modal<void>((close) => <GeneralCard gid={gid} close={close} />);
}

function GeneralCard(props: { gid: number; close: () => void }) {
  const g = gen(props.gid);
  const d = db.generals[g.id - 1];
  const w = g.weapon >= 0 ? db.items[g.weapon] : undefined;
  const b = g.book >= 0 ? db.items[g.book] : undefined;
  const status = g.status === 'serving' ? (isLord(g) ? '君主' : titleName(g)) : g.status === 'prisoner' ? '俘虏' : g.status === 'free' ? '在野' : g.status === 'dead' ? '已故' : '未登场';
  const nx = expToNext(g.level);
  return (
    <Panel title={<span>{d.name} <span class="dim" style={{ fontSize: '0.7em', letterSpacing: 0 }}>{status}</span></span>} class="modal sg-gcard">
      <div class="body sg-gcard-body">
        <div class="col" style={{ alignItems: 'center' }}>
          <Portrait general={g.id} size="lg" />
          <div class="dim" style={{ fontSize: '0.85em' }}>{nname(g.status === 'prisoner' ? (g.origNation ?? 0) : g.nation)}{g.city ? ` · ${cname(g.city)}` : ''}</div>
        </div>
        <div class="col grow" style={{ minWidth: '15em' }}>
          <div class="stat sg-stat2">
            <b>等级</b><span>{g.level}<span class="mute"> （{g.exp}/{Math.round(nx)}）</span></span>
            <b>武力</b><span>{strOf(g)}{w ? <span class="gold"> (+{w.inc})</span> : null}</span>
            <b>智力</b><span>{intOf(g)}{b && b.attribute === 2 ? <span class="gold"> (+{b.inc})</span> : null}</span>
            <b>忠诚</b><span>{isLord(g) ? '—' : g.loyalty}</span>
            <b>义理</b><span>{d.justice}</span>
            <b>功勋</b><span>{g.merit}</span>
            <b>兵种</b><span>{soldierName(g.soldierType)}</span>
            <b>阵形</b><span>{formationName(g.formation)}</span>
            <b>战绩</b><span>{g.wins ?? 0}胜{g.losses ?? 0}败</span>
          </div>
          <div class="sg-bars">
            <span>体力</span><Bar value={g.hp} max={g.maxHp} kind="hp" /><span>{g.hp}/{g.maxHp}</span>
            <span>技力</span><Bar value={g.mp} max={g.maxMp} kind="mp" /><span>{g.mp}/{g.maxMp}</span>
            <span>兵数</span><Bar value={g.soldiers} max={maxSoldiers(g)} kind="sol" /><span>{g.soldiers}/{maxSoldiers(g)}</span>
          </div>
        </div>
      </div>
      <div class="sg-slots">
        <ItemSlot id={g.weapon} label="武器" />
        <ItemSlot id={g.horse} label="马匹" />
        <ItemSlot id={g.book} label="书籍" />
      </div>
      <div class="sg-skills">
        <div><b>必杀技</b>{d.superAttack || '—'}</div>
        <div><b>武将技</b>{g.bfMagic.map((id) => db.bfMagic[id - 1]?.name).filter(Boolean).join('、') || '—'}</div>
        <div><b>军师技</b>{g.sfMagic.map((id) => db.sfMagic[id - 1]?.name).filter(Boolean).join('、') || '—'}</div>
        <div><b>可率兵种</b>{g.soldierTypes.map(soldierName).join('、')}</div>
        <div><b>已学阵形</b>{g.formations.map(formationName).join('、')}</div>
      </div>
      <div class="actions">
        <Btn class="primary" onClick={() => props.close()}>确定</Btn>
      </div>
    </Panel>
  );
}

export function itemTypeName(id: number) {
  return ITEM_TYPE_NAME[db.items[id]?.type] ?? '';
}
