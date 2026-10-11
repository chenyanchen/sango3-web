// UI graphics: the strategy map and its city icons / flags, command title art,
// item icons, battle HUD gauges, buttons, panels, scrollbars, cursors, digits.
import type { FrameJob, PaintOut, Painter } from '../types.ts';
import { svgDoc } from '../ink.ts';
import { ensureFonts } from './_ui_fonts.ts';
import { paintCityNames, paintMap } from './_ui_map.ts';
import { cityIcon, cityMark, ICON_SIZE, type CitySize } from './_ui_city.ts';
import { paintFlag } from './_ui_flag.ts';
import { paintChrome } from './_ui_chrome.ts';
import { paintThing } from './_ui_things.ts';
import { paintRider } from './_ui_rider.ts';

ensureFonts();

const UI_DIRS = /^(ad|ad\/base|ad\/btn(\/city|\/flag)?|ad\/progress|ad\/scroll|ad\/sprite|ad\/static|ad\/things|bf\/menu|cursor|digits|others\/button|mm\/button|cg\/button|cg\/scroll)$/;

function city(job: FrameJob): PaintOut {
  const m = /^city0(\d)(?:-(\d)|_(active|ft|movable|relief)0(\d))$/.exec(job.name);
  const size = (m ? +m[1] : 3) as CitySize;
  if (m && m[3]) {
    const { w, h, defs, body } = cityMark(size, m[3] as 'active', +m[4]);
    return { svg: svgDoc(w, h, body, defs), w, h, ax: Math.round(w / 2), ay: Math.round(h / 2) };
  }
  const [iw, ih] = ICON_SIZE[size];
  const w = iw + 2, h = ih + 2;
  const body = cityIcon(size, w / 2, h / 2);
  return { svg: svgDoc(w, h, m?.[2] === '2' ? `<g opacity="0.75">${body}</g>` : body), w, h, ax: 0, ay: 0 };
}

export const painter: Painter = {
  id: 'ui',
  match: (dir) => UI_DIRS.test(dir),
  paint(job) {
    const { dir, name } = job;
    if (dir === 'ad/base' && name === 'map') return paintMap();
    if (dir === 'ad/base' && name === 'citiesname') return paintCityNames();
    if (dir === 'ad/btn/city') return city(job);
    if (dir === 'ad/btn/flag') return paintFlag(job);
    if (dir === 'ad/things') return paintThing(job);
    if (dir === 'ad/sprite') return paintRider(job);
    return paintChrome(job);
  },
};
