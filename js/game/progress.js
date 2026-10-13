// Finn's progress, patches and settings, kept in localStorage (never sent anywhere).
const KEY = 'astraharbour.v1';

export const LEVELS = {
  tables: [
    { id: 1, name: 'Load', blurb: 'Load the ship row by row' },
    { id: 2, name: 'Count', blurb: 'How many boxes?' },
    { id: 3, name: 'Quick', blurb: 'Quick facts' },
  ],
  bonds: [
    { id: 1, name: 'Fill', blurb: 'Fill the boat' },
    { id: 2, name: 'More', blurb: 'How many more?' },
    { id: 3, name: 'Quick', blurb: 'Quick pairs' },
  ],
};

export const PATCHES = [
  ...[2, 5, 10].flatMap(t => [
    { id: `t${t}-1`, game: 'tables', key: String(t), level: 1, title: `${t}s Loader`, label: `×${t}`, colour: '#d9402f' },
    { id: `t${t}-2`, game: 'tables', key: String(t), level: 2, title: `${t}s Counter`, label: `×${t}`, colour: '#2f6fd0' },
    { id: `t${t}-3`, game: 'tables', key: String(t), level: 3, title: `${t}s Captain`, label: `×${t}`, colour: '#1f1d1a' },
  ]),
  { id: 'tmix-3', game: 'tables', key: 'mix', level: 3, title: 'Harbour Master', label: '2·5·10', colour: '#8b55c6' },
  ...[10, 20].flatMap(n => [
    { id: `b${n}-1`, game: 'bonds', key: String(n), level: 1, title: `Filler of ${n}`, label: `${n}`, colour: '#ee7b2c' },
    { id: `b${n}-2`, game: 'bonds', key: String(n), level: 2, title: `${n} Matcher`, label: `${n}`, colour: '#25a6a0' },
    { id: `b${n}-3`, game: 'bonds', key: String(n), level: 3, title: `${n} Skipper`, label: `${n}`, colour: '#3f9a4f' },
  ]),
];

const fresh = () => ({
  version: 1,
  done: {},                 // patch id -> number of rounds completed
  facts: {},                // "5x3" or "b10:7" -> { r: right first time, w: wrong }
  tally: { boxes: 0, voyages: 0, fed: 0, crates: 0 },
  last: { tables: { key: '2', level: 1 }, bonds: { key: '10', level: 1 } },
  settings: { flavour: 'seaglass', sound: true, read: true },
});

let state = load();

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (s && s.version === 1) return Object.assign(fresh(), s, { tally: Object.assign(fresh().tally, s.tally), settings: Object.assign(fresh().settings, s.settings) });
  } catch (e) { /* private window or blocked storage: start fresh */ }
  return fresh();
}
export function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* ignore */ } }
export const P = () => state;
export function reset() { state = fresh(); save(); }

export function roundsDone(game, key, level) { return state.done[`${game === 'tables' ? 't' : 'b'}${key}-${level}`] || 0; }
export function completeRound(game, key, level) {
  const id = `${game === 'tables' ? 't' : 'b'}${key}-${level}`;
  const first = !state.done[id];
  state.done[id] = (state.done[id] || 0) + 1;
  state.last[game] = { key, level };
  save();
  return { patch: PATCHES.find(p => p.id === id), first };
}
export function noteFact(id, right) {
  const f = state.facts[id] || (state.facts[id] = { r: 0, w: 0 });
  if (right) f.r++; else f.w++;
  save();
}
// Weight for picking a fact: shakier facts come up more often.
export function factWeight(id) {
  const f = state.facts[id];
  if (!f) return 2;
  return 1 + Math.max(0, f.w * 2 - f.r * 0.5) + (f.r < 2 ? 1 : 0);
}
export function addTally(k, n = 1) { state.tally[k] = (state.tally[k] || 0) + n; save(); }
export function setting(k, v) { if (v === undefined) return state.settings[k]; state.settings[k] = v; save(); }
// The suggested next level for a key: the first level not yet done, else the top one.
export function suggestLevel(game, key) {
  for (const l of [1, 2, 3]) if (!roundsDone(game, key, l)) return l;
  return 3;
}
