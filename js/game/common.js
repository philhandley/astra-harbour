// Shared bits for the games: answer choices, asking with tiles, picking facts.
import { noteFact, factWeight } from './progress.js';
import * as audio from '../audio.js';
import { say } from './voice.js';

export const sleep = s => new Promise(r => setTimeout(r, s * 1000));
export function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

// Four answer tiles: the answer and near misses that a child might really pick (one step either side, etc.).
export function choices(ans, step, lo = 0, hi = 200) {
  const out = new Set([ans]);
  const near = shuffle([ans + step, ans - step]);
  const far = shuffle([ans + 2 * step, ans - 2 * step, ans + 1, ans - 1, ans + step + 1, ans + 10, ans - 10]);
  for (const v of [...near, ...far]) {
    if (out.size >= 4) break;
    if (v >= lo && v <= hi && v !== ans) out.add(v);
  }
  let k = 1;
  while (out.size < 4) { const v = ans + k * (k % 2 ? 1 : -1) * 3; if (v >= lo && v <= hi) out.add(v); k++; if (k > 40) break; }
  return [...out].sort((a, b) => a - b);
}

// Ask with tiles until right. onWrong() shows help (counting along). Returns true if right first time.
export async function ask(ui, ans, opts, factId, onWrong) {
  const nopes = [];
  let first = true;
  for (;;) {
    const v = await ui.tiles(opts, nopes);
    if (v === ans) {
      ui.markTile(v, 'right');
      audio.chime();
      noteFact(factId, first);
      return first;
    }
    first = false;
    nopes.push(v);
    ui.markTile(v, 'nope');
    audio.hmm();
    ui.lockTiles(true);
    await onWrong(v);
    ui.lockTiles(false);
  }
}

// Pick n from candidates weighted by how shaky each fact is, avoiding the last one.
export function pickWeighted(cands, idOf, last) {
  const pool = cands.filter(c => c !== last);
  const w = pool.map(c => factWeight(idOf(c)));
  let r = Math.random() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < pool.length; i++) { r -= w[i]; if (r <= 0) return pool[i]; }
  return pool[pool.length - 1];
}

export function cheer() { return ['Yes!', 'Brilliant!', 'Spot on!', 'Great counting!', 'You got it!'][Math.floor(Math.random() * 5)]; }
export { say };
