// Headless screenshot helper for visual checks during development.
//
//   pnpm shot "/?dev=battle" out.png [--w 1280] [--h 720] [--wait 3000]
//             [--click "x,y"]... [--key "Space"]... [--eval "js"] [--mobile]
//
// Requires the dev server (pnpm dev, default http://localhost:5173) to run.
// Prints console errors from the page.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';

function findChrome(): string | undefined {
  const base = path.join(os.homedir(), 'Library/Caches/ms-playwright');
  const cands: string[] = [];
  if (fs.existsSync(base))
    for (const d of fs.readdirSync(base).sort().reverse()) {
      if (d.startsWith('chromium-'))
        cands.push(path.join(base, d, 'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'),
          path.join(base, d, 'chrome-mac/Chromium.app/Contents/MacOS/Chromium'), path.join(base, d, 'chrome-linux/chrome'));
    }
  cands.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
  return cands.find((p) => fs.existsSync(p));
}

const args = process.argv.slice(2);
const url = args[0] ?? '/';
const out = args[1] ?? 'shot.png';
const opt = (k: string, d?: string) => {
  const i = args.indexOf('--' + k);
  return i >= 0 ? args[i + 1] : d;
};
const all = (k: string) => args.flatMap((a, i) => (a === '--' + k ? [args[i + 1]] : []));

const base = process.env.SHOT_BASE ?? 'http://localhost:5173';
const browser = await chromium.launch({ executablePath: findChrome(), args: ['--use-angle=metal', '--enable-unsafe-swiftshader'] });
const mobile = args.includes('--mobile');
const page = await browser.newPage({
  viewport: { width: +opt('w', mobile ? '844' : '1280')!, height: +opt('h', mobile ? '390' : '720')! },
  deviceScaleFactor: 1,
  hasTouch: mobile,
});
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') console.log(`[${m.type()}]`, m.text());
});
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(base + url, { waitUntil: 'load' });
await page.waitForTimeout(+opt('wait', '2500')!);
for (const c of all('click')) {
  const [x, y] = c.split(',').map(Number);
  await page.mouse.click(x, y);
  await page.waitForTimeout(+opt('step', '800')!);
}
for (const k of all('key')) {
  await page.keyboard.press(k);
  await page.waitForTimeout(+opt('step', '800')!);
}
const ev = opt('eval');
if (ev) {
  console.log('eval →', JSON.stringify(await page.evaluate(ev)));
  await page.waitForTimeout(+opt('after', '1500')!);
}
await page.screenshot({ path: out });
console.log('saved', out);
await browser.close();
