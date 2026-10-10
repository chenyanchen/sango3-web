// Pixi extensions must be registered before the renderer is created (tree-shaken in production otherwise).
import 'pixi.js/graphics';
import 'pixi.js/text';
import './style.css';
import { loadDB } from './data/db';
import { core, showError } from './engine/core';

const DEV: Record<string, () => Promise<{ default: () => Promise<void> | void }>> = {
  battle: () => import('./scenes/battle/dev'),
  duel: () => import('./scenes/duel/dev'),
  field: () => import('./scenes/field/dev'),
  strategy: () => import('./scenes/strategy/dev'),
  ending: async () => ({
    default: async () => {
      (await import('./game/state')).newGame(5, '刘备');
      await (await import('./scenes/ending')).showEnding(new URLSearchParams(location.search).get('win') !== '0');
    },
  }),
};

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

async function boot() {
  await core.init();
  await loadDB();
  const dev = new URLSearchParams(location.search).get('dev');
  if (dev && DEV[dev]) {
    document.getElementById('boot')?.remove();
    await (await DEV[dev]()).default();
    return;
  }
  const { go } = await import('./scenes/registry');
  document.getElementById('boot')?.remove();
  await go.title();
}

boot().catch((e) => {
  console.error(e);
  showError(e);
});
