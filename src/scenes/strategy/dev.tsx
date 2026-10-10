// Dev entry: http://localhost:5173/?dev=strategy[&lord=曹操][&era=4] — starts a
// fresh campaign and opens the strategy map.
import { db } from '../../data/db';
import { newGame } from '../../game/state';
import { go } from '../registry';

export default async function dev() {
  const q = new URLSearchParams(location.search);
  const era = Math.max(1, Math.min(7, parseInt(q.get('era') ?? '1', 10) || 1));
  let lord = q.get('lord') ?? '刘备';
  if (!db.scenarios[era - 1].nations.some((n) => n.lord === lord)) lord = db.scenarios[era - 1].nations.find((n) => n.lord)?.lord ?? lord;
  newGame(era, lord);
  await go.strategy();
}
