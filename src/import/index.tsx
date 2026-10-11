// Bring-your-own-installer: the hosted build ships no original assets. On first
// visit the player picks their own 三国群英传3 installer (or sango3.pak), which
// is converted locally by a pool of workers into Cache Storage; the service
// worker (public/sw.js) then serves it under ./assets/.
import { render } from 'preact';
import { useState } from 'preact/hooks';
import { setAssetMode } from '../engine/assets';
import { ASSET_FORMAT } from '../extract/pipeline';
import { ASSET_CACHE, type Job, type WorkerMsg } from './protocol';

/** Where the original assets live (imported into Cache Storage, or `pnpm extract`ed). */
const ORIG_BASE = () => new URL(import.meta.env.BASE_URL + 'assets-orig/', location.href).href;

/** True when the original assets are available (imported earlier, or served by the host). */
export async function hasOriginalAssets(): Promise<boolean> {
  try {
    const r = await fetch(ORIG_BASE() + 'version.json', { cache: 'no-store' });
    if (!r.ok) return false;
    const v = (await r.json()) as { format?: number };
    return (v.format ?? ASSET_FORMAT) === ASSET_FORMAT;
  } catch {
    return false;
  }
}

/** Registers the service worker and waits until it controls this page. */
export async function ensureServiceWorker(): Promise<boolean> {
  if (!('serviceWorker' in navigator)) return false;
  try {
    await navigator.serviceWorker.register('./sw.js');
    await navigator.serviceWorker.ready;
  } catch {
    return false;
  }
  if (navigator.serviceWorker.controller) return true;
  // first visit: the worker claims open pages on activation
  await new Promise<void>((res) => {
    navigator.serviceWorker.addEventListener('controllerchange', () => res(), { once: true });
    setTimeout(res, 3000);
  });
  return !!navigator.serviceWorker.controller;
}

export async function clearImportedAssets() {
  await caches.delete(ASSET_CACHE);
}

/** Shows the import screen; resolves true once the original assets are in place, false if cancelled. */
export function runImport(swOk: boolean): Promise<boolean> {
  // own layer above #fader (which stays opaque until the first scene fades in)
  const host = document.body.appendChild(document.createElement('div'));
  return new Promise((resolve) => {
    const done = (ok: boolean) => {
      render(null, host);
      host.remove();
      if (ok) setAssetMode('orig');
      resolve(ok);
    };
    render(<ImportUI swOk={swOk} onDone={() => done(true)} onCancel={() => done(false)} />, host);
  });
}

// ------------------------------------------------------------------ worker pool
type Progress = { label: string; done: number; total: number };

class Pool {
  private idle: Worker[] = [];
  private all: Worker[] = [];
  private queue: { job: Job; res: (v: unknown) => void; rej: (e: Error) => void; onProgress?: (m: WorkerMsg) => void }[] = [];
  constructor(n: number) {
    for (let i = 0; i < n; i++) {
      const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
      this.all.push(w);
      this.idle.push(w);
    }
  }
  run<T>(job: Job, onProgress?: (m: WorkerMsg) => void): Promise<T> {
    return new Promise((res, rej) => {
      this.queue.push({ job, res: res as (v: unknown) => void, rej, onProgress });
      this.pump();
    });
  }
  private pump() {
    while (this.idle.length && this.queue.length) {
      const w = this.idle.pop()!;
      const t = this.queue.shift()!;
      w.onmessage = (e: MessageEvent<WorkerMsg>) => {
        const m = e.data;
        if (m.type === 'progress') return t.onProgress?.(m);
        this.idle.push(w);
        if (m.type === 'done') t.res(m.result);
        else t.rej(new Error(m.message));
        this.pump();
      };
      w.onerror = (e) => {
        e.preventDefault();
        this.idle.push(w);
        t.rej(new Error(e.message || '转换线程出错'));
        this.pump();
      };
      w.postMessage(t.job);
    }
  }
  close() {
    for (const w of this.all) w.terminate();
  }
}

async function convert(files: File[], report: (p: Progress) => void) {
  const base = ORIG_BASE();
  const byName = (re: RegExp) => files.find((f) => re.test(f.name));
  const exe = byName(/\.exe$/i);
  let sango = byName(/^sango3\.pak$/i) ?? null;
  let music = byName(/^music\.pak$/i) ?? null;
  if (!exe && !sango) throw new Error('请选择《三国群英传3》的安装包（.exe）或游戏目录里的 sango3.pak');

  await clearImportedAssets();
  try {
    await navigator.storage?.persist?.();
  } catch {
    /* best effort */
  }
  const n = Math.max(2, Math.min(6, (navigator.hardwareConcurrency || 4) - 1));
  const pool = new Pool(n);
  try {
    if (exe && !sango) {
      const r = await pool.run<{ sango: File; music: File | null }>({ kind: 'unpack', base, exe }, (m) => {
        if (m.type !== 'progress') return;
        report({ label: m.phase === 'scan' ? '读取安装包' : '解压游戏文件', done: m.done, total: m.total });
      });
      sango = r.sango;
      music = r.music;
    }
    report({ label: '分析游戏数据', done: 0, total: 1 });
    const plan = await pool.run<{ dirs: { dir: string; files: string[] }[]; tracks: string[] }>({
      kind: 'plan', base, sango: sango!, music,
    });

    const jobs: Job[] = [];
    // long jobs first so the pool stays busy
    for (const track of plan.tracks) jobs.push({ kind: 'music', base, music: music!, track });
    jobs.push({ kind: 'data', base, sango: sango! });
    for (let i = 0; i < plan.dirs.length; i += 4) jobs.push({ kind: 'shapes', base, sango: sango!, dirs: plan.dirs.slice(i, i + 4) });
    let done = 0;
    report({ label: '转换图像与音乐', done, total: jobs.length });
    await Promise.all(
      jobs.map((j) =>
        pool.run(j).then(() => report({ label: '转换图像与音乐', done: ++done, total: jobs.length })),
      ),
    );
    // marks the import complete (checked by hasAssets)
    const c = await caches.open(ASSET_CACHE);
    const body = JSON.stringify({ format: ASSET_FORMAT, generated: new Date().toISOString(), imported: true });
    await c.put(new Request(base + 'version.json'), new Response(body, { headers: { 'content-type': 'application/json' } }));
  } finally {
    pool.close();
    try {
      const root = await navigator.storage.getDirectory();
      for (const f of ['sango3.pak', 'music.pak']) await root.removeEntry(f).catch(() => {});
    } catch {
      /* no OPFS */
    }
  }
}

function ImportUI(props: { swOk: boolean; onDone: () => void; onCancel: () => void }) {
  const [prog, setProg] = useState<Progress | null>(null);
  const [err, setErr] = useState('');
  const [drag, setDrag] = useState(false);
  const busy = !!prog && !err;
  const t0 = useState(() => ({ at: 0 }))[0];

  const start = async (list: FileList | File[] | null) => {
    const files = [...(list ?? [])];
    if (!files.length || busy) return;
    setErr('');
    t0.at = performance.now();
    setProg({ label: '准备中', done: 0, total: 1 });
    try {
      await convert(files, setProg);
      props.onDone();
    } catch (e) {
      console.error(e);
      setErr(e instanceof Error ? e.message : String(e));
      await clearImportedAssets().catch(() => {});
    }
  };

  const pct = prog ? Math.floor((100 * prog.done) / Math.max(1, prog.total)) : 0;
  const pick = (accept: string) => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.multiple = true;
    inp.accept = accept;
    inp.onchange = () => void start(inp.files);
    inp.click();
  };

  return (
    <div
      class="importer"
      onDragOver={(e) => (e.preventDefault(), setDrag(true))}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        void start(e.dataTransfer?.files ?? null);
      }}
    >
      <div class={`panel importer-box ${drag ? 'drag' : ''}`}>
        <h1>导入原版素材</h1>
        <div class="sub">适用于《三国群英传3》</div>
        {!props.swOk ? (
          <p class="err">
            当前浏览器无法保存游戏素材（不支持 Service Worker，或处于无痕/隐私模式）。请换用最新版的 Chrome、Edge、Firefox 或 Safari，并关闭无痕模式。
          </p>
        ) : (
          <>
            <p>
              本站默认使用程序生成的水墨素材与重新编写的剧本。如果你有《三国群英传3》，可以改用原版的画面、音乐与数据：
              选择你自己的安装包（<code>.exe</code>），或游戏目录中的 <code>sango3.pak</code>（同时选上 <code>MUSIC.PAK</code> 就有背景音乐）。
            </p>
            <p class="dim">所有处理都在你的浏览器里完成，文件不会上传。首次导入需要一两分钟，完成后可离线游玩。</p>
            {busy ? (
              <div class="prog">
                <div class="row-between">
                  <span>{prog!.label}…</span>
                  <span>{pct}%</span>
                </div>
                <div class="bar">
                  <i style={{ width: `${pct}%` }} />
                </div>
                <div class="dim small">请勿关闭页面 · 已用时 {Math.round((performance.now() - t0.at) / 1000)} 秒</div>
              </div>
            ) : (
              <div class="importer-actions">
                <button class="btn primary big" onClick={() => pick('.exe')}>选择安装包 (.exe)</button>
                <button class="btn big" onClick={() => pick('.pak,.PAK')}>选择 PAK 文件</button>
              </div>
            )}
            {!busy && <p class="dim small">也可以把文件直接拖到这里。两套素材的存档互相独立。</p>}
            {!busy && (
              <div class="importer-actions">
                <button class="btn" onClick={props.onCancel}>返回</button>
              </div>
            )}
            {err && <p class="err">导入失败：{err}</p>}
          </>
        )}
        {!props.swOk && (
          <div class="importer-actions">
            <button class="btn" onClick={props.onCancel}>返回</button>
          </div>
        )}
      </div>
    </div>
  );
}
