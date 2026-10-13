// Herring gulls: circle over the harbour (banking into turns, gliding with a few flaps), pick a perch, approach it
// from above, flare and land, stand with their wings folded (looking about), and take off again. A horn sends them
// all up; food on the water brings two or three swooping down.
// Template: length 1 (x SCALE), +x head, wings along z (root |z| 0.12 at the shoulder x 0.02, y 0.08), flex 0 on the
// body rising to 1 at the wingtips, feet at y = -0.36. Kind 2; see deform() in shaders.js for the anim encoding.
import { MeshBuilder, MAT } from '../gpu/mesh.js';
import { LAMPS, QUAY_TOP, LIGHTHOUSE, CRANE, B } from '../world/layout.js';
import { OBJ } from '../world/env.js';
import { InstanceWriter, Shape, quatYPR, rotate, yawOf, wrap, clamp, sstep } from './habitat.js';

const SCALE = 0.05;           // template length 1 -> 0.05 units
const FEET = 0.36;            // template units from the body centre down to the soles
const CRUISE = 0.27;
const W = 0xffffff;           // white plumage takes the instance tint
const GREY = 0x93a1ad, BLACK = 0x1b1c20, BILL = 0xf0bf2c, RED = 0xd42f28, LEG = 0xe9a29c;
const TWO_PI = Math.PI * 2;

// ---- template -----------------------------------------------------------------------------------------------------
export function gullTemplate() {
  const s = new Shape();
  // body: rings of 8 from the head back; the grey mantle covers the back between the wings
  const rings = [
    [0.445, 0.135, 0.046, 0.040, 0], [0.41, 0.140, 0.086, 0.076, 0], [0.35, 0.146, 0.106, 0.093, 0], [0.28, 0.122, 0.096, 0.088, 0],
    [0.20, 0.075, 0.106, 0.100, 0], [0.10, 0.025, 0.145, 0.145, 2], [-0.02, 0.0, 0.155, 0.152, 2], [-0.14, 0.012, 0.126, 0.120, 2],
    [-0.24, 0.032, 0.080, 0.080, 1],
  ];
  const R = rings.map(([x, yc, h, w, m]) => {
    const ids = [];
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * TWO_PI;
      const grey = (m >= 1 && k === 0) || (m === 2 && (k === 1 || k === 7));
      ids.push(s.vert([x, yc + h * Math.cos(a), w * Math.sin(a)], grey ? GREY : W, 0, MAT.PAINT));
    }
    return ids;
  });
  const nose = s.vert([0.455, 0.135, 0], W, 0, MAT.PAINT);
  for (let k = 0; k < 8; k++) s.tri(nose, R[0][k], R[0][(k + 1) % 8]);
  for (let j = 0; j < R.length - 1; j++) for (let k = 0; k < 8; k++) {
    const a = R[j][k], b = R[j][(k + 1) % 8], c = R[j + 1][k], d = R[j + 1][(k + 1) % 8];
    s.tri(a, d, b); s.tri(a, c, d);
  }
  const rump = s.vert([-0.31, 0.042, 0], W, 0, MAT.PAINT);
  for (let k = 0; k < 8; k++) s.tri(R[R.length - 1][k], rump, R[R.length - 1][(k + 1) % 8]);
  // bill: yellow, a red spot on the lower mandible, a slight hook
  const bill = [[0.43, 0.130, 0.042, 0.036], [0.50, 0.122, 0.034, 0.026], [0.55, 0.117, 0.029, 0.018]];
  const BR = bill.map(([x, yc, h, w], j) => [0, 1, 2, 3].map(k => {
    const a = (k / 4) * TWO_PI;
    return s.vert([x, yc + h * Math.cos(a), w * Math.sin(a)], j === 2 && k === 2 ? RED : BILL, 0, MAT.STEEL);
  }));
  const btip = s.vert([0.59, 0.108, 0], 0xe8c35a, 0, MAT.STEEL);
  for (let j = 0; j < 2; j++) for (let k = 0; k < 4; k++) {
    const a = BR[j][k], b = BR[j][(k + 1) % 4], c = BR[j + 1][k], d = BR[j + 1][(k + 1) % 4];
    s.tri(a, d, b); s.tri(a, c, d);
  }
  for (let k = 0; k < 4; k++) s.tri(BR[2][k], btip, BR[2][(k + 1) % 4]);
  // eyes
  for (const side of [1, -1]) {
    const cx = 0.385, cy = 0.178, cz = side * 0.083, r = 0.021;
    const c = s.vert([cx, cy, cz + side * 0.004], 0x101114, 0, MAT.GLASS);
    const ids = [];
    for (let k = 0; k < 6; k++) { const a = (k / 6) * TWO_PI; ids.push(s.vert([cx + Math.cos(a) * r, cy + Math.sin(a) * r, cz], 0x3a3428, 0, MAT.GLASS)); }
    for (let k = 0; k < 6; k++) side > 0 ? s.tri(c, ids[k], ids[(k + 1) % 6]) : s.tri(c, ids[(k + 1) % 6], ids[k]);
  }
  // wings: upper and lower skins between the leading and trailing edges, black tips with white mirrors
  // r, lead x, trail x, upper colours [lead, mid, rear, trailing edge], lower colours
  const st = [
    [0.12, 0.19, -0.15, [GREY, GREY, GREY, GREY], [W, W, W, W]],
    [0.38, 0.21, -0.14, [GREY, GREY, GREY, W], [W, W, W, W]],
    [0.60, 0.22, -0.12, [GREY, GREY, GREY, W], [W, W, W, W]],
    [0.76, 0.16, -0.105, [GREY, GREY, GREY, 0xd9dde0], [W, W, W, 0xdfe2e4]],
    [0.90, 0.085, -0.10, [BLACK, BLACK, BLACK, BLACK], [0x3a3c40, 0x5a5d61, 0x45474b, BLACK]],
    [1.02, 0.0, -0.09, [BLACK, 0xf2f2ee, BLACK, BLACK], [BLACK, 0xe6e6e2, BLACK, BLACK]],
  ];
  const TIP = [1.13, -0.075];
  const flexOf = r => (r - 0.12) / (TIP[0] - 0.12);
  for (const side of [1, -1]) {
    for (const upper of [true, false]) {
      const rows = st.map(([r, lx, tx, cu, cl]) => {
        const f = flexOf(r), cols = upper ? cu : cl;
        const thick = upper ? 0.032 * (1 - 0.6 * f) : -0.006;
        return [
          s.vert([lx, 0.08, side * r], cols[0], f, MAT.PAINT),
          s.vert([lx * 0.6 + tx * 0.4, 0.08 + thick, side * r], cols[1], f, MAT.PAINT),
          s.vert([lx * 0.12 + tx * 0.88, 0.079 + thick * 0.3, side * r], cols[2], f, MAT.PAINT),
          s.vert([tx, 0.078, side * r], cols[3], f, MAT.PAINT),
        ];
      });
      const tip = s.vert([TIP[1], 0.079, side * TIP[0]], BLACK, 1, MAT.PAINT);
      for (let j = 0; j < rows.length - 1; j++) for (let k = 0; k < 3; k++) {
        const a = rows[j][k], b = rows[j][k + 1], c = rows[j + 1][k], d = rows[j + 1][k + 1];
        s.tri(a, c, d); s.tri(a, d, b);
      }
      const L = rows[rows.length - 1];
      for (let k = 0; k < 3; k++) s.tri(L[k], tip, L[k + 1]);
    }
  }
  // tail fan
  s.flat([[-0.22, 0.052, -0.06], [-0.22, 0.052, 0.06], [-0.42, 0.046, 0.10], [-0.455, 0.046, 0], [-0.42, 0.046, -0.10]], W, 0, MAT.PAINT);
  // legs and webbed feet
  for (const side of [1, -1]) {
    const z = side * 0.05, a = [-0.02, -0.10, z], b = [-0.035, -0.345, z * 1.08], wdt = 0.012;
    const ring = (p) => [[p[0] - wdt, p[1], p[2] - wdt], [p[0] + wdt, p[1], p[2] - wdt], [p[0] + wdt, p[1], p[2] + wdt], [p[0] - wdt, p[1], p[2] + wdt]]
      .map(q => s.vert(q, LEG, 0, MAT.PAINT));
    const A = ring(a), Bq = ring(b);
    for (let k = 0; k < 4; k++) { const k2 = (k + 1) % 4; s.tri(A[k], Bq[k], Bq[k2]); s.tri(A[k], Bq[k2], A[k2]); }
    const y = -0.36, zb = b[2];
    s.flat([[-0.05, y, zb - 0.012], [-0.05, y, zb + 0.012], [0.07, y, zb + 0.055], [0.10, y, zb], [0.07, y, zb - 0.055]].reverse(), LEG, 0, MAT.PAINT);
  }
  const mb = new MeshBuilder();
  s.emit(mb);
  return { name: 'life-gull', mesh: mb.finish(), tris: s.triangles };
}

// ---- built-in perches for the dev viewer (when neither ctx.perches() nor the builders' points exist) ----------------
function builtinPerches() {
  const out = [];
  for (const [x, z] of LAMPS) out.push({ obj: 0, local: [x, QUAY_TOP + 0.12, z] });
  for (const k of [0.25, 0.75]) out.push({ obj: 0, local: [LIGHTHOUSE.x + Math.cos(k * Math.PI) * 0.084, 0.65, LIGHTHOUSE.z + Math.sin(k * Math.PI) * 0.084] });
  out.push({ obj: OBJ.CRANE_A, local: [0, CRANE.apexY + 0.025, -0.10] }, { obj: OBJ.CRANE_B, local: [0, CRANE.apexY + 0.025, -0.10] });
  for (const [x, y, z] of [[-1.2, 0.47, -1.88], [0.1, 0.48, -1.9], [1.6, 0.47, -1.87], [-0.6, 0.64, -2.14], [1.0, 0.65, -2.12], [-1.8, 0.81, -2.38]]) out.push({ obj: 0, local: [x, y, z] });
  return out;
}

// ---- the flock ------------------------------------------------------------------------------------------------------
export class Gulls {
  constructor(scene, hab, ctx, rand, opts = {}) {
    this.scene = scene;
    this.hab = hab;
    this.rand = rand;
    this.perchFn = ctx && typeof ctx.perches === 'function' ? () => ctx.perches() : null;
    this.writer = new InstanceWriter(scene, 'life-gull', 16, true);
    this.time = 0;
    this.reserved = new Map();     // perch key -> gull
    this.onSplash = opts.onSplash || null;
    this.lastList = null; this.lastNorm = null;
    this.gulls = [];
    const n = opts.count || 9;
    const perches = this.perches().filter(p => {
      const w = this.perchWorld(p, SCALE);
      return !hab.overhead(w[0], w[2], w[1] + 0.05) && this.approachPoint(w)[1] - w[1] <= 0.45;
    });
    const order = perches.map((p, i) => i).sort(() => rand() - 0.5);
    for (let i = 0; i < n; i++) {
      const g = {
        id: i, scale: SCALE * rand.range(0.93, 1.06), pos: [0, 1, 0], yaw: rand.range(-3, 3), yawRate: 0, vy: 0, speed: CRUISE, bank: 0, pitch: 0,
        amt: 0, phase: rand.range(0, TWO_PI), legs: 0, fold: 0, head: 0, headTarget: 0, headTimer: 1, mode: 'circle', timer: rand.range(3, 14),
        perch: null, localYaw: 0, faceYaw: 0, shuffle: 0, circle: null, circleT: 0, h: null, noPerchUntil: 0, excited: 0,
        burst: 0, burstWait: rand.range(0.5, 5), replan: 0, cruiseY: 1, food: null, after: null, tint: [247, 246, 241, 255],
      };
      this.newCircle(g, rand.range(-1.5, 1.5), rand.range(0.2, 1.6));
      const c = g.circle, a = rand.range(0, TWO_PI);
      g.pos = [c.cx + Math.cos(a) * c.r, c.y, c.cz + Math.sin(a) * c.r];
      g.yaw = Math.atan2(-Math.cos(a) * c.dir, -Math.sin(a) * c.dir);
      if (i >= 4 && order.length > i - 4) {
        const p = perches[order[i - 4]];
        if (!this.reserved.has(p.key)) { this.settle(g, p, -Math.PI / 2); g.localYaw = g.faceYaw; g.fold = 1; g.timer = rand.range(3, 20); }
      }
      this.gulls.push(g);
    }
  }

  // ---- perches -------------------------------------------------------------------------------------------------------
  perches() {
    let list = null;
    if (this.perchFn) { try { list = this.perchFn(); } catch (e) { list = null; } }
    if (!list || !list.length) {
      if (!this.fallback) {
        const pts = this.scene.points || {};
        const got = [];
        for (const k in pts) {
          if (Array.isArray(pts[k].perches)) got.push(...pts[k].perches);
          if (k === 'breakwater' && Array.isArray(pts[k].gallery)) got.push(...pts[k].gallery);
        }
        this.fallback = got.length >= 4 ? got : builtinPerches();
      }
      list = this.fallback;
    }
    if (list === this.lastList) return this.lastNorm;
    this.lastList = list;
    this.lastNorm = list.map(p => {
      const obj = Array.isArray(p) ? 0 : (p.obj || 0);
      const local = Array.isArray(p) ? p : (p.local || p.pos);
      return { obj, local, key: obj + ':' + local.map(v => v.toFixed(3)).join(',') };
    }).filter(p => p.local && p.local[1] < 1.35 && Math.abs(p.local[0]) < B && Math.abs(p.local[2]) < B);
    return this.lastNorm;
  }
  // Where the gull's body centre sits when standing on perch p (world space).
  perchWorld(p, scale) {
    const up = FEET * scale;
    if (!p.obj) return [p.local[0], p.local[1] + up, p.local[2]];
    const o = this.scene.getObject(p.obj);
    const r = rotate(o.q, [p.local[0], p.local[1] + up, p.local[2]]);
    return [o.pos[0] + r[0], o.pos[1] + r[1], o.pos[2] + r[2]];
  }
  objYaw(p) { return p.obj ? yawOf(this.scene.getObject(p.obj).q) : 0; }
  pickPerch(g) {
    const list = this.perches(), r = this.rand;
    let best = null, bw = 0;
    for (const p of list) {
      if (this.reserved.has(p.key)) continue;
      const w = this.perchWorld(p, g.scale);
      // nothing hanging over it (a crane boom over the ship's mast), and a short glide in from the approach point
      if (this.hab.overhead(w[0], w[2], w[1] + 0.05)) continue;
      if (this.approachPoint(w)[1] - w[1] > 0.45) continue;
      const d = Math.hypot(w[0] - g.pos[0], w[2] - g.pos[2]);
      const score = r() / (0.6 + d);
      if (score > bw) { bw = score; best = p; }
    }
    return best;
  }
  release(g) { if (g.perch && this.reserved.get(g.perch.key) === g) this.reserved.delete(g.perch.key); g.perch = null; }
  // The point a gull glides in from: seaward of the perch and above it, clear of the roofs and cranes.
  approachPoint(P) {
    const ax = P[0], az = Math.min(P[2] + 0.32, B - 0.3);
    return [ax, Math.max(P[1] + 0.2, this.hab.safeTop(ax, az) + 0.09), az];
  }

  newCircle(g, nx, nz) {
    const r = this.rand;
    const rad = r.range(0.35, 0.75);
    const cx = clamp(nx + r.range(-0.5, 0.5), -2.25 + rad, 2.25 - rad);
    const cz = clamp(nz + r.range(-0.4, 0.4), -0.25 + rad, 2.25 - rad);
    const hi = g.excited > this.time;
    g.circle = { cx, cz, r: rad, y: hi ? r.range(1.1, 1.4) : r.range(0.9, 1.3), dir: r() < 0.5 ? 1 : -1 };
    g.circleT = r.range(14, 30);
  }

  // ---- events -------------------------------------------------------------------------------------------------------
  horn() {
    const r = this.rand, t = this.time;
    for (const g of this.gulls) {
      g.excited = t + r.range(16, 22);
      g.noPerchUntil = t + r.range(18, 28);
      if (g.mode === 'perched') this.takeoff(g, r.range(0, 0.6));
      else if (g.mode === 'transit' || g.mode === 'orbit' || g.mode === 'final') this.abort(g);
      if (g.mode === 'circle') this.newCircle(g, g.pos[0], Math.max(0.3, g.pos[2]));
    }
  }
  feed(x, z) {
    // two or three gulls, the nearest that are not already busy
    const free = this.gulls.filter(g => !g.food && (g.mode === 'circle' || g.mode === 'perched' || g.mode === 'transit' || g.mode === 'orbit'));
    free.sort((a, b) => Math.hypot(a.pos[0] - x, a.pos[2] - z) - Math.hypot(b.pos[0] - x, b.pos[2] - z));
    const n = Math.min(free.length, 2 + (this.rand() < 0.5 ? 1 : 0));
    for (let i = 0; i < n; i++) {
      const g = free[i];
      const food = this.plotDive(x + this.rand.range(-0.05, 0.05), z + this.rand.range(-0.05, 0.05), g.pos[0], g.pos[2]);
      if (!food) continue;
      g.food = food;
      g.food.delay = i * this.rand.range(0.6, 1.2);
      if (g.mode === 'perched') { this.takeoff(g, g.food.delay); g.after = 'food'; }
      else { this.abort(g); g.mode = 'toFood'; g.replan = 0; }
    }
  }
  splash(x, z, strength) {
    if (strength < 0.3) return;
    for (const g of this.gulls) {
      if (g.mode !== 'perched') continue;
      if (Math.hypot(g.pos[0] - x, g.pos[2] - z) < 0.12 + 0.15 * strength) this.takeoff(g, this.rand.range(0, 0.25));
    }
  }
  // A dive at food: touch point on the water, and the direction to come in from (open water on both sides).
  // The touch point is the food or a spot close by; the gull comes in from S and climbs out the other way.
  plotDive(x, z, gx = x, gz = z + 1) {
    const h = this.hab, sea = this.scene.sea;
    const low = (px, pz, lim) => h.safeTop(px, pz) < sea + lim && Math.abs(px) < B - 0.15 && Math.abs(pz) < B - 0.15 && h.sim.isWater(px, pz);
    let best = null, bs = -1e9;
    for (const rad of [0, 0.07, 0.14, 0.2]) {
      const na = rad === 0 ? 1 : 8;
      for (let m = 0; m < na; m++) {
        const tx = x + Math.cos((m / na) * TWO_PI) * rad, tz = z + Math.sin((m / na) * TWO_PI) * rad;
        if (!low(tx, tz, 0.2)) continue;
        // which of 16 approach directions are clear, coming in over S and climbing out beyond the touch point
        const ok = [];
        for (let k = 0; k < 16; k++) {
          const a = (k / 16) * TWO_PI, dx = Math.cos(a), dz = Math.sin(a);
          ok.push(low(tx + dx * 0.15, tz + dz * 0.15, 0.25) && low(tx - dx * 0.15, tz - dz * 0.15, 0.25)
            && low(tx + dx * 0.32, tz + dz * 0.32, 0.36) && low(tx - dx * 0.32, tz - dz * 0.32, 0.36) && low(tx + dx * 0.48, tz + dz * 0.48, 0.36));
        }
        const nOk = ok.filter(Boolean).length;
        if (!nOk) continue;
        const gd = Math.hypot(gx - tx, gz - tz) || 1;
        for (let k = 0; k < 16; k++) {
          if (!ok[k] || !ok[(k + 1) % 16] || !ok[(k + 15) % 16]) continue;    // the middle of a clear fan
          const a = (k / 16) * TWO_PI, dx = Math.cos(a), dz = Math.sin(a);
          // a wide clear fan, near the food, on the side the gull is already coming from
          const sc = nOk * 0.12 - rad * 4 + 0.6 * ((gx - tx) * dx + (gz - tz) * dz) / gd + this.rand() * 0.05;
          if (sc > bs) { bs = sc; best = [tx, tz, dx, dz]; }
        }
      }
    }
    if (!best) return null;
    const [tx, tz, dx, dz] = best;
    // the entry point: out along the clear fan, where the gull lines up for its dive
    const S = [tx + dx * 0.45, 0, tz + dz * 0.45];
    S[1] = Math.max(0.42, h.pathTop(S[0], S[2], tx, tz) + 0.08);
    return { tp: [tx, 0, tz], S, dir: [dx, dz], giveUp: 0, nearT: 0 };
  }

  // ---- state changes ----------------------------------------------------------------------------------------------
  settle(g, p, worldYaw) {
    this.release(g);
    g.perch = p;
    this.reserved.set(p.key, g);
    g.mode = 'perched';
    g.pos = this.perchWorld(p, g.scale);
    g.localYaw = wrap(worldYaw - this.objYaw(p));
    // after a moment, shuffle round to face the sea
    g.faceYaw = wrap(-Math.PI / 2 + this.rand.range(-0.8, 0.8) - this.objYaw(p));
    g.shuffle = this.rand.range(0.5, 1.4);
    g.fold = g.fold || 0;
    g.legs = 1;
    g.amt = 0;
    g.timer = this.rand.range(9, 26);
    g.pitch = 0; g.bank = 0;
  }
  takeoff(g, delay = 0) {
    if (g.mode !== 'perched') return;
    g.mode = 'unfold';
    g.timer = delay;
  }
  abort(g) {
    if (g.mode === 'perched' || g.mode === 'unfold' || g.mode === 'hop') return;
    this.release(g);
    if (g.mode === 'final' && g.h) {
      // carry on from the curve's current velocity
      const v = g.h.vel || [Math.cos(g.yaw) * CRUISE, 0, -Math.sin(g.yaw) * CRUISE];
      g.speed = Math.max(0.15, Math.hypot(v[0], v[2])); g.vy = v[1];
    }
    g.h = null;
    g.mode = 'circle';
    g.timer = this.rand.range(4, 9);
    this.newCircle(g, g.pos[0], Math.max(0.3, g.pos[2] + 0.4));
  }

  // ---- flight ------------------------------------------------------------------------------------------------------
  // Free flight toward a horizontal direction and a height, never below the obstacles' safe top (when guarded).
  fly(g, dt, dx, dz, ty, speedT, guard = true, look = 0.55, maxDown = 0.17) {
    const p = g.pos;
    // under a crane boom: never climb into it, slip out seaward first
    const under = guard && this.hab.overhead(p[0], p[2], p[1] + 0.06);
    if (under) { dx = 0; dz = 1; }
    // keep inside the block
    if (Math.abs(p[0]) > B - 0.35 || Math.abs(p[2]) > B - 0.35) { dx += -p[0] * 0.8; dz += -p[2] * 0.8; }
    const want = Math.atan2(-dz, dx);
    const rate = clamp(wrap(want - g.yaw) * 2.0, -1.7, 1.7);
    g.yawRate += (rate - g.yawRate) * Math.min(1, dt * 5);
    g.yaw = wrap(g.yaw + g.yawRate * dt);
    const hx = Math.cos(g.yaw), hz = -Math.sin(g.yaw);
    let minY = -1;
    if (guard) {
      const h = this.hab;
      minY = Math.max(h.safeTop(p[0], p[2]), h.safeTop(p[0] + hx * look * 0.45, p[2] + hz * look * 0.45), h.safeTop(p[0] + hx * look, p[2] + hz * look)) + 0.06;
      if (ty < minY) ty = minY;
    }
    let vyT = clamp((ty - p[1]) * 1.3, -maxDown, 0.22);
    if (guard && p[1] < minY) { vyT = Math.max(vyT, 0.3); speedT *= 0.55; }
    if (under) { vyT = Math.min(vyT, 0); speedT = Math.max(speedT, CRUISE); }
    g.vy += (vyT - g.vy) * Math.min(1, dt * 3);
    g.speed += (speedT - g.speed) * Math.min(1, dt * 1.2);
    p[0] += hx * g.speed * dt; p[2] += hz * g.speed * dt; p[1] += g.vy * dt;
    const bankT = clamp(-Math.atan(g.yawRate * g.speed / 0.42), -0.75, 0.75);
    g.bank += (bankT - g.bank) * Math.min(1, dt * 4);
    g.pitch += (Math.atan2(g.vy, g.speed) * 0.8 - g.pitch) * Math.min(1, dt * 4);
    // wings: flap to climb, in short bursts now and then, otherwise glide
    let flap = clamp(g.vy * 4, 0, 1);
    g.burstWait -= dt;
    if (g.burst > 0) { g.burst -= dt; flap = Math.max(flap, 0.85); }
    else if (g.burstWait <= 0) {
      const hi = g.excited > this.time;
      g.burst = this.rand.int(2, hi ? 6 : 4) / 3.3;
      g.burstWait = hi ? this.rand.range(0.6, 2.2) : this.rand.range(2.5, 7.5);
    }
    if (g.speed < CRUISE * 0.8) flap = Math.max(flap, 0.6);
    g.amt += (flap - g.amt) * Math.min(1, dt * 5);
    g.legs = Math.max(0, g.legs - dt * 1.5);
  }
  // Is the straight dive from p down to the touch point tp, and the climb out beyond it, clear of everything?
  diveClear(p, tp) {
    const h = this.hab, sea = this.scene.sea;
    const dx = tp[0] - p[0], dz = tp[2] - p[2], d = Math.hypot(dx, dz) || 1, ux = dx / d, uz = dz / d;
    for (const k of [0.25, 0.5, 0.75]) {
      // the dive curve is still high near its start: allow taller things there
      const y = p[1] + (sea - p[1]) * (k * k * (3 - 2 * k));
      const st = h.safeTop(p[0] + dx * k, p[2] + dz * k);
      if (st > sea + 0.17 && st - 0.06 > y) return false;
    }
    if (h.safeTop(tp[0] + ux * 0.15, tp[2] + uz * 0.15) > sea + 0.25) return false;
    if (h.safeTop(tp[0] + ux * 0.32, tp[2] + uz * 0.32) > sea + 0.4) return false;
    return Math.abs(tp[0] + ux * 0.35) < B - 0.1 && Math.abs(tp[2] + uz * 0.35) < B - 0.1;
  }
  // Highest obstacle under a small orbit ring (so the orbit's height clears all of it).
  ringTop(cx, cz, r) {
    let m = -1;
    for (let k = 0; k < 12; k++) { const a = (k / 12) * TWO_PI; m = Math.max(m, this.hab.safeTop(cx + Math.cos(a) * r, cz + Math.sin(a) * r)); }
    return m;
  }
  circleDir(g, cx, cz, r, dir) {
    const dx = g.pos[0] - cx, dz = g.pos[2] - cz, d = Math.hypot(dx, dz) || 1e-3;
    const k = clamp((r - d) / r * 1.6, -1.2, 1.2);
    return [(-dz / d) * dir + (dx / d) * k, (dx / d) * dir + (dz / d) * k];
  }
  startCurve(g, p1Fn, v1, T) {
    const v0 = [Math.cos(g.yaw) * g.speed, g.vy, -Math.sin(g.yaw) * g.speed];
    g.h = { p0: g.pos.slice(), v0, p1Fn, v1, T, t: 0, vel: v0 };
  }
  // Advance a Hermite curve; returns progress 0..1 and sets the pose from its velocity.
  curve(g, dt) {
    const H = g.h;
    H.t = Math.min(H.T, H.t + dt);
    const k = H.t / H.T, T = H.T, p1 = H.p1Fn();
    const k2 = k * k, k3 = k2 * k;
    const h00 = 2 * k3 - 3 * k2 + 1, h10 = k3 - 2 * k2 + k, h01 = -2 * k3 + 3 * k2, h11 = k3 - k2;
    const d00 = 6 * k2 - 6 * k, d10 = 3 * k2 - 4 * k + 1, d01 = -6 * k2 + 6 * k, d11 = 3 * k2 - 2 * k;
    const v = [0, 0, 0];
    for (let i = 0; i < 3; i++) {
      g.pos[i] = h00 * H.p0[i] + h10 * T * H.v0[i] + h01 * p1[i] + h11 * T * H.v1[i];
      v[i] = (d00 * H.p0[i] + d10 * T * H.v0[i] + d01 * p1[i] + d11 * T * H.v1[i]) / T;
    }
    H.vel = v;
    const vh = Math.hypot(v[0], v[2]);
    if (vh > 0.02) {
      const yaw = Math.atan2(-v[2], v[0]);
      g.yawRate = wrap(yaw - g.yaw) / Math.max(dt, 1e-3);
      g.yaw = yaw;
    }
    g.speed = vh; g.vy = v[1];
    g.bank += (clamp(-Math.atan(g.yawRate * vh / 0.42), -0.6, 0.6) - g.bank) * Math.min(1, dt * 5);
    return k;
  }

  update(dt) {
    this.time += dt;
    const t = this.time, r = this.rand, h = this.hab;
    for (const g of this.gulls) {
      g.phase += dt * TWO_PI * (g.mode === 'final' || g.mode === 'dip' ? 4.2 : 3.3);
      if (g.phase > 1e4) g.phase -= TWO_PI * 1000;
      let flare = 0;
      switch (g.mode) {
        case 'circle': {
          const c = g.circle;
          const [dx, dz] = this.circleDir(g, c.cx, c.cz, c.r, c.dir);
          const hi = g.excited > t;
          this.fly(g, dt, dx, dz, c.y + 0.04 * Math.sin(t * 0.5 + g.id), CRUISE * (hi ? 1.15 : 1));
          g.circleT -= dt;
          if (g.circleT <= 0) this.newCircle(g, c.cx, c.cz);
          g.timer -= dt;
          if (g.timer <= 0) {
            g.timer = r.range(4, 9);
            if (t >= g.noPerchUntil && r() < 0.75) {
              const p = this.pickPerch(g);
              if (p) { g.perch = p; this.reserved.set(p.key, g); g.mode = 'transit'; g.replan = 0; }
            }
          }
          break;
        }
        case 'transit': {
          const P = this.perchWorld(g.perch, g.scale), A = this.approachPoint(P);
          const dist = Math.hypot(A[0] - g.pos[0], A[2] - g.pos[2]);
          g.replan -= dt;
          if (g.replan <= 0) { g.replan = 0.6; g.cruiseY = Math.max(A[1], h.pathTop(g.pos[0], g.pos[2], A[0], A[2]) + 0.1); }
          this.fly(g, dt, A[0] - g.pos[0], A[2] - g.pos[2], dist < 0.45 ? A[1] : g.cruiseY, CRUISE);
          if (dist < 0.2) { g.mode = 'orbit'; g.orbitDir = r() < 0.5 ? 1 : -1; g.timer = 16; g.replan = 0; }
          break;
        }
        case 'orbit': {
          const P = this.perchWorld(g.perch, g.scale), A = this.approachPoint(P);
          g.replan -= dt;
          if (g.replan <= 0) { g.replan = 0.5; g.orbitY = Math.max(A[1], this.ringTop(A[0], A[2], 0.22) + 0.06); }
          const [dx, dz] = this.circleDir(g, A[0], A[2], 0.2, g.orbitDir);
          this.fly(g, dt, dx, dz, g.orbitY, CRUISE * 0.85, true, 0.12);
          const tx = P[0] - g.pos[0], tz = P[2] - g.pos[2], d = Math.hypot(tx, tz);
          const off = Math.abs(wrap(Math.atan2(-tz, tx) - g.yaw));
          if (Math.abs(g.pos[1] - g.orbitY) < 0.05 && off < 0.6 && d > 0.15 && d < 0.6) {
            g.mode = 'final';
            const pr = g.perch;
            const dist3 = Math.hypot(tx, P[1] - g.pos[1], tz);
            const hx = tx / d, hz = tz / d;
            this.startCurve(g, () => this.perchWorld(pr, g.scale), [hx * 0.05, -0.025, hz * 0.05], clamp(dist3 / 0.2, 1.3, 2.6));
          }
          g.timer -= dt;
          if (g.timer <= 0) this.abort(g);
          break;
        }
        case 'final': {
          const k = this.curve(g, dt);
          flare = sstep(0.55, 1.0, k) * 0.8;
          g.pitch = Math.atan2(g.vy, Math.max(g.speed, 0.01)) * 0.6;
          g.amt += ((k > 0.58 && k < 0.94 ? 0.85 : 0) - g.amt) * Math.min(1, dt * 7);
          g.legs = Math.max(g.legs, sstep(0.25, 0.55, k));
          if (k >= 1) { const y = g.yaw; this.settle(g, g.perch, y); g.fold = 0.001; }
          break;
        }
        case 'perched': case 'unfold': {
          const P = this.perchWorld(g.perch, g.scale);
          g.pos = P;
          g.shuffle -= dt;
          if (g.shuffle <= 0) {
            const e = wrap(g.faceYaw - g.localYaw);
            g.localYaw = wrap(g.localYaw + clamp(e, -1.8 * dt, 1.8 * dt));
          }
          g.headTimer -= dt;
          if (g.headTimer <= 0) { g.headTimer = r.range(0.5, 2.8); g.headTarget = r() < 0.3 ? 0 : r.range(-0.95, 0.95); }
          if (g.mode === 'perched') {
            g.fold = Math.min(1, g.fold + dt * 2.2);
            g.head += (g.headTarget - g.head) * Math.min(1, dt * 9);
            g.timer -= dt;
            if (g.timer <= 0) this.takeoff(g, 0);
            // a crane swinging over the perch makes it leave
            else if (g.perch.obj && (g.lookUp = (g.lookUp || 0) - dt) <= 0) { g.lookUp = 0.5; if (h.overhead(P[0], P[2], P[1] + 0.05)) this.takeoff(g, 0); }
          } else {
            g.head += (0 - g.head) * Math.min(1, dt * 10);
            g.timer -= dt;
            if (g.timer <= 0) g.fold = Math.max(0, g.fold - dt * 4.5);
            if (g.timer <= 0 && g.fold <= 0) {
              // hop up and forward with strong flaps
              const yaw = wrap(this.objYaw(g.perch) + g.localYaw);
              const fx = Math.cos(yaw), fz = -Math.sin(yaw);
              const p0 = P.slice();
              this.release(g);
              g.yaw = yaw; g.speed = 0.06; g.vy = 0.45; g.phase = 0;
              g.mode = 'hop';
              g.h = { p0, v0: [fx * 0.06, 0.45, fz * 0.06], p1Fn: () => [p0[0] + fx * 0.17, p0[1] + 0.25, p0[2] + fz * 0.17], v1: [fx * 0.26, 0.14, fz * 0.26], T: 0.85, t: 0 };
            }
          }
          break;
        }
        case 'hop': {
          const k = this.curve(g, dt);
          g.pitch = Math.atan2(g.vy, Math.max(g.speed, 0.01)) * 0.5;
          g.amt += (1 - g.amt) * Math.min(1, dt * 10);
          g.fold = 0; g.head = 0;
          if (k >= 1) {
            g.h = null;
            if (g.after === 'food' && g.food) { g.mode = 'toFood'; g.replan = 0; }
            else {
              g.mode = 'circle'; g.timer = r.range(5, 12);
              this.newCircle(g, g.pos[0] + Math.cos(g.yaw) * 0.5, Math.max(0.3, g.pos[2] + 0.7));
            }
            g.after = null;
          }
          break;
        }
        case 'toFood': {
          const F = g.food, S = F.S;
          if (F.delay > 0) { F.delay -= dt; const c = g.circle; const [dx, dz] = this.circleDir(g, c.cx, c.cz, c.r, c.dir); this.fly(g, dt, dx, dz, c.y, CRUISE); break; }
          const dist = Math.hypot(S[0] - g.pos[0], S[2] - g.pos[2]);
          g.replan -= dt;
          if (g.replan <= 0) { g.replan = 0.5; g.cruiseY = Math.max(S[1], h.pathTop(g.pos[0], g.pos[2], S[0], S[2]) + 0.1); }
          if (F.orbitY === undefined) F.orbitY = S[1];
          const tp = F.tp, tx = tp[0] - g.pos[0], tz = tp[2] - g.pos[2], d = Math.hypot(tx, tz);
          if (!F.near) {
            this.fly(g, dt, S[0] - g.pos[0], S[2] - g.pos[2], dist < 0.8 ? F.orbitY : g.cruiseY, CRUISE * 1.15, true, 0.55, 0.32);
            if (dist < 0.25) { F.near = true; F.nearT = 0; }
          } else {
            // head for the touch point (turning round if need be), holding the entry height
            this.fly(g, dt, tx, tz, F.orbitY, CRUISE * 0.95, true, 0.3, 0.3);
            F.nearT += dt;
            if (F.nearT > 6) F.near = false;      // could not line up: go round again
          }
          {
            const off = Math.abs(wrap(Math.atan2(-tz, tx) - g.yaw));
            const yOk = g.pos[1] > F.orbitY - 0.07 && g.pos[1] < F.orbitY + 0.22;
            if (this.debug && ((F.dbg = (F.dbg || 0) + dt) > 0.5)) { F.dbg = 0; console.log('GULLDBG', g.id, 'pos', g.pos.map(v => v.toFixed(2)).join(','), 'tp', tp[0].toFixed(2), tp[2].toFixed(2), 'S', S.map(v => v.toFixed(2)).join(','), 'oY', F.orbitY.toFixed(2), 'd', d.toFixed(2), 'off', off.toFixed(2), 'yOk', yOk, 'clear', this.diveClear(g.pos, tp), 'near', !!F.near); }
            if (yOk && off < 0.5 && d > 0.15 && d < 0.8 && this.diveClear(g.pos, tp)) {
              g.mode = 'dive';
              const hx = tx / d, hz = tz / d;
              const tpFn = () => [tp[0], h.surfaceAt(tp[0], tp[2]) + 0.016, tp[2]];
              this.startCurve(g, tpFn, [hx * 0.14, -0.04, hz * 0.14], clamp(Math.hypot(d, g.pos[1]) / 0.42, 0.9, 2.0));
              g.diveDir = [hx, hz];
            }
          }
          F.giveUp += dt;
          if (F.giveUp > 14) { g.food = null; this.abort(g); g.mode = 'circle'; }
          break;
        }
        case 'dive': {
          const k = this.curve(g, dt);
          g.pitch = Math.atan2(g.vy, Math.max(g.speed, 0.01)) * 0.7 + sstep(0.8, 1.0, k) * 0.6;
          g.legs = Math.max(g.legs, sstep(0.05, 0.25, k));
          g.fold = 0.38 * sstep(0.25, 0.42, k) * (1 - sstep(0.7, 0.84, k));
          g.amt += ((k > 0.84 ? 0.8 : 0) - g.amt) * Math.min(1, dt * 8);
          if (k >= 1) {
            g.mode = 'dip'; g.timer = 0.45; g.fold = 0; g.h = null;
            const p = g.pos;
            this.scene.sim.disturb(p[0], p[2], 0.035, 0.004);
            this.scene.sim.addFoam(p[0], p[2], 0.04, 0.5);
            if (this.onSplash) this.onSplash(p[0], p[2]);
          }
          break;
        }
        case 'dip': {
          const [hx, hz] = g.diveDir;
          g.pos[0] += hx * 0.05 * dt; g.pos[2] += hz * 0.05 * dt;
          g.pos[1] = h.surfaceAt(g.pos[0], g.pos[2]) + 0.016 + 0.004 * Math.sin(t * 20);
          g.amt += (0.8 - g.amt) * Math.min(1, dt * 8);
          g.pitch += (0.5 - g.pitch) * Math.min(1, dt * 6);
          g.bank *= Math.exp(-dt * 6);
          g.timer -= dt;
          if (g.timer <= 0) {
            const p0 = g.pos.slice();
            g.yaw = Math.atan2(-hz, hx);
            g.mode = 'climb';
            g.h = { p0, v0: [hx * 0.05, 0.5, hz * 0.05], p1Fn: () => [p0[0] + hx * 0.32, p0[1] + 0.45, p0[2] + hz * 0.32], v1: [hx * 0.27, 0.1, hz * 0.27], T: 1.35, t: 0 };
          }
          break;
        }
        case 'climb': {
          const k = this.curve(g, dt);
          g.pitch = Math.atan2(g.vy, Math.max(g.speed, 0.01)) * 0.5;
          g.amt += (1 - g.amt) * Math.min(1, dt * 8);
          g.legs = Math.max(0, 1 - sstep(0.3, 0.9, k));
          if (k >= 1) {
            g.h = null; g.food = null;
            g.mode = 'circle'; g.timer = r.range(4, 10);
            this.newCircle(g, g.pos[0] + Math.cos(g.yaw) * 0.6, Math.max(0.3, g.pos[2] + 0.5));
          }
          break;
        }
      }
      g.flare = flare;
    }
    this.pack();
  }

  pack() {
    const w = this.writer, q = [0, 0, 0, 1];
    w.begin();
    for (const g of this.gulls) {
      if (g.mode === 'perched' || g.mode === 'unfold') {
        const p = g.perch, up = FEET * g.scale;
        quatYPR(g.localYaw, 0.1, 0, q);
        w.put(p.local[0], p.local[1] + up, p.local[2], g.scale, q, g.tint, p.obj, 2, g.head, -Math.max(g.fold, 0.002));
        continue;
      }
      quatYPR(g.yaw, g.pitch + (g.flare || 0), g.bank, q);
      let ay;
      if (g.fold > 0.004) ay = -g.fold;
      else ay = 2 * Math.round(clamp(g.legs, 0, 1) * 8) + Math.min(clamp(g.amt, 0, 1), 0.999);
      w.put(g.pos[0], g.pos[1], g.pos[2], g.scale, q, g.tint, 0, 2, g.fold > 0.004 ? 0 : g.phase, ay);
    }
    w.end();
  }
}
