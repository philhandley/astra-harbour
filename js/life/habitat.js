// Shared surroundings for the harbour wildlife: where the open water is, how deep it is, where the hulls sit,
// how high a gull must fly to clear the town and the cranes, and a small writer for 48-byte instances.
import { B, SEA, QUAY_Z, QUAY_TOP, LAND_Z, LIGHT_TOWERS, LIGHTHOUSE, CHURCH, BW, CRANE, BERTH, SHIP, FISHBOAT,
  floorHeight, landHeight, inBreakwater, inPier } from '../world/layout.js';
import { OBJ } from '../world/env.js';
import { MAT } from '../gpu/mesh.js';

const G = 130;                    // grid cells per side for the swimmers' maps (0.04 units)
const CELL = (2 * B) / G;

export class Habitat {
  constructor(scene, ctx) {
    this.scene = scene;
    this.sim = scene.sim;
    this.ctx = ctx;
    this.hullFn = ctx && typeof ctx.hulls === 'function' ? () => ctx.hulls() : null;
    // seabed height at grid nodes (the basin shape continues under the quay so the bilinear read never jumps)
    this.floor = new Float32Array((G + 1) * (G + 1));
    for (let j = 0; j <= G; j++) for (let i = 0; i <= G; i++) this.floor[j * (G + 1) + i] = floorHeight(-B + i * CELL, -B + j * CELL);
    // open water for swimmers (deep enough, in front of the quay wall, inside the block) and the distance to its edge
    const blocked = new Uint8Array(G * G);
    for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
      const x = -B + (i + 0.5) * CELL, z = -B + (j + 0.5) * CELL;
      blocked[j * G + i] = (z < QUAY_Z + 0.012 || floorHeight(x, z) > SEA - 0.075 || Math.abs(x) > B - 0.05 || Math.abs(z) > B - 0.05) ? 1 : 0;
    }
    this.dist = chamfer(blocked, G, CELL);
    this.hulls = [];
    this.refreshHulls();
  }

  // ---- swimmers ---------------------------------------------------------------------------------------------------
  floorAt(x, z) {
    const gx = clampG((x + B) / CELL, G), gz = clampG((z + B) / CELL, G);
    const i = Math.min(G - 1, gx | 0), j = Math.min(G - 1, gz | 0), fx = gx - i, fz = gz - j, F = this.floor, W = G + 1;
    const a = F[j * W + i], b = F[j * W + i + 1], c = F[(j + 1) * W + i], d = F[(j + 1) * W + i + 1];
    return a + (b - a) * fx + (c - a + (d - c - b + a) * fx) * fz;
  }
  // Horizontal distance (units) to the nearest place a swimmer may not go (quay wall, rocks, shallows, block edge).
  wallDist(x, z) {
    const gx = clampG((x + B) / CELL - 0.5, G - 1), gz = clampG((z + B) / CELL - 0.5, G - 1);
    const i = Math.min(G - 2, gx | 0), j = Math.min(G - 2, gz | 0), fx = gx - i, fz = gz - j, D = this.dist;
    const a = D[j * G + i], b = D[j * G + i + 1], c = D[(j + 1) * G + i], d = D[(j + 1) * G + i + 1];
    return a + (b - a) * fx + (c - a + (d - c - b + a) * fx) * fz;
  }
  // Unit vector pointing away from the nearest wall (toward open water).
  wallAway(x, z, out) {
    const e = CELL;
    const gx = this.wallDist(x + e, z) - this.wallDist(x - e, z), gz = this.wallDist(x, z + e) - this.wallDist(x, z - e);
    const l = Math.hypot(gx, gz) || 1;
    out[0] = gx / l; out[1] = gz / l;
    return out;
  }
  open(x, z, clear = 0.02) { return this.wallDist(x, z) > clear && this.sim.isWater(x, z); }
  surfaceAt(x, z) { return this.scene.sea + this.sim.heightAt(x, z); }

  // The lowest point a swimmer's centre may reach from above at (x, z): just under the surface, and under any hull
  // (with a sloping skirt round each hull so a fish slides down before it reaches the side).
  ceilingAt(x, z, gap = 0.025, skirt = 0.07) {
    let c = this.surfaceAt(x, z) - gap;
    const sea = this.scene.sea;
    for (const h of this.hulls) {
      const dx = x - h.x, dz = z - h.z;
      if (Math.abs(dx) > h.reach + skirt || Math.abs(dz) > h.reach + skirt) continue;
      const lx = dx * h.ca - dz * h.sa, lz = dx * h.sa + dz * h.ca;
      const ex = Math.max(Math.abs(lx) - h.halfL, 0), ez = Math.max(Math.abs(lz) - h.halfB, 0);
      const d = Math.hypot(ex, ez);
      if (d >= skirt) continue;
      const bottom = sea - h.draft - gap * 0.6;
      const k = d / skirt, s = k * k * (3 - 2 * k);
      const cc = bottom + (c - bottom) * s;
      if (cc < c) c = cc;
    }
    return c;
  }

  // ---- hulls ------------------------------------------------------------------------------------------------------
  // { x, z, yaw, halfL, halfB, draft, speed } from ctx.hulls(), plus moored craft read from their object poses
  // (fishing boats, yachts, buoys) when the list does not already include them.
  refreshHulls() {
    let list = null;
    if (this.hullFn) { try { list = this.hullFn(); } catch (e) { list = null; } }
    const out = [];
    const have = new Set();
    if (list && list.length) {
      for (const h of list) { out.push(h); if (h.id !== undefined) have.add(h.id); }
    } else {
      // dev fallback: the ship at its berth and the tug at its home pose
      out.push({ x: BERTH.x, z: BERTH.z, yaw: 0, halfL: SHIP.length / 2, halfB: SHIP.beam / 2, draft: SHIP.draft, speed: 0, id: OBJ.SHIP });
      have.add(OBJ.SHIP);
      const t = this.scene.getObject(OBJ.TUG);
      if (t.pos[0] || t.pos[2]) { out.push({ x: t.pos[0], z: t.pos[2], yaw: yawOf(t.q), halfL: 0.15, halfB: 0.05, draft: 0.055, speed: 0, id: OBJ.TUG }); have.add(OBJ.TUG); }
    }
    const extra = [
      [OBJ.BOAT_A, FISHBOAT.length / 2, FISHBOAT.beam / 2, 0.045], [OBJ.BOAT_B, FISHBOAT.length / 2, FISHBOAT.beam / 2, 0.045],
      [OBJ.YACHT_1, 0.14, 0.05, 0.07], [OBJ.YACHT_2, 0.14, 0.05, 0.07],
      [OBJ.CHANNEL_BUOY, 0.035, 0.035, 0.05], [OBJ.MOOR_1, 0.025, 0.025, 0.03], [OBJ.MOOR_2, 0.025, 0.025, 0.03], [OBJ.MOOR_3, 0.025, 0.025, 0.03],
    ];
    for (const [id, hl, hb, dr] of extra) {
      if (have.has(id)) continue;
      const o = this.scene.getObject(id);
      if (!o.pos[0] && !o.pos[2]) continue;
      out.push({ x: o.pos[0], z: o.pos[2], yaw: yawOf(o.q), halfL: hl, halfB: hb, draft: dr, speed: 0, id });
    }
    for (const h of out) {
      h.ca = Math.cos(h.yaw); h.sa = Math.sin(h.yaw);
      h.reach = Math.hypot(h.halfL, h.halfB);
      h.speed = Math.abs(h.speed || 0);
    }
    this.hulls = out;
  }

  // Signed horizontal distance from (x, z) to a hull's footprint rectangle (0 inside) and the push-away direction.
  hullAway(h, x, z, out) {
    const dx = x - h.x, dz = z - h.z;
    const lx = dx * h.ca - dz * h.sa, lz = dx * h.sa + dz * h.ca;
    const ex = Math.max(Math.abs(lx) - h.halfL, 0), ez = Math.max(Math.abs(lz) - h.halfB, 0);
    let px, pz;
    if (ex > 0 || ez > 0) { px = Math.sign(lx) * ex; pz = Math.sign(lz) * ez; }
    else if (h.halfL - Math.abs(lx) < h.halfB - Math.abs(lz)) { px = Math.sign(lx) || 1; pz = 0; }
    else { px = 0; pz = Math.sign(lz) || 1; }
    // back to world: local (lx, lz) = R * (dx, dz) with R = [[ca, -sa], [sa, ca]], so world = R^T * local
    const wx = px * h.ca + pz * h.sa, wz = -px * h.sa + pz * h.ca;
    const l = Math.hypot(wx, wz) || 1;
    out[0] = wx / l; out[1] = wz / l;
    return Math.hypot(ex, ez);
  }

  // ---- fliers -----------------------------------------------------------------------------------------------------
  // The top of everything that stands at (x, z), plus clearance: gulls in free flight never go below this.
  safeTop(x, z) {
    const sea = this.scene.sea;
    let t = sea + 0.16;
    if (z < QUAY_Z + 0.06) {
      const zz = Math.min(z, QUAY_Z - 0.001);
      t = Math.max(t, landHeight(x, zz) + (zz < LAND_Z + 0.05 ? 0.40 : 0.38));
    }
    if (inPier(x, z, 0.06)) t = Math.max(t, 0.42);
    if (inBreakwater(x, z, 0.04)) t = Math.max(t, BW.wallTop + 0.12);
    const lh = Math.hypot(x - LIGHTHOUSE.x, z - LIGHTHOUSE.z);
    if (lh < 0.26) t = Math.max(t, LIGHTHOUSE.lanternTop + 0.2);
    for (const [lx, lz] of LIGHT_TOWERS) if (Math.abs(x - lx) < 0.2 && Math.abs(z - lz) < 0.2) t = Math.max(t, QUAY_TOP + 0.85);
    if (Math.hypot(x - CHURCH.x, z - CHURCH.z) < 0.32) t = Math.max(t, 1.32);
    // cranes: gantry, A-frame and boom, wherever they are on the rails
    for (const [g, b] of [[OBJ.CRANE_A, OBJ.BOOM_A], [OBJ.CRANE_B, OBJ.BOOM_B]]) {
      const o = this.scene.objects, cx = o[g * 8];
      if (Math.abs(x - cx) > CRANE.legSpanX / 2 + 0.2) continue;
      const tip = this.boomTip(b);
      const zTip = Math.max(tip[2], o[g * 8 + 2] + 0.1);
      if (z < o[g * 8 + 2] - CRANE.backreach - 0.15 || z > zTip + 0.18) continue;
      t = Math.max(t, Math.max(QUAY_TOP + CRANE.apexY, tip[1]) + 0.2);
    }
    // vessels: masts, funnels, radar
    for (const h of this.hulls) {
      const dx = x - h.x, dz = z - h.z;
      if (Math.abs(dx) > h.reach + 0.12 || Math.abs(dz) > h.reach + 0.12) continue;
      const lx = dx * h.ca - dz * h.sa, lz = dx * h.sa + dz * h.ca;
      if (Math.abs(lx) < h.halfL + 0.1 && Math.abs(lz) < h.halfB + 0.1) t = Math.max(t, sea + (h.halfL > 0.5 ? 0.6 : h.halfL > 0.1 ? 0.5 : 0.2));
    }
    return t;
  }
  // True when a crane's boom, girder or A-frame hangs over (x, z) above height y (a gull there must not climb).
  overhead(x, z, y) {
    const o = this.scene.objects;
    for (const [g, b] of [[OBJ.CRANE_A, OBJ.BOOM_A], [OBJ.CRANE_B, OBJ.BOOM_B]]) {
      const cx = o[g * 8], cz = o[g * 8 + 2];
      if (Math.abs(x - cx) > CRANE.legSpanX / 2 + 0.12) continue;
      const hinge = [cx, o[g * 8 + 1] + CRANE.hingeY, cz];
      const tip = this.boomTip(b);
      if (z < cz - CRANE.backreach - 0.05 || z > Math.max(tip[2], cz) + 0.08) continue;
      // girder height under the point: the backreach is level, the boom runs from the hinge to its tip
      let top = hinge[1];
      if (z > cz && tip[2] > cz + 0.01) top = hinge[1] + (tip[1] - hinge[1]) * Math.min(1, (z - cz) / (tip[2] - cz));
      if (y < top - 0.02) return true;
    }
    return false;
  }
  boomTip(boomObj) {
    const o = this.scene.objects, k = boomObj * 8;
    const q = [o[k + 4], o[k + 5], o[k + 6], o[k + 7]];
    const p = rotate(q, [0, 0, CRANE.boomLen]);
    return [o[k] + p[0], o[k + 1] + p[1], o[k + 2] + p[2]];
  }
  // Highest safeTop along a straight path (sampled), ignoring a little circle round the destination.
  pathTop(x0, z0, x1, z1, skipR = 0.0) {
    let m = -1;
    const n = Math.max(4, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 0.08));
    for (let k = 0; k <= n; k++) {
      const x = x0 + (x1 - x0) * k / n, z = z0 + (z1 - z0) * k / n;
      if (skipR > 0 && Math.hypot(x - x1, z - z1) < skipR) continue;
      m = Math.max(m, this.safeTop(x, z));
    }
    return m;
  }
}

// ---- instance writer --------------------------------------------------------------------------------------------
// Instance: pos f32x3, scale f32, quat f32x4, tint unorm8x4, info uint8x4 (parent, kind, 0, 0), anim f32x2.
export class InstanceWriter {
  constructor(scene, template, cap, shadow = true) {
    this.cap = cap;
    this.buf = new ArrayBuffer(cap * 48);
    this.f32 = new Float32Array(this.buf);
    this.u8 = new Uint8Array(this.buf);
    this.entry = { template, data: this.buf, count: 0, shadow };
    this.n = 0;
    scene.instanceGroups.push(this.entry);
  }
  begin() { this.n = 0; }
  put(x, y, z, scale, q, tint, parent, kind, ax, ay) {
    if (this.n >= this.cap) return;
    const o = this.n * 12, b = this.n * 48, f = this.f32, u = this.u8;
    f[o] = x; f[o + 1] = y; f[o + 2] = z; f[o + 3] = scale;
    f[o + 4] = q[0]; f[o + 5] = q[1]; f[o + 6] = q[2]; f[o + 7] = q[3];
    u[b + 32] = tint[0]; u[b + 33] = tint[1]; u[b + 34] = tint[2]; u[b + 35] = tint[3] === undefined ? 255 : tint[3];
    u[b + 36] = parent; u[b + 37] = kind; u[b + 38] = 0; u[b + 39] = 0;
    f[o + 10] = ax; f[o + 11] = ay;
    this.n++;
  }
  end() { this.entry.count = this.n; }
}

// ---- a tiny mesh helper: shared vertices get smooth normals from the faces around them ---------------------------
export class Shape {
  constructor() { this.v = []; this.t = []; }
  vert(p, color, flex = 0, mat = MAT.PAINT) { this.v.push({ p, color, flex, mat }); return this.v.length - 1; }
  tri(a, b, c) { this.t.push(a, b, c); }
  quad(a, b, c, d) { this.t.push(a, b, c, a, c, d); }
  // Flat (unshared) polygon, counter-clockwise seen from the side the normal faces.
  flat(pts, color, flex, mat) {
    const ids = pts.map((p, k) => this.vert(p, color, Array.isArray(flex) ? flex[k] : flex, mat));
    for (let k = 1; k < ids.length - 1; k++) this.tri(ids[0], ids[k], ids[k + 1]);
    return ids;
  }
  emit(mb) {
    const N = this.v.map(() => [0, 0, 0]);
    for (let k = 0; k < this.t.length; k += 3) {
      const a = this.v[this.t[k]].p, b = this.v[this.t[k + 1]].p, c = this.v[this.t[k + 2]].p;
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
      for (let m = 0; m < 3; m++) { const q = N[this.t[k + m]]; q[0] += n[0]; q[1] += n[1]; q[2] += n[2]; }
    }
    const base = mb.nv;
    this.v.forEach((v, i) => {
      const n = N[i], l = Math.hypot(n[0], n[1], n[2]);
      mb.vert(v.p, l > 0 ? [n[0] / l, n[1] / l, n[2] / l] : [0, 1, 0], { color: v.color, param: v.flex, mat: v.mat });
    });
    for (let k = 0; k < this.t.length; k += 3) mb.tri(base + this.t[k], base + this.t[k + 1], base + this.t[k + 2]);
    return this;
  }
  get triangles() { return this.t.length / 3; }
}

// ---- small maths ------------------------------------------------------------------------------------------------
export function rotate(q, v) {
  const [x, y, z, w] = q;
  const ix = w * v[0] + y * v[2] - z * v[1], iy = w * v[1] + z * v[0] - x * v[2], iz = w * v[2] + x * v[1] - y * v[0], iw = -x * v[0] - y * v[1] - z * v[2];
  return [ix * w + iw * -x + iy * -z - iz * -y, iy * w + iw * -y + iz * -x - ix * -z, iz * w + iw * -z + ix * -y - iy * -x];
}
// Yaw (about +y) of a quaternion's local +x axis, in the engine's convention (heading = (cos yaw, -sin yaw)).
export function yawOf(q) { const f = rotate(q, [1, 0, 0]); return Math.atan2(-f[2], f[0]); }
// Body orientation with +x forward: yaw about +y, then pitch about local z (nose up > 0), then roll about local x.
export function quatYPR(yaw, pitch, roll, out = [0, 0, 0, 1]) {
  const cy = Math.cos(yaw / 2), sy = Math.sin(yaw / 2), cp = Math.cos(pitch / 2), sp = Math.sin(pitch / 2), cr = Math.cos(roll / 2), sr = Math.sin(roll / 2);
  // qy * qz
  const ax = sy * sp, ay = sy * cp, az = cy * sp, aw = cy * cp;
  // (qy * qz) * qx
  out[0] = aw * sr + ax * cr; out[1] = ay * cr + az * sr; out[2] = az * cr - ay * sr; out[3] = aw * cr - ax * sr;
  return out;
}
export function qmul(a, b) {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}
export const wrap = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const hexRGB = h => [(h >> 16) & 255, (h >> 8) & 255, h & 255];

function clampG(g, n) { return g < 0 ? 0 : g > n ? n : g; }

// Two-pass chamfer distance (units) from every cell centre to the nearest blocked cell.
function chamfer(blocked, n, cell) {
  const INF = 1e9, d = new Float32Array(n * n);
  for (let k = 0; k < n * n; k++) d[k] = blocked[k] ? 0 : INF;
  const a = 1, b = Math.SQRT2;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const k = j * n + i; let v = d[k];
    if (i > 0) v = Math.min(v, d[k - 1] + a);
    if (j > 0) { v = Math.min(v, d[k - n] + a); if (i > 0) v = Math.min(v, d[k - n - 1] + b); if (i < n - 1) v = Math.min(v, d[k - n + 1] + b); }
    d[k] = v;
  }
  for (let j = n - 1; j >= 0; j--) for (let i = n - 1; i >= 0; i--) {
    const k = j * n + i; let v = d[k];
    if (i < n - 1) v = Math.min(v, d[k + 1] + a);
    if (j < n - 1) { v = Math.min(v, d[k + n] + a); if (i < n - 1) v = Math.min(v, d[k + n + 1] + b); if (i > 0) v = Math.min(v, d[k + n - 1] + b); }
    d[k] = v;
  }
  for (let k = 0; k < n * n; k++) d[k] = Math.min(d[k], 40) * cell - (blocked[k] ? 0 : cell * 0.5);
  return d;
}
