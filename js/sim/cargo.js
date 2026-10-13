// Containers as GPU instances: the yard stacks (static), and "groups" (a row of 2, 5 or 10 boxes that the cranes
// lift together) that live in the staging lane, on the ship's deck, or on a crane's spreader. Also fish crates.
import { OBJ } from '../world/env.js';
import { BOX, SHIP, YARD, QUAY_TOP, STAGING_Z, BERTH, bayX, shipSlots } from '../world/layout.js';
import { makeRand } from '../gpu/math.js';

const STRIDE = 48;
export const GROUP_COLOURS = ['#d9402f', '#2f6fd0', '#f0b62e', '#3f9a4f', '#ee7b2c', '#25a6a0', '#8b55c6', '#e45d93', '#4fb3e8', '#9cc23a'];
export const GROUP_COLOUR_NAMES = ['red', 'blue', 'yellow', 'green', 'orange', 'teal', 'purple', 'pink', 'sky blue', 'lime'];
export const YARD_LIVERIES = ['#b8442f', '#2d5f9a', '#3e7d4a', '#d07a32', '#d9b23c', '#2a8a86', '#7d8790', '#7a3442', '#e3ded4', '#2d3b5f'];

const hexRGB = h => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };

let nextId = 1;

export class Cargo {
  constructor(scene) {
    this.scene = scene;
    this.groups = [];
    this.yard = this.buildYard();
    this.cap = 2000;
    this.buf = new ArrayBuffer(this.cap * STRIDE);
    this.f32 = new Float32Array(this.buf);
    this.u8 = new Uint8Array(this.buf);
    this.entry = { template: 'container', data: this.buf, count: 0, shadow: true };
    scene.instanceGroups.push(this.entry);
    this.highlight = null;   // group id to pulse
    this.time = 0;
  }

  // ---- the yard: neat blocks of stacked boxes, a few gaps --------------------------------------------
  buildYard() {
    const r = makeRand(7);
    const boxes = [];
    const nx = Math.floor((YARD.x1 - YARD.x0) / BOX.pitchX);
    const nz = Math.floor((YARD.z1 - YARD.z0) / BOX.pitchZ);
    for (let i = 0; i < nx; i++) {
      if (i % 7 === 6) continue; // a lane between blocks
      for (let k = 0; k < nz; k++) {
        const h = r() < 0.12 ? 0 : 1 + Math.floor(r() * 3.2);
        for (let t = 0; t < h; t++) {
          boxes.push({
            x: YARD.x0 + (i + 0.5) * BOX.pitchX, z: YARD.z0 + (k + 0.5) * BOX.pitchZ,
            y: QUAY_TOP + 0.002 + (t + 0.5) * BOX.H,
            c: hexRGB(r.pick(YARD_LIVERIES)),
          });
        }
      }
    }
    return boxes;
  }

  // ---- groups ----------------------------------------------------------------------------------------
  // where: { kind: 'staging', bay } | { kind: 'ship', bay } | { kind: 'spreader', obj } | { kind: 'world', pos }
  makeGroup(size, colour, where, opts = {}) {
    const g = {
      id: nextId++, size, colour, where,
      slots: shipSlots(size),
      tint: colour ? hexRGB(colour) : null,
      liveries: [],
      scale: opts.pop ? 0 : 1, pop: !!opts.pop, fade: 0, remove: false, glow: 0,
    };
    const r = makeRand(g.id * 31 + 5);
    for (let k = 0; k < g.slots.length; k++) g.liveries.push(g.tint || hexRGB(r.pick(YARD_LIVERIES)));
    this.groups.push(g);
    return g;
  }
  removeGroup(g, animate = true) { if (animate) g.remove = true; else this.groups = this.groups.filter(x => x !== g); }
  clearWhere(kind) { for (const g of this.groups) if (g.where.kind === kind) g.remove = true; }
  groupsOn(kind) { return this.groups.filter(g => g.where.kind === kind && !g.remove); }
  groupAt(kind, bay) { return this.groups.find(g => g.where.kind === kind && g.where.bay === bay && !g.remove); }
  tiers(g) { return g.size === 10 ? 2 : 1; }

  // Height of a group's top above its base.
  heightOf(g) { return this.tiers(g) * BOX.H; }

  // Box-local positions in the group's parent frame.
  boxPos(g, k) {
    const s = g.slots[k];
    const w = g.where;
    if (w.kind === 'ship') return [bayX(w.bay), SHIP.hatchY + (s.tier + 0.5) * BOX.H, s.z];
    if (w.kind === 'staging') return [BERTH.x + bayX(w.bay), QUAY_TOP + 0.002 + (s.tier + 0.5) * BOX.H, STAGING_Z + s.z];
    if (w.kind === 'spreader') {
      const top = this.tiers(g) - 1;
      return [0, -(top - s.tier + 0.5) * BOX.H, s.z];
    }
    if (w.kind === 'world') return [w.pos[0], w.pos[1] + (s.tier + 0.5) * BOX.H, w.pos[2] + s.z];
    return [0, 0, 0];
  }
  parentOf(g) {
    const w = g.where;
    if (w.kind === 'ship') return OBJ.SHIP;
    if (w.kind === 'spreader') return w.obj;
    return OBJ.WORLD;
  }

  update(dt) {
    this.time += dt;
    for (const g of this.groups) {
      if (g.remove) { g.scale -= dt * 3.5; }
      else if (g.scale < 1) g.scale = Math.min(1, g.scale + dt * 2.8);
      if (g.glow > 0) g.glow = Math.max(0, g.glow - dt * 0.9);
    }
    this.groups = this.groups.filter(g => !(g.remove && g.scale <= 0));
    this.pack();
  }

  pack() {
    const f = this.f32, u = this.u8;
    let n = 0;
    const put = (pos, scale, rgb, parent) => {
      if (n >= this.cap) return;
      const o = n * 12, b = n * STRIDE;
      f[o] = pos[0]; f[o + 1] = pos[1]; f[o + 2] = pos[2]; f[o + 3] = scale;
      f[o + 4] = 0; f[o + 5] = 0; f[o + 6] = 0; f[o + 7] = 1;
      u[b + 32] = rgb[0]; u[b + 33] = rgb[1]; u[b + 34] = rgb[2]; u[b + 35] = 255;
      u[b + 36] = parent; u[b + 37] = 0; u[b + 38] = 0; u[b + 39] = 0;
      f[o + 10] = 0; f[o + 11] = 0;
      n++;
    };
    for (const y of this.yard) put([y.x, y.y, y.z], 1, y.c, 0);
    for (const g of this.groups) {
      const parent = this.parentOf(g);
      // a springy pop: overshoot a little as it appears
      const s = g.scale >= 1 ? 1 : popEase(g.scale);
      const pulse = g.glow > 0 ? 1 + 0.06 * Math.sin(this.time * 18) * g.glow : 1;
      for (let k = 0; k < g.slots.length; k++) {
        const p = this.boxPos(g, k);
        let c = g.liveries[k];
        if (g.glow > 0) c = c.map(v => Math.min(255, Math.round(v + (255 - v) * 0.35 * g.glow)));
        put(p, s * pulse, c, parent);
      }
    }
    this.entry.count = n;
  }
}

function popEase(t) {
  // back-out: 0 -> 1 with a small overshoot
  const c1 = 1.9, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

// ---- fish crates on the fishing boats (bonds game) ----------------------------------------------------
export class Crates {
  constructor(scene) {
    this.scene = scene;
    this.items = [];        // { boat: OBJ id, slot: index, colour, scale, hop: {from, t} | null, remove }
    this.cap = 64;
    this.buf = new ArrayBuffer(this.cap * STRIDE);
    this.f32 = new Float32Array(this.buf);
    this.u8 = new Uint8Array(this.buf);
    this.entry = { template: 'crate', data: this.buf, count: 0, shadow: true };
    scene.instanceGroups.push(this.entry);
    this.slots = null; // boat-local slot centres, set by the game (from layout.boatSlots())
  }
  add(boat, slot, colour, opts = {}) {
    const it = { boat, slot, colour: hexRGB(colour), scale: opts.pop ? 0 : 1, hop: opts.from ? { from: opts.from, t: 0, dur: opts.dur || 0.55 } : null, remove: false, wob: 0 };
    this.items.push(it);
    return it;
  }
  clear(animate = true) { for (const it of this.items) it.remove = animate; if (!animate) this.items = []; }
  update(dt) {
    for (const it of this.items) {
      if (it.remove) it.scale -= dt * 4;
      else if (it.scale < 1) it.scale = Math.min(1, it.scale + dt * 3);
      if (it.hop) { it.hop.t += dt; if (it.hop.t >= it.hop.dur) { it.hop = null; it.wob = 1; } }
      if (it.wob > 0) it.wob = Math.max(0, it.wob - dt * 2.5);
    }
    this.items = this.items.filter(it => !(it.remove && it.scale <= 0));
    this.pack();
  }
  pack() {
    const f = this.f32, u = this.u8;
    let n = 0;
    for (const it of this.items) {
      if (n >= this.cap || !this.slots) break;
      const o = n * 12, b = n * STRIDE;
      const sl = this.slots[it.slot];
      let p = [sl[0], sl[1] + 0.001, sl[2]], parent = it.boat;
      let s = it.scale >= 1 ? 1 : popEase(Math.max(0, it.scale));
      if (it.hop) {
        // fly in a little arc from a world point to the slot (computed in world space, parent = world)
        const k = it.hop.t / it.hop.dur;
        const e = k * k * (3 - 2 * k);
        const boat = this.scene.getObject(it.boat);
        const dst = addv(boat.pos, rot(boat.q, p));
        const a = it.hop.from;
        p = [a[0] + (dst[0] - a[0]) * e, a[1] + (dst[1] - a[1]) * e + Math.sin(Math.PI * k) * 0.16, a[2] + (dst[2] - a[2]) * e];
        parent = 0;
      }
      const sq = it.wob > 0 ? 1 + 0.18 * Math.sin(it.wob * 14) * it.wob : 1;
      f[o] = p[0]; f[o + 1] = p[1]; f[o + 2] = p[2]; f[o + 3] = Math.max(0, s) * sq;
      f[o + 4] = 0; f[o + 5] = 0; f[o + 6] = 0; f[o + 7] = 1;
      u[b + 32] = it.colour[0]; u[b + 33] = it.colour[1]; u[b + 34] = it.colour[2]; u[b + 35] = 255;
      u[b + 36] = parent; u[b + 37] = 0; u[b + 38] = 0; u[b + 39] = 0;
      f[o + 10] = 0; f[o + 11] = 0;
      n++;
    }
    this.entry.count = n;
  }
}

function rot(q, v) {
  const [x, y, z, w] = q;
  const ix = w * v[0] + y * v[2] - z * v[1], iy = w * v[1] + z * v[0] - x * v[2], iz = w * v[2] + x * v[1] - y * v[0], iw = -x * v[0] - y * v[1] - z * v[2];
  return [ix * w + iw * -x + iy * -z - iz * -y, iy * w + iw * -y + iz * -x - ix * -z, iz * w + iw * -z + ix * -y - iy * -x];
}
function addv(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
