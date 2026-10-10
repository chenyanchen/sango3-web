// 新的游戏: choose an era (剧本) and a lord (君主).
import { useEffect, useMemo, useState } from 'preact/hooks';
import { db } from '../data/db';
import { imageUrl, shape } from '../engine/assets';
import { sfx } from '../engine/audio';
import { Scene } from '../engine/core';
import { Backdrop } from '../engine/view';
import { injectCustom, listCustom } from '../game/custom';
import { NATION_COLORS, newGame } from '../game/state';
import { Btn, Panel, Portrait } from '../ui/kit';
import { go } from './registry';

export const ERA_NAMES = ['黄巾之乱', '董卓弄权', '群雄割据', '官渡之战', '赤壁之战', '三国鼎立', '星落五丈原'];

export class NewGameScene extends Scene {
  private bg!: Backdrop;
  async enter() {
    const f = await shape('mm/base/selectagebg');
    this.bg = new Backdrop(f.tex);
    this.bg.alpha = 0.55;
    this.root.addChild(this.bg);
    this.renderUI(<NewGameUI />);
  }
  resize(w: number, h: number) {
    this.bg?.layout(w, h);
  }
}

function NewGameUI() {
  const [era, setEra] = useState(1);
  const [lord, setLord] = useState<string>('');
  const [mapUrl, setMapUrl] = useState('');
  useEffect(() => {
    void imageUrl('ad/base/map').then(setMapUrl);
  }, []);
  const sc = db.scenarios[era - 1];
  const lords = useMemo(() => {
    const out: { name: string; color: string; cities: string[]; gens: number; id: number }[] = [];
    for (const n of sc.nations) {
      if (!n.lord) continue;
      const cities = sc.cities.filter((c) => c.lord === n.lord).map((c) => c.name);
      if (!cities.length) continue;
      const gens = db.generals.filter((g) => {
        const a = g.appear[era];
        return a && !a.free && cities.includes(a.city);
      }).length;
      out.push({ name: n.lord, color: NATION_COLORS[n.flag % NATION_COLORS.length], cities, gens, id: db.generalByName.get(n.lord)?.id ?? 0 });
    }
    return out.sort((a, b) => b.cities.length - a.cities.length);
  }, [era]);
  useEffect(() => setLord(lords[0]?.name ?? ''), [lords]);
  const owner = new Map<string, string>();
  for (const l of lords) for (const c of l.cities) owner.set(c, l.color);
  const sel = lords.find((l) => l.name === lord);

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', gap: '1em', padding: '2.5vh 2.5vw', alignItems: 'stretch' }}>
      <Panel title="选择剧本" style={{ width: '13em', display: 'flex', flexDirection: 'column' }}>
        <div class="col" style={{ gap: '0.45em' }}>
          {db.scenarios.map((s) => (
            <Btn class={s.id === era ? 'sel' : ''} onClick={() => setEra(s.id)} style={{ textAlign: 'left' }}>
              <span class="kai">{ERA_NAMES[s.id - 1]}</span>
              <span class="mute" style={{ float: 'right', fontSize: '0.85em' }}>
                {s.year}
              </span>
            </Btn>
          ))}
        </div>
        <div class="grow" />
        <Btn onClick={() => void go.title()}>返回</Btn>
      </Panel>

      <Panel title={`${sc.year}年${sc.month}月 · ${ERA_NAMES[era - 1]}`} class="grow" style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ position: 'relative', width: '100%', maxHeight: '100%', aspectRatio: '1024/768', backgroundImage: mapUrl ? `url(${mapUrl})` : '', backgroundSize: 'cover', borderRadius: '4px', boxShadow: 'inset 0 0 40px #000' }}>
            {db.cities.map((c) => {
              const col = owner.get(c.name);
              const mine = sel?.cities.includes(c.name);
              return (
                <div
                  title={c.name}
                  style={{
                    position: 'absolute', left: `${(c.x / 1024) * 100}%`, top: `${(c.y / 768) * 100}%`,
                    width: c.isPass ? '0.7em' : '1.1em', height: c.isPass ? '0.7em' : '1.1em',
                    transform: 'translate(-50%,-50%)', borderRadius: '50%',
                    background: col ?? 'rgba(200,200,200,0.5)', border: mine ? '2px solid #fff' : '1px solid rgba(0,0,0,0.7)',
                    boxShadow: mine ? '0 0 10px #fff' : '0 1px 3px #000',
                  }}
                />
              );
            })}
          </div>
        </div>
      </Panel>

      <Panel title="选择君主" style={{ width: '17em', display: 'flex', flexDirection: 'column' }}>
        <div class="list grow" style={{ minHeight: 0 }}>
          <table class="grid">
            <tbody>
              {lords.map((l) => (
                <tr class={`click ${l.name === lord ? 'sel' : ''}`} onClick={() => { sfx('touch'); setLord(l.name); }}>
                  <td style={{ width: '1.2em' }}>
                    <span class="chip" style={{ background: l.color }} />
                  </td>
                  <td>{l.name}</td>
                  <td class="dim">{l.cities.length}城</td>
                  <td class="dim">{l.gens}将</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {sel && (
          <div class="row" style={{ marginTop: '0.8em', alignItems: 'flex-start' }}>
            <Portrait general={sel.id} />
            <div class="stat grow">
              <b>武力</b>
              <span>{db.generals[sel.id - 1]?.str}</span>
              <b>智力</b>
              <span>{db.generals[sel.id - 1]?.int}</span>
              <b>城池</b>
              <span style={{ whiteSpace: 'normal' }}>{sel.cities.join('、')}</span>
            </div>
          </div>
        )}
        <Btn
          class="primary big"
          style={{ marginTop: '0.8em' }}
          disabled={!sel}
          onClick={() => {
            sfx('accept');
            injectCustom(listCustom(), era);
            newGame(era, lord);
            void go.strategy();
          }}
        >
          出 仕
        </Btn>
      </Panel>
    </div>
  );
}
