// The flat harbour: a 2D drawing used when WebGPU is missing. It offers the same stage calls as stage3d.js,
// so both maths games run unchanged: a ship seen from above with ten bays, and two boats with ten-frame decks.
import { Panel } from './ui/panel.js';
import { GROUP_COLOURS } from './sim/cargo.js';
import * as audio from './audio.js';
import { say } from './game/voice.js';

const sleep = s => new Promise(r => setTimeout(r, s * 1000));
const OLD = '#2f6fd0', NEW = '#ee7b2c';

export function startFlat(app) {
  app.flat = true;
  app.stage = new Stage2D(document.getElementById('stage'));
  app.ui = new Panel(app);
  app.ui.home();
}

class Stage2D {
  constructor(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.view = 'ship';
    this.rows = [];        // { size, colour, y (0..1 drop progress), glow }
    this.labels = [];      // { text, kind: 'row'|'slot', i, colour, until }
    this.crates = [];      // { k, colour, t (0..1 hop), remove }
    this.target = 10; this.filled = 0; this.startA = 0;
    this.onSlotTap = null;
    this.lineTarget = null; this.sink = 0;
    this.gulls = []; this.gullN = 10;
    this.resize();
    addEventListener('resize', () => this.resize());
    canvas.addEventListener('pointerdown', e => this.tapAt(e.clientX, e.clientY));
    const loop = () => { this.draw(); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }
  resize() {
    const d = Math.min(devicePixelRatio || 1, 2);
    this.w = this.cv.clientWidth; this.h = this.cv.clientHeight;
    this.cv.width = this.w * d; this.cv.height = this.h * d;
    this.ctx.setTransform(d, 0, 0, d, 0, 0);
  }
  area() {
    const narrow = this.w <= 760;
    const right = narrow ? 0 : 376;
    const w = this.w - right, h = narrow ? this.h * 0.4 : this.h;
    return { x: 0, y: narrow ? 70 : 0, w, h };
  }

  // ---- geometry ----------------------------------------------------------------------------------------
  shipBox() {
    const a = this.area();
    const L = Math.min(a.w * 0.82, 900), B = L * 0.2;
    return { x: a.x + (a.w - L) / 2, y: a.y + a.h * 0.52 - B / 2, L, B };
  }
  bayRect(i, size) {
    const s = this.shipBox();
    const x0 = s.x + s.L * 0.13, bw = (s.L * 0.74) / 10;
    return { x: x0 + i * bw + bw * 0.08, y: s.y + s.B * 0.1, w: bw * 0.84, h: s.B * 0.8 };
  }
  boatBox(b) {
    const a = this.area();
    const W = Math.min(a.w * 0.38, 420), H = W * 0.36;
    const gap = W * 0.08;
    const x = a.x + a.w / 2 - W - gap / 2 + b * (W + gap);
    return { x, y: a.y + a.h * 0.52 - H / 2, W, H };
  }
  slotRect(k) {
    const b = this.boatBox(this.target === 20 ? (k < 10 ? 0 : 1) : 0.5), j = k % 10;
    const r = Math.floor(j / 5), c = j % 5;
    const cw = b.W * 0.11, x0 = b.x + b.W * 0.3;
    return { x: x0 + c * cw * 1.08, y: b.y + b.H * 0.18 + r * b.H * 0.36, w: cw, h: b.H * 0.3 };
  }

  // ---- drawing ------------------------------------------------------------------------------------------
  draw() {
    const g = this.ctx, a = this.area();
    g.clearRect(0, 0, this.w, this.h);
    g.fillStyle = '#ece6dc'; g.fillRect(0, 0, this.w, this.h);
    // a block of jelly sea
    const pad = 30;
    roundRect(g, a.x + pad, a.y + pad + 60, a.w - pad * 2, a.h - pad * 2 - 80, 26);
    const grd = g.createLinearGradient(0, a.y, 0, a.y + a.h);
    grd.addColorStop(0, '#5fd6c8'); grd.addColorStop(1, '#25b3a6');
    g.fillStyle = grd; g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 3; g.stroke();
    if (this.view === 'ship') this.drawShip(g); else if (this.view === 'gulls') this.drawGulls(g); else this.drawBoats(g);
    if (this.view === 'ship' && this.lineTarget) this.drawLine(g);
    // labels
    const now = performance.now();
    this.labels = this.labels.filter(l => l.until > now);
    for (const l of this.labels) {
      let x, y;
      if (l.kind === 'row') { const r = this.bayRect(l.i, 5); x = r.x + r.w / 2; y = r.y - 12; }
      else if (l.kind === 'gull') { const p = this.pegXY(l.i); x = p[0]; y = p[1] - 34; }
      else { const r = this.slotRect(l.i); x = r.x + r.w / 2; y = r.y - 8; }
      g.font = '700 18px Lexend, sans-serif';
      const tw = g.measureText(l.text).width + 18;
      roundRect(g, x - tw / 2, y - 26, tw, 26, 13);
      g.fillStyle = '#fff'; g.fill(); g.strokeStyle = l.colour; g.lineWidth = 2.5; g.stroke();
      g.fillStyle = '#26221d'; g.textAlign = 'center'; g.fillText(l.text, x, y - 7);
    }
  }
  drawShip(g) {
    const s = this.shipBox();
    // hull from above: square stern on the left, pointed bow on the right
    g.beginPath();
    g.moveTo(s.x, s.y); g.lineTo(s.x + s.L * 0.86, s.y); g.quadraticCurveTo(s.x + s.L, s.y + s.B / 2, s.x + s.L * 0.86, s.y + s.B);
    g.lineTo(s.x, s.y + s.B); g.closePath();
    g.fillStyle = '#22355f'; g.fill();
    g.fillStyle = '#8e969e'; g.fillRect(s.x + s.L * 0.12, s.y + s.B * 0.06, s.L * 0.76, s.B * 0.88);
    g.fillStyle = '#f4f2ec'; g.fillRect(s.x + s.L * 0.015, s.y + s.B * 0.08, s.L * 0.09, s.B * 0.84);
    g.fillStyle = '#e8b23a'; g.beginPath(); g.arc(s.x + s.L * 0.05, s.y + s.B / 2, s.B * 0.1, 0, 7); g.fill();
    for (let i = 0; i < 10; i++) {
      const r = this.bayRect(i, 5);
      g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 1; g.strokeRect(r.x, r.y, r.w, r.h);
    }
    for (let i = 0; i < this.rows.length; i++) {
      const row = this.rows[i];
      if (!row) continue;
      row.y = Math.min(1, row.y + 0.06);
      if (row.glow > 0) row.glow -= 0.02;
      const r = this.bayRect(i, row.size);
      const n = row.size === 10 ? 5 : row.size;
      const bh = r.h / 5;
      const off = (1 - easeOut(row.y)) * -160;
      for (let k = 0; k < n; k++) {
        const y = r.y + (row.size === 2 ? (1.5 + k) * bh : k * bh) + off;
        g.fillStyle = row.colour;
        g.fillRect(r.x, y + 1, r.w, bh - 2);
        if (row.size === 10) { g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(r.x + r.w * 0.5, y + 1, r.w * 0.5, bh - 2); }
        g.strokeStyle = row.glow > 0 ? '#fff' : 'rgba(0,0,0,0.25)'; g.lineWidth = row.glow > 0 ? 3 : 1; g.strokeRect(r.x, y + 1, r.w, bh - 2);
      }
    }
  }
  drawBoats(g) {
    const boats = this.target === 20 ? 2 : 1;
    for (let b = 0; b < boats; b++) {
      const o = this.boatBox(boats === 1 ? 0.5 : b);
      g.beginPath();
      g.moveTo(o.x, o.y); g.lineTo(o.x + o.W * 0.82, o.y); g.quadraticCurveTo(o.x + o.W, o.y + o.H / 2, o.x + o.W * 0.82, o.y + o.H);
      g.lineTo(o.x, o.y + o.H); g.closePath();
      g.fillStyle = b ? '#2f5f9e' : '#c23a2f'; g.fill();
      g.fillStyle = '#a98b67'; g.fillRect(o.x + o.W * 0.25, o.y + o.H * 0.1, o.W * 0.6, o.H * 0.8);
      g.fillStyle = '#f4f2ec'; g.fillRect(o.x + o.W * 0.03, o.y + o.H * 0.2, o.W * 0.18, o.H * 0.6);
    }
    for (let k = 0; k < this.target; k++) {
      const r = this.slotRect(boats === 1 ? k : k);
      g.fillStyle = '#f3e7b0'; g.fillRect(r.x, r.y, r.w, r.h);
    }
    for (const c of this.crates) {
      c.t = Math.min(1, c.t + 0.05);
      const r = this.slotRect(c.k);
      const s = c.remove ? Math.max(0, 1 - (c.rt = (c.rt || 0) + 0.08)) : easeOut(c.t);
      const cx = r.x + r.w / 2, cy = r.y + r.h / 2 - Math.sin(Math.PI * Math.min(1, c.t)) * 30 * (1 - c.t);
      g.fillStyle = c.colour;
      g.fillRect(cx - (r.w / 2) * s, cy - (r.h / 2) * s, r.w * s, r.h * s);
      g.strokeStyle = 'rgba(0,0,0,0.25)'; g.strokeRect(cx - (r.w / 2) * s, cy - (r.h / 2) * s, r.w * s, r.h * s);
    }
    this.crates = this.crates.filter(c => !(c.remove && c.rt >= 1));
  }

  // ---- stage calls (same as stage3d.js) -------------------------------------------------------------------------
  label(text, kind, i, colour, secs = 2) { this.labels.push({ text: String(text), kind, i, colour, until: performance.now() + secs * 1000 }); }
  clearLabels() { this.labels = []; }
  update() {}
  async tablesReady() { this.view = 'ship'; }
  async prepTables(t, colour) { this.rows = []; this.nextColour = colour || null; await sleep(0.2); }
  setLoadLine(t) { this.lineTarget = t; }
  boxesAboard() { return this.rows.reduce((n, r) => n + (r ? r.size : 0), 0); }
  async unloadRow(i) { this.rows[i] = undefined; this.rows.length = i; audio.clunk(0.6); await sleep(0.5); }
  async clearDeck() { this.rows = []; await sleep(0.2); }
  async refillStaging() {}
  horn() { audio.horn(); }
  hintRow() {}
  async loadRow(i, t) { this.rows[i] = { size: t, colour: this.nextColour || GROUP_COLOURS[i % 10], y: 0, glow: 0 }; audio.latch(); await sleep(0.7); audio.clunk(0.8); }
  rowLabel(i, value, secs = 2) { this.label(value, 'row', i, GROUP_COLOURS[i % 10], secs || 30); }
  async countRows(n, t, opts = {}) {
    this.clearLabels();
    for (let i = 0; i < n; i++) {
      if (this.rows[i]) this.rows[i].glow = 1;
      this.label((i + 1) * t, 'row', i, GROUP_COLOURS[i % 10], 30);
      audio.countNote(i);
      if (opts.voice) say(String((i + 1) * t));
      await sleep(opts.fast ? 0.28 : 0.85);
    }
    await sleep(opts.fast ? 0.6 : 1.2);
    this.clearLabels();
  }
  async showRows(n, t, colour) {
    this.clearLabels();
    const next = [];
    for (let i = 0; i < n; i++) next[i] = this.rows[i] && this.rows[i].size === t && (!colour || this.rows[i].colour === colour) ? this.rows[i] : { size: t, colour: colour || GROUP_COLOURS[i], y: 0.4, glow: 0 };
    this.rows = next;
    await sleep(0.4);
  }
  voyage() { audio.horn(); }
  async bondsReady(target) { this.view = 'boats'; this.target = target; }
  async prepBoats(target, a) {
    this.target = target; this.filled = a; this.startA = a;
    this.crates = [];
    for (let k = 0; k < a; k++) this.crates.push({ k, colour: OLD, t: 1 });
    await sleep(0.3);
  }
  async addCrate(fast) {
    if (this.filled >= this.target) return;
    const k = this.filled++;
    this.crates.push({ k, colour: NEW, t: 0 });
    audio.hop(k % 10);
    await sleep(fast ? 0.3 : 0.45);
  }
  async countCrates(which, opts = {}) {
    const list = [];
    if (which === 'added') for (let k = this.startA; k < this.filled; k++) list.push(k);
    else if (which === 'empty') for (let k = this.filled; k < this.target; k++) list.push(k);
    else for (let k = this.filled - (opts.n || 1); k < this.filled; k++) list.push(k);
    for (let i = 0; i < list.length; i++) {
      this.label(i + 1, 'slot', list[i], which === 'added' ? NEW : which === 'empty' ? '#9a9286' : OLD, 30);
      audio.countNote(i);
      if (opts.voice) say(String(i + 1));
      await sleep(0.7);
    }
    await sleep(1);
    this.clearLabels();
  }
  async removeCrates(n) {
    const live = this.crates.filter(c => !c.remove).slice(-n);
    for (const c of live.reverse()) { c.remove = true; audio.hop(3); await sleep(0.18); }
    this.filled -= live.length;
  }
  async toMarket() { for (const c of this.crates) c.remove = true; await sleep(0.4); }
  parade() { audio.toot(); }

  // ---- load to the line: a side view of the ship with her line, sinking as she loads -----------------------------
  drawLine(g) {
    const s = this.shipBox();
    const T = this.lineTarget, b = this.boxesAboard();
    const want = Math.min(b, T) / T + 1.6 * Math.max(0, b - T) / T;
    this.sink += (want - this.sink) * 0.1;
    const x = s.x + s.L * 0.3, w = s.L * 0.4, y0 = s.y + s.B + 40, h = 46;
    g.fillStyle = '#25b3a6'; g.fillRect(x - 20, y0 + h * 0.55, w + 40, h * 0.6);
    const off = this.sink * 16;
    g.fillStyle = '#22355f'; g.fillRect(x, y0 + off, w, h * 0.55);
    g.fillStyle = '#c23a2f'; g.fillRect(x, y0 + off + h * 0.55, w, h * 0.25);
    g.fillStyle = '#fff'; g.fillRect(x + w * 0.2, y0 + off + h * 0.55 - 16, w * 0.6, 3);
    g.beginPath(); g.arc(x + w / 2, y0 + off + h * 0.55 - 14.5, 7, 0, 7); g.strokeStyle = '#fff'; g.lineWidth = 2.5; g.stroke();
  }

  // ---- gulls on the roof ------------------------------------------------------------------------------------------
  pegXY(i) {
    const a = this.area(), w = Math.min(a.w * 0.8, 700);
    const row = Math.floor(i / 10), j = i % 10;
    const x0 = a.x + (a.w - w) / 2;
    const x = x0 + w * (0.06 + j * 0.088 + (j >= 5 ? 0.03 : 0));
    const y = a.y + a.h * 0.42 + row * 70;
    return [x, y];
  }
  drawGulls(g) {
    const a = this.area(), w = Math.min(a.w * 0.8, 700), x0 = a.x + (a.w - w) / 2;
    const rows = this.gullN > 10 ? 2 : 1;
    g.fillStyle = '#d2544a';
    g.beginPath(); g.moveTo(x0, a.y + a.h * 0.42 + 6); g.lineTo(x0 + w, a.y + a.h * 0.42 + 6);
    g.lineTo(x0 + w + 30, a.y + a.h * 0.42 + 70 * rows + 10); g.lineTo(x0 - 30, a.y + a.h * 0.42 + 70 * rows + 10); g.closePath(); g.fill();
    g.fillStyle = '#7fb3b0'; g.fillRect(x0 - 10, a.y + a.h * 0.42 + 70 * rows + 10, w + 20, 90);
    for (let i = 0; i < this.gullN; i++) {
      const [x, y] = this.pegXY(i);
      g.fillStyle = (i % 10) < 5 ? '#d8402f' : '#f4f1ea';
      g.beginPath(); g.arc(x, y + 4, 7, 0, 7); g.fill();
      const gl = this.gulls[i];
      if (!gl || !gl.on) continue;
      const t = Math.min(1, gl.t += 0.06);
      const yy = y - 14 - (1 - t) * 60;
      g.fillStyle = '#fff'; g.beginPath(); g.ellipse(x, yy, 14, 10, 0, 0, 7); g.fill();
      g.fillStyle = '#93a1ad'; g.beginPath(); g.ellipse(x, yy - 3, 11, 5, 0, 0, 7); g.fill();
      g.fillStyle = '#fff'; g.beginPath(); g.arc(x + 9, yy - 9, 6, 0, 7); g.fill();
      g.fillStyle = '#f0bf2c'; g.beginPath(); g.moveTo(x + 14, yy - 9); g.lineTo(x + 21, yy - 8); g.lineTo(x + 14, yy - 6); g.fill();
      g.fillStyle = '#222'; g.beginPath(); g.arc(x + 11, yy - 11, 1.4, 0, 7); g.fill();
    }
  }
  async gullsReady(n) { this.view = 'gulls'; this.gullN = n; this.gulls = Array.from({ length: n }, () => ({ on: false, t: 1 })); }
  async setGulls(count) {
    if (!this.gulls.length) return;
    this.gulls.forEach((gl, i) => { const on = i < count; if (on && !gl.on) gl.t = 0; gl.on = on; });
    await sleep(0.5);
  }
  async gullsFlyAway(k) {
    const on = this.gulls.map((g, i) => (g.on ? i : -1)).filter(i => i >= 0);
    for (const i of on.slice(on.length - k).reverse()) { this.gulls[i].on = false; await sleep(0.1); }
    audio.gullCall();
    await sleep(0.4);
  }
  async gullsLand(k, onEach) {
    let n = 0;
    for (let i = 0; i < this.gulls.length && n < k; i++) {
      if (this.gulls[i].on) continue;
      this.gulls[i].on = true; this.gulls[i].t = 0; n++;
      if (onEach) onEach(n);
      await sleep(0.45);
    }
  }
  async countGulls(which, opts = {}) {
    this.clearLabels();
    const list = this.gulls.map((g, i) => ((which === 'left') === g.on ? i : -1)).filter(i => i >= 0);
    for (let k = 0; k < list.length; k++) {
      this.label(k + 1, 'gull', list[k], which === 'left' ? '#4b5a6b' : '#c9a227', 30);
      audio.countNote(k);
      if (opts.voice) say(String(k + 1));
      await sleep(0.7);
    }
    await sleep(1);
    this.clearLabels();
  }
  gullsCount() { return this.gulls.filter(g => g.on).length; }
  clearGulls() { this.gulls.forEach(g => { g.on = false; }); }
  tapAt(px, py) {
    if (!this.onSlotTap || this.view !== 'boats') return false;
    for (let k = this.filled; k < this.target; k++) {
      const r = this.slotRect(k);
      if (px >= r.x - 6 && px <= r.x + r.w + 6 && py >= r.y - 6 && py <= r.y + r.h + 6) { const f = this.onSlotTap; this.onSlotTap = null; f(); return true; }
    }
    return false;
  }
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
