// macOS ships its brush/Kai CJK fonts (Kaiti SC, Xingkai SC, Libian SC…) as
// downloadable "MobileAsset" fonts that fontconfig — used by librsvg inside
// sharp — does not scan. Point fontconfig at them (only when the user has not
// configured it), so local generation renders the same calligraphy style as CI
// (which installs AR PL UKai). Must run before the first text is rasterized.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function ensureFonts() {
  if (process.platform !== 'darwin' || process.env.FONTCONFIG_FILE) return;
  const assets = '/System/Library/AssetsV2';
  let extra: string[] = [];
  try {
    extra = fs.readdirSync(assets).filter((d) => /Font/.test(d)).map((d) => path.join(assets, d));
  } catch {
    return;
  }
  if (!extra.length) return;
  const dir = path.join(os.tmpdir(), 'sgqyz3-fontconfig');
  fs.mkdirSync(dir, { recursive: true });
  const conf = path.join(dir, 'fonts.conf');
  const includes = ['/opt/homebrew/etc/fonts/fonts.conf', '/usr/local/etc/fonts/fonts.conf', '/etc/fonts/fonts.conf'];
  const xml = `<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
${includes.map((i) => `  <include ignore_missing="yes">${i}</include>`).join('\n')}
  <dir>/System/Library/Fonts</dir>
  <dir>/Library/Fonts</dir>
  <dir>${path.join(os.homedir(), 'Library/Fonts')}</dir>
${extra.map((d) => `  <dir>${d}</dir>`).join('\n')}
  <cachedir>${path.join(dir, 'cache')}</cachedir>
</fontconfig>
`;
  if (!fs.existsSync(conf) || fs.readFileSync(conf, 'utf8') !== xml) fs.writeFileSync(conf, xml);
  process.env.FONTCONFIG_FILE = conf;
}
