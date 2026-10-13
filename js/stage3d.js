// The 3D stage: what the games ask the harbour to do (load rows, show arrays, fill ten frames) and floating labels.
import { OBJ } from './world/env.js';
import { BOX, SHIP, bayX, boatSlots, BOAT_MOOR, PIER, SHED, QUAY_TOP, gullPegs, LOAD_LINE_Y } from './world/layout.js';
import { quatYPR } from './life/habitat.js';
import { GROUP_COLOURS } from './sim/cargo.js';
import { quat } from './gpu/math.js';
import * as audio from './audio.js';
import { say } from './game/voice.js';

const sleep = s => new Promise(r => setTimeout(r, s * 1000));
const OLD = '#2f6fd0', NEW = '#ee7b2c';
const GULL_SCALE = 0.064, GULL_FEET = 0.36 * GULL_SCALE;
const SLOTS = boatSlots();

export class Stage3D {
  constructor(app) {
    this.app = app;
    this.scene = app.scene;
    this.labels = [];
    this.layer = document.getElementById('labels');
    this.filled = 0; this.target = 10; this.startA = 0;
    this.crateItems = [];
    this.onSlotTap = null;
    app.crates.slots = SLOTS;
    this.lineTarget = null;
    this.gulls = [];          // the roof game's own gulls, one per peg
    this.gullWriter = null;
    this.time = 0;
  }

  // ---- floating labels -----------------------------------------------------------------------------------
  // Pinned to a point in an object's frame (obj 0 = world). Removed after `secs` (or by clearLabels).
  label(text, obj, local, opts = {}) {
    const el = document.createElement('div');
    el.className = 'lab' + (opts.big ? ' big' : '') + (opts.soft ? ' soft' : '');
    el.textContent = text;
    if (opts.colour) el.style.setProperty('--c', opts.colour);
    this.layer.appendChild(el);
    const l = { el, obj, local, until: opts.secs ? performance.now() + opts.secs * 1000 : Infinity };
    this.labels.push(l);
    return l;
  }
  clearLabels() { for (const l of this.labels) l.el.remove(); this.labels = []; }
  update(dt = 1 / 60) {
    this.time += dt;
    this.updateSink();
    this.updateGulls(dt);
    const now = performance.now();
    const keep = [];
    for (const l of this.labels) {
      if (now > l.until) { l.el.remove(); continue; }
      let p = l.local;
      if (l.obj) { const o = this.scene.getObject(l.obj); const r = quat.rotate(o.q, l.local); p = [o.pos[0] + r[0], o.pos[1] + r[1], o.pos[2] + r[2]]; }
      const s = this.scene.project(p);
      if (s && s[2] > 0 && s[2] < 1) { l.el.style.left = `${s[0]}px`; l.el.style.top = `${s[1]}px`; l.el.style.display = ''; }
      else l.el.style.display = 'none';
      keep.push(l);
    }
    this.labels = keep;
  }

  // ---- times tables ------------------------------------------------------------------------------------------
  async tablesReady(onStatus) {
    const a = this.app, h = a.harbour;
    a.autowork.stop();
    a.scene.camera.go('ship');
    if (!h.atBerth || h.workDone) {
      h.callIn();
      onStatus(h.phase === 'atSea' || h.phase === 'comingIn' ? 'The ship is coming back in…' : 'The ship is getting ready…');
      while (!(h.atBerth && !h.workDone)) { await sleep(0.25); if (h.phase === 'atSea') h.callIn(); }
    }
    while (!a.cranes.idle()) await sleep(0.2);
    a.cranes.speed = 2.6;
  }

  async prepTables(t, colour) {
    const c = this.app.cargo;
    this.clearLabels();
    const had = c.groupsOn('ship').length + c.groupsOn('staging').length;
    c.clearWhere('ship'); c.clearWhere('staging');
    if (had) await sleep(0.4);
    for (let i = 0; i < 10; i++) { c.makeGroup(t, colour || GROUP_COLOURS[i], { kind: 'staging', bay: i }, { pop: true }); await sleep(0.05); }
    await sleep(0.4);
  }

  hintRow(i) { const g = this.app.cargo.groupAt('staging', i); if (g) g.glow = 1; }

  async loadRow(i, t) {
    const c = this.app.cargo;
    let g = c.groupAt('staging', i);
    if (!g) g = c.makeGroup(t, GROUP_COLOURS[i % 10], { kind: 'staging', bay: i }, { pop: true });
    await this.app.cranes.move(g, { kind: 'ship', bay: i });
  }

  rowTop(i, size) { return [bayX(i), SHIP.hatchY + (size === 10 ? 2 : 1) * BOX.H + 0.01, 0.15]; }
  rowLabel(i, value, secs = 0, colour) {
    const g = this.app.cargo.groupAt('ship', i);
    return this.label(String(value), OBJ.SHIP, this.rowTop(i, g ? g.size : 5), { colour: colour || (g && g.colour) || '#222', secs });
  }

  async countRows(n, t, opts = {}) {
    const c = this.app.cargo;
    this.clearLabels();
    for (let i = 0; i < n; i++) {
      const g = c.groupAt('ship', i);
      if (g) g.glow = 1;
      this.rowLabel(i, (i + 1) * t);
      audio.countNote(i);
      if (opts.voice) say(String((i + 1) * t));
      await sleep(opts.fast ? 0.28 : 0.85);
    }
    await sleep(opts.fast ? 0.6 : 1.2);
    this.clearLabels();
  }

  async showRows(n, t, colour) {
    const c = this.app.cargo;
    this.clearLabels();
    let changed = false;
    for (const g of c.groupsOn('ship')) if (g.size !== t || g.where.bay >= n || (colour && g.colour !== colour)) { c.removeGroup(g); changed = true; }
    if (changed) await sleep(0.3);
    for (let i = 0; i < n; i++) {
      if (!c.groupAt('ship', i)) { c.makeGroup(t, colour || GROUP_COLOURS[i], { kind: 'ship', bay: i }, { pop: true }); changed = true; await sleep(0.04); }
    }
    if (n && changed) { audio.clunk(0.5); await sleep(0.45); }
  }

  voyage() { this.app.harbour.finishWork(); }
  horn() { this.app.horn(); }

  // ---- load to the line ---------------------------------------------------------------------------------------
  // The ship sinks as she loads: with exactly the target aboard, her painted load line sits on the water.
  setLoadLine(target) { this.lineTarget = target; }
  boxesAboard() { return this.app.cargo.groupsOn('ship').reduce((n, g) => n + g.size, 0); }
  updateSink() {
    const sh = this.app.harbour.ship;
    if (!this.lineTarget) { sh.sinkTarget = 0; return; }
    const b = this.boxesAboard(), T = this.lineTarget;
    sh.sinkTarget = LOAD_LINE_Y * Math.min(b, T) / T + LOAD_LINE_Y * 1.6 * Math.max(0, b - T) / T;
  }
  async unloadRow(i) {
    const g = this.app.cargo.groupAt('ship', i);
    if (g) await this.app.cranes.move(g, { kind: 'staging', bay: i });
  }
  async clearDeck() {
    const c = this.app.cargo;
    if (c.groupsOn('ship').length) { c.clearWhere('ship'); await sleep(0.45); }
  }
  async refillStaging(t) {
    const c = this.app.cargo;
    for (let i = 0; i < 10; i++) if (!c.groupAt('staging', i)) { c.makeGroup(t, GROUP_COLOURS[i], { kind: 'staging', bay: i }, { pop: true }); await sleep(0.03); }
  }

  // ---- gulls on the roof ----------------------------------------------------------------------------------------
  ensureGullWriter() {
    if (this.gullWriter) return;
    const buf = new ArrayBuffer(24 * 48);
    this.gullWriter = { buf, f32: new Float32Array(buf), u8: new Uint8Array(buf), entry: { template: 'life-gull', data: buf, count: 0, shadow: true } };
    this.scene.instanceGroups.push(this.gullWriter.entry);
    const pbuf = new ArrayBuffer(20 * 48);
    this.pegWriter = { f32: new Float32Array(pbuf), u8: new Uint8Array(pbuf), entry: { template: 'peg', data: pbuf, count: 0, shadow: true } };
    this.scene.instanceGroups.push(this.pegWriter.entry);
  }
  // Pegs for the rows in play: red five, white five, like a counting rack.
  showPegs(n) {
    const w = this.pegWriter, f = w.f32, u = w.u8, pegs = gullPegs(n);
    pegs.forEach((p, i) => {
      const o = i * 12, b = i * 48, red = (i % 10) < 5;
      f[o] = p[0]; f[o + 1] = p[1]; f[o + 2] = p[2]; f[o + 3] = 1;
      f[o + 4] = 0; f[o + 5] = 0; f[o + 6] = 0; f[o + 7] = 1;
      u[b + 32] = red ? 216 : 246; u[b + 33] = red ? 64 : 243; u[b + 34] = red ? 47 : 236; u[b + 35] = 255;
      u[b + 36] = 0; u[b + 37] = 0; u[b + 38] = 0; u[b + 39] = 0;
      f[o + 10] = 0; f[o + 11] = 0;
    });
    w.entry.count = pegs.length;
  }
  hidePegs() { if (this.pegWriter) this.pegWriter.entry.count = 0; }
  async gullsReady(n) {
    this.ensureGullWriter();
    this.gullN = n;
    this.pegs = gullPegs(n);
    this.showPegs(n);
    this.app.scene.camera.go(n > 10 ? 'gulls20' : 'gulls');
    // shoo the wild gulls off the roof so only the game's gulls stand there
    if (this.app.life) this.app.life.horn();
    while (this.gulls.length < n) this.gulls.push({ state: 'empty', t: 0, pos: [0, 0, 0], phase: Math.random() * 6, head: 0 });
    this.gulls.length = n;
    await sleep(0.2);
  }
  // Put exactly `count` gulls on the first pegs, landing the newcomers and sending extras away.
  async setGulls(count) {
    if (count === 0 && this.gullN && this.app.mode !== 'gulls') setTimeout(() => { if (this.app.mode !== 'gulls') this.hidePegs(); }, 2200);
    const moves = [];
    for (let i = 0; i < this.gulls.length; i++) {
      const g = this.gulls[i];
      if (i < count && g.state !== 'perched' && g.state !== 'arriving') moves.push(this.landGull(i, moves.length * 0.07, 1.1));
      if (i >= count && (g.state === 'perched' || g.state === 'arriving')) moves.push(this.flyGull(i, 0));
    }
    await Promise.all(moves);
  }
  landGull(i, delay = 0, dur = 1.5) {
    const g = this.gulls[i], peg = this.pegs[i];
    const from = [peg[0] - 0.6 + Math.random() * 0.2, peg[1] + 0.7, peg[2] + 0.9];
    Object.assign(g, { state: 'arriving', t: -delay, dur, from, to: [peg[0], peg[1] + GULL_FEET, peg[2]] });
    return new Promise(res => { g.done = res; });
  }
  flyGull(i, delay = 0) {
    const g = this.gulls[i], peg = this.pegs[i];
    const dir = Math.random() < 0.5 ? -1 : 1;
    const to = [peg[0] + dir * (0.5 + Math.random() * 0.4), peg[1] + 0.9, peg[2] + 0.9 + Math.random() * 0.3];
    Object.assign(g, { state: 'leaving', t: -delay, dur: 2.0, from: [peg[0], peg[1] + GULL_FEET, peg[2]], to });
    return new Promise(res => { g.done = res; });
  }
  // k gulls fly away from the right-hand end (the white pegs first), like taking beads off a counting rack.
  async gullsFlyAway(k) {
    const on = [];
    for (let i = 0; i < this.gulls.length; i++) if (this.gulls[i].state === 'perched') on.push(i);
    const go = on.slice(on.length - k).reverse();
    audio.gullCall();
    await Promise.all(go.map((i, n) => this.flyGull(i, n * 0.12)));
  }
  // k gulls fly in, one after another, to the first empty pegs.
  async gullsLand(k, onEach) {
    let n = 0;
    for (let i = 0; i < this.gulls.length && n < k; i++) {
      if (this.gulls[i].state !== 'empty') continue;
      await this.landGull(i, 0, 0.9);
      n++;
      if (onEach) onEach(n);
    }
  }
  // Count with labels: 'left' (gulls on the roof) or 'empty' (empty pegs).
  async countGulls(which, opts = {}) {
    this.clearLabels();
    const list = [];
    for (let i = 0; i < this.gulls.length; i++) {
      const on = this.gulls[i].state === 'perched';
      if ((which === 'left') === on) list.push(i);
    }
    for (let k = 0; k < list.length; k++) {
      const p = this.pegs[list[k]];
      this.label(String(k + 1), 0, [p[0], p[1] + (which === 'left' ? 0.075 : 0.03), p[2]], { colour: which === 'left' ? '#4b5a6b' : '#c9a227', soft: which !== 'left' });
      audio.countNote(k);
      if (opts.voice) say(String(k + 1));
      await sleep(0.7);
    }
    await sleep(1.0);
    this.clearLabels();
  }
  gullsCount() { return this.gulls.filter(g => g.state === 'perched').length; }
  clearGulls() { for (const g of this.gulls) { g.state = 'empty'; if (g.done) { const d = g.done; g.done = null; d(); } } }
  updateGulls(dt) {
    if (!this.gullWriter) return;
    const w = this.gullWriter, f = w.f32, u = w.u8, q = [0, 0, 0, 1];
    let n = 0;
    for (const g of this.gulls) {
      if (g.state === 'empty') continue;
      g.t += dt;
      let pos, yaw = -Math.PI / 2, pitch = 0.1, ax = 0, ay = -1;
      if (g.state === 'perched') {
        pos = g.to;
        g.head += (Math.sin(this.time * 0.7 + g.phase * 3) * 0.5 - g.head) * Math.min(1, dt * 3);
        ax = g.head;
      } else if (g.t < 0) {
        // waiting for its turn: a leaving gull still stands on its peg, an arriving one is not here yet
        if (g.state === 'arriving') continue;
        pos = g.from;
      } else {
        const k = Math.min(1, g.t / g.dur);
        const arriving = g.state === 'arriving';
        const e = arriving ? 1 - Math.pow(1 - k, 2.2) : Math.pow(k, 1.6);
        const a = g.from, b = g.to;
        const lift = Math.sin(Math.PI * e) * 0.12;
        pos = [a[0] + (b[0] - a[0]) * e, a[1] + (b[1] - a[1]) * e + lift, a[2] + (b[2] - a[2]) * e];
        yaw = Math.atan2(-(b[2] - a[2]), b[0] - a[0]);
        if (arriving && k > 0.8) yaw += ((-Math.PI / 2) - yaw) * ((k - 0.8) / 0.2);
        g.phase += dt * 14;
        ax = g.phase;
        const legs = arriving ? (k > 0.6 ? 8 : 0) : (k < 0.15 ? 8 : 0);
        ay = 2 * legs + 0.9;
        pitch = arriving ? 0.25 - 0.4 * k : 0.2;
        if (k >= 1) {
          g.state = arriving ? 'perched' : 'empty';
          if (arriving) { g.head = 0; pos = g.to; ax = 0; ay = -1; yaw = -Math.PI / 2; pitch = 0.1; }
          if (g.done) { const d = g.done; g.done = null; d(); }
          if (!arriving) continue;
        }
      }
      if (n >= 24) break;
      quatYPR(yaw, pitch, 0, q);
      const o = n * 12, b = n * 48;
      f[o] = pos[0]; f[o + 1] = pos[1]; f[o + 2] = pos[2]; f[o + 3] = GULL_SCALE;
      f[o + 4] = q[0]; f[o + 5] = q[1]; f[o + 6] = q[2]; f[o + 7] = q[3];
      u[b + 32] = 247; u[b + 33] = 246; u[b + 34] = 241; u[b + 35] = 255;
      u[b + 36] = 0; u[b + 37] = 2; u[b + 38] = 0; u[b + 39] = 0;
      f[o + 10] = ax; f[o + 11] = ay;
      n++;
    }
    w.entry.count = n;
  }

  // ---- number bonds -----------------------------------------------------------------------------------------
  async bondsReady(target) {
    this.target = target;
    this.app.scene.camera.go('pier');
    while (this.app.harbour.boatsAway) await sleep(0.25);
  }

  slotFor(k) { return { boat: k < 10 ? OBJ.BOAT_A : OBJ.BOAT_B, slot: k % 10 }; }

  async prepBoats(target, a) {
    const cr = this.app.crates;
    this.clearLabels();
    if (cr.items.length) { cr.clear(); await sleep(0.3); }
    this.target = target; this.filled = a; this.startA = a;
    for (let k = 0; k < a; k++) { const s = this.slotFor(k); cr.add(s.boat, s.slot, OLD, { pop: true }); if (a < 12) await sleep(0.03); }
    await sleep(0.35);
  }

  // A crate hops from the quay pile onto the next empty place.
  async addCrate(fast = false) {
    if (this.filled >= this.target) return;
    const k = this.filled++;
    const s = this.slotFor(k);
    const from = [PIER.arm.x0 + 0.62 + (s.boat === OBJ.BOAT_B ? 0.0 : 0), PIER.deckY + 0.02, PIER.arm.z];
    const dur = fast ? 0.32 : 0.5;
    this.app.crates.add(s.boat, s.slot, NEW, { from, dur });
    audio.hop(k % 10);
    await sleep(dur + 0.05);
    audio.clunk(0.25);
  }

  // Count crates aloud with labels: 'added' (the new colour), 'empty' (places still to fill), 'last' (the last n).
  async countCrates(which, opts = {}) {
    this.clearLabels();
    let list = [];
    if (which === 'added') for (let k = this.startA; k < this.filled; k++) list.push(k);
    else if (which === 'empty') for (let k = this.filled; k < this.target; k++) list.push(k);
    else if (which === 'last') for (let k = this.filled - (opts.n || 1); k < this.filled; k++) list.push(k);
    for (let i = 0; i < list.length; i++) {
      const s = this.slotFor(list[i]);
      const p = SLOTS[s.slot];
      this.label(String(i + 1), s.boat, [p[0], p[1] + 0.07, p[2]], { colour: which === 'empty' ? '#9a9286' : which === 'added' ? NEW : OLD, soft: which === 'empty' });
      audio.countNote(i);
      if (opts.voice) say(String(i + 1));
      await sleep(0.7);
    }
    await sleep(1.0);
    this.clearLabels();
  }

  async removeCrates(n) {
    const cr = this.app.crates;
    const items = cr.items.filter(it => !it.remove).slice(-n);
    for (const it of items.reverse()) { it.remove = true; audio.hop(3); await sleep(0.18); }
    this.filled -= items.length;
    await sleep(0.3);
  }

  async toMarket() {
    const cr = this.app.crates;
    for (const it of cr.items) it.remove = true;
    audio.splash(0.3);
    await sleep(0.45);
  }

  parade() { this.app.harbour.boatParade && this.app.harbour.boatParade(); audio.toot(); }

  // Taps on the deck: an empty slot near the pointer counts as "add a crate".
  tapAt(px, py) {
    if (!this.onSlotTap) return false;
    for (let k = this.filled; k < this.target; k++) {
      const s = this.slotFor(k), o = this.scene.getObject(s.boat), p = SLOTS[s.slot];
      const r = quat.rotate(o.q, [p[0], p[1] + 0.015, p[2]]);
      const sp = this.scene.project([o.pos[0] + r[0], o.pos[1] + r[1], o.pos[2] + r[2]]);
      if (sp && Math.hypot(sp[0] - px, sp[1] - py) < 34) { const f = this.onSlotTap; this.onSlotTap = null; f(); return true; }
    }
    return false;
  }
}
