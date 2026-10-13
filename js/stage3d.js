// The 3D stage: what the games ask the harbour to do (load rows, show arrays, fill ten frames) and floating labels.
import { OBJ } from './world/env.js';
import { BOX, SHIP, bayX, boatSlots, BOAT_MOOR, PIER, SHED, QUAY_TOP } from './world/layout.js';
import { GROUP_COLOURS } from './sim/cargo.js';
import { quat } from './gpu/math.js';
import * as audio from './audio.js';
import { say } from './game/voice.js';

const sleep = s => new Promise(r => setTimeout(r, s * 1000));
const OLD = '#2f6fd0', NEW = '#ee7b2c';
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
  update() {
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
    a.cranes.speed = 1.7;
  }

  async prepTables(t) {
    const c = this.app.cargo;
    this.clearLabels();
    const had = c.groupsOn('ship').length + c.groupsOn('staging').length;
    c.clearWhere('ship'); c.clearWhere('staging');
    if (had) await sleep(0.4);
    for (let i = 0; i < 10; i++) { c.makeGroup(t, GROUP_COLOURS[i], { kind: 'staging', bay: i }, { pop: true }); await sleep(0.05); }
    await sleep(0.4);
  }

  hintRow(i) { const g = this.app.cargo.groupAt('staging', i); if (g) g.glow = 1; }

  async loadRow(i, t) {
    const c = this.app.cargo;
    let g = c.groupAt('staging', i);
    if (!g) g = c.makeGroup(t, GROUP_COLOURS[i % 10], { kind: 'staging', bay: i }, { pop: true });
    await this.app.cranes.move(g, { kind: 'ship', bay: i });
  }

  rowTop(i, size) { return [bayX(i), SHIP.hatchY + (size === 10 ? 2 : 1) * BOX.H + 0.012, -0.16]; }
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

  async showRows(n, t) {
    const c = this.app.cargo;
    this.clearLabels();
    let changed = false;
    for (const g of c.groupsOn('ship')) if (g.size !== t || g.where.bay >= n) { c.removeGroup(g); changed = true; }
    if (changed) await sleep(0.3);
    for (let i = 0; i < n; i++) {
      if (!c.groupAt('ship', i)) { c.makeGroup(t, GROUP_COLOURS[i], { kind: 'ship', bay: i }, { pop: true }); changed = true; await sleep(0.04); }
    }
    if (n && changed) { audio.clunk(0.5); await sleep(0.45); }
  }

  voyage() { this.app.harbour.finishWork(); }

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
