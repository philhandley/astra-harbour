// The frosted panel: the harbour controls at home, and the question card while a game runs.
// Game-facing calls return promises; abort() rejects any that are waiting (the Back button).
import { LEVELS, PATCHES, P, roundsDone, setting } from '../game/progress.js';
import { say, stop as stopVoice } from '../game/voice.js';
import { canInstall, install, onInstallChange } from './install.js';

const SPEAKER = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>';
const CRANE = '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 29V9l6-5v25M6 9h22M12 4l16 5M22 9v8"/><rect x="18" y="17" width="8" height="5" rx="1"/></svg>';
const HORN = '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13h5l10-6v18l-10-6H5z"/><path d="M24 11c1.5 1.5 1.5 8.5 0 10M27 8c3 3 3 13 0 16"/></svg>';
const CRATE = '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="12" width="22" height="13" rx="2"/><path d="M10 12V8h12v4M5 18h22"/></svg>';

export class AbortError extends Error { constructor() { super('aborted'); this.name = 'AbortError'; } }

export class Panel {
  constructor(app) {
    this.app = app;
    this.el = document.getElementById('panel');
    this.body = document.getElementById('panelBody');
    this.waiting = new Set();
    document.getElementById('sheetHandle').addEventListener('click', () => this.el.classList.toggle('collapsed'));
    onInstallChange(() => { const s = this.$('#pInstall'); if (s) s.hidden = !canInstall(); });
  }

  // ---- helpers -------------------------------------------------------------------------------------
  h(html) { this.body.innerHTML = html; this.body.scrollTop = 0; }
  $(sel) { return this.body.querySelector(sel); }
  wait(fn) {
    return new Promise((res, rej) => {
      const w = { rej };
      this.waiting.add(w);
      fn(v => { this.waiting.delete(w); res(v); });
    });
  }
  abort() { for (const w of this.waiting) w.rej(new AbortError()); this.waiting.clear(); stopVoice(); }

  // ---- home -----------------------------------------------------------------------------------------
  home() {
    const a = this.app, t = P().tally;
    const starsFor = (game, keys) => keys.flatMap(k => LEVELS[game].map(l => `<i class="${roundsDone(game, k, l.id) ? 'on' : ''}"></i>`)).join('');
    this.h(`
      <section class="sec" id="pInstall" ${canInstall() ? '' : 'hidden'}>
        <button class="btn dark install" id="bInstall">Install Jelly Harbour</button>
      </section>
      <section class="sec">
        <div class="sec-h"><span class="eyebrow">Play</span><small>with the grown-up</small></div>
        <div class="games">
          <button class="game-card" data-go="tables">
            <div class="icon">${iconRows()}</div>
            <div><h3>Crane Tables</h3><p>2s, 5s and 10s</p><div class="stars">${starsFor('tables', ['2', '5', '10'])}</div></div>
            <span class="go">→</span>
          </button>
          <button class="game-card" data-go="bonds">
            <div class="icon" style="background:#fdf1e4">${iconFrame()}</div>
            <div><h3>Fish Bonds</h3><p>Make 10, 20 and 100</p><div class="stars">${starsFor('bonds', ['10', '20', '100'])}</div></div>
            <span class="go">→</span>
          </button>
          <button class="game-card" data-go="gulls">
            <div class="icon" style="background:#eef1f5">${iconGulls()}</div>
            <div><h3>Gulls on the Roof</h3><p>Fly away, make 10 and 20</p><div class="stars">${starsFor('gulls', ['10', '20'])}</div></div>
            <span class="go">→</span>
          </button>
        </div>
      </section>
      ${a.flat ? '' : `<section class="sec">
        <div class="sec-h"><span class="eyebrow">The harbour</span><small id="phaseSmall"></small></div>
        <div class="grid3">
          <button class="btn dark" id="bCast">Cast off</button>
          <button class="btn dark" id="bHorn">Horn</button>
          <button class="btn dark" id="bFeed">Feed the fish</button>
        </div>
        <div class="tally">
          <div><b id="tBoxes">${t.boxes}</b><span>Boxes moved</span></div>
          <div><b id="tVoy">${t.voyages}</b><span>Voyages</span></div>
          <div><b id="tFed">${t.fed}</b><span>Fed</span></div>
        </div>
        <div class="status"><span class="meter"><i id="meter"></i></span><span id="status">Working cargo</span></div>
      </section>
      <section class="sec">
        <div class="grid4">
          <button class="btn" id="bReset">Reset</button>
          <button class="btn" id="bPause">Pause</button>
          <button class="btn" id="bSound">Sound ${setting('sound') ? 'on' : 'off'}</button>
          <button class="btn" id="bView">View</button>
        </div>
      </section>`}
      <section class="sec">
        <div class="sec-h"><span class="eyebrow">Harbour log</span><small>${Object.keys(P().done).length} of ${PATCHES.length} patches</small></div>
        <div class="log">${PATCHES.map(p => `<span class="mini ${P().done[p.id] ? '' : 'off'}" style="background:${p.colour}" title="${p.title}">${p.label}</span>`).join('')}</div>
      </section>`);
    this.body.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => a.startGame(b.dataset.go)));
    this.$('#bInstall').addEventListener('click', () => install());
    this.mode = 'home';
    if (a.flat) return;
    this.$('#bCast').addEventListener('click', () => a.castOffOrCallIn());
    this.$('#bHorn').addEventListener('click', () => a.horn());
    this.$('#bFeed').addEventListener('click', () => a.feed());
    this.$('#bReset').addEventListener('click', () => a.resetWorld());
    this.$('#bPause').addEventListener('click', e => { a.togglePause(); e.target.textContent = a.paused ? 'Play' : 'Pause'; });
    this.$('#bSound').addEventListener('click', e => { const on = a.toggleSound(); e.target.textContent = `Sound ${on ? 'on' : 'off'}`; });
    this.$('#bView').addEventListener('click', () => a.resetView());
    this.mode = 'home';
    this.refreshHarbour();
  }

  // Live bits of the home panel (called every few frames).
  refreshHarbour() {
    if (this.mode !== 'home') return;
    const a = this.app, h = a.harbour;
    if (!h) return;
    const st = this.$('#status'), cast = this.$('#bCast'), m = this.$('#meter');
    if (st) st.textContent = h.status;
    if (cast) {
      const atSea = h.phase === 'atSea' || h.phase === 'comingIn';
      cast.textContent = atSea ? 'Call her in' : 'Cast off';
      cast.disabled = !(h.atBerth && !h.workDone) && !(atSea && h.hurry === 1);
    }
    if (m) m.style.width = `${Math.round(Math.min(1, a.activity) * 100)}%`;
    const t = P().tally;
    const set = (id, v) => { const e = this.$(id); if (e && e.textContent !== String(v)) e.textContent = v; };
    set('#tBoxes', t.boxes); set('#tVoy', t.voyages); set('#tFed', t.fed);
  }

  // ---- game view ------------------------------------------------------------------------------------------
  // spec: { game, title, keys: [{ id, label }], key, level, onKey, onLevel, onBack }
  game(spec) {
    this.mode = 'game';
    const levels = LEVELS[spec.game];
    this.h(`
      <div class="game-top"><button class="back" id="gBack" aria-label="Back to the harbour">←</button><h2>${spec.title}</h2></div>
      <div class="chips">${spec.keys.map(k => `<button class="chip ${k.id === spec.key ? 'on' : ''}" data-key="${k.id}">${k.label}</button>`).join('')}</div>
      <div class="levels">${levels.map(l => `<button class="level ${l.id === spec.level ? 'on' : ''}" data-level="${l.id}"><b>${l.id}. ${l.name}${roundsDone(spec.game, spec.key, l.id) ? ' <span class="done">★</span>' : ''}</b>${l.blurb}</button>`).join('')}</div>
      <div class="qcard">
        <div class="qtext"><p id="qText"></p><button class="say" id="qSay" aria-label="Read aloud">${SPEAKER}</button></div>
        <div class="counter" id="qCounter"><b id="qNum"></b><span id="qSub"></span></div>
        <div class="sentence" id="qSentence"></div>
        <div id="qAct"></div>
        <div class="feedback" id="qFeed"></div>
        <div class="helprow"><button class="help" id="qHelp" hidden>Show me</button><div class="dots" id="qDots"></div></div>
      </div>`);
    this.$('#gBack').addEventListener('click', () => spec.onBack());
    this.body.querySelectorAll('[data-key]').forEach(b => b.addEventListener('click', () => spec.onKey(b.dataset.key)));
    this.body.querySelectorAll('[data-level]').forEach(b => b.addEventListener('click', () => spec.onLevel(Number(b.dataset.level))));
    this.$('#qSay').addEventListener('click', () => say(this.readText || this.$('#qText').textContent));
    this.helpFn = null;
    this.$('#qHelp').addEventListener('click', () => { if (this.helpFn) this.helpFn(); });
  }

  question(html, read = true, spoken) {
    const p = this.$('#qText');
    if (!p) return;
    p.innerHTML = html;
    this.readText = spoken || p.textContent;
    if (read && setting('read')) say(this.readText);
  }
  counter(n, sub = '') {
    const b = this.$('#qNum'), s = this.$('#qSub');
    if (!b) return;
    const txt = n === null || n === undefined ? '' : String(n);
    if (b.textContent !== txt) { b.textContent = txt; b.classList.add('bump'); setTimeout(() => b.classList.remove('bump'), 180); }
    s.textContent = sub;
  }
  sentence(html) { const e = this.$('#qSentence'); if (e) e.innerHTML = html; }
  feedback(text, good = false) { const e = this.$('#qFeed'); if (e) { e.textContent = text; e.classList.toggle('good', good); } }
  dots(done, total) {
    const e = this.$('#qDots');
    if (e) e.innerHTML = Array.from({ length: total }, (_, i) => `<i class="${i < done ? 'on' : i === done ? 'now' : ''}"></i>`).join('');
  }
  help(fn) { this.helpFn = fn; const e = this.$('#qHelp'); if (e) e.hidden = !fn; }
  clearAct() { const e = this.$('#qAct'); if (e) e.innerHTML = ''; }

  // Answer tiles; resolves with the chosen value. Wrong ones can be marked later with markTile().
  tiles(values, nopes = []) {
    const e = this.$('#qAct');
    if (!e) return Promise.reject(new AbortError());
    e.innerHTML = `<div class="tiles">${values.map(v => `<button class="tile ${nopes.includes(v) ? 'nope' : ''}" data-v="${v}">${v}</button>`).join('')}</div>`;
    return this.wait(done => {
      e.querySelectorAll('.tile').forEach(b => b.addEventListener('click', () => {
        if (b.classList.contains('nope') || e.dataset.locked) return;
        done(Number(b.dataset.v));
      }));
    });
  }
  lockTiles(on) { const e = this.$('#qAct'); if (e) { if (on) e.dataset.locked = '1'; else delete e.dataset.locked; } }
  markTile(v, kind) { const b = this.$(`.tile[data-v="${v}"]`); if (b) b.classList.add(kind); }

  // One big action button (Load a row / Add a crate / Next). Resolves on each tap; call again for the next tap.
  big(label, icon = 'crane', style = '') {
    const e = this.$('#qAct');
    if (!e) return Promise.reject(new AbortError());
    e.innerHTML = `<button class="bigbtn ${style}" id="qBig">${icon === 'crane' ? CRANE : icon === 'crate' ? CRATE : icon === 'horn' ? HORN : ''}<span>${label}</span></button>`;
    const b = this.$('#qBig');
    return this.wait(done => b.addEventListener('click', () => { if (!b.disabled) done(true); }, { once: true }));
  }
  bigEnabled(on) { const b = this.$('#qBig'); if (b) b.disabled = !on; for (const id of ['#qBigA', '#qBigB']) { const x = this.$(id); if (x) x.disabled = !on; } }

  // Two big buttons side by side; resolves 'a' or 'b'. The second can start disabled.
  two(labelA, iconA, labelB, bOff = false) {
    const e = this.$('#qAct');
    if (!e) return Promise.reject(new AbortError());
    const ic = n => (n === 'crane' ? CRANE : n === 'horn' ? HORN : n === 'crate' ? CRATE : '');
    e.innerHTML = `<div class="two"><button class="bigbtn" id="qBigA">${ic(iconA)}<span>${labelA}</span></button><button class="bigbtn go" id="qBigB" ${bOff ? 'disabled' : ''}><span>${labelB}</span></button></div>`;
    return this.wait(done => {
      this.$('#qBigA').addEventListener('click', e2 => { if (!e2.currentTarget.disabled) done('a'); }, { once: true });
      this.$('#qBigB').addEventListener('click', e2 => { if (!e2.currentTarget.disabled) done('b'); }, { once: true });
    });
  }

  // End-of-round patch card; resolves on "Next".
  patch(p, lines, first) {
    const e = this.$('.qcard');
    if (!e) return Promise.reject(new AbortError());
    e.innerHTML = `
      <div class="patch">
        <div class="badge ${p.label.length > 3 ? 'long' : ''}" style="background:${p.colour}">${p.label}</div>
        <h3>${first ? 'New patch!' : 'Well done!'}</h3>
        <p><b>${p.title}</b></p>
        <p style="margin-top:8px">${lines}</p>
      </div>
      <button class="bigbtn go" id="pNext"><span>Play again</span></button>
      <button class="btn" id="pHome" style="width:100%;margin-top:10px">Back to the harbour</button>`;
    say(`${first ? 'New patch!' : 'Well done!'} ${p.title}. ${lines}`);
    return this.wait(done => {
      this.$('#pNext').addEventListener('click', () => done('again'), { once: true });
      this.$('#pHome').addEventListener('click', () => done('home'), { once: true });
    });
  }

  message(html) { const e = this.$('#qText'); if (e) e.innerHTML = html; }
}

function iconRows() {
  const cols = ['#d9402f', '#2f6fd0', '#f0b62e', '#3f9a4f'];
  let s = '';
  for (let r = 0; r < 4; r++) for (let k = 0; k < 3; k++) s += `<span class="box" style="left:${8 + k * 19}px;top:${7 + r * 11}px;background:${cols[r]}"></span>`;
  return s;
}
function iconGulls() {
  let s = '<span style="position:absolute;left:6px;right:6px;top:30px;height:16px;background:#d2544a;clip-path:polygon(0 100%,8% 0,92% 0,100% 100%)"></span>';
  for (let k = 0; k < 5; k++) s += `<span style="position:absolute;left:${10 + k * 12}px;top:${18 - (k % 2) * 2}px;width:9px;height:9px;border-radius:50% 50% 40% 40%;background:#fff;box-shadow:0 1px 0 #93a1ad"></span>`;
  return s;
}
function iconFrame() {
  let s = '';
  for (let r = 0; r < 2; r++) for (let k = 0; k < 5; k++) s += `<span class="tf ${r * 5 + k < 7 ? 'on' : ''}" style="left:${7 + k * 12.5}px;top:${16 + r * 13}px"></span>`;
  return s;
}
