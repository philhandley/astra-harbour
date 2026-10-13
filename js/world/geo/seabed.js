// Seabed props seen through the jelly: swaying weed tufts, stones, starfish, shells, low silt drifts,
// the old anchor with its chain (SEABED_SPOTS.anchor) and the lost tyre with a crab (SEABED_SPOTS.tyre).
// Handy views: dev/view.html?b=seabed&cam=-0.5,1.0,0.9,-1.55,-0.4,0.8 (anchor)
//              dev/view.html?b=seabed&cam=0.3,0.95,0.6,0.12,-0.4,0.38 (tyre and crab)
//              dev/view.html?b=seabed&cam=0.1,0.12,2.2,0.0,-0.3,2.0 (through the front cut face)
import { MAT, mixHex } from '../../gpu/mesh.js';
import { makeRand } from '../../gpu/math.js';
import { SEA, QUAY_Z, BW, BOAT_MOOR, FISHBOAT, SEABED_SPOTS, MOORING_BUOYS, CHANNEL_BUOY, floorHeight, inBreakwater, inPier } from '../layout.js';

const EDGE = 2.55;                 // props stay inside x, z in [-EDGE, EDGE]
const Z0 = QUAY_Z + 0.04;          // and clear of the quay wall
const CEIL = SEA - 0.12;           // nothing rises above this
const LOW = 0.03;                  // height cap over the ship's berth and under the fishing boats
const BERTH = { x0: -2.0, x1: 0.1, z1: -0.30 };
const UP = [0, 1, 0];
const SAND = 0xdccfb2;                // the seabed's own sand colour (terrain.js)
const TAU = Math.PI * 2;

// ---- low silt drifts: [x, z, half length, half width, angle, height]. Every prop sits on top of them. ----------
const SILT = [
  [-0.62, 1.02, 0.36, 0.15, 0.35, 0.011],
  [-1.95, 1.45, 0.30, 0.13, -0.5, 0.010],
  [0.22, 1.85, 0.32, 0.12, 0.15, 0.010],
  [-1.05, 2.12, 0.26, 0.11, -0.2, 0.009],
  [-2.05, 0.15, 0.24, 0.10, 0.8, 0.008],
  [1.78, 0.22, 0.24, 0.09, -0.1, 0.008],
  [0.16, 0.39, 0.13, 0.075, 0.6, 0.010],    // drifted against the lost tyre
  [-1.50, 0.37, 0.13, 0.065, -0.4, 0.006],  // banked up behind the anchor's crown
  [-0.40, -0.12, 0.30, 0.10, 0.05, 0.007],
].map((s, i) => {
  const r = makeRand(900 + i);
  return { x: s[0], z: s[1], rx: s[2], rz: s[3], rot: s[4], h: s[5], p1: r() * TAU, p2: r() * TAU };
});

const wob = (d, a) => 1 + 0.16 * Math.sin(2 * a + d.p1) + 0.09 * Math.sin(3 * a + d.p2);
function siltU(d, x, z) {
  const dx = x - d.x, dz = z - d.z, c = Math.cos(d.rot), s = Math.sin(d.rot);
  const lx = (dx * c + dz * s) / d.rx, lz = (-dx * s + dz * c) / d.rz;
  return Math.hypot(lx, lz) / wob(d, Math.atan2(lz, lx));
}
const siltBump = (d, u) => (u < 1 ? d.h * (1 - u * u) * (1 - u * u) : 0);

// Ground height: the seabed plus the silt drifts.
function ground(x, z) {
  let y = floorHeight(x, z);
  for (const d of SILT) {
    if (Math.abs(x - d.x) > d.rx * 1.3 || Math.abs(z - d.z) > d.rx * 1.3) continue;
    y += siltBump(d, siltU(d, x, z));
  }
  return y;
}

// Where fish gather when fed: on the sand just off the west end of the pier arm.
const FEED = [[0.80, -0.22], [0.74, -0.05], [0.91, 0.08], [0.62, -0.15]];
export const points = { feedSpots: FEED.map(([x, z]) => [x, ground(x, z), z]) };

// ---- placement rules --------------------------------------------------------------------------------------------
function free(x, z, r = 0) {
  return z - r > Z0 && z + r < EDGE && x - r > -EDGE && x + r < EDGE && !inBreakwater(x, z, 0.02 + r) && !inPier(x, z, 0.035 + r);
}
// Tallest a prop may be at (x, z).
function maxH(x, z) {
  let h = CEIL - ground(x, z);
  if (x > BERTH.x0 - 0.04 && x < BERTH.x1 + 0.04 && z < BERTH.z1 + 0.04) h = Math.min(h, LOW);
  for (const m of BOAT_MOOR) {
    if (Math.abs(x - m.x) < FISHBOAT.length / 2 + 0.06 && Math.abs(z - m.z) < FISHBOAT.beam / 2 + 0.06) h = Math.min(h, LOW);
  }
  return h;
}
// Spots kept clear of scattered props (anchor, chain, tyre, feed spots, buoy moorings).
const RES = [];
const reserve = (x, z, r) => RES.push([x, z, r]);
const clearOf = (x, z, r) => RES.every(([a, b, rr]) => Math.hypot(x - a, z - b) > rr + r);
const open = (x, z, r) => free(x, z, r) && clearOf(x, z, r);

// ---- small vector helpers ---------------------------------------------------------------------------------------
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scl = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const nrm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

// ---- emitters (the mesh builder M; local space = M's current transform) ------------------------------------------
let M = null;
const LP = [], LN = [];
function V(p, n, o) { const i = M.vert(p, n, o); LP[i] = p; LN[i] = n; return i; }
// Triangle wound so its front faces the way its vertex normals point.
function T(a, b, c) {
  const g = cross(sub(LP[b], LP[a]), sub(LP[c], LP[a]));
  const s = add(add(LN[a], LN[b]), LN[c]);
  if (dot(g, s) < 0) M.tri(a, c, b); else M.tri(a, b, c);
}
// Flat triangle facing toward ref. pr: optional per-vertex params.
function facet(p1, p2, p3, ref, o, pr) {
  let n = nrm(cross(sub(p2, p1), sub(p3, p1)));
  let q = pr;
  if (dot(n, ref) < 0) { n = scl(n, -1); [p2, p3] = [p3, p2]; if (pr) q = [pr[0], pr[2], pr[1]]; }
  const a = M.vert(p1, n, q ? { ...o, param: q[0] } : o);
  const b = M.vert(p2, n, q ? { ...o, param: q[1] } : o);
  const c = M.vert(p3, n, q ? { ...o, param: q[2] } : o);
  M.tri(a, b, c);
}
// Open tube through pts with a radius per point; the ring frame uses `up` (tangents must not be parallel to it).
function rod(pts, radii, seg, up, o) {
  const n = pts.length, rows = [];
  for (let j = 0; j < n; j++) {
    const t = nrm(sub(pts[Math.min(n - 1, j + 1)], pts[Math.max(0, j - 1)]));
    const s = nrm(cross(t, up)), u = cross(s, t), row = [];
    for (let k = 0; k < seg; k++) {
      const a = (k / seg) * TAU, nn = add(scl(s, Math.cos(a)), scl(u, Math.sin(a)));
      row.push(V(add(pts[j], scl(nn, radii[j])), nn, o));
    }
    rows.push(row);
  }
  for (let j = 0; j < n - 1; j++) for (let k = 0; k < seg; k++) {
    const k2 = (k + 1) % seg;
    T(rows[j][k], rows[j + 1][k], rows[j + 1][k2]); T(rows[j][k], rows[j + 1][k2], rows[j][k2]);
  }
}
// Closed tube loop through pts lying in the plane with normal pn.
function loop(pts, r, seg, pn, o, twist = 0) {
  const n = pts.length, rows = [];
  for (let j = 0; j < n; j++) {
    const t = nrm(sub(pts[(j + 1) % n], pts[(j - 1 + n) % n]));
    const s = nrm(cross(t, pn)), u = cross(s, t), row = [];
    for (let k = 0; k < seg; k++) {
      const a = (k / seg) * TAU + twist, nn = add(scl(s, Math.cos(a)), scl(u, Math.sin(a)));
      row.push(V(add(pts[j], scl(nn, r)), nn, o));
    }
    rows.push(row);
  }
  for (let j = 0; j < n; j++) for (let k = 0; k < seg; k++) {
    const j2 = (j + 1) % n, k2 = (k + 1) % seg;
    T(rows[j][k], rows[j2][k], rows[j2][k2]); T(rows[j][k], rows[j2][k2], rows[j][k2]);
  }
}

// ---- weed ---------------------------------------------------------------------------------------------------------
const GREENS = [0x4f8a3c, 0x6a9c46, 0x4f8a3c, 0x5c9440];
const BROWNS = [0x8a7a3a, 0x7d7034, 0x6f7a36];

// One tapered, slightly folded blade from root (world) rising H, leaning toward angle ang.
function blade(root, H, W, ang, lean, twist, kelp, col, wave) {
  const segs = kelp ? 5 : 3;
  const lx = Math.cos(ang), lz = Math.sin(ang);
  const sway = Math.sqrt(Math.min(1, H / 0.09));
  const rows = [];
  for (let s = 0; s <= segs; s++) {
    const t = s / segs;
    const c = [root[0] + lx * lean * H * t * t, root[1] + H * t, root[2] + lz * lean * H * t * t];
    const tan = nrm([lx * 2 * lean * t, 1, lz * 2 * lean * t]);
    const a = ang + Math.PI / 2 + twist * t;
    let side = [Math.cos(a), 0, Math.sin(a)];
    side = nrm(sub(side, scl(tan, dot(side, tan))));
    if (wave) { const k = wave * Math.sin(t * Math.PI) * H * 0.25; c[0] += side[0] * k; c[2] += side[2] * k; }
    const fold = cross(side, tan);
    const w = kelp ? W * (0.45 + 0.8 * Math.sin(Math.PI * t * 0.9)) * (1 - t * t * t * t) : W * Math.pow(1 - t, 0.85);
    rows.push({
      L: sub(c, scl(side, w / 2)), Mid: add(c, scl(fold, w * 0.12)), R: add(c, scl(side, w / 2)),
      p: t * sway, n: fold, col: mixHex(col, 0xd6e27a, 0.14 * t), tip: s === segs,
    });
  }
  // shared vertices with the blade's face normal, so each blade shades as one soft leaf
  const ids = rows.map(r => {
    const o = { mat: MAT.WEED, color: r.col, param: r.p };
    return r.tip ? [V(r.Mid, r.n, o)] : [V(r.L, r.n, o), V(r.Mid, r.n, o), V(r.R, r.n, o)];
  });
  for (let s = 0; s < segs; s++) {
    const A = ids[s], Bq = ids[s + 1];
    if (Bq.length === 1) { T(A[0], A[1], Bq[0]); T(A[1], A[2], Bq[0]); continue; }
    T(A[0], A[1], Bq[1]); T(A[0], Bq[1], Bq[0]);
    T(A[1], A[2], Bq[2]); T(A[1], Bq[2], Bq[1]);
  }
}

// A tuft: n blades fanning out from around (x, z). kelp: share of tall ribbon blades.
function tuft(rand, x, z, opt) {
  const { n = 11, spread = 0.045, hMin = 0.035, hMax = 0.08, kelp = 0, check = true } = opt;
  const pal = rand() < 0.3 ? BROWNS : GREENS;
  let made = 0;
  for (let i = 0; i < n * 3 && made < n; i++) {
    const a = rand() * TAU, d = spread * Math.sqrt(rand());
    const bx = x + Math.cos(a) * d, bz = z + Math.sin(a) * d;
    if (check && !free(bx, bz, 0.013)) continue;
    const isKelp = rand() < kelp;
    let H = isKelp ? rand.range(0.085, 0.12) : rand.range(hMin, hMax) * (1.15 - 0.4 * d / spread);
    H = Math.min(H, maxH(bx, bz) - 0.006);
    if (H < 0.014) continue;
    const short = H < LOW + 0.001;
    const col = mixHex(isKelp ? rand.pick(BROWNS) : rand.pick(pal), 0x000000, rand.range(-0.05, 0.12));
    const W = isKelp ? rand.range(0.014, 0.02) : Math.max(0.0065, H * rand.range(0.16, 0.22));
    const lean = short ? rand.range(0.4, 0.8) : isKelp ? rand.range(0.15, 0.4) : rand.range(0.25, 0.65);
    // blades splay out from the middle of the tuft, but never over the quay, the block edge or the berth
    let ang = a + rand.range(-0.45, 0.45);
    const reach = lean * H + 0.01;
    const tipOk = g => free(bx + Math.cos(g) * reach, bz + Math.sin(g) * reach, 0.004) && maxH(bx + Math.cos(g) * reach, bz + Math.sin(g) * reach) > H;
    if (check && !tipOk(ang)) { ang += Math.PI; if (!tipOk(ang)) continue; }
    blade([bx, ground(bx, bz) - 0.004, bz], H, W, ang, lean, rand.range(-0.6, 0.6), isKelp, col,
      isKelp ? rand.range(-1, 1) : 0);
    made++;
  }
}

// ---- stones, starfish, shells -------------------------------------------------------------------------------------
const STONES = [0xa59d90, 0xc2baa9, 0x8f877b, 0xa59d90, 0xb3aa98];

function stone(rand, x, z, r, h) {
  if (!free(x, z, r * 1.2)) return;
  h = Math.min(h, maxH(x, z) - 0.003);
  if (h < 0.004) return;
  const y0 = ground(x, z), n = r > 0.013 ? 6 : 5, rot = rand() * TAU;
  const o = { mat: MAT.ROCK, color: mixHex(rand.pick(STONES), rand() < 0.5 ? 0xffffff : 0x000000, rand.range(0, 0.1)) };
  const C = [x, y0 + h * 0.3, z];
  const top = [x + rand.range(-0.25, 0.25) * r, y0 + h, z + rand.range(-0.25, 0.25) * r];
  const lo = [], up = [];
  for (let k = 0; k < n; k++) {
    const a = rot + ((k + rand.range(-0.2, 0.2)) / n) * TAU, rr = r * rand.range(0.82, 1.15);
    const px = x + Math.cos(a) * rr, pz = z + Math.sin(a) * rr;
    lo.push([px, ground(px, pz) - 0.002, pz]);
    const a2 = a + (Math.PI / n) * rand.range(0.7, 1.3), r2 = rr * rand.range(0.6, 0.8);
    up.push([x + Math.cos(a2) * r2, y0 + h * rand.range(0.5, 0.75), z + Math.sin(a2) * r2]);
  }
  const out = (p, q, s) => sub(scl(add(add(p, q), s), 1 / 3), C);
  for (let k = 0; k < n; k++) {
    const k2 = (k + 1) % n;
    facet(top, up[k], up[k2], out(top, up[k], up[k2]), o);
    facet(lo[k], lo[k2], up[k], out(lo[k], lo[k2], up[k]), o);
    facet(up[k], lo[k2], up[k2], out(up[k], lo[k2], up[k2]), o);
  }
}

function scatter(rand, x, z, count, rMin = 0.006, rMax = 0.017, spread = 0.06) {
  for (let i = 0; i < count; i++) {
    const a = rand() * TAU, d = spread * Math.sqrt(rand());
    const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
    const r = rand.range(rMin, rMax) * (i === 0 ? 1.25 : 1);
    if (!clearOf(px, pz, r)) continue;
    stone(rand, px, pz, r, r * rand.range(0.55, 0.95));
  }
}

const STAR_COLS = { orange: 0xe8763a, red: 0xc94a3a, purple: 0x8e5aa8 };

function starfish(rand, x, z, R, col) {
  const yaw = rand() * TAU, curl = rand.range(-0.3, 0.3);
  const o = { mat: MAT.PAINT, color: mixHex(col, 0xffffff, rand.range(0, 0.08)) };
  const at = (a, rad, lift) => { const px = x + Math.cos(a) * rad, pz = z + Math.sin(a) * rad; return [px, ground(px, pz) + lift, pz]; };
  const c = [x, ground(x, z) + R * 0.3, z];
  const tips = [], ridges = [], vals = [];
  for (let i = 0; i < 5; i++) {
    const a = yaw + (i / 5) * TAU, L = R * rand.range(0.88, 1.08);
    tips.push(at(a + curl * 0.45, L, 0.0012));
    ridges.push(at(a + curl * 0.15, L * 0.5, R * 0.2));
    vals.push(at(a + Math.PI / 5, R * 0.36, R * 0.07));
  }
  for (let i = 0; i < 5; i++) {
    const ip = (i + 4) % 5;
    facet(c, vals[ip], ridges[i], UP, o);
    facet(vals[ip], tips[i], ridges[i], UP, o);
    facet(ridges[i], tips[i], vals[i], UP, o);
    facet(c, ridges[i], vals[i], UP, o);
  }
  // a thin skirt down into the sand
  const rim = [];
  for (let i = 0; i < 5; i++) rim.push(tips[i], vals[i]);
  for (let k = 0; k < rim.length; k++) {
    const p = rim[k], q = rim[(k + 1) % rim.length];
    const pl = [p[0], p[1] - 0.003, p[2]], ql = [q[0], q[1] - 0.003, q[2]];
    const outw = sub(scl(add(p, q), 0.5), c); outw[1] = 0;
    facet(p, q, ql, outw, o); facet(p, ql, pl, outw, o);
  }
}

const SHELL_COLS = [0xf6efe6, 0xf3c4bf, 0xf7dcc4, 0xeec0d0, 0xfaf4ea];

function scallop(rand, x, z, R) {
  const rot = rand() * TAU, cr = Math.cos(rot), sr = Math.sin(rot), y0 = ground(x, z) - 0.0008;
  const o = { mat: MAT.PAINT, color: rand.pick(SHELL_COLS) };
  const P = (u, v, h) => [x + cr * u - sr * v, y0 + h, z + sr * u + cr * v];
  const hu = -0.45 * R;
  const um = P(hu + 0.32 * R, 0, 0.36 * R);
  const edge = [], k = 10;
  for (let j = 0; j <= k; j++) {
    const th = -1.2 + (2.4 * j) / k;
    edge.push(P(hu + Math.cos(th) * R, Math.sin(th) * R, j % 2 ? 0.13 * R : 0.03 * R));
  }
  const earL = P(hu, -0.34 * R, 0.04 * R), earR = P(hu, 0.34 * R, 0.04 * R);
  for (let j = 0; j < k; j++) facet(um, edge[j], edge[j + 1], UP, o);
  facet(um, earL, edge[0], UP, o);
  facet(um, edge[k], earR, UP, o);
  facet(um, earR, earL, UP, o);
}

function whelk(rand, x, z, L) {
  const W = L * 0.5;
  M.push();
  M.translate(x, ground(x, z) + W * 0.32, z);
  M.rotateY(rand() * TAU);
  M.rotateZ(Math.PI / 2 + rand.range(-0.2, 0.2));
  M.lathe(0, 0, [[0, -0.5 * L], [0.3 * W, -0.46 * L], [0.5 * W, -0.22 * L], [0.43 * W, 0.04 * L], [0.29 * W, 0.22 * L], [0.13 * W, 0.4 * L], [0, 0.5 * L]],
    { seg: 6, mat: MAT.PAINT, color: rand.pick(SHELL_COLS) });
  M.pop();
}

// ---- silt drifts ----------------------------------------------------------------------------------------------------
function siltDrift(d, rand) {
  const N = 16, U = [0.42, 0.76, 1.0];
  const cr = Math.cos(d.rot), sr = Math.sin(d.rot);
  const col = mixHex(rand() < 0.5 ? 0xbcb4a0 : 0xc2b9a2, 0x000000, rand.range(0, 0.05));
  const o = { mat: MAT.SAND, color: col };
  const ringO = [o, { mat: MAT.SAND, color: mixHex(col, SAND, 0.45) }, { mat: MAT.SAND, color: SAND }];   // fades into the seabed
  const pos = (u, a) => {
    const w = wob(d, a), lx = u * d.rx * w * Math.cos(a), lz = u * d.rz * w * Math.sin(a);
    const px = d.x + lx * cr - lz * sr, pz = d.z + lx * sr + lz * cr;
    return [px, u >= 1 ? floorHeight(px, pz) - 0.0015 : ground(px, pz), pz];
  };
  const normal = (u, a) => {
    const e = 0.03;
    const du = sub(pos(Math.min(u + e, 0.999), a), pos(Math.max(u - e, 0.0), a));
    const da = sub(pos(Math.max(u, 0.05), a + e), pos(Math.max(u, 0.05), a - e));
    const n = nrm(cross(da, du));
    return n[1] < 0 ? scl(n, -1) : n;
  };
  const c = V(pos(0, 0), normal(0.05, 0), o);
  const rings = U.map((u, j) => { const r = []; for (let k = 0; k < N; k++) { const a = (k / N) * TAU; r.push(V(pos(u, a), normal(u, a), ringO[j])); } return r; });
  for (let k = 0; k < N; k++) T(c, rings[0][k], rings[0][(k + 1) % N]);
  for (let j = 0; j < U.length - 1; j++) for (let k = 0; k < N; k++) {
    const k2 = (k + 1) % N;
    T(rings[j][k], rings[j + 1][k], rings[j + 1][k2]); T(rings[j][k], rings[j + 1][k2], rings[j][k2]);
  }
}

// ---- the old anchor and its chain ---------------------------------------------------------------------------------
const RUST = 0x7c4b33;

function anchor(rand) {
  const [sx, sz] = SEABED_SPOTS.anchor;
  const yaw = -1.93, L = 0.20, mid = 0.115 * 1.25;
  const D = [Math.cos(yaw), 0, -Math.sin(yaw)];
  const cx = sx - D[0] * mid, cz = sz - D[2] * mid;
  const gx = (ground(sx + 0.05, sz) - ground(sx - 0.05, sz)) / 0.1, gz = (ground(sx, sz + 0.05) - ground(sx, sz - 0.05)) / 0.1;
  const o = { mat: MAT.PAINT, color: RUST };
  const oDark = { mat: MAT.PAINT, color: mixHex(RUST, 0x3a2418, 0.25) };
  const oLight = { mat: MAT.PAINT, color: mixHex(RUST, 0xa86a3e, 0.3) };
  M.push();
  M.translate(cx, ground(cx, cz) + 0.003, cz);
  M.rotateZ(Math.atan(gx)); M.rotateX(-Math.atan(gz));
  M.rotateY(yaw);
  M.rotateX(0.05);                    // rolled a little: one arm digs in, the other lifts
  M.scale(1.25);
  // crown, shank and the collar at the top
  M.sphere(0, 0, 0, 0.0125, { ...o, seg: 8, rings: 4, sy: 0.8 });
  rod([[0, 0, 0], [L * 0.5, 0, 0], [L, 0, 0]], [0.0088, 0.0077, 0.0066], 8, UP, o);
  M.sphere(L, 0, 0, 0.0085, { ...oDark, seg: 8, rings: 4 });
  // stock: a crossbar near the top with ball ends
  const sxL = L - 0.032;
  rod([[sxL, 0, -0.082], [sxL, 0, 0], [sxL, 0, 0.082]], [0.0048, 0.0072, 0.0048], 6, UP, oLight);
  for (const e of [-1, 1]) M.sphere(sxL, 0, e * 0.084, 0.0078, { ...oLight, seg: 6, rings: 4 });
  // ring
  const rc = L + 0.026, rr = 0.019, ring = [];
  for (let k = 0; k < 12; k++) { const a = (k / 12) * TAU; ring.push([rc + Math.cos(a) * rr, 0, Math.sin(a) * rr]); }
  loop(ring, 0.0042, 6, UP, oDark);
  // arms curving up from the crown, each ending in an arrowhead fluke
  const R = 0.085, thEnd = 1.15;
  for (const sg of [-1, 1]) {
    const pts = [], radii = [];
    for (let j = 0; j <= 6; j++) {
      const th = (thEnd * j) / 6;
      pts.push([R * (1 - Math.cos(th)), 0, sg * R * Math.sin(th)]);
      radii.push(0.0088 + (0.0056 - 0.0088) * (j / 6));
    }
    rod(pts, radii, 6, UP, o);
    const end = pts[pts.length - 1];
    const Tg = [Math.sin(thEnd), 0, sg * Math.cos(thEnd)], Pp = [Tg[2], 0, -Tg[0]];
    const F = add(end, scl(Tg, 0.034)), Nn = add(end, scl(Tg, 0.003));
    const b1 = add(add(end, scl(Tg, -0.007)), scl(Pp, 0.021)), b2 = add(add(end, scl(Tg, -0.007)), scl(Pp, -0.021));
    const hi = 0.0036, lo = -0.0045;
    const up = p => [p[0], hi, p[2]], dn = p => [p[0], lo, p[2]];
    const spine = [Nn[0] + Tg[0] * 0.012, hi + 0.0022, Nn[2] + Tg[2] * 0.012];
    facet(up(F), up(b1), spine, UP, oLight); facet(up(b1), up(Nn), spine, UP, oLight);
    facet(up(F), spine, up(b2), UP, oLight); facet(spine, up(Nn), up(b2), UP, oLight);
    const outline = [F, b1, Nn, b2];
    const fc = scl(add(add(F, b1), add(Nn, b2)), 0.25);
    for (let k = 0; k < 4; k++) {
      const p = outline[k], q = outline[(k + 1) % 4];
      const ow = sub(scl(add(p, q), 0.5), fc); ow[1] = 0;
      facet(up(p), dn(p), dn(q), ow, o); facet(up(p), dn(q), up(q), ow, o);
    }
  }
  const ringFar = M.xp([rc + rr + 0.004, 0, 0]);
  M.pop();
  reserve(sx, sz, 0.18);
  reserve(cx, cz, 0.06);
  return { ringFar, D };
}

function chain(rand, start, D) {
  const Q = [D[2], 0, -D[0]];         // to the anchor's right
  const P0 = [start[0], 0, start[2]];
  const P1 = add(P0, scl(D, 0.12));
  const P2 = add(add(P0, scl(D, 0.21)), scl(Q, 0.10));
  const P3 = add(add(P0, scl(D, 0.22)), scl(Q, 0.31));
  const bez = t => {
    const u = 1 - t;
    return add(add(scl(P0, u * u * u), scl(P1, 3 * u * u * t)), add(scl(P2, 3 * u * t * t), scl(P3, t * t * t)));
  };
  const samples = [bez(0)], lens = [0];
  for (let i = 1; i <= 200; i++) { const p = bez(i / 200); lens.push(lens[i - 1] + Math.hypot(p[0] - samples[i - 1][0], p[2] - samples[i - 1][2])); samples.push(p); }
  const total = lens[200];
  const at = s => {
    let i = 1; while (i < 200 && lens[i] < s) i++;
    const f = (s - lens[i - 1]) / Math.max(1e-6, lens[i] - lens[i - 1]);
    const p = add(samples[i - 1], scl(sub(samples[i], samples[i - 1]), f));
    const d = nrm(sub(samples[i], samples[i - 1]));
    return { p, d };
  };
  const a = 0.0088, b = 0.0054, r = 0.0024, pitch = 0.0152;
  let idx = 0;
  for (let s = a * 0.6; s < total; s += pitch, idx++) {
    const { p, d } = at(s);
    const side = nrm(cross(UP, d));
    const upright = idx % 2 === 1;
    const g = ground(p[0], p[2]);
    const lift = idx < 2 ? Math.max(0, start[1] - g) * (1 - idx * 0.5) : 0;
    const c = [p[0], g + (upright ? b * 0.55 : r * 0.6) + lift, p[2]];
    const v = upright ? UP : side, pn = upright ? side : UP;
    const pts = [];
    for (let k = 0; k < 8; k++) { const ph = (k / 8) * TAU; pts.push(add(add(c, scl(d, a * Math.cos(ph))), scl(v, b * Math.sin(ph)))); }
    loop(pts, r, 4, pn, { mat: MAT.PAINT, color: mixHex(RUST, rand() < 0.5 ? 0x5e3a2a : 0x96603c, rand.range(0, 0.45)) }, Math.PI / 4);
    if (idx % 3 === 0) reserve(p[0], p[2], 0.03);
  }
}

// ---- the lost tyre and its crab ------------------------------------------------------------------------------------
function tyre(rand) {
  const [tx, tz] = SEABED_SPOTS.tyre;
  const gx = (ground(tx + 0.05, tz) - ground(tx - 0.05, tz)) / 0.1, gz = (ground(tx, tz + 0.05) - ground(tx, tz - 0.05)) / 0.1;
  const ri = 0.027, ro = 0.048, h = 0.017;
  M.push();
  M.translate(tx, ground(tx, tz) - 0.003, tz);
  M.rotateZ(Math.atan(gx)); M.rotateX(-Math.atan(gz));
  M.rotateY(0.7);
  M.rotateX(0.2);                     // tipped: one side half buried, the other standing proud
  M.set({ mat: MAT.RUBBER, color: 0x2a2a2c, param: 0 });
  M.lathe(0, 0, [
    [ri + 0.003, -h], [ro - 0.006, -h], [ro - 0.001, -h + 0.006], [ro, 0], [ro - 0.001, h - 0.006], [ro - 0.006, h],
    [ri + 0.004, h], [ri, h - 0.004], [ri - 0.001, 0], [ri, -h + 0.004], [ri + 0.003, -h],
  ], { seg: 20 });
  // chunky tread lugs round the outside
  for (let k = 0; k < 20; k++) {
    const a = ((k + 0.5) / 20) * TAU, off = k % 2 ? 0.004 : -0.004;
    M.push(); M.rotateY(a);
    M.boxMM(ro - 0.002, off - 0.0075, -0.0032, ro + 0.0032, off + 0.0075, 0.0032, { skip: ['nx'], color: 0x323234 });
    M.pop();
  }
  M.pop();
  reserve(tx, tz, 0.07);
  // weed growing up through the middle
  tuft(rand, tx, tz, { n: 6, spread: 0.012, hMin: 0.04, hMax: 0.07, kelp: 0, check: false });
  // a little crab sitting beside it, looking out
  const ca = -2.2, cxp = tx + Math.cos(ca) * 0.078, czp = tz + Math.sin(ca) * 0.078;
  crab(cxp, czp, -ca);
  reserve(cxp, czp, 0.03);
}

function crab(x, z, yaw) {
  const o = { mat: MAT.PAINT, color: 0xd9572f }, oLeg = { mat: MAT.PAINT, color: 0xc24a2a };
  M.push();
  M.translate(x, ground(x, z), z);
  M.rotateY(yaw);
  M.push(); M.scale(0.8, 1, 1.15);
  M.sphere(0, 0.004, 0, 0.0105, { ...o, seg: 10, rings: 5, sy: 0.5 });
  M.pop();
  for (const sg of [-1, 1]) {
    for (const lx of [-0.0045, 0, 0.0045]) {
      const a = [lx, 0.004, sg * 0.009], k = [lx * 1.6 - 0.001, 0.0085, sg * 0.0175], f = [lx * 2.2 - 0.002, 0.0, sg * 0.023];
      M.beam(a, k, 0.0022, 0.0022, oLeg); M.beam(k, f, 0.0019, 0.0019, oLeg);
    }
    M.beam([0.006, 0.004, sg * 0.0065], [0.0135, 0.0055, sg * 0.0115], 0.0028, 0.0028, oLeg);
    M.sphere(0.0175, 0.0055, sg * 0.0115, 0.0046, { ...o, seg: 6, rings: 4, sy: 0.7 });
    M.beam([0.0072, 0.0068, sg * 0.0028], [0.0085, 0.0098, sg * 0.0032], 0.0012, 0.0012, oLeg);
    M.sphere(0.0086, 0.0103, sg * 0.0032, 0.0016, { mat: MAT.PAINT, color: 0x1d1d22, seg: 5, rings: 3 });
  }
  M.pop();
}

// ---- the whole seabed ----------------------------------------------------------------------------------------------
export function build(mb, ctx) {
  M = mb;
  mb.push();
  mb.set({ obj: 0, param: 0, mat: MAT.PAINT });
  RES.length = 0;
  for (const [x, z] of FEED) reserve(x, z, 0.05);
  for (const [x, z] of MOORING_BUOYS) reserve(x, z, 0.06);
  reserve(CHANNEL_BUOY[0], CHANNEL_BUOY[1], 0.06);

  // silt first so everything else sits on it
  const srand = makeRand(1201);
  for (const d of SILT) siltDrift(d, srand);

  // the anchor and its chain, the tyre and its crab
  const arand = makeRand(3301);
  const { ringFar, D } = anchor(arand);
  chain(arand, ringFar, D);
  tuft(arand, SEABED_SPOTS.anchor[0] - D[0] * 0.17 + 0.03, SEABED_SPOTS.anchor[1] - D[2] * 0.17, { n: 5, spread: 0.02, hMin: 0.03, hMax: 0.055 });
  scatter(arand, SEABED_SPOTS.anchor[0] + 0.19, SEABED_SPOTS.anchor[1] - 0.15, 4, 0.006, 0.016, 0.04);
  tyre(makeRand(4401));

  // weed: thick along the quay wall foot and the breakwater toe, sparse out in the basin
  const wr = makeRand(5501);
  const sites = [];
  for (let k = 0; k < 16; k++) {
    const x = -2.46 + (k * 4.62) / 15 + wr.range(-0.08, 0.08), z = wr.range(-0.645, -0.57);
    if (!open(x, z, 0.02)) continue;
    const inBerth = x > BERTH.x0 - 0.05 && x < BERTH.x1 + 0.05;
    sites.push({ x, z, n: inBerth ? 13 : 12, spread: inBerth ? 0.065 : 0.05, kelp: inBerth ? 0 : 0.3, stones: wr() < 0.6 });
  }
  for (let k = 0; k < 14; k++) {
    const u = (k + wr.range(0.1, 0.9)) / 14, d = BW.toeHalf + wr.range(0.05, 0.12);
    let x, z;
    if (u < 0.34) { const th = Math.PI / 2 + (u / 0.34) * Math.PI; x = BW.headX + Math.cos(th) * d; z = BW.z + Math.sin(th) * d; }
    else if (u < 0.7) { x = BW.headX + ((u - 0.34) / 0.36) * (2.45 - BW.headX); z = BW.z - d; }
    else { x = BW.headX + ((u - 0.7) / 0.3) * (2.45 - BW.headX); z = BW.z + d; }
    if (!open(x, z, 0.02)) continue;
    sites.push({ x, z, n: 12, spread: 0.05, kelp: 0.4, stones: wr() < 0.7 });
  }
  const basin = [];
  for (let tries = 0; tries < 400 && basin.length < 9; tries++) {
    const x = wr.range(-2.35, 0.95), z = wr.range(-0.2, 2.35);
    if (!open(x, z, 0.08) || basin.some(b => Math.hypot(b[0] - x, b[1] - z) < 0.5)) continue;
    if (sites.some(s => Math.hypot(s.x - x, s.z - z) < 0.3)) continue;
    basin.push([x, z]);
    sites.push({ x, z, n: wr.int(6, 8), spread: 0.035, kelp: 0.25, stones: wr() < 0.5 });
  }
  // a few near the cut faces, where they show through the side of the block
  for (const [x, z, kelp] of [[-0.52, 2.40, 0.6], [0.30, 2.30, 0.3], [0.66, 2.44, 0.5], [-1.55, 2.42, 0.5], [1.55, 2.36, 0.5],
    [-0.12, 2.47, 0.5], [0.98, 2.40, 0.4], [-0.95, 2.36, 0.3],
    [-2.44, 1.15, 0.5], [-2.43, 0.22, 0.4], [-2.44, 1.78, 0.5], [-2.42, -0.45, 0.5], [2.44, 1.95, 0.6]]) {
    if (open(x, z, 0.02)) sites.push({ x, z, n: 10, spread: 0.045, kelp, stones: true });
  }
  for (const s of sites) {
    tuft(wr, s.x, s.z, { n: s.n, spread: s.spread, kelp: s.kelp });
    reserve(s.x, s.z, s.spread * 0.6);
  }
  // stones: little scatters by the weed, plus some out on their own
  const sr = makeRand(6601);
  for (const s of sites) if (s.stones) {
    const a = sr() * TAU;
    scatter(sr, s.x + Math.cos(a) * 0.07, s.z + Math.sin(a) * 0.07, sr.int(3, 6), 0.006, 0.017, 0.05);
  }
  for (let tries = 0, made = 0; tries < 200 && made < 6; tries++) {
    const x = sr.range(-2.4, 2.4), z = sr.range(-0.6, 2.4);
    if (!open(x, z, 0.08)) continue;
    scatter(sr, x, z, sr.int(3, 6), 0.007, 0.02, 0.07);
    made++;
  }

  // starfish
  const fr = makeRand(7701);
  const [tx, tz] = SEABED_SPOTS.tyre;
  const stars = [
    [0.42, 2.34, 'orange'], [-0.22, 2.18, 'red'], [-1.15, -0.60, 'purple'], [1.55, 0.36, 'orange'], [0.52, 1.08, 'red'],
    [tx + 0.07, tz - 0.06, 'purple'], [SEABED_SPOTS.anchor[0] + 0.16, SEABED_SPOTS.anchor[1] + 0.06, 'orange'],
    [2.02, -0.55, 'red'], [-2.18, 1.72, 'orange'], [0.52, -0.34, 'purple'],
  ];
  for (const [x, z, c] of stars) {
    const R = fr.range(0.021, 0.027);
    if (!free(x, z, R)) continue;
    starfish(fr, x, z, R, STAR_COLS[c]);
  }

  // shells: scallops and whelks, more of them toward the front
  const hr = makeRand(8801);
  for (let tries = 0, made = 0; tries < 400 && made < 16; tries++) {
    const front = made < 7;
    const x = front ? hr.range(-0.9, 0.9) : hr.range(-2.4, 2.4), z = front ? hr.range(1.95, 2.48) : hr.range(-0.6, 2.4);
    if (!open(x, z, 0.02)) continue;
    if (hr() < 0.6) scallop(hr, x, z, hr.range(0.012, 0.016));
    else whelk(hr, x, z, hr.range(0.022, 0.03));
    made++;
  }

  mb.pop();
  LP.length = 0; LN.length = 0;
  M = null;
}
