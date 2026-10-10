import './style.css';
import { loadDB } from './data/db';
import { core, showError } from './engine/core';

const DEV: Record<string, () => Promise<{ default: () => Promise<void> | void }>> = {
  battle: () => import('./scenes/battle/dev'),
  duel: () => import('./scenes/duel/dev'),
  field: () => import('./scenes/field/dev'),
  strategy: () => import('./scenes/strategy/dev'),
};

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

async function boot() {
  await core.init();
  await loadDB();
  const dev = new URLSearchParams(location.search).get('dev');
  if (dev && DEV[dev]) {
    await (await DEV[dev]()).default();
    document.getElementById('boot')?.remove();
    return;
  }
  const { go } = await import('./scenes/registry');
  await go.title();
  document.getElementById('boot')?.remove();
}

boot().catch((e) => {
  console.error(e);
  showError(e);
});
