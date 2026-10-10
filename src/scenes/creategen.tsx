// 自创武将 screen: pick a face, name, roll stats, choose a starting city.
import { useMemo, useState } from 'preact/hooks';
import { db } from '../data/db';
import { shape } from '../engine/assets';
import { sfx } from '../engine/audio';
import { Scene } from '../engine/core';
import { Backdrop } from '../engine/view';
import { listCustom, MAX_CUSTOM, saveCustom, templates, type CustomGeneral } from '../game/custom';
import { Btn, confirmBox, Panel, Portrait, toast } from '../ui/kit';
import { go } from './registry';

export class CreateGeneralScene extends Scene {
  private bg!: Backdrop;
  async enter() {
    const f = await shape('mm/base/selectagebg');
    this.bg = new Backdrop(f.tex);
    this.bg.alpha = 0.45;
    this.root.addChild(this.bg);
    this.renderUI(<CreateUI />);
  }
  resize(w: number, h: number) {
    this.bg?.layout(w, h);
  }
}

const SURNAMES = '赵钱孙李周吴郑王冯陈褚卫蒋沈韩杨朱秦尤许何吕施张孔曹严华金魏陶姜谢邹喻柏水窦章云苏潘葛范彭郎鲁韦马苗凤花方俞任袁柳史唐费薛雷贺倪汤殷罗毕郝安常乐于傅齐康伍余顾孟黄穆萧尹';
const GIVEN = '云龙虎豹威武勇烈忠义文德仁智信宁安平远翔飞腾霸昭明英杰俊雄辉玄策略谋';

function randomName() {
  const r = (s: string) => s[Math.floor(Math.random() * s.length)];
  return r(SURNAMES) + r(GIVEN) + (Math.random() < 0.5 ? r(GIVEN) : '');
}

/** Rolls four stats like the original's dice: a total budget spread randomly. */
function roll() {
  const v = () => 35 + Math.floor(Math.random() * 30);
  const s = { str: v(), int: v(), hp: v(), mp: v() };
  let bonus = 40 + Math.floor(Math.random() * 60);
  const keys = ['str', 'int', 'hp', 'mp'] as const;
  while (bonus-- > 0) {
    const k = keys[Math.floor(Math.random() * 4)];
    if (s[k] < 100) s[k]++;
  }
  return s;
}

function CreateUI() {
  const tpls = useMemo(() => templates(), []);
  const [list, setList] = useState<CustomGeneral[]>(listCustom());
  const [tpl, setTpl] = useState(0);
  const [name, setName] = useState(randomName());
  const [stats, setStats] = useState(roll());
  const [city, setCity] = useState('');
  const [sexTab, setSexTab] = useState<1 | 2>(1);
  const t = tpls[tpl];
  const total = stats.str + stats.int + stats.hp + stats.mp;
  const soldierNames = (t?.tokens ?? []).map((k) => db.soldiers[k]?.name).filter(Boolean).join('、');

  const register = () => {
    const nm = name.trim();
    if (!nm || nm.length > 4) return toast('姓名需为 1～4 个字');
    if (db.generals.some((g) => g.name === nm && g.id <= 421) || list.some((g) => g.name === nm)) return toast('此姓名已有人使用');
    if (list.length >= MAX_CUSTOM) return toast(`最多 ${MAX_CUSTOM} 名自创武将`);
    const next = [...list, { name: nm, sex: t.sex, template: tpl, ...stats, city }];
    saveCustom(next);
    setList(next);
    sfx('accept');
    toast(`${nm} 已登录，将于新游戏中以在野武将身份登场`);
    setName(randomName());
    setStats(roll());
  };

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', gap: '1em', padding: '2.5vh 2.5vw' }}>
      <Panel title="选择相貌" style={{ flex: 1.2, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div class="tabs">
          <button class={sexTab === 1 ? 'on' : ''} onClick={() => setSexTab(1)}>男</button>
          <button class={sexTab === 2 ? 'on' : ''} onClick={() => setSexTab(2)}>女</button>
        </div>
        <div class="list grow" style={{ minHeight: 0, padding: '0.5em', display: 'flex', flexWrap: 'wrap', gap: '0.5em', alignContent: 'flex-start' }}>
          {tpls.map((x, i) =>
            x.sex === sexTab ? (
              <span onClick={() => { sfx('touch'); setTpl(i); }} style={{ cursor: 'pointer', outline: i === tpl ? '2px solid var(--gold-hi)' : 'none', borderRadius: '2px' }}>
                <Portrait shape={`portrait/${x.shape}`} />
              </span>
            ) : null,
          )}
        </div>
      </Panel>

      <Panel title="武将资料" class="cg-info" style={{ width: '19em', display: 'flex', flexDirection: 'column', minHeight: 0, overflowY: 'auto' }}>
        <div class="row" style={{ alignItems: 'flex-start', gap: '1em' }}>
          {t && <Portrait shape={`portrait/${t.shape}`} size="lg" />}
          <div class="col grow">
            <label class="dim">姓名</label>
            <div class="row">
              <input
                value={name}
                maxLength={4}
                onInput={(e) => setName((e.target as HTMLInputElement).value)}
                style={{ width: '6em', font: 'inherit', fontSize: '1.2em', padding: '0.2em 0.4em', background: '#120904', color: 'var(--ink)', border: '1px solid var(--line)', borderRadius: '3px' }}
              />
              <Btn class="ghost" onClick={() => setName(randomName())}>随机</Btn>
            </div>
            <div class="dim" style={{ fontSize: '0.9em' }}>擅长兵种：{soldierNames || '—'}</div>
          </div>
        </div>
        <div class="stat cg-stats" style={{ margin: '1em 0', fontSize: '1.1em', gridTemplateColumns: 'auto 1fr auto' }}>
          {(['str', 'int', 'hp', 'mp'] as const).map((k) => (
            <>
              <b>{{ str: '武力', int: '智力', hp: '体力', mp: '技力' }[k]}</b>
              <div class="bar sol" style={{ alignSelf: 'center' }}>
                <i style={{ width: `${stats[k]}%` }} />
              </div>
              <span style={{ width: '2em', textAlign: 'right' }}>{stats[k]}</span>
            </>
          ))}
          <b>合计</b>
          <span />
          <span class={total >= 300 ? 'gold' : ''} style={{ textAlign: 'right' }}>{total}</span>
        </div>
        <Btn class="big" onClick={() => { sfx('bounce'); setStats(roll()); }}>掷 骰</Btn>
        <label class="dim" style={{ marginTop: '0.8em' }}>登场城市</label>
        <select
          value={city}
          onChange={(e) => setCity((e.target as HTMLSelectElement).value)}
          style={{ font: 'inherit', padding: '0.3em', background: '#120904', color: 'var(--ink)', border: '1px solid var(--line)', borderRadius: '3px' }}
        >
          <option value="">随机</option>
          {db.cities.filter((c) => !c.isPass).map((c) => (
            <option value={c.name}>{c.name}</option>
          ))}
        </select>
        <div class="grow" />
        <Btn class="primary big" style={{ marginTop: '0.8em' }} onClick={register}>登 录</Btn>
      </Panel>

      <Panel title={`已登录 ${list.length}/${MAX_CUSTOM}`} style={{ width: '15em', display: 'flex', flexDirection: 'column' }}>
        <div class="list grow" style={{ minHeight: 0 }}>
          <table class="grid">
            <tbody>
              {list.map((g, i) => (
                <tr>
                  <td>
                    <Portrait shape={`portrait/${tpls[g.template]?.shape}`} size="sm" />
                  </td>
                  <td>
                    {g.name}
                    <div class="mute" style={{ fontSize: '0.8em' }}>
                      武{g.str} 智{g.int}
                    </div>
                  </td>
                  <td>
                    <Btn
                      class="ghost"
                      onClick={async () => {
                        if (!(await confirmBox(`删除自创武将「${g.name}」？`))) return;
                        const next = list.filter((_, j) => j !== i);
                        saveCustom(next);
                        setList(next);
                      }}
                    >
                      删
                    </Btn>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Btn style={{ marginTop: '0.8em' }} onClick={() => void go.title()}>返回</Btn>
      </Panel>
    </div>
  );
}
