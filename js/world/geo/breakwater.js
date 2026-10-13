// Breakwater: rubble mound dressed with armour boulders, a concrete crown wall and walkway along its crest,
// the red-and-white lighthouse on its round head, and the lighthouse's spinning lamp (obj LAMP).
// Rocks are seeded low-poly convex hulls, flat shaded. Everything is cut cleanly at x = B - 0.005.
// The seabed mound itself (ROCK colour) comes from terrain.js; this file only dresses it.
import { MAT, mixHex } from '../../gpu/mesh.js';
import { makeRand } from '../../gpu/math.js';
import { OBJ } from '../env.js';
import { B, BW, LIGHTHOUSE, floorHeight } from '../layout.js';

const XC = B - 0.005;                         // clean cut at the block's right face
const LX = LIGHTHOUSE.x, LZ = LIGHTHOUSE.z;
const PLAT_R = LIGHTHOUSE.baseR + 0.028;      // round concrete platform on the head
const PLAT_TOP = BW.crestY + 0.025;
const WALK_Y = BW.crestY + 0.02;              // walkway top
const WALK_IN = -0.088, WALK_OUT = 0.098;     // walkway slab edges, z offset from BW.z
const WALK_X0 = LX + 0.085;
const WALL_IN = 0.025, WALL_OUT_TOP = 0.079, WALL_OUT_FOOT = 0.098; // crown wall faces, z offset from BW.z
const WALL_X0 = LX + 0.18;                    // the wall stops short of the lighthouse platform
const TOWER_Y0 = PLAT_TOP + 0.01, TOWER_Y1 = LIGHTHOUSE.towerTop - 0.028;
const TOWER_R0 = 0.07, TOWER_R1 = 0.054;
const GAL_R = 0.084, GAL_Y = LIGHTHOUSE.towerTop, RAIL_Y = GAL_Y + 0.028;
const LAMP_Y = LIGHTHOUSE.towerTop + 0.055;   // where rig.js puts the LAMP object
const RAIL_TOP = WALK_Y + 0.026, PRAIL_R = PLAT_R - 0.006; // walkway and platform railings
const LANT_R = 0.048, LANT_Y0 = GAL_Y + 0.018, LANT_Y1 = LIGHTHOUSE.lanternTop - 0.033;

const RED = 0xd23c2c, WHITE = 0xf4f1ea, DARK = 0x2d3136, CONC = 0xd6d2c9;
const ROCK_DRY = [0xdcd8d0, 0xc9c3b8, 0xb3ada2, 0xd2cdc3];
const ROCK_WET = [0xb4ad9f, 0xa7a093, 0xaaa690, 0xbab3a4];
const ROCK_SEA = [0xa29b8b, 0x948e7d, 0xa8a18f, 0x8d8a75, 0x99997f];
const WEED_COL = [0x6a9a3c, 0x7fa944, 0x557f36, 0x93a043, 0x8f7034, 0xa3823a, 0x7a5f2c];

export const points = {
  // gull perches: crown wall top and the lighthouse's ventilator ball
  perches: [
    ...[1.45, 1.75, 2.05, 2.35].map(x => [x, BW.wallTop, BW.z + (WALL_IN + WALL_OUT_TOP) / 2]),
    [LX, LIGHTHOUSE.lanternTop, LZ],
  ],
  // four spots on the gallery's top rail
  gallery: [0.25, 0.75, 1.25, 1.75].map(k => [LX + Math.cos(k * Math.PI) * GAL_R, RAIL_Y + 0.002, LZ + Math.sin(k * Math.PI) * GAL_R]),
};

export function build(mb, ctx) {
  mb.push();
  mb.set({ obj: 0, param: 0, mat: MAT.PAINT });
  const rand = makeRand(4711);
  crown(mb);
  const rocks = placeRocks(rand);
  for (const r of rocks) dressRock(mb, r, rand);
  looseWeed(mb, rand);
  lighthouse(mb);
  lamp(mb);
  mb.pop();
}

// ---- small vector helpers ---------------------------------------------------------------------
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ---- convex hull (incremental), faces wound outward ---------------------------------------------
function hull(P) {
  const n = P.length;
  if (n < 4) return null;
  let i0 = 0;
  for (let k = 1; k < n; k++) if (P[k][0] < P[i0][0]) i0 = k;
  let i1 = -1, best = 0;
  for (let k = 0; k < n; k++) { const d = Math.hypot(...sub(P[k], P[i0])); if (d > best) { best = d; i1 = k; } }
  if (i1 < 0) return null;
  const dir = norm(sub(P[i1], P[i0]));
  let i2 = -1; best = 0;
  for (let k = 0; k < n; k++) { const d = Math.hypot(...cross(sub(P[k], P[i0]), dir)); if (d > best) { best = d; i2 = k; } }
  if (i2 < 0 || best < 1e-6) return null;
  const pn = norm(cross(sub(P[i1], P[i0]), sub(P[i2], P[i0])));
  let i3 = -1; best = 0;
  for (let k = 0; k < n; k++) { const d = Math.abs(dot(sub(P[k], P[i0]), pn)); if (d > best) { best = d; i3 = k; } }
  if (i3 < 0 || best < 1e-6) return null;
  const mk = (a, b, c) => { const nn = norm(cross(sub(P[b], P[a]), sub(P[c], P[a]))); return { v: [a, b, c], n: nn, d: dot(nn, P[a]) }; };
  let faces = [];
  for (const [a, b, c, o] of [[i0, i1, i2, i3], [i0, i1, i3, i2], [i0, i2, i3, i1], [i1, i2, i3, i0]]) {
    let f = mk(a, b, c);
    if (dot(f.n, P[o]) - f.d > 0) f = mk(a, c, b);
    faces.push(f);
  }
  const tet = new Set([i0, i1, i2, i3]);
  for (let k = 0; k < n; k++) {
    if (tet.has(k)) continue;
    const p = P[k];
    const vis = faces.map(f => dot(f.n, p) - f.d > 1e-7);
    if (!vis.some(Boolean)) continue;
    const edges = new Set();
    faces.forEach((f, i) => { if (vis[i]) for (let j = 0; j < 3; j++) edges.add(f.v[j] * 4096 + f.v[(j + 1) % 3]); });
    const keep = faces.filter((f, i) => !vis[i]);
    faces.forEach((f, i) => {
      if (!vis[i]) return;
      for (let j = 0; j < 3; j++) {
        const a = f.v[j], b = f.v[(j + 1) % 3];
        if (!edges.has(b * 4096 + a)) keep.push(mk(a, b, k));
      }
    });
    faces = keep;
  }
  return faces.map(f => f.v);
}

// Clip a convex point set (with its hull faces) to x <= X: the inside points plus the edge crossings.
function clipX(P, faces, X) {
  const out = P.filter(p => p[0] <= X);
  const seen = new Set();
  for (const f of faces) for (let j = 0; j < 3; j++) {
    const a = f[j], b = f[(j + 1) % 3];
    const key = Math.min(a, b) * 4096 + Math.max(a, b);
    if (seen.has(key)) continue;
    seen.add(key);
    const pa = P[a], pb = P[b];
    if ((pa[0] - X) * (pb[0] - X) < 0) out.push(lerp3(pa, pb, (X - pa[0]) / (pb[0] - pa[0])));
  }
  return out;
}

// ---- the mound -----------------------------------------------------------------------------------
const surf = (x, z) => floorHeight(x, z);
function surfNormal(x, z) {
  const e = 0.01;
  const hx = (surf(x + e, z) - surf(x - e, z)) / (2 * e), hz = (surf(x, z + e) - surf(x, z - e)) / (2 * e);
  return norm([-hx, 1, -hz]);
}
// distance from the breakwater's centre line (or from the head's centre), and which side of the trunk
function moundD(x, z) { return x >= BW.headX ? Math.abs(z - BW.z) : Math.hypot(x - BW.headX, z - BW.z); }

// A rock's local frame: y along the (tilted) surface normal, random yaw about it.
function frame(nrm, rand, tilt) {
  const up = norm(add(nrm, [(rand() - 0.5) * tilt, 0, (rand() - 0.5) * tilt]));
  const a = rand() * Math.PI * 2;
  const h = [Math.cos(a), 0, Math.sin(a)];
  const ex = norm(sub(h, mul(up, dot(h, up))));
  const ez = cross(ex, up);
  return [ex, up, ez];
}

// Rock outline points: a tapered, skewed box with some corners knocked off, like a quarried armour block.
// chop is the chance each corner is chipped (three points along its edges instead of the corner).
function rockShape(rand, chop, sx, sy, sz) {
  const pts = [];
  const taper = 0.7 + 0.3 * rand();
  const kx = (rand() - 0.5) * 0.35 * sx, kz = (rand() - 0.5) * 0.35 * sz;
  for (const X of [-1, 1]) for (const Y of [-1, 1]) for (const Z of [-1, 1]) {
    const t = Y > 0 ? taper : 1;
    const c = [X * sx * t * (0.8 + 0.3 * rand()) + (Y > 0 ? kx : 0), Y * sy * (0.75 + 0.4 * rand()), Z * sz * t * (0.8 + 0.3 * rand()) + (Y > 0 ? kz : 0)];
    if (rand() < chop) {
      pts.push([c[0] - X * sx * (0.25 + 0.45 * rand()), c[1], c[2]]);
      pts.push([c[0], c[1] - Y * sy * (0.25 + 0.45 * rand()), c[2]]);
      pts.push([c[0], c[1], c[2] - Z * sz * (0.25 + 0.45 * rand())]);
    } else pts.push(c);
  }
  return pts;
}

// Is a candidate rock clear of the walkway, crown wall and lighthouse platform?
function clearOfStructures(x, z, rx, top) {
  const dz = z - BW.z;
  const dh = Math.hypot(x - LX, z - LZ);
  if (dh < PLAT_R + 0.5 * rx) return false;
  if (dh < PLAT_R + 0.06 && top > PLAT_TOP + 0.022) return false;
  if (x > WALK_X0 - 0.6 * rx) {
    if (dz > WALK_IN - 0.62 * rx && dz < WALK_OUT + 0.35 * rx) return false;
    if (dz < 0 && dz > WALK_IN - 0.08 && top > WALK_Y + 0.022) return false;
    if (dz > 0 && x > WALL_X0 && dz < WALK_OUT + 0.10 && top > BW.wallTop - 0.024) return false;
    if (dz > 0 && x <= WALL_X0 && dz < WALK_OUT + 0.08 && top > WALK_Y + 0.03) return false;
  }
  return true;
}

function placeRocks(rand) {
  const rocks = [];
  const CELL = 0.06, grid = new Map();
  const key = (i, j) => i * 1000 + j;
  const addRock = r => {
    const k = key(Math.floor(r.c[0] / CELL), Math.floor(r.c[2] / CELL));
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(r);
    rocks.push(r);
  };
  const fits = (c, rx, f) => {
    const i0 = Math.floor(c[0] / CELL), j0 = Math.floor(c[2] / CELL);
    for (let i = i0 - 2; i <= i0 + 2; i++) for (let j = j0 - 2; j <= j0 + 2; j++) {
      const list = grid.get(key(i, j));
      if (!list) continue;
      for (const o of list) {
        const d = Math.hypot(c[0] - o.c[0], (c[1] - o.c[1]) * 1.2, c[2] - o.c[2]);
        if (d < (rx + o.rx) * f) return false;
      }
    }
    return true;
  };
  const passes = [
    // armour: big blocks near the crest and upper slopes, then medium ones filling the gaps
    { n: 9000, r: [0.036, 0.05], y: [-0.03, 0.3], f: 0.74, chop: 0.55, flat: [0.62, 0.82], emb: [0.15, 0.4], armour: true },
    { n: 9000, r: [0.025, 0.036], y: [-0.07, 0.3], f: 0.74, chop: 0.5, flat: [0.6, 0.85], emb: [0.15, 0.45], armour: true },
    // under water: smaller rocks tumbling down to the toe, sparser toward the bottom
    { n: 9000, r: [0.016, 0.0225], y: [-0.6, -0.02], f: 0.95, chop: 0.3, flat: [0.55, 0.85], emb: [0.1, 0.4] },
    { n: 9000, r: [0.01, 0.016], y: [-0.6, -0.02], f: 1.0, chop: 0.2, flat: [0.55, 0.85], emb: [0.1, 0.4] },
  ];
  for (const P of passes) {
    for (let t = 0; t < P.n; t++) {
      const x = BW.headX - BW.toeHalf - 0.02 + rand() * (B + 0.03 - (BW.headX - BW.toeHalf - 0.02));
      const z = BW.z - BW.toeHalf - 0.02 + rand() * (2 * BW.toeHalf + 0.04);
      const d = moundD(x, z);
      if (d > BW.toeHalf + 0.015) continue;
      const sy0 = surf(x, z);
      if (sy0 < P.y[0] || sy0 > P.y[1]) continue;
      const r = P.r[0] + (P.r[1] - P.r[0]) * rand();
      // sparser toward the toe for the small ones
      const toe = sstep(0.22, BW.toeHalf, d);
      const f = P.armour ? P.f : P.f + 0.9 * toe;
      const sx = r * (0.9 + 0.25 * rand()), sz = r * (0.85 + 0.2 * rand());
      const sy = r * (P.flat[0] + (P.flat[1] - P.flat[0]) * rand());
      const nrm = surfNormal(x, z);
      const emb = P.emb[0] + (P.emb[1] - P.emb[0]) * rand();
      let c = add([x, sy0, z], mul(nrm, sy * emb));
      // seaward armour piled up against the crown wall as a berm
      const dz = z - BW.z;
      if (P.armour && dz > 0 && x > WALL_X0 - 0.05) c[1] += 0.03 * (1 - sstep(0.1, 0.2, dz));
      const rx = (sx + sz) / 2;
      const top = c[1] + sy;
      if (!clearOfStructures(c[0], c[2], rx, top)) continue;
      if (!fits(c, rx, f)) continue;
      addRock({ c, rx, sx, sy, sz, nrm, chop: P.chop, armour: !!P.armour });
    }
  }
  return rocks;
}

function rockColour(y, rand) {
  let c;
  if (y > 0.03) c = rand.pick(ROCK_DRY);
  else if (y > -0.05) c = rand.pick(ROCK_WET);
  else c = rand.pick(ROCK_SEA);
  return mixHex(c, rand() < 0.5 ? 0xffffff : 0x8a8478, rand() * 0.08);
}

function dressRock(mb, r, rand) {
  const [ex, ey, ez] = frame(r.nrm, rand, r.armour ? 0.6 : 0.9);
  const local = rockShape(rand, r.chop, r.sx, r.sy, r.sz);
  let W = local.map(p => add(r.c, add(mul(ex, p[0]), add(mul(ey, p[1]), mul(ez, p[2])))));
  let faces = hull(W);
  if (!faces) return;
  if (W.some(p => p[0] > XC)) {
    if (W.every(p => p[0] >= XC)) return;
    W = clipX(W, faces, XC);
    faces = hull(W);
    if (!faces) return;
  }
  const col = rockColour(r.c[1], rand);
  // faces wholly buried in the mound are never seen
  const buried = W.map(p => p[1] < surf(p[0], p[2]) - 0.006);
  for (const f of faces) {
    if (buried[f[0]] && buried[f[1]] && buried[f[2]]) continue;
    mb.poly([W[f[0]], W[f[1]], W[f[2]]], { mat: MAT.ROCK, color: col });
  }
  r.W = W;
  const y = r.c[1];
  if (r.c[0] > B - 0.03) return;
  // mussels around the waterline and just below
  if (y < 0.04 && y > -0.08 && rand() < 0.45) {
    const band = faces.map(f => ({ f, n: norm(cross(sub(W[f[1]], W[f[0]]), sub(W[f[2]], W[f[0]]))), cy: (W[f[0]][1] + W[f[1]][1] + W[f[2]][1]) / 3 }))
      .filter(e => e.n[1] > 0.15 && e.cy < 0.025 && e.cy > -0.05);
    if (band.length) { const e = rand.pick(band); mussels(mb, rand, e.f.map(i => W[i]), e.n, rand.int(5, 9)); }
  }
  // weed on the rocks under water
  if (y < -0.05 && rand() < 0.6) {
    let topP = W[0];
    for (const p of W) if (p[1] > topP[1]) topP = p;
    const root = lerp3(topP, r.c, 0.18);
    tuft(mb, rand, root, r.rx, rand.int(3, 5));
  }
}

// A clump of mussels lying on one rock face (tri = its three corners, out = its normal).
function mussels(mb, rand, tri, out, count) {
  let u = rand() * 0.6 + 0.2, v = rand() * 0.6 + 0.2;
  if (u + v > 0.9) { u *= 0.9 / (u + v); v *= 0.9 / (u + v); }
  const c = add(tri[0], add(mul(sub(tri[1], tri[0]), u), mul(sub(tri[2], tri[0]), v)));
  const t1 = norm(sub(tri[1], tri[0])), t2 = cross(out, t1);
  for (let i = 0; i < count; i++) {
    const a = rand() * Math.PI * 2, rr = Math.sqrt(rand()) * 0.009;
    const p = add(c, add(add(mul(t1, Math.cos(a) * rr), mul(t2, Math.sin(a) * rr)), mul(out, 0.0012)));
    if (p[0] > B - 0.02) continue;
    const [ax, ay, az] = frame(out, rand, 0.5);
    // a little triangular bipyramid: two shell tips and a ridge of three points round the middle
    const L = 0.0045 + rand() * 0.0025, H = 0.0026, Wd = 0.0021;
    const tips = [add(p, mul(ax, L)), add(p, mul(ax, -L * 0.8))];
    const mid = [0, 1, 2].map(k => { const a = Math.PI / 2 + k * 2.094; return add(p, add(mul(ay, Math.sin(a) * H), mul(az, Math.cos(a) * Wd))); });
    for (let k = 0; k < 3; k++) for (const t of tips) {
      const tri = [mid[k], mid[(k + 1) % 3], t];
      const nn = cross(sub(tri[1], tri[0]), sub(tri[2], tri[0]));
      if (dot(nn, sub(tri[0], p)) < 0) tri.reverse();
      mb.poly(tri, { mat: MAT.MUSSEL, color: 0x22262e });
    }
  }
}

// A tuft of weed blades rising from a root point; each blade sways more toward its tip.
function tuft(mb, rand, root, spread, count) {
  const col = rand.pick(WEED_COL);
  for (let i = 0; i < count; i++) {
    const r0 = add(root, [(rand() - 0.5) * spread * 0.7, -0.002, (rand() - 0.5) * spread * 0.7]);
    let len = 0.022 + rand() * 0.035;
    if (r0[1] + len > -0.025) len = -0.025 - r0[1];
    if (len < 0.01) continue;
    blade(mb, r0, len, 0.0045 + rand() * 0.003, 0.15 + rand() * 0.45, rand() * Math.PI * 2, mixHex(col, rand() < 0.5 ? 0x2f4a22 : 0xc8c060, rand() * 0.2));
  }
}

function blade(mb, root, len, w, lean, yaw, col) {
  const d1 = norm([Math.sin(lean) * Math.cos(yaw), Math.cos(lean), Math.sin(lean) * Math.sin(yaw)]);
  const d2 = norm([Math.sin(lean * 1.7) * Math.cos(yaw + 0.3), Math.cos(lean * 1.7), Math.sin(lean * 1.7) * Math.sin(yaw + 0.3)]);
  const side = norm(cross(d1, [Math.cos(yaw + 1.2), 0, Math.sin(yaw + 1.2)]));
  const mid = add(root, mul(d1, len * 0.5));
  const tip = add(mid, mul(d2, len * 0.5));
  const n = norm(cross(side, d1));
  const o = t => ({ mat: MAT.WEED, color: col, param: t });
  const b = mb.nv;
  mb.vert(add(root, mul(side, -w * 0.3)), n, o(0));
  mb.vert(add(root, mul(side, w * 0.3)), n, o(0));
  mb.vert(add(mid, mul(side, -w * 0.5)), n, o(0.5));
  mb.vert(add(mid, mul(side, w * 0.5)), n, o(0.5));
  mb.vert(tip, n, o(1));
  mb.tri(b, b + 1, b + 3); mb.tri(b, b + 3, b + 2); mb.tri(b + 2, b + 3, b + 4);
}

// A few weed tufts straight on the mound between the rocks.
function looseWeed(mb, rand) {
  let made = 0;
  for (let t = 0; t < 600 && made < 45; t++) {
    const x = BW.headX - 0.3 + rand() * (B - 0.05 - (BW.headX - 0.3));
    const z = BW.z + (rand() < 0.5 ? -1 : 1) * (0.2 + rand() * 0.18);
    if (moundD(x, z) > BW.toeHalf - 0.02) continue;
    const y = surf(x, z);
    if (y > -0.08) continue;
    tuft(mb, rand, [x, y, z], 0.02, rand.int(2, 4));
    made++;
  }
}

// ---- crown wall and walkway ------------------------------------------------------------------------
// Extrude a closed (dz, y) profile along x from x0 to x1. skipEdges: indices of profile edges to leave out.
function extrudeX(mb, prof, x0, x1, o, skipEdges = [], caps = [true, true]) {
  const zc = prof.reduce((s, p) => s + p[0], 0) / prof.length, yc = prof.reduce((s, p) => s + p[1], 0) / prof.length;
  const Z = p => BW.z + p[0];
  for (let k = 0; k < prof.length; k++) {
    if (skipEdges.includes(k)) continue;
    const a = prof[k], b = prof[(k + 1) % prof.length];
    let q = [[x0, a[1], Z(a)], [x1, a[1], Z(a)], [x1, b[1], Z(b)], [x0, b[1], Z(b)]];
    const nn = cross(sub(q[1], q[0]), sub(q[2], q[0]));
    const mid = [(a[0] + b[0]) / 2 - zc, (a[1] + b[1]) / 2 - yc];
    if (nn[2] * mid[0] + nn[1] * mid[1] < 0) q = q.reverse();
    mb.poly(q, o);
  }
  for (const [x, s, on] of [[x0, -1, caps[0]], [x1, 1, caps[1]]]) {
    if (!on) continue;
    let cap = prof.map(p => [x, p[1], Z(p)]);
    // wind the cap to face outward (Newell x component)
    let ax = 0;
    for (let i = 0; i < cap.length; i++) { const p = cap[i], q = cap[(i + 1) % cap.length]; ax += (p[1] - q[1]) * (p[2] + q[2]); }
    if (Math.sign(ax) !== s) cap = cap.reverse();
    mb.polyFan(cap, o);
  }
}

function crown(mb) {
  const C = { mat: MAT.CONCRETE, color: CONC };
  // walkway slab, full width under the wall too, from the lighthouse platform to the cut face
  const walk = [[WALK_IN, 0.11], [WALK_IN, WALK_Y - 0.004], [WALK_IN + 0.004, WALK_Y], [WALK_OUT, WALK_Y], [WALK_OUT, 0.11]];
  extrudeX(mb, walk, WALK_X0, XC, { ...C, color: 0xdcd8cf }, [4], [false, true]);
  // crown wall, in panels with thin joints on the 0.25 grid (matching the concrete pattern)
  const wall = [[WALL_IN, WALK_Y - 0.002], [WALL_IN, BW.wallTop - 0.007], [WALL_IN + 0.007, BW.wallTop], [WALL_OUT_TOP - 0.006, BW.wallTop],
    [WALL_OUT_TOP, BW.wallTop - 0.008], [WALL_OUT_FOOT, 0.11]];
  const cuts = [WALL_X0];
  for (let x = Math.ceil(WALL_X0 * 4) / 4; x < XC - 0.05; x += 0.25) if (x > WALL_X0 + 0.05) cuts.push(x);
  cuts.push(XC);
  for (let i = 0; i < cuts.length - 1; i++) {
    const a = cuts[i] + (i > 0 ? 0.0018 : 0), b = cuts[i + 1] - (i < cuts.length - 2 ? 0.0018 : 0);
    extrudeX(mb, wall, a, b, C, [5]);
  }
  // a low railing along the harbour edge of the walkway
  const rz = BW.z + WALK_IN + 0.006, ry = RAIL_TOP;
  const rx0 = LX + Math.sqrt(PRAIL_R * PRAIL_R - (rz - LZ) * (rz - LZ)), rx1 = XC - 0.012;
  const nPost = Math.round((rx1 - rx0) / 0.075);
  const R = { mat: MAT.STEEL, color: DARK };
  for (let i = 0; i <= nPost; i++) {
    const x = rx0 + (rx1 - rx0) * i / nPost;
    mb.beam([x, WALK_Y, rz], [x, ry, rz], 0.0026, 0.0026, R);
  }
  mb.tube([[rx0, ry, rz], [rx1, ry, rz]], 0.0017, { ...R, seg: 5 });
  mb.tube([[rx0, ry - 0.011, rz], [rx1, ry - 0.011, rz]], 0.0012, { ...R, seg: 4 });
}

// ---- lighthouse ------------------------------------------------------------------------------------
const towerR = y => TOWER_R0 + (TOWER_R1 - TOWER_R0) * (y - TOWER_Y0) / (TOWER_Y1 - TOWER_Y0);

// Build something facing outward from the tower axis at angle a (local +x = outward, local z = along the wall).
function onTower(mb, a, fn) {
  mb.push();
  mb.translate(LX, 0, LZ);
  mb.rotateY(a);
  fn();
  mb.pop();
}

function lighthouse(mb) {
  const C = { mat: MAT.CONCRETE, color: CONC };
  // platform: concrete drum with a chamfered top edge
  mb.cylinder(LX, 0.07, LZ, PLAT_R, PLAT_TOP - 0.006 - 0.07, { ...C, seg: 36, caps: false });
  mb.cylinder(LX, PLAT_TOP - 0.006, LZ, PLAT_R, 0.006, { ...C, seg: 36, r2: PLAT_R - 0.006, bottom: false });
  // plinth
  mb.cylinder(LX, PLAT_TOP, LZ, TOWER_R0 + 0.007, TOWER_Y0 - PLAT_TOP, { mat: MAT.PAINT, color: 0xe6e2da, seg: 28, bottom: false });
  // railing round the platform's outer edge, joining the walkway railing on the harbour side
  {
    const R = { mat: MAT.STEEL, color: DARK };
    const a0 = Math.asin((WALK_OUT + 0.004) / PRAIL_R), a1 = 2 * Math.PI + Math.asin((WALK_IN + 0.006) / PRAIL_R);
    const n = Math.round((a1 - a0) * PRAIL_R / 0.045);
    const top = [], mid = [];
    for (let k = 0; k <= n * 2; k++) {
      const a = a0 + (a1 - a0) * k / (n * 2), x = LX + Math.cos(a) * PRAIL_R, z = LZ + Math.sin(a) * PRAIL_R;
      top.push([x, RAIL_TOP, z]); mid.push([x, RAIL_TOP - 0.011, z]);
      if (k % 2 === 0 && k < n * 2) mb.beam([x, PLAT_TOP, z], [x, RAIL_TOP, z], 0.0026, 0.0026, R);
    }
    mb.tube(top, 0.0017, { ...R, seg: 5 });
    mb.tube(mid, 0.0012, { ...R, seg: 4 });
  }
  // banded tower: red, white, red, white, red
  const nb = 5, seg = 28;
  for (let i = 0; i < nb; i++) {
    const y0 = TOWER_Y0 + (TOWER_Y1 - TOWER_Y0) * i / nb, y1 = TOWER_Y0 + (TOWER_Y1 - TOWER_Y0) * (i + 1) / nb;
    mb.cylinder(LX, y0, LZ, towerR(y0), y1 - y0, { r2: towerR(y1), seg, caps: false, mat: MAT.PAINT, color: i % 2 ? WHITE : RED });
  }
  // gallery: a white corbel flaring out to a dark deck
  mb.cylinder(LX, TOWER_Y1, LZ, TOWER_R1, GAL_Y - 0.012 - TOWER_Y1, { r2: GAL_R + 0.005, seg, caps: false, mat: MAT.PAINT, color: WHITE });
  mb.cylinder(LX, GAL_Y - 0.012, LZ, GAL_R + 0.006, 0.012, { seg: 32, mat: MAT.STEEL, color: 0x3a3f45 });
  // railing: posts, a top rail and a middle rail
  const R = { mat: MAT.STEEL, color: DARK };
  const np = 16;
  const ring = (r, y, n) => { const pts = []; for (let k = 0; k <= n; k++) { const a = k / n * Math.PI * 2; pts.push([LX + Math.cos(a) * r, y, LZ + Math.sin(a) * r]); } return pts; };
  for (let k = 0; k < np; k++) {
    const a = (k + 0.5) / np * Math.PI * 2;
    const x = LX + Math.cos(a) * GAL_R, z = LZ + Math.sin(a) * GAL_R;
    mb.beam([x, GAL_Y, z], [x, RAIL_Y, z], 0.0026, 0.0026, R);
  }
  mb.tube(ring(GAL_R, RAIL_Y, 32), 0.002, { ...R, seg: 5 });
  mb.tube(ring(GAL_R, GAL_Y + 0.014, 32), 0.0013, { ...R, seg: 4 });
  // lantern: white pedestal, glass with thin white frames, red dome
  mb.cylinder(LX, GAL_Y, LZ, LANT_R + 0.004, LANT_Y0 - GAL_Y, { seg, bottom: false, mat: MAT.PAINT, color: WHITE });
  const nf = 10, W = { mat: MAT.PAINT, color: WHITE };
  const corner = (k, r, y) => { const a = k / nf * Math.PI * 2; return [LX + Math.cos(a) * r, y, LZ + Math.sin(a) * r]; };
  const paneTop = LANT_Y0 + 0.016;
  for (let k = 0; k < nf; k++) {
    mb.beam(corner(k, LANT_R, LANT_Y0), corner(k, LANT_R, LANT_Y1), 0.0032, 0.0032, W);
    // the lower storm panes are glazed; the upper lights are left clear so the lamp shows
    mb.quad(corner(k, LANT_R - 0.001, LANT_Y0), corner(k, LANT_R - 0.001, paneTop), corner(k + 1, LANT_R - 0.001, paneTop), corner(k + 1, LANT_R - 0.001, LANT_Y0), { mat: MAT.GLASS, color: 0x3e5a6c });
  }
  const polyRing = (r, y) => { const pts = []; for (let k = 0; k <= nf; k++) pts.push(corner(k, r, y)); return pts; };
  mb.tube(polyRing(LANT_R, paneTop), 0.0018, { ...W, seg: 4 });
  mb.tube(polyRing(LANT_R, LANT_Y1 - 0.001), 0.0026, { ...W, seg: 4 });
  // roof: red eave ring, its underside, the dome and a little ventilator ball
  const eR = LANT_R + 0.009;
  mb.cylinder(LX, LANT_Y1, LZ, eR, 0.005, { seg, caps: false, mat: MAT.PAINT, color: RED });
  const under = [];
  for (let k = 0; k < seg; k++) { const a = k / seg * Math.PI * 2; under.push([LX + Math.cos(a) * eR, LANT_Y1, LZ + Math.sin(a) * eR]); }
  mb.poly(under, { mat: MAT.PAINT, color: 0xb83426 });
  const domeY = LANT_Y1 + 0.005, domeH = LIGHTHOUSE.lanternTop - 0.0105 - domeY;
  const prof = [];
  for (let i = 0; i <= 6; i++) { const t = i / 6 * Math.PI / 2; prof.push([eR * Math.cos(t), domeY + domeH * Math.sin(t)]); }
  mb.lathe(LX, LZ, prof, { seg, mat: MAT.PAINT, color: RED });
  mb.cylinder(LX, domeY + domeH - 0.001, LZ, 0.0022, 0.006, { seg: 6, mat: MAT.STEEL, color: DARK });
  mb.sphere(LX, LIGHTHOUSE.lanternTop - 0.0045, LZ, 0.0045, { seg: 8, rings: 5, mat: MAT.STEEL, color: DARK });

  // door facing the walkway (+x), with a white frame and a little hood
  onTower(mb, 0, () => {
    const r = TOWER_R0 - 0.003;
    mb.boxMM(r, TOWER_Y0, -0.0155, r + 0.0075, TOWER_Y0 + 0.044, 0.0155, { mat: MAT.PAINT, color: WHITE, skip: ['bottom'] });
    mb.boxMM(r, TOWER_Y0, -0.011, r + 0.009, TOWER_Y0 + 0.037, 0.011, { mat: MAT.PAINT, color: 0x2c5a6e, skip: ['bottom'] });
    mb.boxMM(r, TOWER_Y0 + 0.044, -0.019, r + 0.013, TOWER_Y0 + 0.048, 0.019, { mat: MAT.PAINT, color: RED });
    mb.boxMM(r + 0.0088, TOWER_Y0 + 0.017, 0.006, r + 0.0105, TOWER_Y0 + 0.02, 0.0085, { mat: MAT.STEEL, color: 0xd8b04a });
  });
  // small windows up the tower, each in a white frame
  const wins = [[-Math.PI / 2, 0.33], [Math.PI * 0.8, 0.40], [-Math.PI * 0.15, 0.475], [Math.PI * 0.55, 0.53]];
  for (const [a, y] of wins) {
    onTower(mb, a, () => {
      const r = towerR(y) - 0.004;
      mb.boxMM(r, y - 0.014, -0.0095, r + 0.0052, y + 0.014, 0.0095, { mat: MAT.PAINT, color: WHITE });
      mb.boxMM(r, y - 0.0105, -0.006, r + 0.0058, y + 0.0105, 0.006, { mat: MAT.GLASS, color: 0x34495a });
    });
  }
}

// ---- the spinning lamp (obj LAMP), built around its own origin ------------------------------------
function lamp(mb) {
  mb.push();
  mb.set({ obj: OBJ.LAMP, param: 0 });
  const floor = LANT_Y0 - LAMP_Y;
  const brass = { mat: MAT.STEEL, color: 0x8a6f3a };
  mb.cylinder(0, floor, 0, 0.0065, -0.013 - floor, { seg: 8, mat: MAT.STEEL, color: 0x4a4238, bottom: false });
  mb.cylinder(0, -0.016, 0, 0.012, 0.004, { ...brass, seg: 12 });
  mb.cylinder(0, -0.012, 0, 0.008, 0.024, { seg: 10, caps: false, mat: MAT.LAMP, param: 0.6, color: 0xfff2c4 });
  mb.cylinder(0, 0.012, 0, 0.012, 0.004, { ...brass, seg: 12, bottom: true });
  mb.cylinder(0, 0.016, 0, 0.007, 0.004, { ...brass, seg: 10, r2: 0.003 });
  // two opposite lens panels in brass frames
  for (const s of [-1, 1]) {
    const x0 = s > 0 ? 0.0105 : -0.0195, x1 = s > 0 ? 0.0195 : -0.0105;
    mb.boxMM(x0 + (s > 0 ? 0 : 0.002), -0.019, -0.0165, x1 - (s > 0 ? 0.002 : 0), 0.019, 0.0165, brass);
    const fx0 = s > 0 ? x1 - 0.0021 : x0 - 0.0006, fx1 = s > 0 ? x1 + 0.0006 : x0 + 0.0021;
    mb.boxMM(fx0, -0.016, -0.0135, fx1, 0.016, 0.0135, { mat: MAT.LAMP, param: 1, color: 0xfff2c4 });
  }
  mb.pop();
}
