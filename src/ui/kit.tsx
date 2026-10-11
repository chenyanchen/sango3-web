// Shared DOM UI components (Preact). Styling lives in src/style.css.
import { render, type ComponentChildren, type CSSProperties as CSS } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { db } from '../data/db';
import { frameDataUrl, frameDataUrlSync } from '../engine/assets';
import { sfx } from '../engine/audio';

// ------------------------------------------------------------------ portrait
export function Portrait(props: { general?: number; shape?: string; size?: 'sm' | 'lg'; class?: string; title?: string }) {
  const path = props.shape ?? (props.general ? `portrait/${db.generals[props.general - 1]?.portraitName}` : '');
  const [url, setUrl] = useState<string>(() => (path && frameDataUrlSync(path)) || '');
  useEffect(() => {
    let live = true;
    if (path) frameDataUrl(path).then((u) => live && setUrl(u), () => {});
    return () => {
      live = false;
    };
  }, [path]);
  return (
    <span
      class={`portrait ${props.size ?? ''} ${props.class ?? ''}`}
      title={props.title}
      style={url ? { backgroundImage: `url(${url})` } : undefined}
    />
  );
}

/** Any shape frame as an inline image (icons etc.). */
export function ShapeImg(props: { path: string; style?: CSS; class?: string }) {
  const [url, setUrl] = useState(() => frameDataUrlSync(props.path) ?? '');
  useEffect(() => {
    let live = true;
    frameDataUrl(props.path).then((u) => live && setUrl(u), () => {});
    return () => {
      live = false;
    };
  }, [props.path]);
  return url ? <img src={url} class={props.class} style={props.style} draggable={false} /> : <span class={props.class} style={props.style} />;
}

export function Bar(props: { value: number; max: number; kind?: 'hp' | 'mp' | 'sol'; style?: CSS }) {
  const pct = props.max > 0 ? Math.max(0, Math.min(100, (props.value / props.max) * 100)) : 0;
  return (
    <div class={`bar ${props.kind ?? 'hp'}`} style={props.style}>
      <i style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Btn(props: {
  onClick?: () => void;
  children: ComponentChildren;
  class?: string;
  disabled?: boolean;
  title?: string;
  style?: CSS;
}) {
  return (
    <button
      class={`btn ${props.class ?? ''}`}
      disabled={props.disabled}
      title={props.title}
      style={props.style}
      onClick={(e) => {
        e.stopPropagation();
        sfx('touch', { volume: 0.5 });
        props.onClick?.();
      }}
    >
      {props.children}
    </button>
  );
}

export function Panel(props: { title?: ComponentChildren; children: ComponentChildren; class?: string; style?: CSS }) {
  return (
    <div class={`panel ${props.class ?? ''}`} style={props.style}>
      {props.title !== undefined && <div class="title">{props.title}</div>}
      {props.children}
    </div>
  );
}

// ------------------------------------------------------------------ modals
let host: HTMLDivElement | null = null;
const stack: { id: number; node: ComponentChildren; instant?: boolean }[] = [];
let seq = 0;
/** when the last modal closed; a modal opened right after it replaces it without a fade */
let lastClose = -1e9;

function hostEl() {
  if (!host) {
    host = document.createElement('div');
    host.className = 'modal-host';
    host.style.cssText = 'position:fixed;inset:0;z-index:80;pointer-events:none';
    document.body.appendChild(host);
  }
  return host;
}

/** the last modal stays painted briefly after closing, so a follow-up modal replaces it seamlessly */
let lingering: (typeof stack)[number] | null = null;
let lingerTimer = 0;

function redraw() {
  const shown = stack.length ? stack : lingering ? [lingering] : [];
  render(
    <>
      {shown.map((m) => (
        <div class={`modal-back${m.instant ? ' instant' : ''}${m === lingering && !stack.length ? ' lingering' : ''}`} key={m.id}>
          {m.node}
        </div>
      ))}
    </>,
    hostEl(),
  );
}

/**
 * Shows arbitrary modal content. `body` receives a `close(value)` callback.
 * Resolves with the value passed to close.
 */
export function modal<T>(body: (close: (v: T) => void) => ComponentChildren): Promise<T> {
  return new Promise<T>((resolve) => {
    const id = ++seq;
    const close = (v: T) => {
      const i = stack.findIndex((m) => m.id === id);
      if (i < 0) return;
      const [m] = stack.splice(i, 1);
      if (!stack.length) {
        lastClose = performance.now();
        lingering = m;
        clearTimeout(lingerTimer);
        lingerTimer = window.setTimeout(() => {
          lingering = null;
          redraw();
        }, 120);
      }
      redraw();
      resolve(v);
    };
    // dialogue chains (one modal per line) must not flash the scene in between
    const instant = !stack.length && (!!lingering || performance.now() - lastClose < 120);
    lingering = null;
    clearTimeout(lingerTimer);
    stack.push({ id, node: body(close), instant });
    redraw();
  });
}

export function isModalOpen() {
  return stack.length > 0;
}

export function alertBox(text: ComponentChildren, title = '提示', portrait?: number): Promise<void> {
  return modal<void>((close) => (
    <Panel title={title} class="modal">
      <div class="body row" style={{ alignItems: 'flex-start', gap: '1em' }}>
        {portrait ? <Portrait general={portrait} /> : null}
        <div style={{ lineHeight: 1.7, whiteSpace: 'pre-wrap', minWidth: '14em' }}>{text}</div>
      </div>
      <div class="actions">
        <Btn class="primary" onClick={() => close()}>
          确定
        </Btn>
      </div>
    </Panel>
  ));
}

export function confirmBox(text: ComponentChildren, title = '确认', yes = '确定', no = '取消'): Promise<boolean> {
  return modal<boolean>((close) => (
    <Panel title={title} class="modal">
      <div class="body" style={{ lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
        {text}
      </div>
      <div class="actions">
        <Btn onClick={() => close(false)}>{no}</Btn>
        <Btn class="primary" onClick={() => close(true)}>
          {yes}
        </Btn>
      </div>
    </Panel>
  ));
}

/** Pick one of several options; resolves with the index or -1 when cancelled. */
export function chooseBox(text: ComponentChildren, options: string[], title = '选择', cancellable = true): Promise<number> {
  return modal<number>((close) => (
    <Panel title={title} class="modal">
      <div class="body" style={{ lineHeight: 1.7, whiteSpace: 'pre-wrap', marginBottom: '0.6em' }}>
        {text}
      </div>
      <div class="col">
        {options.map((o, i) => (
          <Btn onClick={() => close(i)}>{o}</Btn>
        ))}
      </div>
      {cancellable && (
        <div class="actions">
          <Btn onClick={() => close(-1)}>取消</Btn>
        </div>
      )}
    </Panel>
  ));
}

// ------------------------------------------------------------------ toast
let toastHost: HTMLDivElement | null = null;
export function toast(text: string) {
  if (!toastHost) {
    toastHost = document.createElement('div');
    toastHost.className = 'toasts';
    toastHost.style.position = 'fixed';
    document.body.appendChild(toastHost);
  }
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = text;
  toastHost.appendChild(el);
  setTimeout(() => el.remove(), 2700);
}
