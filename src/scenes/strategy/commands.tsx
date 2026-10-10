// Player commands (内政/军政/外交/任免/计略/系统/休息). Each command is an
// async UI flow over the rules in src/game/rules.ts.
import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import { db } from '../../data/db';
import { sfx } from '../../engine/audio';
import type { WarSetup } from '../../game/contracts';
import {
  aiPrisonerChoice, allianceChance, apOf, attackTargets, autoAssignSoldiers, autoTitle, availableTitles, bfMagicReq, breakAlliance, canEquip, cityPower, clamp,
  cname, conscriptAmount, DEV_MAX, doAppoint, doConscript, doDevelop, doGiveItem, doGrantTitle, doInvestigate, doLearn, doLure,
  doMove, doPersuadePrisoner, doProposeAlliance, doSearch, doSowDiscord, doTrain, doUnequip, formationName, friendship, gname,
  handlePrisoner, hasIntel, incomeOf, intOf, isAllied, isLord, ITEM_TYPE, lureChance, moveTargets, nationStrength, nname, powerOf,
  recruitFree, reserveCap, setSoldiers, soldierName, sowChance, spendAP as spendNationAP, strOf, titleName, totalMoney, totalSoldiers,
  type LureMethod,
} from '../../game/rules';
import { listSaves, saveGame } from '../../game/save';
import {
  G, addLog, city, citiesOf, gen, generalsIn, generalsOf, maxSoldiers, nation, prisonersIn, type GeneralState,
} from '../../game/state';
import { Btn, chooseBox, confirmBox, modal, Panel, Portrait, toast } from '../../ui/kit';
import type { MarkKind, MapView } from './map';
import {
  askNumber, CmdTitle, Court, GeneralTable, itemIcon, itemTypeName, pickGenerals, pickList, say, showGeneral,
} from './ui';

export interface Ctx {
  map: MapView;
  /** currently selected city */
  sel(): number;
  select(id: number): void;
  refresh(): void;
  pickCity(targets: number[], kind: MarkKind, prompt: string): Promise<number>;
  /** run a player-started war and its aftermath */
  war(setup: WarSetup): Promise<void>;
  endMonth(): Promise<void>;
  loadSlot(slot: number): Promise<void>;
  toTitle(): void;
}

export interface Command {
  key: string;
  label: string;
  ap: number;
  /** needs a selected own city */
  city: boolean;
  art?: string;
  run(ctx: Ctx): Promise<void>;
}
export interface Group {
  key: string;
  label: string;
  hot: string;
  cmds: Command[];
  /** runs directly (no submenu) */
  direct?: (ctx: Ctx) => Promise<void>;
}

const P = () => G.player;
const myCity = (ctx: Ctx) => {
  const c = city(ctx.sel());
  return c && c.owner === P() ? c : undefined;
};
const needAP = (n = 1) => {
  if (apOf(P()) < n) {
    toast('行动点数不足，请选择「休息」结束本月。');
    sfx('sorry');
    return false;
  }
  return true;
};
const actedWhy = (g: GeneralState) => (g.acted ? '本月已行动' : null);

/** Pick one idle general in the city. */
async function pickActor(ctx: Ctx, title: ComponentChildren, prompt: string, extra?: (g: GeneralState) => string | null, cols?: Parameters<typeof GeneralTable>[0]['cols']) {
  const gs = generalsIn(ctx.sel(), P());
  if (!gs.length) {
    toast('城中没有武将。');
    return null;
  }
  const r = await pickGenerals({
    title, prompt, gens: gs, cols,
    disabled: (g) => extra?.(g) ?? null,
  });
  return r ? gen(r[0]) : null;
}

// ================================================================== 内政
const move: Command = {
  key: 'move', label: '移动', ap: 1, city: true, art: 'movet',
  async run(ctx) {
    const from = ctx.sel();
    const targets = moveTargets(P(), from);
    if (!targets.length) return void say(undefined, `${cname(from)}无任何城市可以前往。`);
    const ids = await pickGenerals({
      title: <CmdTitle art="movet" text="移动" />, prompt: '请选择出发的武将。', gens: generalsIn(from, P()), multi: true, disabled: actedWhy,
      cols: ['name', 'level', 'str', 'int', 'sol', 'loy'],
    });
    if (!ids) return;
    const to = await ctx.pickCity(targets, 'move', '请选择到达城市。');
    if (to <= 0) return;
    const src = city(from);
    let money = 0;
    if (src.money > 0) {
      const m = await askNumber('运送金钱', `确定由${cname(from)}移动至${cname(to)}？\n可同时运送金钱（${cname(from)}现有 ${src.money}）：`, 0, src.money, 0, 10);
      if (m === null) return;
      money = m;
    } else if (!(await confirmBox(`确定由${cname(from)}移动至${cname(to)}？`))) return;
    if (!spendAP()) return;
    void ctx.map.ride(from, to);
    const r = doMove(P(), from, to, ids, money);
    sfx('horse01', { volume: 0.6 });
    ctx.select(to);
    ctx.refresh();
    await say(r.speaker, r.msg + (money ? `\n运送金钱 ${money}。` : ''), '移动');
  },
};
/** Validates and spends one action point. */
function spendAP() {
  return needAP() && spendNationAP(P());
}

const search: Command = {
  key: 'search', label: '搜索', ap: 1, city: true, art: 'search',
  async run(ctx) {
    if (!needAP()) return;
    const g = await pickActor(ctx, <CmdTitle art="search" text="搜索" />, '请选择要执行搜寻的武将。（智力高者容易有所发现）');
    if (!g || !spendAP()) return;
    const r = doSearch(P(), g);
    ctx.refresh();
    if (r.found) {
      await say(g.id, r.msg, '搜索');
      const f = r.found;
      const join = await modal<boolean>((close) => (
        <Court bg={2}>
          <Panel title="人才" class="modal sg-say">
            <div class="body row" style={{ gap: '1em', alignItems: 'flex-start' }}>
              <PortraitG id={f} />
              <div class="col">
                <div class="sg-saytext">{`${gname(f)}将军，请加入我们吧！`}</div>
                <MiniStats g={gen(f)} />
              </div>
            </div>
            <div class="actions">
              <Btn onClick={() => close(false)}>放弃</Btn>
              <Btn class="primary" onClick={() => close(true)}>登用</Btn>
            </div>
          </Panel>
        </Court>
      ));
      if (!join) return;
      const rr = recruitFree(P(), g, f);
      sfx(rr.ok ? 'accept' : 'sorry');
      ctx.refresh();
      await say(f, rr.msg + (rr.ok ? `\n\n太好了，${gname(f)}加入我军了。` : `\n\n${gname(f)}拒绝加入我军。`), '人才', 2);
      return;
    }
    if (r.ok) sfx('lucky');
    await say(g.id, r.msg + (r.item !== undefined ? `\n（${db.items[r.item].desc}）` : ''), '搜索');
  },
};

function PortraitG(p: { id: number }) {
  return <Portrait general={p.id} />;
}
function MiniStats(p: { g: GeneralState }) {
  const g = p.g;
  return (
    <div class="stat" style={{ gridTemplateColumns: 'auto auto auto auto' }}>
      <b>等级</b><span>{g.level}</span><b>武力</b><span>{strOf(g)}</span>
      <b>智力</b><span>{intOf(g)}</span><b>体力</b><span>{g.maxHp}</span>
    </div>
  );
}

const develop: Command = {
  key: 'develop', label: '开发', ap: 1, city: true, art: 'develop',
  async run(ctx) {
    const c = myCity(ctx)!;
    if (c.dev >= DEV_MAX) return void toast(`${cname(c.id)}开发度已达上限 ${DEV_MAX}。`);
    if (!needAP()) return;
    const g = await pickActor(ctx, <CmdTitle art="develop" text="开发" />, `请选择要执行开发的武将。目前开发度 ${c.dev}/${DEV_MAX}`, undefined, ['name', 'level', 'int', 'str', 'acted']);
    if (!g || !spendAP()) return;
    const r = doDevelop(g);
    sfx('accept');
    ctx.refresh();
    await say(r.speaker, r.msg, '开发');
  },
};

const talent: Command = {
  key: 'talent', label: '人才', ap: 1, city: true, art: 'person',
  async run(ctx) {
    const k = await chooseBox('请选择要采用的策略。', ['招降（劝降城中俘虏）', '招揽（策反已调查城中的敌将）'], '人才');
    if (k === 0) await persuade(ctx);
    else if (k === 1) await lure(ctx);
  },
};

async function persuade(ctx: Ctx) {
  const ps = prisonersIn(ctx.sel()).filter((p) => p.nation === P());
  if (!ps.length) return void say(undefined, `${cname(ctx.sel())}城中没有俘虏。`);
  const r = await pickGenerals({
    title: '俘虏', prompt: '请选择要招降的武将。（俘虏的忠诚度会随关押时间逐月下降）', gens: ps,
    cols: ['name', 'level', 'str', 'int', 'loy', 'nation'], bg: 3,
  });
  if (!r) return;
  const p = gen(r[0]);
  const act = await chooseBox(`如何处置${gname(p.id)}？`, ['招降（消耗行动点数）', '释放', '斩首'], '俘虏处理');
  if (act < 0) return;
  if (act === 0) {
    if (!needAP()) return;
    const agent = await pickActor(ctx, '招降', '请选择执行招降的武将。（智力越高越容易说服）');
    if (!agent || !spendAP()) return;
    const res = doPersuadePrisoner(P(), agent, p.id);
    sfx(res.ok ? 'accept' : 'sorry');
    ctx.refresh();
    await say(p.id, res.msg + (res.ok ? `\n\n太好了，${gname(p.id)}加入我军了。` : ''), '招降', 3);
  } else {
    const ch = act === 1 ? 'release' : 'behead';
    if (!(await confirmBox(act === 1 ? `确定释放${gname(p.id)}吗？` : `确定要杀了${gname(p.id)}吗？`))) return;
    const msg = await handlePrisoner(P(), p.id, ch, warHooks(ctx));
    addLog(msg);
    ctx.refresh();
    await say(p.id, (act === 1 ? '多谢不杀之恩‧‧‧后会有期了。' : '大丈夫死不足惜！') + '\n\n' + msg, '俘虏处理');
  }
}

async function lure(ctx: Ctx) {
  const targets = G.generals.filter((g) => g.status === 'serving' && g.nation !== P() && !isLord(g) && hasIntel(P(), g.city));
  if (!targets.length) return void say(undefined, '没有可招揽的武将。\n招揽之前，必须先以「计略 → 调查」打探敌将所在的城市。');
  const r = await pickGenerals({
    title: '招揽', prompt: '请选择要招揽的武将。（只列出已调查城市中的敌将）', gens: targets.sort((a, b) => a.loyalty - b.loyalty),
    cols: ['name', 'nation', 'city', 'level', 'str', 'int', 'loy'], bg: 2,
  });
  if (!r) return;
  const t = gen(r[0]);
  if (!needAP()) return;
  const agent = await pickActor(ctx, '招揽', '请选择要执行招揽的武将。');
  if (!agent) return;
  const m = await chooseBox(`派遣${gname(agent.id)}前去招揽${gname(t.id)}，要用什么方法？`, ['宝　物', '金　钱', '游　说'], '招揽');
  if (m < 0) return;
  const method: LureMethod = (['treasure', 'money', 'talk'] as const)[m];
  let item = -1;
  let money = 0;
  if (method === 'treasure') {
    const inv = nation(P())!.items ?? [];
    if (!inv.length) return void toast('库存中没有任何物品。');
    item = await pickItem('赠送宝物', inv);
    if (item < 0) return;
  } else if (method === 'money') {
    const c = city(agent.city);
    if (c.money < 50) return void toast('金钱不足。');
    const v = await askNumber('赠送金钱', `${cname(c.id)}现有金钱 ${c.money}`, 50, c.money, Math.min(c.money, 500), 10);
    if (v === null) return;
    money = v;
  }
  const est = lureChance(agent, t, method, method === 'money' ? money : method === 'treasure' ? db.items[item].attraction : 0);
  if (!(await confirmBox(`确定要派遣${gname(agent.id)}前去招揽${gname(t.id)}吗？\n（成功可能：${chanceWord(est)}）`))) return;
  if (!spendAP()) return;
  await say(agent.id, `${gname(t.id)}将军，良禽择木而栖，贤臣择主而仕，请加入我军为天下苍生共谋福祉！`, '招揽', 2);
  const res = doLure(P(), agent, t.id, method, item, money);
  sfx(res.ok ? 'accept' : 'sorry');
  ctx.refresh();
  await say(res.speaker, res.msg + (res.ok ? `\n\n太好了，${gname(t.id)}加入我军了。` : `\n\n${gname(t.id)}拒绝加入我军。`), '招揽', 2);
}

function chanceWord(p: number) {
  return p > 0.7 ? '极高' : p > 0.45 ? '颇高' : p > 0.25 ? '普通' : p > 0.1 ? '偏低' : '渺茫';
}

function pickItem(title: string, inv: number[], gfor?: GeneralState): Promise<number> {
  // group identical items
  const counts = new Map<number, number>();
  for (const i of inv) counts.set(i, (counts.get(i) ?? 0) + 1);
  const ids = [...counts.keys()].sort((a, b) => db.items[a].type - db.items[b].type || a - b);
  return pickList(
    title,
    ['物品', '类别', '数量', '说明'],
    ids.map((i) => ({
      key: i, icon: itemIcon(i),
      cells: [db.items[i].name, itemTypeName(i), counts.get(i), <span class="dim">{db.items[i].desc}</span>],
      disabled: gfor ? canEquip(gfor, db.items[i]) : null,
    })),
  );
}

const items: Command = {
  key: 'items', label: '物品', ap: 0, city: false, art: undefined,
  async run(ctx) {
    for (;;) {
      const inv = nation(P())!.items ?? [];
      const mode = await chooseBox(`库存物品 ${inv.length} 件。`, ['赏赐物品', '卸下装备'], '物品');
      if (mode < 0) return;
      if (mode === 1) {
        const r = await pickGenerals({
          title: '卸下装备', gens: generalsOf(P()).filter((g) => g.weapon >= 0 || g.horse >= 0 || g.book >= 0), cols: ['name', 'city', 'level', 'str', 'int'],
        });
        if (!r) continue;
        const g = gen(r[0]);
        const slots = (['weapon', 'horse', 'book'] as const).filter((s) => g[s] >= 0);
        const k = await chooseBox('卸下身上装备', slots.map((s) => db.items[g[s]].name), '卸下装备');
        if (k < 0) continue;
        const res = doUnequip(P(), g, slots[k]);
        toast(res.msg);
        ctx.refresh();
        continue;
      }
      if (!inv.length) {
        await say(undefined, '库存中没有任何物品。\n可以用「搜索」在城中寻找道具。');
        return;
      }
      const it = await pickItem('赏赐物品', inv);
      if (it < 0) continue;
      const def = db.items[it];
      const gs = generalsOf(P()).sort((a, b) => a.city - b.city || b.level - a.level);
      const cols: Parameters<typeof GeneralTable>[0]['cols'] =
        def.type === ITEM_TYPE.treasure ? ['name', 'city', 'level', 'loy'] : def.type === ITEM_TYPE.weapon ? ['name', 'city', 'level', 'str', 'loy'] : ['name', 'city', 'level', 'str', 'int', 'type'];
      const r = await pickGenerals({ title: `赏赐 ${def.name}`, prompt: def.desc, gens: gs, cols, disabled: (g) => canEquip(g, def) });
      if (!r) continue;
      const res = doGiveItem(P(), gen(r[0]), it);
      sfx(res.ok ? 'accept' : 'sorry');
      ctx.refresh();
      await say(res.speaker, res.msg, '物品');
    }
  },
};

// ================================================================== 军政
const conscript: Command = {
  key: 'conscript', label: '征兵', ap: 1, city: true, art: 'recruitt',
  async run(ctx) {
    const c = myCity(ctx)!;
    if (c.reserve >= reserveCap(c)) return void toast(`${cname(c.id)}预备兵已达上限。`);
    if (c.money < 10) return void say(undefined, `${cname(c.id)}金钱不足，未征得任何士兵。`);
    if (!needAP()) return;
    const g = await pickActor(ctx, <CmdTitle art="recruitt" text="征兵" />, `请选择要执行征兵的武将。\n金钱 ${c.money} · 预备兵 ${c.reserve}/${reserveCap(c)} · 每名士兵花费金钱 1`, undefined, ['name', 'level', 'str', 'int', 'acted']);
    if (!g || !spendAP()) return;
    const r = doConscript(g);
    sfx('accept');
    ctx.refresh();
    await say(r.speaker, r.msg + `\n\n${cname(c.id)}预备兵 ${c.reserve}/${reserveCap(c)}。可用「调兵」分配给武将。`, '征兵');
  },
};
void conscriptAmount;

const train: Command = {
  key: 'train', label: '训练', ap: 1, city: true, art: 'train',
  async run(ctx) {
    const c = myCity(ctx)!;
    if (c.training >= 100) return void toast('士气已达上限。');
    if (!needAP()) return;
    const g = await pickActor(ctx, <CmdTitle art="train" text="训练" />, `请选择要执行训练的武将。目前士气 ${c.training}/100`, undefined, ['name', 'level', 'str', 'int', 'acted']);
    if (!g || !spendAP()) return;
    const r = doTrain(g);
    sfx('accept');
    ctx.refresh();
    await say(r.speaker, r.msg, '训练');
  },
};

const war: Command = {
  key: 'war', label: '战争', ap: 1, city: true, art: 'campaignt',
  async run(ctx) {
    const from = ctx.sel();
    const targets = attackTargets(P(), from);
    if (!targets.length) return void say(undefined, `${cname(from)}无任何城市可以进攻。`);
    if (!needAP()) return;
    const all = generalsIn(from, P());
    if (!all.some((g) => !g.acted && g.soldiers > 0)) return void say(undefined, `${cname(from)}没有可出阵的武将。\n（武将需带有士兵，且本月尚未出动）`);
    const ids = await pickGenerals({
      title: <CmdTitle art="campaignt" text="战争" />, prompt: '请选择出阵武将（最多 10 名）。', gens: all, multi: true, max: 10,
      cols: ['name', 'level', 'str', 'int', 'hp', 'sol', 'type'],
      disabled: (g) => actedWhy(g) ?? (g.soldiers <= 0 ? '没有士兵' : g.hp < 5 ? '体力不足' : null),
      preselect: all.filter((g) => !g.acted && g.soldiers > 0 && g.hp >= 5).sort((a, b) => powerOf(b) - powerOf(a)).slice(0, 10).map((g) => g.id),
      okText: '出阵',
      footer: (sel) => (
        <div class="dim sg-foot">
          总兵力 {sel.reduce((s, id) => s + gen(id).soldiers, 0)} 人 · 城中士气 {city(from).training}
        </div>
      ),
    });
    if (!ids) return;
    const to = await ctx.pickCity(targets, 'ft', '请选择进攻城市。');
    if (to <= 0) return;
    const tc = city(to);
    const known = hasIntel(P(), to);
    const defs = generalsIn(to, tc.owner);
    const atk = ids.reduce((s, id) => s + powerOf(gen(id)), 0);
    const ratio = atk / Math.max(1, cityPower(to));
    const odds = !defs.length ? '敌城无人防守' : known ? `守将 ${defs.length} 名，兵力 ${defs.reduce((s, g) => s + g.soldiers, 0)}（${ratio > 1.5 ? '我军占优' : ratio > 0.9 ? '势均力敌' : '敌军占优'}）` : `守将 ${defs.length} 名（未调查，详情不明）`;
    let msg = `确定由${cname(from)}进攻${cname(to)}？\n${nname(tc.owner)}军 · ${odds}`;
    if (ids.length === all.length) msg += '\n\n确定要全军出动，不派人留守吗？';
    if (!(await confirmBox(msg, '战争', '出阵'))) return;
    if (!spendAP()) return;
    for (const id of ids) gen(id).acted = true;
    addLog(`我军进攻${cname(to)}。`);
    ctx.refresh();
    await ctx.map.ride(from, to, true);
    await ctx.war({ city: to, attacker: P(), attackers: ids, from, defenders: defs.filter((g) => g.hp > 0).map((g) => g.id) });
  },
};

const prepare: Command = {
  key: 'prepare', label: '整备', ap: 0, city: true, art: 'prepare',
  async run(ctx) {
    for (;;) {
      const r = await pickGenerals({
        title: <CmdTitle art="prepare" text="整备" />, prompt: '请选择要执行整备的武将。', gens: generalsIn(ctx.sel(), P()),
        cols: ['name', 'level', 'str', 'int', 'type', 'merit'],
      });
      if (!r) return;
      await modal<void>((close) => <PrepareBox gid={r[0]} close={close} />);
      ctx.refresh();
    }
  },
};

function PrepareBox(props: { gid: number; close: () => void }) {
  const g = gen(props.gid);
  const [tab, setTab] = useState(0);
  const [, force] = useState(0);
  const redraw = () => force((x) => x + 1);
  const learn = (kind: 'bf' | 'sf', id: number) => {
    const m = kind === 'bf' ? db.bfMagic[id - 1] : db.sfMagic[id - 1];
    void confirmBox(`学习${m.name}？\n所需功勋：${m.contribution}（现有 ${g.merit}）`, '整备').then((y) => {
      if (!y) return;
      const res = doLearn(g, kind, id);
      sfx(res.ok ? 'level' : 'sorry');
      toast(res.msg);
      redraw();
    });
  };
  const skillTable = (kind: 'bf' | 'sf') => {
    const list = (kind === 'bf' ? db.bfMagic : db.sfMagic).filter((m) => m.name);
    const known = kind === 'bf' ? g.bfMagic : g.sfMagic;
    const rows = list
      .map((m) => ({ m, why: known.includes(m.id) ? '已学会' : bfMagicReq(g, m) }))
      .filter((x) => x.why === null || x.why === '已学会' || x.m.level <= g.level + 6)
      .sort((a, b) => (a.why === null ? 0 : a.why === '已学会' ? 1 : 2) - (b.why === null ? 0 : b.why === '已学会' ? 1 : 2) || a.m.level - b.m.level);
    return (
      <table class="grid">
        <thead>
          <tr><th>{kind === 'bf' ? '武将技' : '军师技'}</th><th>等级</th><th>技力</th><th>功勋</th><th>状态</th></tr>
        </thead>
        <tbody>
          {rows.map(({ m, why }) => {
            const can = why === null && g.merit >= m.contribution;
            return (
              <tr class={can ? 'click' : 'off'} onClick={() => can && learn(kind, m.id)}>
                <td>{m.name}</td><td>{m.level}</td><td>{m.mp}</td><td>{m.contribution}</td>
                <td>{why === '已学会' ? <span class="gold">已学会</span> : why ? <span class="mute">需{why}</span> : g.merit < m.contribution ? <span class="mute">功勋不足</span> : <span class="gold">可学习</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  };
  return (
    <Panel title={<CmdTitle art="prepare" text={`整备 · ${gname(g.id)}`} />} class="modal sg-picker">
      <div class="row" style={{ gap: '0.8em', marginBottom: '0.5em' }}>
        <Portrait general={g.id} size="sm" />
        <div class="dim">
          等级 {g.level} · 武力 {strOf(g)} · 智力 {intOf(g)} · 功勋 <b class="gold">{g.merit}</b>
          <br />必杀技：{db.generals[g.id - 1].superAttack || '—'}
        </div>
      </div>
      <div class="tabs">
        {['阵形', '兵种', '武将技', '军师技'].map((t, i) => (
          <button class={tab === i ? 'on' : ''} onClick={() => setTab(i)}>{t}</button>
        ))}
      </div>
      <div class="list sg-scroll">
        {tab === 0 && (
          <div class="sg-chips">
            {db.formations.map((f) => {
              const has = g.formations.includes(f.id);
              return (
                <Btn class={g.formation === f.id ? 'sel' : ''} disabled={!has} title={has ? '' : '需使用阵法书学会'} onClick={() => { g.formation = f.id; redraw(); }}>
                  {formationName(f.id)}
                </Btn>
              );
            })}
          </div>
        )}
        {tab === 1 && (
          <div class="sg-chips">
            {db.soldiers.map((s) => {
              const has = g.soldierTypes.includes(s.id);
              return (
                <Btn class={g.soldierType === s.id ? 'sel' : ''} disabled={!has} title={has ? '' : '需使用兵符学会'} onClick={() => { g.soldierType = s.id; redraw(); }}>
                  {soldierName(s.id)}
                </Btn>
              );
            })}
          </div>
        )}
        {tab === 2 && skillTable('bf')}
        {tab === 3 && skillTable('sf')}
      </div>
      <div class="actions">
        <Btn class="primary" onClick={() => props.close()}>确定</Btn>
      </div>
    </Panel>
  );
}

const assign: Command = {
  key: 'assign', label: '调兵', ap: 0, city: true, art: 'adjust',
  async run(ctx) {
    await modal<void>((close) => <AssignBox cid={ctx.sel()} close={close} />);
    ctx.refresh();
  },
};

function AssignBox(props: { cid: number; close: () => void }) {
  const c = city(props.cid);
  const [, force] = useState(0);
  const redraw = () => force((x) => x + 1);
  const gs = generalsIn(c.id, P()).sort((a, b) => b.level - a.level);
  return (
    <Panel title={<CmdTitle art="adjust" text="调兵" />} class="modal sg-picker">
      <div class="sg-prompt">
        {cname(c.id)} 预备兵 <b class="gold">{c.reserve}</b>/{reserveCap(c)} · 士气 {c.training}
      </div>
      <div class="list sg-scroll">
        <table class="grid sg-assign">
          <thead>
            <tr><th>武将</th><th>官职</th><th>兵种</th><th style={{ width: '40%' }}>兵数</th><th /></tr>
          </thead>
          <tbody>
            {gs.map((g) => (
              <tr>
                <td>{gname(g.id)}</td>
                <td class="dim">{titleName(g)}</td>
                <td>{soldierName(g.soldierType)}</td>
                <td>
                  <input type="range" min={0} max={maxSoldiers(g)} step={1} value={g.soldiers} style={{ width: '100%' }}
                    onInput={(e) => { setSoldiers(g, +(e.target as HTMLInputElement).value); redraw(); }} />
                </td>
                <td class="sg-num">{g.soldiers}/{maxSoldiers(g)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div class="actions">
        <Btn onClick={() => { for (const g of gs) setSoldiers(g, 0); redraw(); }}>全部解散</Btn>
        <Btn onClick={() => { autoAssignSoldiers(c.id); redraw(); }}>全部补满</Btn>
        <Btn class="primary" onClick={() => props.close()}>确定</Btn>
      </div>
    </Panel>
  );
}

// ================================================================== 外交
function relation(n: number) {
  return isAllied(P(), n) ? <span class="gold">同盟</span> : <span class="dim">—</span>;
}
const ally: Command = {
  key: 'ally', label: '同盟', ap: 1, city: false, art: 'diplomacy',
  async run(ctx) {
    if (!needAP()) return;
    const ns = G.nations.filter((n) => n.alive && n.id !== P());
    const k = await pickList(
      <CmdTitle art="diplomacy" text="同盟" />,
      ['君主', '城数', '武将', '友好度', '关系', '可能'],
      ns.map((n) => ({
        key: n.id,
        cells: [<span><i class="chip" style={{ background: n.color }} /> {n.name}</span>, citiesOf(n.id).length, generalsOf(n.id).length, friendship(P(), n.id), relation(n.id), chanceWord(allianceChance(P(), n.id))],
        disabled: isAllied(P(), n.id) ? '已是同盟' : null,
      })),
      '请选择要同盟的国家。', 1,
    );
    if (k < 0) return;
    if (!(await confirmBox(`确定与${nname(k)}同盟吗？`))) return;
    if (!spendAP()) return;
    const lord = gen(nation(P())!.lord);
    await say(lord.id, rngPick(['我们两国唇亡齿寒，应该更团结才是，还请同意和我国结盟，共御外侮。', '如今天下纷乱，请同意和我国结盟，携手齐心为苍生黎民而努力。', '团结力量大，还望你们能同意与我国结盟，百利无弊，请好好考虑一下吧！']), '同盟', 1);
    const r = doProposeAlliance(P(), k);
    sfx(r.ok ? 'accept' : 'sorry');
    ctx.refresh();
    await say(r.speaker, r.msg, nname(k), 1);
  },
};
function rngPick<T>(a: T[]) {
  return a[Math.floor(Math.random() * a.length)];
}
const unally: Command = {
  key: 'unally', label: '解盟', ap: 1, city: false, art: 'diplomacy',
  async run(ctx) {
    const ns = G.nations.filter((n) => n.alive && isAllied(P(), n.id));
    if (!ns.length) return void say(undefined, '我国目前没有任何同盟国。');
    if (!needAP()) return;
    const k = await pickList('解盟', ['君主', '城数', '友好度'], ns.map((n) => ({ key: n.id, cells: [n.name, citiesOf(n.id).length, friendship(P(), n.id)] })), '请选择要解盟的国家。');
    if (k < 0) return;
    if (!(await confirmBox(`确定与${nname(k)}解盟吗？`))) return;
    if (!spendAP()) return;
    breakAlliance(P(), k);
    addLog(`我国与${nname(k)}解除盟约。`);
    ctx.refresh();
    await say(nation(k)!.lord, rngPick(['等这一天已经很久了，他日沙场一决死战！', '你们竟然如此不顾道义，他日别怪我们兵刃相向。', '如此背信忘义的决定，枉费同盟结义一场。']), nname(k), 1);
  },
};

// ================================================================== 任免
const governor: Command = {
  key: 'governor', label: '太守', ap: 0, city: true, art: 'appoint',
  async run(ctx) {
    const c = myCity(ctx)!;
    const r = await pickGenerals({ title: <CmdTitle art="appoint" text="太守" />, prompt: '请任命本城的太守。', gens: generalsIn(c.id, P()), cols: ['name', 'level', 'str', 'int', 'loy'] });
    if (!r) return;
    const res = doAppoint(c, 'governor', r[0]);
    ctx.refresh();
    toast(res.msg);
  },
};
const advisor: Command = {
  key: 'advisor', label: '军师', ap: 0, city: true, art: 'appoint',
  async run(ctx) {
    const c = myCity(ctx)!;
    const r = await pickGenerals({ title: <CmdTitle art="appoint" text="军师" />, prompt: '请任命本城的军师。（军师在野战中施展军师技）', gens: generalsIn(c.id, P()).sort((a, b) => intOf(b) - intOf(a)), cols: ['name', 'level', 'int', 'str', 'loy'] });
    if (!r) return;
    const res = doAppoint(c, 'advisor', r[0]);
    ctx.refresh();
    toast(res.msg);
  },
};
const general: Command = {
  key: 'general', label: '将军', ap: 0, city: false, art: 'appoint',
  async run(ctx) {
    for (;;) {
      const r = await pickGenerals({
        title: <CmdTitle art="appoint" text="将军" />, prompt: '请选择要任命将军的武将。（官职决定带兵数，升官可提升忠诚）',
        gens: generalsOf(P()).sort((a, b) => b.level - a.level), cols: ['name', 'city', 'level', 'title', 'sol', 'loy'],
        footer: () => (
          <div class="row" style={{ marginTop: '0.5em' }}>
            <Btn class="ghost" onClick={() => {
              let n = 0;
              for (const g of generalsOf(P()).sort((a, b) => b.level - a.level)) if (autoTitle(g)) n++;
              toast(n ? `已为 ${n} 名武将晋升官职。` : '没有可晋升的武将。');
              ctx.refresh();
            }}>自动任命</Btn>
          </div>
        ),
      });
      if (!r) return;
      const g = gen(r[0]);
      const ts = db.titles.filter((t) => t.level <= g.level + 4);
      const avail = new Set(availableTitles(g).map((t) => t.id));
      const holder = new Map(generalsOf(P()).filter((x) => x.title >= 0).map((x) => [x.title, x.id]));
      const k = await pickList(
        `授予 ${gname(g.id)} 官职（等级 ${g.level}）`,
        ['官职', '等级', '带兵数', '担任者'],
        ts.sort((a, b) => b.soldiers - a.soldiers || a.id - b.id).map((t) => ({
          key: t.id,
          cells: [t.id === g.title ? <b class="gold">{t.name}</b> : t.name, t.level, t.soldiers, holder.has(t.id) ? gname(holder.get(t.id)!) : '—'],
          disabled: t.id === g.title ? '现任' : avail.has(t.id) ? null : t.level > g.level ? `需等级${t.level}` : '已有人担任',
        })),
      );
      if (k < 0) continue;
      const res = doGrantTitle(g, k);
      sfx(res.ok ? 'accept' : 'sorry');
      ctx.refresh();
      await say(g.id, res.ok ? `${res.msg}\n\n我将全力以赴，不会让您失望的。` : res.msg, '任命');
    }
  },
};

// ================================================================== 计略
const investigate: Command = {
  key: 'investigate', label: '调查', ap: 1, city: true, art: 'investigate',
  async run(ctx) {
    if (!needAP()) return;
    const targets = G.cities.filter((c) => c.owner !== P() && c.owner !== 0).map((c) => c.id);
    const to = await ctx.pickCity(targets, 'relief', '请选择要调查的城市。');
    if (to <= 0) return;
    const g = await pickActor(ctx, <CmdTitle art="investigate" text="调查" />, `确定要调查${cname(to)}吗？请选择要执行调查的武将。`, undefined, ['name', 'level', 'int', 'acted']);
    if (!g || !spendAP()) return;
    const r = doInvestigate(P(), g, to);
    sfx('accept');
    ctx.refresh();
    await say(r.speaker, r.msg, '调查');
    await cityReport(to);
  },
};

export function cityReport(cid: number): Promise<void> {
  const c = city(cid);
  const gs = generalsIn(cid, c.owner);
  return modal<void>((close) => (
    <Panel title={`${cname(cid)} · ${nname(c.owner)}`} class="modal sg-picker">
      <div class="sg-cstats">
        <span>人口</span><b>{c.people}</b><span>金钱</span><b>{c.money}</b><span>开发</span><b>{c.dev}</b>
        <span>预备兵</span><b>{c.reserve}</b><span>士气</span><b>{c.training}</b><span>总兵力</span><b>{gs.reduce((s, g) => s + g.soldiers, 0) + c.reserve}</b>
        <span>太守</span><b>{c.governor ? gname(c.governor) : '—'}</b><span>军师</span><b>{c.advisor ? gname(c.advisor) : '—'}</b>
      </div>
      <div class="list sg-scroll">
        <GeneralTable gens={gs} onRow={(g) => void showGeneral(g.id)} />
      </div>
      <div class="actions"><Btn class="primary" onClick={() => close()}>确定</Btn></div>
    </Panel>
  ));
}

const sow: Command = {
  key: 'sow', label: '离间', ap: 1, city: true, art: 'alienate',
  async run(ctx) {
    const targets = G.generals.filter((g) => g.status === 'serving' && g.nation !== P() && !isLord(g) && hasIntel(P(), g.city));
    if (!targets.length) return void say(undefined, '没有可离间的武将。\n请先以「调查」打探敌城。');
    if (!needAP()) return;
    const r = await pickGenerals({
      title: <CmdTitle art="alienate" text="离间" />, prompt: '请选择要离间的武将。（忠诚度低、智力低者易被离间）',
      gens: targets.sort((a, b) => a.loyalty - b.loyalty), cols: ['name', 'nation', 'city', 'level', 'int', 'loy'],
    });
    if (!r) return;
    const t = gen(r[0]);
    const g = await pickActor(ctx, '离间', '请选择要执行离间的武将。', undefined, ['name', 'level', 'int', 'acted']);
    if (!g) return;
    if (!(await confirmBox(`确定要离间${gname(t.id)}吗？\n（成功可能：${chanceWord(sowChance(g, t))}）`))) return;
    if (!spendAP()) return;
    const lordName = nname(t.nation);
    await say(g.id, rngPick([`${lordName}只知贪图享乐，替他卖命实在是太不值得了。`, `${lordName}优柔寡断、贪生怕死，这种人如何成就大业呢？`, `${lordName}不是能成事之人，良禽择木而栖，劝您早投明君才是。`, `${lordName}竟不识您的大才，难道您忍心埋没了自己吗？`]), '离间');
    const res = doSowDiscord(P(), g, t.id);
    sfx(res.ok ? 'accept' : 'sorry');
    ctx.refresh();
    await say(t.id, res.msg, '离间');
  },
};

const intel: Command = {
  key: 'intel', label: '情报', ap: 0, city: false, art: 'info',
  async run(ctx) {
    await modal<void>((close) => <IntelBox ctx={ctx} close={close} />);
  },
};

function IntelBox(props: { ctx: Ctx; close: () => void }) {
  const [tab, setTab] = useState(0);
  const cs = citiesOf(P());
  const ns = G.nations.filter((n) => n.alive).sort((a, b) => citiesOf(b.id).length - citiesOf(a.id).length);
  return (
    <Panel title={<CmdTitle art="info" text="情报" />} class="modal sg-picker sg-wide">
      <div class="tabs">
        {['我方城池', '诸侯势力', '我方武将'].map((t, i) => <button class={tab === i ? 'on' : ''} onClick={() => setTab(i)}>{t}</button>)}
      </div>
      <div class="list sg-scroll">
        {tab === 0 && (
          <table class="grid">
            <thead><tr><th>城池</th><th>人口</th><th>金钱</th><th>收入</th><th>开发</th><th>预备兵</th><th>士气</th><th>武将</th><th>太守</th></tr></thead>
            <tbody>
              {cs.map((c) => (
                <tr class="click" onClick={() => { props.ctx.select(c.id); props.ctx.map.centerOn(c.id); props.close(); }}>
                  <td>{cname(c.id)}</td><td>{c.people}</td><td>{c.money}</td><td>+{incomeOf(c)}</td><td>{c.dev}</td>
                  <td>{c.reserve}/{reserveCap(c)}</td><td>{c.training}</td><td>{generalsIn(c.id, P()).length}</td><td>{c.governor ? gname(c.governor) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {tab === 1 && (
          <table class="grid">
            <thead><tr><th>君主</th><th>城数</th><th>武将</th><th>总兵数</th><th>金钱</th><th>友好度</th><th>关系</th></tr></thead>
            <tbody>
              {ns.map((n) => (
                <tr class={n.id === P() ? 'sel' : ''}>
                  <td><i class="chip" style={{ background: n.color }} /> {n.name}</td><td>{citiesOf(n.id).length}</td><td>{generalsOf(n.id).length}</td>
                  <td>{totalSoldiers(n.id)}</td><td>{totalMoney(n.id)}</td><td>{n.id === P() ? '—' : friendship(P(), n.id)}</td>
                  <td>{n.id === P() ? '我国' : relation(n.id)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {tab === 2 && <GeneralTable gens={generalsOf(P()).sort((a, b) => a.city - b.city || b.level - a.level)} cols={['name', 'city', 'level', 'str', 'int', 'hp', 'sol', 'title', 'loy', 'acted']} onRow={(g) => void showGeneral(g.id)} />}
      </div>
      <div class="actions"><Btn class="primary" onClick={() => props.close()}>确定</Btn></div>
    </Panel>
  );
}
void nationStrength;

// ================================================================== 系统
async function system(ctx: Ctx) {
  const k = await chooseBox('', ['进度存档', '进度读取', '设定调整', '游戏说明', '回主选单'], '系统');
  if (k === 0) {
    const slot = await pickSlot();
    if (slot < 0) return;
    toast(saveGame(slot) ? `已存档至进度 ${slot}。` : '存档失败。');
  } else if (k === 1) {
    const { pickSave } = await import('../title');
    const slot = await pickSave();
    if (slot >= 0) await ctx.loadSlot(slot);
  } else if (k === 2) {
    const { optionsBox } = await import('../title');
    const ev = await chooseBox(`历史事件：${G.options.historicalEvents ? '开启' : '关闭'}`, ['音乐与音效…', G.options.historicalEvents ? '关闭历史事件' : '开启历史事件'], '设定调整');
    if (ev === 0) await optionsBox();
    else if (ev === 1) {
      G.options.historicalEvents = !G.options.historicalEvents;
      toast(`历史事件已${G.options.historicalEvents ? '开启' : '关闭'}。`);
    }
  } else if (k === 3) {
    const { showHelp } = await import('../../ui/help');
    await showHelp();
  } else if (k === 4) {
    if (await confirmBox('确定要回到主选单吗？未存档的进度将会遗失（每月初会自动存档）。')) ctx.toTitle();
  }
}

function pickSlot(): Promise<number> {
  const saves = listSaves();
  return modal<number>((close) => (
    <Panel title="储存进度" class="modal" style={{ width: 'min(34em, 92vw)' }}>
      <div class="body list" style={{ maxHeight: '60vh' }}>
        <table class="grid">
          <thead><tr><th>存档</th><th>君主</th><th>时间</th><th>城数</th></tr></thead>
          <tbody>
            {saves.map((s, i) =>
              i === 0 ? null : (
                <tr class="click" onClick={() => close(i)}>
                  <td>进度 {i}</td><td>{s?.lord ?? '—（空）'}</td><td>{s ? `${s.year}年${s.month}月` : ''}</td><td>{s?.cities ?? ''}</td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
      <div class="actions"><Btn onClick={() => close(-1)}>返回</Btn></div>
    </Panel>
  ));
}

// ================================================================== war hooks (player side)
export function warHooks(ctx: Ctx) {
  return {
    async decide(captor: number, pid: number) {
      if (captor !== P()) return aiPrisonerChoice(captor, pid);
      return prisonerDialog(pid);
    },
    async chooseLord(_n: number, cands: number[]) {
      const r = await pickGenerals({
        title: '新立君主', prompt: '君主不幸身亡，请选择新君主。', gens: cands.map(gen), cols: ['name', 'city', 'level', 'str', 'int', 'loy'], bg: 1,
      });
      const id = r ? r[0] : cands[0];
      await say(id, '我继任为本国国君，必当鞠躬尽瘁，矢志完成先王大业。', '新立君主', 1);
      return id;
    },
    log(t: string) {
      void t;
      ctx.refresh();
    },
  };
}

export async function prisonerDialog(pid: number): Promise<'recruit' | 'release' | 'behead' | 'imprison'> {
  const p = gen(pid);
  const lordP = nation(p.origNation ?? 0)?.lord === pid;
  const opts: ['recruit' | 'release' | 'behead' | 'imprison', string][] = lordP
    ? [['release', '释　放'], ['behead', '斩　首']]
    : [['recruit', '招　降'], ['imprison', '俘　掳'], ['release', '释　放'], ['behead', '斩　首']];
  const k = await modal<number>((close) => (
    <Court bg={3}>
      <Panel title="俘虏处理" class="modal sg-say">
        <div class="body row" style={{ gap: '1em', alignItems: 'flex-start' }}>
          <Portrait general={pid} />
          <div class="col">
            <div class="sg-saytext">
              {lordP ? `${gname(pid)}（${nname(p.origNation ?? 0)}君主）被我军俘虏了！` : `我军俘虏了敌将${gname(pid)}！`}
              {'\n'}
              {rngPick(['要杀要放，悉听尊便，要我参加你们，绝无可能，别白费唇舌了！', '哼！', '‧‧‧'])}
            </div>
            <MiniStats g={p} />
            <div class="dim">忠诚 {p.loyalty} · 义理 {db.generals[pid - 1].justice}</div>
          </div>
        </div>
        <div class="actions">
          {opts.map(([, label], i) => <Btn class={i === 0 ? 'primary' : ''} onClick={() => close(i)}>{label}</Btn>)}
        </div>
      </Panel>
    </Court>
  ));
  const choice = opts[clamp(k, 0, opts.length - 1)][0];
  if (choice === 'behead' && !(await confirmBox(`确定要杀了${gname(pid)}吗？`))) return prisonerDialog(pid);
  return choice;
}

// ================================================================== menu
export const GROUPS: Group[] = [
  { key: 'interior', label: '内政', hot: '1', cmds: [move, search, develop, talent, items] },
  { key: 'military', label: '军政', hot: '2', cmds: [conscript, train, war, prepare, assign] },
  { key: 'diplomacy', label: '外交', hot: '3', cmds: [ally, unally] },
  { key: 'appoint', label: '任免', hot: '4', cmds: [governor, advisor, general] },
  { key: 'strategy', label: '计略', hot: '5', cmds: [investigate, sow, intel] },
  { key: 'system', label: '系统', hot: '6', cmds: [], direct: system },
  {
    key: 'rest', label: '休息', hot: '7', cmds: [],
    direct: async (ctx) => {
      const left = apOf(P());
      if (await confirmBox(left > 0 ? `本月尚有 ${left} 点行动点数未使用。\n确定结束本月的行动吗？` : '结束这个月的所有行动？', '休息', '休息')) await ctx.endMonth();
    },
  },
];

/** Runs a command with validation of the selected city. */
export async function runCommand(ctx: Ctx, cmd: Command) {
  if (G.over) return;
  if (cmd.city && !myCity(ctx)) {
    toast('请先在地图上选择我方城市。');
    sfx('sorry');
    return;
  }
  const before = apOf(P());
  try {
    await cmd.run(ctx);
    if (before > 0 && apOf(P()) === 0) toast('本月命令已经执行完毕。请选择「休息」进入下个月。');
  } catch (e) {
    console.error(e);
    toast('发生错误：' + String(e instanceof Error ? e.message : e));
  }
  ctx.refresh();
}
