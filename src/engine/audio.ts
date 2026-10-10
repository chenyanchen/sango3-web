// Music (streamed, cross-faded) and sound effects (Web Audio, decoded once).
import { assetUrl } from './assets';

let ctx: AudioContext | null = null;
let sfxGain: GainNode | null = null;
const buffers = new Map<string, Promise<AudioBuffer | null>>();

export const settings = {
  music: loadNum('sg3.musicVol', 0.6),
  sfx: loadNum('sg3.sfxVol', 0.8),
};

function loadNum(k: string, d: number) {
  try {
    const v = localStorage.getItem(k);
    return v === null ? d : Math.max(0, Math.min(1, parseFloat(v)));
  } catch {
    return d;
  }
}

function ac(): AudioContext | null {
  if (!ctx) {
    try {
      ctx = new AudioContext();
      sfxGain = ctx.createGain();
      sfxGain.gain.value = settings.sfx;
      sfxGain.connect(ctx.destination);
    } catch {
      return null;
    }
  }
  return ctx;
}

/** Must be called from a user gesture once (browsers block autoplay). */
export function unlockAudio() {
  const c = ac();
  if (c && c.state === 'suspended') void c.resume();
  if (pendingMusic) {
    const m = pendingMusic;
    pendingMusic = null;
    playMusic(m);
  }
}

function loadBuffer(name: string): Promise<AudioBuffer | null> {
  name = name.toLowerCase().replace(/\s+/g, '');
  if (!name.endsWith('.wav')) name += '.wav';
  let p = buffers.get(name);
  if (!p) {
    p = (async () => {
      const c = ac();
      if (!c) return null;
      try {
        const r = await fetch(assetUrl('sound/' + name));
        if (!r.ok) return null;
        return await c.decodeAudioData(await r.arrayBuffer());
      } catch {
        return null;
      }
    })();
    buffers.set(name, p);
  }
  return p;
}

const lastPlayed = new Map<string, number>();

/**
 * Plays a sound effect from Sound/ by file name (without extension).
 * Rapid repeats of the same effect are throttled to avoid clipping.
 */
export function sfx(name: string, opts: { volume?: number; rate?: number; pan?: number } = {}) {
  const c = ac();
  if (!c || c.state !== 'running' || settings.sfx <= 0) return;
  const now = c.currentTime;
  const last = lastPlayed.get(name) ?? -1;
  if (now - last < 0.045) return;
  lastPlayed.set(name, now);
  void loadBuffer(name).then((buf) => {
    if (!buf || !sfxGain) return;
    const src = c.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = opts.rate ?? 1;
    let node: AudioNode = src;
    if (opts.volume !== undefined && opts.volume !== 1) {
      const g = c.createGain();
      g.gain.value = opts.volume;
      node.connect(g);
      node = g;
    }
    if (opts.pan) {
      const p = c.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, opts.pan));
      node.connect(p);
      node = p;
    }
    node.connect(sfxGain);
    src.start();
  });
}

export function preloadSfx(names: string[]) {
  for (const n of names) void loadBuffer(n);
}

// ---------------------------------------------------------------- music
let current: { name: string; el: HTMLAudioElement } | null = null;
let pendingMusic: string | null = null;

/** Plays a track from Music/ (e.g. "mainmenu", "bf003"), looping, with cross-fade. */
export function playMusic(name: string) {
  name = name.toLowerCase();
  if (current?.name === name) return;
  const el = new Audio(assetUrl(`music/${name}.mp3`));
  el.loop = true;
  el.volume = 0;
  const prev = current;
  current = { name, el };
  el.play().then(
    () => {
      if (current?.el === el) fade(el, settings.music, 800);
    },
    (e: unknown) => {
      // a newer track took over (or this one was paused before it could start): nothing to do
      if (current?.el !== el) return;
      // autoplay blocked: retry on the next user gesture (unlockAudio)
      current = null;
      if ((e as { name?: string })?.name === 'NotAllowedError') pendingMusic = name;
    },
  );
  if (prev) fade(prev.el, 0, 800, () => prev.el.pause());
}

export function stopMusic() {
  if (current) {
    const el = current.el;
    fade(el, 0, 600, () => el.pause());
    current = null;
  }
}

export function setVolumes(music: number, effects: number) {
  settings.music = music;
  settings.sfx = effects;
  try {
    localStorage.setItem('sg3.musicVol', String(music));
    localStorage.setItem('sg3.sfxVol', String(effects));
  } catch {
    /* ignore */
  }
  if (current) current.el.volume = music;
  if (sfxGain) sfxGain.gain.value = effects;
}

function fade(el: HTMLAudioElement, to: number, ms: number, done?: () => void) {
  const from = el.volume;
  const t0 = performance.now();
  const step = () => {
    const k = Math.min(1, (performance.now() - t0) / ms);
    el.volume = Math.max(0, Math.min(1, from + (to - from) * k));
    if (k < 1) requestAnimationFrame(step);
    else done?.();
  };
  requestAnimationFrame(step);
}
