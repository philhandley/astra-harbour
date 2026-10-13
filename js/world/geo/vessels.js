// Vessels: the feeder container ship, the tug, two yachts, two fishing boats with ten-frame decks, the green channel
// buoy and three yellow mooring buoys. Every vessel is built in its own object frame (+x bow, +y up, y = 0 waterline,
// +z starboard) with its own obj id so the systems can move it. Child parts (ship radar, ship propeller, tug propeller)
// are built around their own origin with their own obj id; rig.js places them.
// Test: dev/view.html?b=vessels&view=ship | &view=pier | &cam=yaw,pitch,dist,tx,ty,tz
import { MAT, MeshBuilder } from '../../gpu/mesh.js';
import { makeRand } from '../../gpu/math.js';
import { OBJ } from '../env.js';
import { SHIP, BOX, bayX, FISHBOAT, boatSlots } from '../layout.js';
import { TUG_HOOK_LOCAL, SHIP_BOW_BOLLARD_LOCAL, SHIP_MAST_TOP_LOCAL, RADAR_LOCAL, PROP_LOCAL, TUG_PROP_LOCAL } from '../rig.js';

// ---- palette -------------------------------------------------------------------------------------
const NAVY = 0x22355f, WHITE = 0xf3f2ee, CREAM = 0xefe5c8, BLACK = 0x1b1c1f, GLASS = 0x34495a, BRONZE = 0xc99a3e;
const DARK = 0x2f3338, STEELGREY = 0x8e969c, YELLOW = 0xe6b437, ORANGE = 0xf06a2a, RUBBER = 0x242526;
const SHIP_DECK = 0x5b6a62, HATCH = 0x9ba3a6, TUG_BLACK = 0x1d1f22, TUG_RED = 0xc8372d, TUG_DECK = 0x7a7f84;

// ---- small maths ---------------------------------------------------------------------------------
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = a => Math.hypot(a[0], a[1], a[2]);
const unit = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const clamp01 = t => (t < 0 ? 0 : t > 1 ? 1 : t);
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

// ---- hull machinery --------------------------------------------------------------------------------
// A hull is described by waterline contours: for each height y it runs from the aft end xA(y) to the stem xF(y)
// with half-breadth hb(x, y). The grid P[j][k] has rows j = heights (bottom to top) and columns k running down the
// port side from aft to the stem, then back up the starboard side (the stem column is shared).
function hullGrid(H, rows, n) {
  const P = [];
  for (const y of rows) {
    const xa = H.xA(y), xf = H.xF(y);
    const port = [];
    for (let k = 0; k <= n; k++) {
      const u = k / n;
      const s = 0.45 * u + 0.275 * (1 - Math.cos(Math.PI * u));
      const x = xa + (xf - xa) * s;
      port.push([x, y, -Math.max(0, H.hb(x, y))]);
    }
    port[n][2] = 0;
    const row = port.slice();
    for (let k = n - 1; k >= 0; k--) row.push([port[k][0], y, -port[k][2]]);
    P.push(row);
  }
  if (H.warp) for (const row of P) for (const p of row) p[1] = H.warp(p[0], p[1]);
  return P;
}

// Smooth normals over a grid, consistent with the triangle winding used by emitGrid.
function gridNormals(P) {
  const R = P.length, C = P[0].length, N = [];
  for (let j = 0; j < R; j++) {
    const row = [];
    for (let k = 0; k < C; k++) {
      const dj = sub(P[Math.min(R - 1, j + 1)][k], P[Math.max(0, j - 1)][k]);
      const dk = sub(P[j][Math.min(C - 1, k + 1)], P[j][Math.max(0, k - 1)]);
      let n = cross(dj, dk);
      if (len(n) < 1e-12) n = [0, 1, 0];
      row.push(unit(n));
    }
    N.push(row);
  }
  return N;
}

function emitGrid(mb, P, N, j0, j1, k0, k1, o) {
  const base = mb.nv, W = k1 - k0 + 1;
  for (let j = j0; j <= j1; j++) for (let k = k0; k <= k1; k++) mb.vert(P[j][k], N[j][k], o);
  for (let j = 0; j < j1 - j0; j++) for (let k = 0; k < W - 1; k++) {
    const a = base + j * W + k, b = a + W;
    mb.tri(a, b, b + 1); mb.tri(a, b + 1, a + 1);
  }
}

// Generic smooth surface from a grid of points (no shared state with a hull).
function surface(mb, P, o) { emitGrid(mb, P, gridNormals(P), 0, P.length - 1, 0, P[0].length - 1, o); }

// Close the aft end between rows j0..j1 (skeg trailing edge, counter, transom).
function aftClose(mb, P, j0, j1, o) {
  const C = P[0].length;
  for (let j = j0; j < j1; j++) {
    const q = [P[j][0], P[j][C - 1], P[j + 1][C - 1], P[j + 1][0]];
    if (len(cross(sub(q[2], q[0]), sub(q[3], q[1]))) < 1e-9) continue;
    mb.poly(q, o);
  }
}

function triFix(mb, ia, ib, ic, pa, pb, pc, n) {
  if (dot(cross(sub(pb, pa), sub(pc, pa)), n) < 0) mb.tri(ia, ic, ib); else mb.tri(ia, ib, ic);
}

// A flat-ish strip between paired point lists L[i] and R[i], all with the normal n.
function ladder(mb, L, R, n, o) {
  const base = mb.nv;
  for (let i = 0; i < L.length; i++) { mb.vert(L[i], n, o); mb.vert(R[i], n, o); }
  for (let i = 0; i < L.length - 1; i++) {
    const a = base + 2 * i;
    triFix(mb, a, a + 1, a + 3, L[i], R[i], R[i + 1], n);
    triFix(mb, a, a + 3, a + 2, L[i], R[i + 1], L[i + 1], n);
  }
}

// Port column k of a row and its starboard mirror.
const stb = (P, j, k) => P[j][P[0].length - 1 - k];

// Outward (in plan) offset of a polyline running round a hull.
function offsetPlan(pts, off, closed) {
  const n = pts.length, out = [];
  for (let i = 0; i < n; i++) {
    const a = pts[closed ? (i - 1 + n) % n : Math.max(0, i - 1)], b = pts[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
    let tx = b[0] - a[0], tz = b[2] - a[2];
    const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
    out.push([pts[i][0] + tz * off, pts[i][1], pts[i][2] - tx * off]);
  }
  return out;
}

// A point on a hull side and a local frame there: u along the hull (forward-ish), v up the side, w outward.
function hullFrame(H, x, y, side) {
  const e = 1e-4;
  const hb = H.hb(x, y);
  const hx = (H.hb(x + e, y) - H.hb(x - e, y)) / (2 * e), hy = (H.hb(x, y + e) - H.hb(x, y - e)) / (2 * e);
  const w = unit([-hx, -hy, side]);
  const v = unit(sub([0, 1, 0], mul(w, w[1])));
  let u = cross(v, w);
  if (u[0] * side < 0) u = mul(u, -1);
  const p = [x, y, side * hb];
  return { p, u, v, w, at: (a, b, c) => add(p, add(mul(u, a), add(mul(v, b), mul(w, c)))) };
}

// ---- small part helpers ----------------------------------------------------------------------------
// Torus arc: ring centre c in the plane of unit vectors u, v; ring radius R, tube radius r.
function torusArc(mb, c, u, v, R, r, a0, a1, na, nt, o) {
  const w = cross(u, v), base = mb.nv;
  for (let i = 0; i <= na; i++) {
    const a = a0 + ((a1 - a0) * i) / na, ca = Math.cos(a), sa = Math.sin(a);
    const e = add(mul(u, ca), mul(v, sa)), p = add(c, mul(e, R));
    for (let j = 0; j <= nt; j++) {
      const b = (2 * Math.PI * j) / nt;
      const n = add(mul(e, Math.cos(b)), mul(w, Math.sin(b)));
      mb.vert(add(p, mul(n, r)), n, o);
    }
  }
  for (let i = 0; i < na; i++) for (let j = 0; j < nt; j++) {
    const a = base + i * (nt + 1) + j, b = a + nt + 1;
    mb.tri(a, b, b + 1); mb.tri(a, b + 1, a + 1);
  }
}
const torus = (mb, c, u, v, R, r, na, nt, o) => torusArc(mb, c, u, v, R, r, 0, Math.PI * 2, na, nt, o);

// Push a frame at a whose +y axis points toward b. Returns the length. Caller must pop.
function along(mb, a, b) {
  const d = sub(b, a), L = len(d);
  mb.push();
  mb.translate(a[0], a[1], a[2]);
  const dy = d[1] / (L || 1), h = Math.hypot(d[0], d[2]);
  if (h > 1e-9) mb.rotateY(Math.atan2(d[2], -d[0]));
  mb.rotateZ(Math.acos(Math.max(-1, Math.min(1, dy))));
  return L;
}

// A sausage (lathe) from a to b with the given radius profile [[r, t 0..1], ...].
function sausage(mb, a, b, prof, o) {
  const L = along(mb, a, b);
  mb.lathe(0, 0, prof.map(([r, t]) => [r, t * L]), o);
  mb.pop();
}

// Symmetric foil ring (keel, rudder) at height y, leading edge xl (forward), trailing edge xt, thickness t.
function foilRing(xl, xt, y, t, m = 6) {
  const pts = [];
  const th = s => Math.pow(Math.max(0, Math.sin(Math.PI * Math.pow(s, 0.62))), 0.85);
  for (let i = 0; i <= m; i++) { const s = (1 - Math.cos((Math.PI * i) / m)) / 2; pts.push([xl + (xt - xl) * s, y, (t / 2) * th(s)]); }
  for (let i = m - 1; i >= 1; i--) { const p = pts[i]; pts.push([p[0], y, -p[2]]); }
  return pts;
}
function fin(mb, root, tip, o) {
  mb.loft([foilRing(root[0], root[1], root[2], root[3]), foilRing(tip[0], tip[1], tip[2], tip[3])], { caps: true, ...o });
}

// Windows: a row of panes on a plane x = const (spread across z), or z = const (spread along x).
function winRowX(mb, x, z0, z1, yc, w, h, pitch, o) {
  const n = Math.max(1, Math.floor((z1 - z0 + pitch - w) / pitch));
  const zc0 = (z0 + z1) / 2 - ((n - 1) * pitch) / 2;
  for (let i = 0; i < n; i++) {
    const z = zc0 + i * pitch;
    mb.poly([[x, yc - h / 2, z - w / 2], [x, yc - h / 2, z + w / 2], [x, yc + h / 2, z + w / 2], [x, yc + h / 2, z - w / 2]], o);
  }
}
function winRowZ(mb, z, x0, x1, yc, w, h, pitch, o) {
  const n = Math.max(1, Math.floor((x1 - x0 + pitch - w) / pitch));
  const xc0 = (x0 + x1) / 2 - ((n - 1) * pitch) / 2;
  for (let i = 0; i < n; i++) {
    const x = xc0 + i * pitch;
    mb.poly([[x - w / 2, yc - h / 2, z], [x + w / 2, yc - h / 2, z], [x + w / 2, yc + h / 2, z], [x - w / 2, yc + h / 2, z]], o);
  }
}

// A four-bladed propeller around the origin, axis along x, hub spinner pointing aft (-x).
function propeller(mb, R, hubR, hubL, o) {
  mb.push();
  mb.rotateZ(-Math.PI / 2); // local +y -> +x
  const h = hubL / 2;
  mb.lathe(0, 0, [[0, -h - hubR * 0.75], [hubR * 0.55, -h - hubR * 0.6], [hubR * 0.9, -h - hubR * 0.25], [hubR, -h], [hubR, h], [hubR * 0.85, h + 0.0005], [0, h + 0.0005]], { seg: 10, ...o });
  mb.pop();
  const c = R * 0.42;
  for (let b = 0; b < 4; b++) {
    mb.push();
    mb.rotateX(b * Math.PI / 2 + 0.4);
    mb.rotateY(0.62); // blade pitch
    const r0 = hubR * 0.7;
    mb.polyFan([
      [0, r0, -c * 0.30], [0, R * 0.42, -c * 0.52], [0, R * 0.78, -c * 0.50], [0, R * 0.96, -c * 0.22], [0, R, 0.0],
      [0, R * 0.95, c * 0.22], [0, R * 0.75, c * 0.40], [0, R * 0.40, c * 0.42], [0, r0, c * 0.30],
    ], o);
    mb.pop();
  }
}

// =================================================================================================
// FEEDER CONTAINER SHIP
// =================================================================================================
const SHIP_ROWS = [-0.085, -0.0838, -0.0805, -0.0755, -0.0695, -0.0625, -0.057, -0.047, -0.035, -0.022, -0.010, -0.004,
  0.006, 0.022, 0.040, 0.054, 0.064, 0.075, 0.086, 0.098, 0.104, 0.115];
const FC_X = 0.70, FC_DECK = 0.098;
const ACC = { x0: SHIP.accomX[0] + 0.005, x1: SHIP.accomX[1] };
const WH = { x0: -0.808, x1: -0.738, hz: 0.105, y0: 0.247, y1: 0.296 };
const FUNNEL = { x: -0.866, y0: 0.247, top: 0.42, rake: 0.08, rz: 0.026, sx: 1.3 };
const FUNNEL_TOP = [FUNNEL.x - (FUNNEL.top - FUNNEL.y0) * Math.tan(FUNNEL.rake), FUNNEL.top, 0];
const WING_Z = SHIP.beam / 2 + 0.002;

const shipBm = y => {
  const r = 0.028, yc = -SHIP.draft + r;
  return y < yc ? SHIP.beam / 2 - r + Math.sqrt(Math.max(0, r * r - (y - yc) * (y - yc))) : SHIP.beam / 2;
};
const shipXF = y => (y >= 0 ? 0.90 + 0.06 * clamp01(y / 0.115) : 0.90 - 0.055 * Math.pow(clamp01(-y / SHIP.draft), 3));
const shipXA = y => {
  if (y >= -0.004) return -0.962 - 0.005 * clamp01((y + 0.004) / 0.079);
  if (y >= -0.07) return -0.915;
  const t = (-0.07 - y) / 0.015;
  return -0.915 + 0.03 * t * t;
};
const SHIP_H = {
  xF: shipXF, xA: shipXA,
  hb(x, y) {
    const Bm = shipBm(y), xf = shipXF(y), xa = shipXA(y);
    const Le = y < 0 ? lerp(0.55, 0.42, clamp01((y + 0.085) / 0.085)) : lerp(0.42, 0.28, clamp01(y / 0.115));
    const tf = clamp01((xf - x) / Le);
    const pf = 1 - Math.pow(1 - tf, 2.1);
    let pa;
    if (y >= -0.004) {
      const wT = 0.62 + 0.18 * clamp01((y + 0.004) / 0.079);
      const tr = clamp01((x - xa) / 0.35);
      pa = wT + (1 - wT) * (1 - (1 - tr) * (1 - tr));
    } else {
      const k = clamp01((y + 0.085) / 0.075);
      const tr = clamp01((x - xa) / lerp(0.62, 0.2, k));
      const m = 0.005 / Bm;
      pa = m + (1 - m) * lerp(tr * tr * (3 - 2 * tr), 1 - (1 - tr) * (1 - tr), k * k);
    }
    return Bm * pf * pa;
  },
};

function buildShip(mb) {
  mb.push();
  mb.set({ obj: OBJ.SHIP, mat: MAT.PAINT, color: WHITE, param: 0 });
  const n = 40;
  const P = hullGrid(SHIP_H, SHIP_ROWS, n), N = gridNormals(P), C = P[0].length;
  const J = y => SHIP_ROWS.indexOf(y);
  const jW = J(0.064), jD = J(0.075), jF = J(FC_DECK), jS = J(0.104), jT = J(0.115);
  let kP = 0;
  while (kP < n && P[jD][kP][0] < FC_X) kP++;
  const kS = C - 1 - kP;
  const hull = { mat: MAT.HULL, color: NAVY }, band = { mat: MAT.HULL, color: WHITE };

  // shell
  emitGrid(mb, P, N, 0, jW, 0, C - 1, hull);
  emitGrid(mb, P, N, jW, jD, 0, kP, band);
  emitGrid(mb, P, N, jW, jD, kP, kS, hull);
  emitGrid(mb, P, N, jW, jD, kS, C - 1, band);
  emitGrid(mb, P, N, jD, jS, kP, kS, hull);
  emitGrid(mb, P, N, jS, jT, kP, kS, band);
  aftClose(mb, P, 0, jW, hull);
  aftClose(mb, P, jW, jD, band);
  // flat bottom
  const bl = [], br = [];
  for (let k = 0; k <= n; k++) { bl.push(P[0][k]); br.push(stb(P, 0, k)); }
  ladder(mb, bl, br, [0, -1, 0], hull);

  // main deck (aft of the forecastle) and the forecastle deck
  const deckO = { color: SHIP_DECK, mat: MAT.PAINT };
  const dl = [], dr = [];
  for (let k = 0; k <= kP; k++) { dl.push(P[jD][k]); dr.push(stb(P, jD, k)); }
  ladder(mb, dl, dr, [0, 1, 0], deckO);
  const fl = [], fr = [];
  for (let k = kP; k <= n; k++) { fl.push(P[jF][k]); fr.push(stb(P, jF, k)); }
  ladder(mb, fl, fr, [0, 1, 0], deckO);
  mb.poly([P[jD][kP], P[jD][kS], P[jF][kS], P[jF][kP]], { color: WHITE });
  // forecastle bulwark: white inner lining and capping
  const lining = [];
  for (let j = jF; j <= jT; j++) lining.push(offsetPlan(P[j].slice(kP, kS + 1), -0.0012, false));
  surface(mb, lining, { color: WHITE, mat: MAT.PAINT });
  mb.tube(P[jT].slice(kP, kS + 1), 0.0022, { seg: 5, color: WHITE, mat: MAT.PAINT });

  // bulbous bow
  mb.push();
  mb.translate(0.862, -0.05, 0);
  mb.scale(0.098, 0.027, 0.025);
  mb.sphere(0, 0, 0, 1, { seg: 14, rings: 8, ...hull });
  mb.pop();
  // bow thruster tunnel marks
  for (const side of [-1, 1]) {
    const f = hullFrame(SHIP_H, 0.80, -0.036, side);
    const ring = [];
    for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; ring.push(f.at(Math.cos(a) * 0.009, Math.sin(a) * 0.009, 0.0006)); }
    mb.poly(side > 0 ? ring : ring.reverse(), { color: 0x2a1512, mat: MAT.PAINT });
  }

  // stern: shaft boss, rudder, rudder horn
  mb.push();
  mb.translate(PROP_LOCAL[0], PROP_LOCAL[1], 0);
  mb.rotateZ(Math.PI / 2); // local +y -> -x
  mb.lathe(0, 0, [[0.0125, -0.026], [0.0118, -0.017], [0.0102, -0.0085], [0.006, -0.0078]], { seg: 10, ...hull });
  mb.pop();
  fin(mb, [-0.951, -0.986, -0.001, 0.0078], [-0.953, -0.982, -0.079, 0.0066], hull);
  // stern flagstaff with a little red ensign
  mb.cylinder(-0.962, SHIP.deckY, 0, 0.0013, 0.046, { seg: 6, color: WHITE });
  mb.poly([[-0.9627, 0.108, 0], [-0.981, 0.1075, 0], [-0.981, 0.1185, 0], [-0.9627, 0.119, 0]], { color: 0xc8402f });

  // anchors in hawse pipes
  for (const side of [-1, 1]) {
    const f = hullFrame(SHIP_H, 0.858, 0.054, side);
    const ring = [];
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; ring.push(f.at(Math.cos(a) * 0.0068, Math.sin(a) * 0.0068 + 0.002, 0.0005)); }
    mb.poly(ring, { color: 0x111214 });
    torus(mb, f.at(0, 0.002, 0.0012), f.u, f.v, 0.0072, 0.0017, 12, 5, { color: NAVY, mat: MAT.STEEL });
    const ao = { color: 0x3a3d42, mat: MAT.STEEL };
    mb.beam(f.at(0, 0.001, 0.003), f.at(0, -0.022, 0.0035), 0.0034, 0.0028, { ...ao, up: f.w });
    mb.beam(f.at(-0.0095, -0.017, 0.0035), f.at(0, -0.0245, 0.0035), 0.0042, 0.0028, { ...ao, up: f.w });
    mb.beam(f.at(0.0095, -0.017, 0.0035), f.at(0, -0.0245, 0.0035), 0.0042, 0.0028, { ...ao, up: f.w });
  }

  // forecastle gear: bow bollard (tow line point), fairlead, windlasses with chains, mooring winches, foremast
  const bb = SHIP_BOW_BOLLARD_LOCAL;
  const bo = { color: 0x2b2e33, mat: MAT.STEEL };
  mb.box(bb[0], FC_DECK, 0, 0.030, 0.0018, 0.012, bo);
  for (const dx of [-0.0085, 0.0085]) {
    mb.cylinder(bb[0] + dx, FC_DECK, 0, 0.0042, 0.0125, { seg: 10, ...bo });
    mb.cylinder(bb[0] + dx, FC_DECK + 0.0125, 0, 0.0054, 0.0018, { seg: 10, ...bo });
  }
  torus(mb, [0.944, 0.1105, 0], [0, 0, 1], [0, 1, 0], 0.0048, 0.0017, 10, 5, bo);
  for (const side of [-1, 1]) {
    const wz = side * 0.046;
    mb.box(0.826, FC_DECK, wz, 0.022, 0.006, 0.026, { color: 0x6f7a80 });
    mb.push(); mb.translate(0.826, FC_DECK + 0.011, wz); mb.rotateX(Math.PI / 2);
    mb.cylinder(0, -0.011, 0, 0.0065, 0.022, { seg: 10, color: 0x2b2e33, mat: MAT.STEEL });
    mb.pop();
    const deckHole = [0.872, FC_DECK + 0.0005, side * 0.062];
    mb.tube([[0.835, FC_DECK + 0.010, wz], [0.855, FC_DECK + 0.004, side * 0.055], deckHole], 0.0016, { seg: 4, color: 0x3a3d42, mat: MAT.STEEL });
    mb.cylinder(deckHole[0], FC_DECK, deckHole[2], 0.004, 0.003, { seg: 8, ...bo });
    mb.box(0.745, FC_DECK, side * 0.052, 0.020, 0.005, 0.024, { color: 0x6f7a80 });
    mb.push(); mb.translate(0.745, FC_DECK + 0.010, side * 0.052); mb.rotateX(Math.PI / 2);
    mb.cylinder(0, -0.010, 0, 0.0058, 0.020, { seg: 10, color: 0x4b5a72, mat: MAT.STEEL });
    mb.pop();
  }
  const mt = SHIP_MAST_TOP_LOCAL;
  mb.cylinder(mt[0], FC_DECK, mt[2], 0.0048, mt[1] - FC_DECK - 0.003, { seg: 8, r2: 0.0032, color: YELLOW, mat: MAT.STEEL });
  mb.cylinder(mt[0], mt[1] - 0.003, mt[2], 0.0055, 0.003, { seg: 10, color: YELLOW, mat: MAT.STEEL });
  mb.beam([mt[0], mt[1] - 0.05, -0.022], [mt[0], mt[1] - 0.05, 0.022], 0.0032, 0.0032, { color: YELLOW, mat: MAT.STEEL });
  mb.beam([mt[0], mt[1] - 0.018, 0], [mt[0] + 0.009, mt[1] - 0.018, 0], 0.002, 0.002, { color: YELLOW });
  mb.sphere(mt[0] + 0.0105, mt[1] - 0.016, 0, 0.0032, { seg: 8, rings: 4, color: 0xfff4d0, mat: MAT.LAMP, param: 0.45 });

  // forward breakwater shielding the first row
  const bwo = { color: WHITE, mat: MAT.PAINT };
  const bwTop = 0.124, bwMid = (SHIP.deckY + bwTop) / 2, bwH = bwTop - SHIP.deckY;
  mb.beam([0.671, bwMid, -0.148], [0.690, bwMid, 0], 0.003, bwH, bwo);
  mb.beam([0.690, bwMid, 0], [0.671, bwMid, 0.148], 0.003, bwH, bwo);
  for (const z of [-0.11, -0.055, 0.055, 0.11]) mb.beam([0.671 + 0.019 * (1 - Math.abs(z) / 0.148) - 0.002, bwTop - 0.004, z], [0.661, SHIP.deckY, z], 0.0022, 0.0022, bwo);

  // cargo hold: coamings, hatch covers (top at SHIP.hatchY), lashing bridges between the bays
  const hz = 0.137, cz = 0.141, half = BOX.L / 2 + 0.002;
  for (let i = 0; i < SHIP.bays; i++) {
    const bx = bayX(i);
    mb.boxMM(bx - half - 0.0015, SHIP.deckY, -cz, bx + half + 0.0015, SHIP.hatchY - 0.0042, cz, { color: 0x4f5c55, skip: ['bottom'] });
    for (const [z0, z1] of [[-hz, -0.0012], [0.0012, hz]]) {
      mb.boxMM(bx - half, SHIP.hatchY - 0.0042, z0, bx + half, SHIP.hatchY, z1, { color: HATCH, skip: ['bottom'] });
    }
  }
  const lb = { color: YELLOW, mat: MAT.STEEL };
  for (let i = -1; i < SHIP.bays - 1; i++) {
    const x = bayX(i) + BOX.pitchX / 2;
    const yTop = 0.116;
    for (const z of [-0.148, -0.074, 0, 0.074, 0.148]) mb.beam([x, SHIP.deckY, z], [x, yTop, z], 0.0034, 0.0034, lb);
    mb.beam([x, yTop - 0.0017, -0.150], [x, yTop - 0.0017, 0.150], 0.0036, 0.0034, lb);
    mb.beam([x, 0.097, -0.150], [x, 0.097, 0.150], 0.0026, 0.0026, lb);
  }

  // accommodation block: four decks with window rows, then the wheelhouse with bridge wings
  const levels = [
    { x0: ACC.x0, x1: ACC.x1, hz: 0.118, y0: SHIP.deckY, y1: 0.118 },
    { x0: ACC.x0, x1: ACC.x1 - 0.002, hz: 0.118, y0: 0.118, y1: 0.161 },
    { x0: ACC.x0 + 0.007, x1: ACC.x1 - 0.006, hz: 0.112, y0: 0.161, y1: 0.204 },
    { x0: ACC.x0 + 0.015, x1: ACC.x1 - 0.010, hz: 0.106, y0: 0.204, y1: 0.247 },
  ];
  const go = { color: GLASS, mat: MAT.GLASS };
  for (const [li, L] of levels.entries()) {
    mb.boxMM(L.x0, L.y0, -L.hz, L.x1, L.y1 - 0.003, L.hz, { color: WHITE, skip: ['bottom', 'top'] });
    mb.boxMM(L.x0 - 0.003, L.y1 - 0.003, -L.hz - 0.003, L.x1 + 0.003, L.y1, L.hz + 0.003, { color: 0xe9e7e0 });
    const yc = (L.y0 + L.y1) / 2 + 0.001;
    winRowX(mb, L.x1 + 0.0006, -L.hz + 0.008, L.hz - 0.008, yc, 0.014, 0.012, 0.026, go);
    winRowX(mb, L.x0 - 0.0006, -L.hz + 0.02, L.hz - 0.02, yc, 0.013, 0.011, 0.03, go);
    for (const s of [-1, 1]) winRowZ(mb, s * (L.hz + 0.0006), L.x0 + 0.012, L.x1 - 0.012, yc, 0.014, 0.012, 0.026, go);
    if (li === 0) for (const s of [-1, 1]) mb.poly([[L.x1 + 0.0007, L.y0, s * 0.085], [L.x1 + 0.0007, L.y0, s * 0.069], [L.x1 + 0.0007, L.y0 + 0.03, s * 0.069], [L.x1 + 0.0007, L.y0 + 0.03, s * 0.085]], { color: 0x8a949b });
  }
  // wheelhouse
  mb.boxMM(WH.x0, WH.y0, -WH.hz, WH.x1, WH.y1, WH.hz, { color: WHITE, skip: ['bottom', 'top'] });
  mb.boxMM(WH.x0 - 0.004, WH.y1, -WH.hz - 0.005, WH.x1 + 0.008, WH.y1 + 0.004, WH.hz + 0.005, { color: 0xe9e7e0 });
  const wy0 = 0.265, wy1 = 0.287;
  mb.poly([[WH.x1 + 0.0006, wy0, -WH.hz + 0.004], [WH.x1 + 0.0006, wy0, WH.hz - 0.004], [WH.x1 + 0.0006, wy1, WH.hz - 0.004], [WH.x1 + 0.0006, wy1, -WH.hz + 0.004]], go);
  for (const s of [-1, 1]) mb.poly([[WH.x0 + 0.006, wy0, s * (WH.hz + 0.0006)], [WH.x1 - 0.004, wy0, s * (WH.hz + 0.0006)], [WH.x1 - 0.004, wy1, s * (WH.hz + 0.0006)], [WH.x0 + 0.006, wy1, s * (WH.hz + 0.0006)]], go);
  winRowX(mb, WH.x0 - 0.0006, -WH.hz + 0.02, WH.hz - 0.02, (wy0 + wy1) / 2, 0.014, 0.014, 0.03, go);
  for (let z = -WH.hz + 0.004 + 0.0205; z < WH.hz - 0.01; z += 0.0205) mb.beam([WH.x1 + 0.0012, wy0, z], [WH.x1 + 0.0012, wy1, z], 0.0016, 0.0012, { color: WHITE });
  // bridge wings reaching the full beam, with bulwarks and brackets
  for (const s of [-1, 1]) {
    const z0 = s * (WH.hz - 0.002), z1 = s * WING_Z;
    mb.boxMM(-0.800, 0.243, Math.min(z0, z1), -0.746, 0.2475, Math.max(z0, z1), { color: 0xe9e7e0 });
    mb.boxMM(-0.800, 0.2475, s > 0 ? z1 - 0.002 : z1, -0.746, 0.262, s > 0 ? z1 : z1 + 0.002, { color: WHITE });
    mb.boxMM(-0.748, 0.2475, Math.min(z0, z1), -0.746, 0.262, Math.max(z0, z1), { color: WHITE });
    mb.boxMM(-0.800, 0.2475, Math.min(z0, z1), -0.798, 0.262, Math.max(z0, z1), { color: WHITE });
    mb.beam([-0.773, 0.212, s * 0.106], [-0.773, 0.243, s * (WING_Z - 0.006)], 0.004, 0.004, { color: WHITE });
    mb.sphere(-0.752, 0.264, s * (WING_Z - 0.003), 0.0024, { seg: 6, rings: 3, color: s > 0 ? 0x6dff8c : 0xff5a4a, mat: MAT.LAMP, param: 0.35 });
  }
  // radar mast on the wheelhouse roof up to the radar pivot
  const rl = RADAR_LOCAL;
  const roofY = WH.y1 + 0.004;
  mb.cylinder(rl[0], roofY, rl[2], 0.0058, rl[1] - roofY - 0.004, { seg: 8, r2: 0.0036, color: WHITE, mat: MAT.STEEL });
  mb.cylinder(rl[0], rl[1] - 0.004, rl[2], 0.0085, 0.004, { seg: 10, color: WHITE, mat: MAT.STEEL });
  mb.beam([rl[0], rl[1] - 0.034, -0.032], [rl[0], rl[1] - 0.034, 0.032], 0.003, 0.003, { color: WHITE, mat: MAT.STEEL });
  for (const s of [-1, 1]) mb.sphere(rl[0], rl[1] - 0.0305, s * 0.030, 0.0024, { seg: 6, rings: 3, color: 0xfff4d0, mat: MAT.LAMP, param: 0.3 });

  // funnel: navy with a yellow band and a black top, raked aft
  mb.push();
  mb.translate(FUNNEL.x, FUNNEL.y0, 0);
  mb.rotateZ(FUNNEL.rake);
  mb.scale(FUNNEL.sx, 1, 1);
  const fh = (FUNNEL.top - FUNNEL.y0) / Math.cos(FUNNEL.rake), r = FUNNEL.rz;
  const fband = (y0, y1, r0, r1, color) => mb.lathe(0, 0, [[r0, y0 * fh], [r1, y1 * fh]], { seg: 16, color, mat: MAT.STEEL });
  fband(0, 0.58, r * 1.04, r, NAVY);
  fband(0.58, 0.72, r, r, YELLOW);
  fband(0.72, 0.86, r, r, NAVY);
  fband(0.86, 1.0, r, r * 0.98, BLACK);
  mb.cylinder(0, fh - 0.004, 0, r * 0.98, 0.004, { seg: 16, color: 0x111112, caps: true });
  mb.pop();
  for (const dz of [-0.008, 0.008]) mb.cylinder(FUNNEL_TOP[0] + 0.004, FUNNEL.top - 0.01, dz, 0.0042, 0.016, { seg: 8, color: 0x2a2b2d, mat: MAT.STEEL });

  // lifeboat on davits, starboard side (the side the basin sees)
  const lbx = -0.832, lby = 0.150, lbz = 0.138;
  mb.push();
  mb.translate(lbx, lby, lbz);
  mb.push(); mb.scale(0.042, 0.012, 0.0145);
  mb.lathe(0, 0, [[0, -1], [0.55, -0.85], [0.85, -0.45], [1, 0]], { seg: 14, color: ORANGE, mat: MAT.STEEL });
  mb.lathe(0, 0, [[1, 0], [1.02, 0.18]], { seg: 14, color: WHITE });
  mb.pop();
  mb.push(); mb.scale(0.039, 0.011, 0.0135);
  mb.lathe(0, 0, [[1.02, 0.18], [0.94, 0.7], [0.72, 1.15], [0.38, 1.4], [0, 1.45]], { seg: 14, color: ORANGE, mat: MAT.STEEL });
  mb.pop();
  mb.pop();
  for (const dx of [-0.03, 0.03]) {
    const x = lbx + dx;
    mb.beam([x, 0.161, 0.116], [x, 0.188, 0.118], 0.004, 0.004, { color: WHITE });
    mb.beam([x, 0.188, 0.118], [x, 0.184, lbz + 0.002], 0.0036, 0.0036, { color: WHITE });
    mb.beam([x, 0.184, lbz], [x, lby + 0.014, lbz], 0.0012, 0.0012, { color: DARK });
  }

  // stern deck: bollards and a rail round the poop
  for (const s of [-1, 1]) for (const dx of [-0.006, 0.006]) mb.cylinder(-0.941 + dx, SHIP.deckY, s * 0.09, 0.0035, 0.01, { seg: 8, ...bo });
  const railY = SHIP.deckY + 0.016, rail = [];
  for (let k = kP; k >= 0; k--) if (P[jD][k][0] < -0.70) rail.push([P[jD][k][0], railY, P[jD][k][2] * 0.975]);
  for (let k = 0; k <= kP; k++) if (stb(P, jD, k)[0] < -0.70) { const p = stb(P, jD, k); rail.push([p[0], railY, p[2] * 0.975]); }
  mb.tube(rail, 0.0013, { seg: 4, color: WHITE });
  for (const [i, p] of rail.entries()) if (i % 2 === 0 || i === rail.length - 1) mb.beam([p[0], SHIP.deckY, p[2]], p, 0.0014, 0.0014, { color: WHITE });

  mb.pop();

  // radar antenna (spins about +y; placed at RADAR_LOCAL)
  mb.push();
  mb.set({ obj: OBJ.RADAR, mat: MAT.STEEL, color: WHITE });
  mb.cylinder(0, 0, 0, 0.0042, 0.0065, { seg: 10, r2: 0.0034 });
  mb.box(0, 0.0065, 0, 0.012, 0.004, 0.009, { color: 0xdedcd6 });
  mb.boxMM(-0.0028, 0.0095, -0.036, 0.0028, 0.0145, 0.036, { color: WHITE });
  mb.boxMM(-0.0018, 0.0105, -0.036, 0.0033, 0.0135, 0.036, { color: 0x30353b });
  mb.pop();

  // ship propeller (spins about +x; placed at PROP_LOCAL)
  mb.push();
  mb.set({ obj: OBJ.PROP, mat: MAT.STEEL, color: BRONZE });
  propeller(mb, 0.035, 0.0095, 0.014, {});
  mb.pop();
}

// =================================================================================================
// TUG
// =================================================================================================
const TUG_ROWS = [-0.045, -0.0446, -0.0428, -0.0398, -0.0355, -0.030, -0.024, -0.017, -0.011, -0.008, 0.002, 0.012, 0.022,
  0.032, 0.040, 0.048, 0.056, 0.064];
const TUG_AFT_DECK = 0.032, TUG_FORE_DECK = 0.056, TUG_STEP_X = -0.075;
const TUG_FUNNEL = { x: -0.046, y0: 0.088, top: 0.140, rake: 0.1, rz: 0.0105, sx: 1.3 };
const TUG_FUNNEL_TOP = [TUG_FUNNEL.x - (TUG_FUNNEL.top - TUG_FUNNEL.y0) * Math.tan(TUG_FUNNEL.rake), TUG_FUNNEL.top, 0];
const TUG_MAST_TOP = [0.012, 0.182, 0];

const tugBm = y => (y < -0.020 ? 0.035 + Math.sqrt(Math.max(0, 0.025 * 0.025 - (y + 0.020) * (y + 0.020))) : 0.060 + 0.002 * clamp01(y / 0.064));
const tugXF = y => (y >= 0 ? 0.150 + 0.022 * clamp01(y / 0.064) : 0.150 - 0.045 * Math.pow(clamp01(-y / 0.045), 2));
const tugXA = y => {
  if (y >= -0.008) return -0.168 - 0.002 * clamp01((y + 0.008) / 0.072);
  if (y >= -0.038) return -0.128;
  const t = (-0.038 - y) / 0.007;
  return -0.128 + 0.025 * t * t;
};
const TUG_H = {
  xF: tugXF, xA: tugXA,
  hb(x, y) {
    const Bm = tugBm(y), xf = tugXF(y), xa = tugXA(y);
    const Le = y < 0 ? lerp(0.19, 0.14, clamp01((y + 0.045) / 0.045)) : lerp(0.14, 0.095, clamp01(y / 0.064));
    const pf = 1 - Math.pow(1 - clamp01((xf - x) / Le), 2.2);
    let pa;
    if (y >= -0.008) {
      const wT = 0.70 + 0.14 * clamp01((y + 0.008) / 0.072);
      const tr = clamp01((x - xa) / 0.13);
      pa = wT + (1 - wT) * (1 - (1 - tr) * (1 - tr));
    } else {
      const k = clamp01((y + 0.045) / 0.034);
      const tr = clamp01((x - xa) / lerp(0.20, 0.10, k));
      const m = 0.004 / Bm;
      pa = m + (1 - m) * lerp(tr * tr * (3 - 2 * tr), 1 - (1 - tr) * (1 - tr), k * k);
    }
    return Bm * pf * pa;
  },
};

function buildTug(mb) {
  mb.push();
  mb.set({ obj: OBJ.TUG, mat: MAT.PAINT, color: WHITE, param: 0 });
  const n = 30;
  const P = hullGrid(TUG_H, TUG_ROWS, n), N = gridNormals(P), C = P[0].length;
  const J = y => TUG_ROWS.indexOf(y);
  const jA = J(TUG_AFT_DECK), jB = J(0.040), jF = J(TUG_FORE_DECK), jT = J(0.064);
  let kP = 0;
  while (kP < n && P[jA][kP][0] < TUG_STEP_X) kP++;
  const kS = C - 1 - kP;
  const hull = { mat: MAT.HULL, color: TUG_BLACK };
  emitGrid(mb, P, N, 0, jB, 0, C - 1, hull);
  emitGrid(mb, P, N, jB, jT, kP, kS, hull);
  aftClose(mb, P, 0, jB, hull);
  const bl = [], br = [];
  for (let k = 0; k <= n; k++) { bl.push(P[0][k]); br.push(stb(P, 0, k)); }
  ladder(mb, bl, br, [0, -1, 0], hull);
  // decks
  const deckO = { color: TUG_DECK };
  const al = [], ar = [];
  for (let k = 0; k <= kP; k++) { al.push(P[jA][k]); ar.push(stb(P, jA, k)); }
  ladder(mb, al, ar, [0, 1, 0], deckO);
  const fl = [], fr = [];
  for (let k = kP; k <= n; k++) { fl.push(P[jF][k]); fr.push(stb(P, jF, k)); }
  ladder(mb, fl, fr, [0, 1, 0], deckO);
  mb.poly([P[jA][kP], P[jA][kS], P[jF][kS], P[jF][kP]], hull);
  // capping rails: low aft bulwark (round the transom) and the forecastle bulwark
  const aftRail = [];
  for (let k = kP; k >= 0; k--) aftRail.push(P[jB][k]);
  for (let k = C - 1; k >= kS; k--) aftRail.push(P[jB][k]);
  mb.tube(aftRail, 0.0018, { seg: 4, color: WHITE });
  mb.tube(P[jT].slice(kP, kS + 1), 0.0019, { seg: 4, color: WHITE });

  // D-fender all round at the sheer, tyres along the sides, big bow pushing pads
  const ro = { color: RUBBER, mat: MAT.RUBBER };
  const loopAt = (y, sMin, m) => {
    const pts = [];
    const xa = TUG_H.xA(y), xf = TUG_H.xF(y);
    for (let i = 0; i <= m; i++) {
      const u = i / m, s = sMin + (1 - sMin) * (0.45 * u + 0.275 * (1 - Math.cos(Math.PI * u)));
      const x = xa + (xf - xa) * s;
      pts.push([x, y, -TUG_H.hb(x, y)]);
    }
    pts[m][2] = 0;
    for (let i = m - 1; i >= 0; i--) pts.push([pts[i][0], y, -pts[i][2]]);
    return pts;
  };
  const fend = loopAt(0.026, 0, 22);
  fend.push(fend[0]);
  mb.tube(offsetPlan(fend, 0.0045, false), 0.0058, { seg: 6, ...ro });
  const pad1 = loopAt(0.040, 0.80, 8), pad2 = loopAt(0.016, 0.82, 8);
  mb.tube(offsetPlan(pad1, 0.008, false), 0.0095, { seg: 9, ...ro });
  mb.tube(offsetPlan(pad2, 0.006, false), 0.0078, { seg: 8, ...ro });
  const rand = makeRand(23);
  for (const side of [-1, 1]) for (const x of [-0.125, -0.088, -0.051, -0.014, 0.023, 0.06]) {
    const y = 0.012, z = side * (TUG_H.hb(x, y) + 0.0042);
    torus(mb, [x, y, z], [1, 0, 0], unit([0, 1, side * (0.12 + rand() * 0.08)]), 0.0066, 0.0034, 8, 5, ro);
  }

  // skeg, nozzle, rudder (the propeller itself is OBJ.TUG_PROP)
  const tp = TUG_PROP_LOCAL;
  mb.push(); mb.rotateX(-Math.PI / 2);
  mb.prism([[-0.128, -0.040], [0.03, -0.040], [0.02, -0.0465], [-0.10, -0.0705], [-0.128, -0.0705]], -0.003, 0.003, { ...hull, bottom: true });
  mb.pop();
  mb.push();
  mb.translate(tp[0], tp[1], 0);
  mb.rotateZ(-Math.PI / 2); // local +y -> +x
  mb.lathe(0, 0, [[0.0205, -0.010], [0.0222, -0.0108], [0.0248, -0.004], [0.0255, 0.006], [0.0236, 0.0105], [0.0212, 0.0105], [0.0205, 0.004], [0.0205, -0.010]], { seg: 16, ...hull });
  mb.pop();
  mb.push(); mb.translate(tp[0], tp[1], 0); mb.rotateZ(-Math.PI / 2);
  mb.lathe(0, 0, [[0.0058, 0.004], [0.0058, 0.022], [0, 0.0225]], { seg: 8, ...hull });
  mb.pop();
  mb.beam([-0.128, -0.069, 0], [-0.176, -0.0705, 0], 0.0045, 0.003, hull);
  mb.beam([tp[0], tp[1] - 0.025, 0], [tp[0], -0.0695, 0], 0.003, 0.004, hull);
  fin(mb, [-0.165, -0.186, -0.006, 0.0055], [-0.166, -0.184, -0.068, 0.0045], hull);

  // deckhouse (red), wheelhouse (white, windows all round), funnel, mast
  const dh = { x0: -0.070, x1: 0.074, hz: 0.043, y0: TUG_FORE_DECK, y1: 0.088 };
  mb.boxMM(dh.x0, dh.y0, -dh.hz, dh.x1, dh.y1 - 0.002, dh.hz, { color: TUG_RED, skip: ['bottom', 'top'] });
  mb.boxMM(dh.x0 - 0.002, dh.y1 - 0.002, -dh.hz - 0.002, dh.x1 + 0.002, dh.y1, dh.hz + 0.002, { color: WHITE });
  const go = { color: GLASS, mat: MAT.GLASS };
  for (const s of [-1, 1]) {
    winRowZ(mb, s * (dh.hz + 0.0006), dh.x0 + 0.03, dh.x1 - 0.01, 0.074, 0.008, 0.008, 0.02, go);
    mb.poly([[dh.x0 + 0.008, dh.y0 + 0.003, s * (dh.hz + 0.0006)], [dh.x0 + 0.02, dh.y0 + 0.003, s * (dh.hz + 0.0006)], [dh.x0 + 0.02, dh.y0 + 0.026, s * (dh.hz + 0.0006)], [dh.x0 + 0.008, dh.y0 + 0.026, s * (dh.hz + 0.0006)]], { color: 0x8a2a22 });
  }
  winRowX(mb, dh.x1 + 0.0006, -0.03, 0.03, 0.074, 0.008, 0.008, 0.02, go);
  const wh = { x0: -0.022, x1: 0.058, hz: 0.036, y0: 0.088, y1: 0.118 };
  mb.boxMM(wh.x0, wh.y0, -wh.hz, wh.x1, wh.y1, wh.hz, { color: WHITE, skip: ['bottom', 'top'] });
  mb.boxMM(wh.x0 - 0.003, wh.y1, -wh.hz - 0.004, wh.x1 + 0.007, wh.y1 + 0.004, wh.hz + 0.004, { color: TUG_RED });
  const wy0 = 0.097, wy1 = 0.112;
  mb.poly([[wh.x1 + 0.0006, wy0, -wh.hz + 0.003], [wh.x1 + 0.0006, wy0, wh.hz - 0.003], [wh.x1 + 0.0006, wy1, wh.hz - 0.003], [wh.x1 + 0.0006, wy1, -wh.hz + 0.003]], go);
  mb.poly([[wh.x0 - 0.0006, wy0, -wh.hz + 0.004], [wh.x0 - 0.0006, wy0, wh.hz - 0.004], [wh.x0 - 0.0006, wy1, wh.hz - 0.004], [wh.x0 - 0.0006, wy1, -wh.hz + 0.004]], go);
  for (const s of [-1, 1]) mb.poly([[wh.x0 + 0.003, wy0, s * (wh.hz + 0.0006)], [wh.x1 - 0.003, wy0, s * (wh.hz + 0.0006)], [wh.x1 - 0.003, wy1, s * (wh.hz + 0.0006)], [wh.x0 + 0.003, wy1, s * (wh.hz + 0.0006)]], go);
  for (let z = -wh.hz + 0.003 + 0.0132; z < wh.hz - 0.006; z += 0.0132) mb.beam([wh.x1 + 0.0011, wy0, z], [wh.x1 + 0.0011, wy1, z], 0.0013, 0.001, { color: WHITE });
  for (const s of [-1, 1]) for (let x = wh.x0 + 0.003 + 0.0155; x < wh.x1 - 0.006; x += 0.0155) mb.beam([x, wy0, s * (wh.hz + 0.0011)], [x, wy1, s * (wh.hz + 0.0011)], 0.0013, 0.001, { color: WHITE });
  // funnel
  mb.push();
  mb.translate(TUG_FUNNEL.x, TUG_FUNNEL.y0, 0);
  mb.rotateZ(TUG_FUNNEL.rake);
  mb.scale(TUG_FUNNEL.sx, 1, 1);
  const fh = (TUG_FUNNEL.top - TUG_FUNNEL.y0) / Math.cos(TUG_FUNNEL.rake), fr2 = TUG_FUNNEL.rz;
  const fb = (a, b, color) => mb.lathe(0, 0, [[fr2, a * fh], [fr2, b * fh]], { seg: 12, color, mat: MAT.STEEL });
  fb(0, 0.55, TUG_RED); fb(0.55, 0.70, WHITE); fb(0.70, 0.84, TUG_RED); fb(0.84, 1, BLACK);
  mb.cylinder(0, fh - 0.003, 0, fr2, 0.003, { seg: 12, color: 0x111112 });
  mb.pop();
  // mast with lights on the wheelhouse roof
  const mt = TUG_MAST_TOP, ry = wh.y1 + 0.004;
  mb.cylinder(mt[0], ry, 0, 0.0032, mt[1] - ry - 0.002, { seg: 8, r2: 0.002, color: WHITE, mat: MAT.STEEL });
  mb.cylinder(mt[0], mt[1] - 0.002, 0, 0.0034, 0.002, { seg: 8, color: WHITE });
  mb.beam([mt[0], 0.160, -0.016], [mt[0], 0.160, 0.016], 0.0022, 0.0022, { color: WHITE });
  mb.sphere(mt[0] + 0.003, mt[1] - 0.008, 0, 0.0024, { seg: 6, rings: 3, color: 0xfff4d0, mat: MAT.LAMP, param: 0.4 });
  mb.sphere(mt[0] + 0.003, mt[1] - 0.016, 0, 0.0022, { seg: 6, rings: 3, color: 0xfff4d0, mat: MAT.LAMP, param: 0.4 });
  for (const s of [-1, 1]) mb.sphere(mt[0], 0.1625, s * 0.015, 0.0019, { seg: 6, rings: 3, color: s > 0 ? 0x6dff8c : 0xff5a4a, mat: MAT.LAMP, param: 0.35 });
  mb.box(0.03, ry, 0, 0.004, 0.006, 0.004, { color: WHITE });
  mb.boxMM(0.022, ry + 0.006, -0.014, 0.034, ry + 0.009, 0.014, { color: 0x30353b });

  // bow: towing staple at TUG_HOOK_LOCAL and a winch just aft of it
  const hk = TUG_HOOK_LOCAL, so = { color: 0xd9d6cf, mat: MAT.STEEL };
  const sy0 = TUG_FORE_DECK;
  mb.tube([[hk[0], sy0, -0.013], [hk[0], hk[1] - 0.006, -0.013], [hk[0], hk[1] - 0.001, -0.009], [hk[0], hk[1], 0], [hk[0], hk[1] - 0.001, 0.009], [hk[0], hk[1] - 0.006, 0.013], [hk[0], sy0, 0.013]], 0.0022, { seg: 6, ...so });
  mb.box(0.104, sy0, 0, 0.018, 0.004, 0.044, { color: 0x4a4f55 });
  for (const s of [-1, 1]) mb.box(0.104, sy0 + 0.004, s * 0.019, 0.016, 0.012, 0.004, { color: 0x4a4f55 });
  mb.push(); mb.translate(0.104, sy0 + 0.0115, 0); mb.rotateX(Math.PI / 2);
  mb.cylinder(0, -0.017, 0, 0.0062, 0.034, { seg: 10, color: TUG_RED, mat: MAT.STEEL });
  mb.cylinder(0, -0.012, 0, 0.0068, 0.024, { seg: 10, color: 0xd8cfb4, mat: MAT.CANVAS, caps: false });
  mb.pop();

  // aft working deck: towing winch and H-bitt
  const ad = TUG_AFT_DECK;
  mb.box(-0.098, ad, 0, 0.018, 0.004, 0.05, { color: 0x4a4f55 });
  for (const s of [-1, 1]) mb.box(-0.098, ad + 0.004, s * 0.022, 0.016, 0.013, 0.004, { color: 0x4a4f55 });
  mb.push(); mb.translate(-0.098, ad + 0.012, 0); mb.rotateX(Math.PI / 2);
  mb.cylinder(0, -0.020, 0, 0.0066, 0.040, { seg: 10, color: TUG_RED, mat: MAT.STEEL });
  mb.cylinder(0, -0.014, 0, 0.0072, 0.028, { seg: 10, color: 0xd8cfb4, mat: MAT.CANVAS, caps: false });
  mb.pop();
  for (const s of [-1, 1]) mb.cylinder(-0.148, ad, s * 0.014, 0.0035, 0.014, { seg: 8, color: 0xd9d6cf, mat: MAT.STEEL });
  mb.beam([-0.148, ad + 0.010, -0.018], [-0.148, ad + 0.010, 0.018], 0.004, 0.004, { color: 0xd9d6cf, mat: MAT.STEEL });
  mb.pop();

  // tug propeller (spins about +x; placed at TUG_PROP_LOCAL)
  mb.push();
  mb.set({ obj: OBJ.TUG_PROP, mat: MAT.STEEL, color: BRONZE });
  propeller(mb, 0.0185, 0.0052, 0.010, {});
  mb.pop();
}

// =================================================================================================
// YACHTS
// =================================================================================================
const Y_ROWS = [-0.0165, -0.0161, -0.015, -0.0125, -0.009, -0.0055, -0.0025, 0.0, 0.002, 0.008, 0.014, 0.0185, 0.0235, 0.027];
const Y_DECK = 0.027;
const Y_MAST = { x: 0.032, top: 0.352 };
const yRise = x => 0.0055 * Math.pow(clamp01((x + 0.13) / 0.26), 2);
const yBm = y => (y < 0 ? 0.041 * Math.sqrt(Math.max(0, 1 - Math.pow(-y / 0.0168, 2.4))) : 0.041 + 0.0015 * clamp01(y / 0.027));
const yXF = y => (y >= 0 ? 0.113 + 0.017 * clamp01(y / 0.027) : 0.113 - 0.062 * Math.pow(clamp01(-y / 0.0165), 2));
const yXA = y => (y >= 0.002 ? -0.128 + 0.002 * clamp01((y - 0.002) / 0.025) : -0.127 + 0.10 * Math.pow(clamp01((0.002 - y) / 0.0185), 2));
const YACHT_H = {
  xF: yXF, xA: yXA,
  hb(x, y) {
    const Bm = yBm(y), xf = yXF(y), xa = yXA(y);
    const Le = y < 0 ? lerp(0.07, 0.13, clamp01((y + 0.0165) / 0.0165)) : lerp(0.13, 0.115, clamp01(y / 0.027));
    const pf = 1 - Math.pow(1 - clamp01((xf - x) / Le), 1.8);
    let pa;
    const tr = clamp01((x - xa) / (y >= 0.002 ? 0.12 : 0.10));
    const conv = 1 - (1 - tr) * (1 - tr);
    if (y >= 0.002) { const wT = 0.72 + 0.06 * clamp01((y - 0.002) / 0.025); pa = wT + (1 - wT) * conv; }
    else { const mA = 0.55 * clamp01((y + 0.008) / 0.01); pa = mA + (1 - mA) * conv; }
    return Bm * pf * pa;
  },
  warp: (x, y) => (y > 0 ? y + yRise(x) * clamp01(y / Y_DECK) : y),
};
const yDeckAt = x => Y_DECK + yRise(x);

function buildYacht(mb, obj, stripe) {
  mb.push();
  mb.set({ obj, mat: MAT.PAINT, color: WHITE, param: 0 });
  const n = 26;
  const P = hullGrid(YACHT_H, Y_ROWS, n), N = gridNormals(P), C = P[0].length;
  const J = y => Y_ROWS.indexOf(y);
  const j0 = J(0.0185), j1 = J(0.0235), jT = Y_ROWS.length - 1;
  const hw = { mat: MAT.HULL, color: WHITE };
  emitGrid(mb, P, N, 0, j0, 0, C - 1, hw);
  emitGrid(mb, P, N, j0, j1, 0, C - 1, { mat: MAT.HULL, color: stripe });
  emitGrid(mb, P, N, j1, jT, 0, C - 1, hw);
  aftClose(mb, P, 0, jT, hw);
  const bl = [], br = [];
  for (let k = 0; k <= n; k++) { bl.push(P[0][k]); br.push(stb(P, 0, k)); }
  ladder(mb, bl, br, [0, -1, 0], hw);
  // cambered deck
  const D = [];
  for (let k = 0; k <= n; k++) {
    const a = P[jT][k], b = stb(P, jT, k), row = [];
    for (let m = 0; m <= 6; m++) {
      const t = m / 6, z = lerp(a[2], b[2], t);
      row.push([a[0], a[1] + 0.0028 * (1 - (2 * t - 1) * (2 * t - 1)), z]);
    }
    D.push(row);
  }
  surface(mb, D, { color: 0xebe6da });
  // toe rail
  const toe = [];
  for (let k = 0; k < C; k++) toe.push(P[jT][k]);
  toe.push(P[jT][0]);
  mb.tube(toe.map(p => [p[0], p[1] + 0.0008, p[2] * 0.985]), 0.0011, { seg: 4, color: 0xc49a6c, mat: MAT.TIMBER });

  // keel with bulb, spade rudder (dark, seen through the jelly)
  const ko = { color: 0x2a2c31, mat: MAT.STEEL };
  fin(mb, [0.040, -0.014, -0.012, 0.0078], [0.011, -0.024, -0.060, 0.0056], ko);
  mb.push(); mb.translate(-0.006, -0.0615, 0); mb.scale(0.029, 0.0072, 0.0082);
  mb.sphere(0, 0, 0, 1, { seg: 12, rings: 6, ...ko });
  mb.pop();
  fin(mb, [-0.088, -0.112, -0.004, 0.0045], [-0.094, -0.110, -0.047, 0.0032], ko);

  // cockpit (teak sole and white coamings) and a wheel
  const ca = -0.112, cf = -0.038, cw = 0.024;
  mb.boxMM(ca, yDeckAt(ca) + 0.0005, -cw, cf, yDeckAt(ca) + 0.0018, cw, { color: 0xb98a58, mat: MAT.TIMBER, param: 0.2, skip: ['bottom'] });
  for (const s of [-1, 1]) mb.boxMM(ca + 0.004, yDeckAt(ca), s > 0 ? cw : -cw - 0.0022, cf, yDeckAt(cf) + 0.0065, s > 0 ? cw + 0.0022 : -cw, { color: WHITE, skip: ['bottom'] });
  torus(mb, [-0.104, yDeckAt(-0.104) + 0.012, 0], [0, 1, 0], [0, 0, 1], 0.0085, 0.0009, 16, 4, { color: 0x3a3d42, mat: MAT.STEEL });
  mb.beam([-0.104, yDeckAt(-0.104), 0], [-0.104, yDeckAt(-0.104) + 0.012, 0], 0.003, 0.003, { color: 0x3a3d42 });
  // cabin trunk with windows
  const cabin = [[-0.038, -0.025], [0.040, -0.023], [0.056, -0.012], [0.060, 0], [0.056, 0.012], [0.040, 0.023], [-0.038, 0.025]];
  mb.prism(cabin, Y_DECK - 0.004, Y_DECK + 0.0145, { color: WHITE });
  const ctop = Y_DECK + 0.0145;
  mb.prism(cabin.map(([x, z]) => [x * 0.96 - 0.001, z * 0.9]), ctop, ctop + 0.0018, { color: 0xe9e5dc });
  const go = { color: GLASS, mat: MAT.GLASS };
  for (const s of [-1, 1]) {
    const z = s * 0.0245, y0 = Y_DECK + 0.006, y1 = Y_DECK + 0.0105;
    mb.poly([[-0.026, y0, z], [0.018, y0, z], [0.032, y1, z], [-0.026, y1, z]].map(p => [p[0], p[1], p[2] + s * 0.0006]), go);
  }
  mb.poly([[0.0566, Y_DECK + 0.006, -0.0105], [0.0566, Y_DECK + 0.006, 0.0105], [0.0566, Y_DECK + 0.011, 0.0105], [0.0566, Y_DECK + 0.011, -0.0105]].map(p => [p[0] + 0.0012, p[1], p[2]]), go);
  mb.box(-0.015, ctop + 0.0018, 0, 0.018, 0.003, 0.018, { color: 0xd8d3c8 });

  // rig: mast, spreaders, boom with the furled mainsail, furled jib on the forestay, stays and shrouds
  const mo = { color: 0xc9ccd0, mat: MAT.STEEL };
  const mx = Y_MAST.x, mtop = Y_MAST.top, mbase = ctop;
  mb.cylinder(mx, mbase, 0, 0.0027, mtop - mbase, { seg: 8, r2: 0.0017, ...mo });
  mb.cylinder(mx, mtop - 0.001, 0, 0.0022, 0.001, { seg: 8, ...mo });
  mb.sphere(mx + 0.002, mtop - 0.004, 0, 0.0018, { seg: 6, rings: 3, color: 0xfff4d0, mat: MAT.LAMP, param: 0.4 });
  const spY = 0.205;
  mb.beam([mx, spY, -0.019], [mx, spY, 0.019], 0.0018, 0.0012, mo);
  const boomA = [mx - 0.002, 0.066, 0], boomB = [-0.104, 0.069, 0];
  mb.beam(boomA, boomB, 0.0034, 0.0042, mo);
  sausage(mb, [mx - 0.004, 0.0705, 0], [-0.100, 0.0735, 0], [[0.0012, 0], [0.0052, 0.06], [0.0066, 0.3], [0.0062, 0.7], [0.0048, 0.93], [0.0012, 1]], { seg: 8, color: CREAM, mat: MAT.CANVAS });
  mb.beam([mx, 0.06, 0], [mx, 0.075, 0], 0.003, 0.003, mo);
  const bowP = [0.126, yDeckAt(0.126) + 0.004, 0], sternP = [-0.124, yDeckAt(-0.124) + 0.002, 0];
  const jibTop = add(bowP, mul(sub([mx, mtop - 0.03, 0], bowP), 0.86));
  sausage(mb, add(bowP, [-0.002, 0.004, 0]), jibTop, [[0.0012, 0], [0.0045, 0.05], [0.0042, 0.4], [0.0028, 0.8], [0.0009, 1]], { seg: 7, color: CREAM, mat: MAT.CANVAS });
  const wire = { seg: 3, color: 0x55595e, mat: MAT.STEEL };
  mb.tube([[mx, mtop - 0.026, 0], bowP], 0.0006, wire);
  mb.tube([[mx, mtop - 0.004, 0], sternP], 0.0006, wire);
  for (const s of [-1, 1]) {
    const chain = [mx - 0.004, yDeckAt(mx) + 0.001, s * 0.038];
    mb.tube([[mx, mtop - 0.03, 0], [mx, spY, s * 0.019], chain], 0.0005, wire);
  }
  // bow pulpit, stern pushpit and lifelines
  const ro = { seg: 4, color: 0xd5d8dc, mat: MAT.STEEL };
  const rh = 0.013;
  const yd = x => yDeckAt(x);
  const hbD = x => YACHT_H.hb(x, Y_DECK) * 0.92;
  mb.tube([[0.084, yd(0.084), -hbD(0.084)], [0.086, yd(0.086) + rh, -hbD(0.086)], [0.106, yd(0.106) + rh, -hbD(0.106) * 0.9], [0.121, yd(0.121) + rh, -0.006], [0.124, yd(0.124) + rh * 0.7, 0], [0.121, yd(0.121) + rh, 0.006], [0.106, yd(0.106) + rh, hbD(0.106) * 0.9], [0.086, yd(0.086) + rh, hbD(0.086)], [0.084, yd(0.084), hbD(0.084)]], 0.0008, ro);
  mb.beam([0.124, yd(0.124), 0], [0.124, yd(0.124) + rh * 0.7, 0], 0.0012, 0.0012, ro);
  for (const s of [-1, 1]) {
    const xs = [-0.118, -0.07, -0.02, 0.03, 0.086];
    for (const x of xs.slice(0, -1)) mb.beam([x, yd(x), s * hbD(x)], [x, yd(x) + rh, s * hbD(x)], 0.0011, 0.0011, ro);
    mb.tube(xs.map(x => [x, yd(x) + rh, s * hbD(x)]), 0.0005, { ...ro, seg: 3 });
    mb.tube([[-0.104, yd(-0.104) + rh, s * hbD(-0.104)], [-0.118, yd(-0.118) + rh, s * hbD(-0.118)], [-0.1235, yd(-0.124) + rh, s * 0.016], [-0.1235, yd(-0.124) + rh, s * 0.004]], 0.0008, ro);
    mb.beam([-0.1235, yd(-0.124), s * 0.016], [-0.1235, yd(-0.124) + rh, s * 0.016], 0.0011, 0.0011, ro);
  }
  mb.pop();
}

// =================================================================================================
// FISHING BOATS (ten-frame working decks for the number-bond game)
// =================================================================================================
const FB = FISHBOAT;
const FB_ROWS = [-0.034, -0.0335, -0.032, -0.029, -0.024, -0.017, -0.009, -0.001, 0.004, 0.014, 0.024, 0.033, 0.0395,
  FB.deckY - 0.0025, 0.047, 0.055, 0.063];
const FB_DECK = FB.deckY - 0.0025; // timber deck; the ten-frame pads rise to FB.deckY
const FB_WH = { x0: -0.247, x1: -0.112, hz: 0.054, y1: 0.100 };
const FB_MAST_TOP = [-0.176, 0.176, 0];
const fbRise = x => 0.020 * Math.pow(sstep(-0.02, 0.27, x), 1.3) + 0.004 * sstep(-0.12, -0.27, x);
const fbBm = y => (y < 0 ? 0.083 * Math.pow(Math.max(0, 1 - Math.pow(-y / 0.0345, 1.8)), 0.6) : 0.083 + 0.002 * clamp01(y / 0.063));
const fbXF = y => (y >= 0 ? 0.232 + 0.034 * clamp01(y / 0.063) : 0.232 - 0.06 * Math.pow(clamp01(-y / 0.034), 2));
const fbXA = y => {
  if (y >= 0.004) return -0.256 - 0.006 * clamp01((y - 0.004) / 0.059);
  if (y >= -0.026) return -0.222;
  const t = (-0.026 - y) / 0.008;
  return -0.222 + 0.03 * t * t;
};
const FISH_H = {
  xF: fbXF, xA: fbXA,
  hb(x, y) {
    const Bm = fbBm(y), xf = fbXF(y), xa = fbXA(y);
    let Le, pw;
    if (y < 0) { const t = clamp01((y + 0.034) / 0.034); Le = lerp(0.26, 0.20, t); pw = lerp(1.8, 2.0, t); }
    else { const t = clamp01(y / 0.0395); Le = lerp(0.20, 0.14, t); pw = lerp(2.0, 2.6, t); }
    const pf = 1 - Math.pow(1 - clamp01((xf - x) / Le), pw);
    let pa;
    if (y >= 0.004) {
      const wT = 0.70 + 0.10 * clamp01((y - 0.004) / 0.059);
      const tr = clamp01((x - xa) / 0.20);
      pa = wT + (1 - wT) * (1 - (1 - tr) * (1 - tr));
    } else {
      const k = clamp01((y + 0.034) / 0.033);
      const tr = clamp01((x - xa) / lerp(0.30, 0.16, k));
      const m = 0.004 / Bm;
      pa = m + (1 - m) * lerp(tr * tr * (3 - 2 * tr), 1 - (1 - tr) * (1 - tr), k * k);
    }
    return Bm * pf * pa;
  },
  warp: (x, y) => (y > 0.047 ? y + fbRise(x) * clamp01((y - 0.047) / 0.016) : y),
};

function buildFishBoat(mb, obj, hullColor) {
  mb.push();
  mb.set({ obj, mat: MAT.PAINT, color: WHITE, param: 0 });
  const n = 30;
  const P = hullGrid(FISH_H, FB_ROWS, n), N = gridNormals(P), C = P[0].length;
  const J = y => FB_ROWS.indexOf(y);
  const jS0 = J(0.0395), jS1 = J(0.047), jD = J(FB_DECK), jT = FB_ROWS.length - 1;
  const hull = { mat: MAT.HULL, color: hullColor }, band = { mat: MAT.HULL, color: WHITE };
  emitGrid(mb, P, N, 0, jS0, 0, C - 1, hull);
  emitGrid(mb, P, N, jS0, jS1, 0, C - 1, band);
  emitGrid(mb, P, N, jS1, jT, 0, C - 1, hull);
  aftClose(mb, P, 0, jS0, hull);
  aftClose(mb, P, jS0, jS1, band);
  aftClose(mb, P, jS1, jT, hull);
  const bl = [], br = [];
  for (let k = 0; k <= n; k++) { bl.push(P[0][k]); br.push(stb(P, 0, k)); }
  ladder(mb, bl, br, [0, -1, 0], hull);
  // flat timber deck
  const dl = [], dr = [];
  for (let k = 0; k <= n; k++) { dl.push(P[jD][k]); dr.push(stb(P, jD, k)); }
  ladder(mb, dl, dr, [0, 1, 0], { color: 0xb48b5c, mat: MAT.TIMBER, param: 0.2 });
  // gunwale capping all round
  const cap = [];
  for (let k = 0; k < C; k++) cap.push(P[jT][k]);
  cap.push(P[jT][0]);
  mb.tube(cap.map(p => [p[0], p[1] + 0.001, p[2] * 0.985]), 0.0034, { seg: 5, color: WHITE });

  // THE TEN FRAME: a dark plate with ten pale pads (5 along the boat, 2 rows); crates sit on the pads at FB.deckY
  const slots = boatSlots();
  const hc = FB.crate / 2, m = 0.006;
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const [x, , z] of slots) { x0 = Math.min(x0, x - hc); x1 = Math.max(x1, x + hc); z0 = Math.min(z0, z - hc); z1 = Math.max(z1, z + hc); }
  mb.boxMM(x0 - m, FB_DECK, z0 - m, x1 + m, FB.deckY - 0.0012, z1 + m, { color: 0x36424c, skip: ['bottom'] });
  for (const [x, y, z] of slots) mb.boxMM(x - hc, y - 0.0012, z - hc, x + hc, y, z + hc, { color: 0xf3e7b0, skip: ['bottom'] });

  // wheelhouse at the stern: white with windows, coloured roof, little mast with a light and a gull perch
  const W = FB_WH;
  mb.boxMM(W.x0, FB_DECK, -W.hz, W.x1, W.y1, W.hz, { color: WHITE, skip: ['bottom', 'top'] });
  mb.boxMM(W.x0 - 0.004, W.y1, -W.hz - 0.005, W.x1 + 0.007, W.y1 + 0.005, W.hz + 0.005, { color: hullColor, mat: MAT.STEEL });
  const go = { color: GLASS, mat: MAT.GLASS };
  winRowX(mb, W.x1 + 0.0006, -W.hz + 0.006, W.hz - 0.006, 0.083, 0.027, 0.020, 0.0345, go);
  for (const s of [-1, 1]) winRowZ(mb, s * (W.hz + 0.0006), W.x0 + 0.03, W.x1 - 0.008, 0.084, 0.032, 0.018, 0.046, go);
  mb.poly([[W.x0 - 0.0006, FB_DECK + 0.002, -0.012], [W.x0 - 0.0006, FB_DECK + 0.002, 0.012], [W.x0 - 0.0006, 0.090, 0.012], [W.x0 - 0.0006, 0.090, -0.012]], { color: 0x7d8b93 });
  const mt = FB_MAST_TOP, ry = W.y1 + 0.005;
  mb.cylinder(mt[0], ry, 0, 0.0034, mt[1] - ry - 0.002, { seg: 8, r2: 0.0024, color: WHITE, mat: MAT.STEEL });
  mb.cylinder(mt[0], mt[1] - 0.002, 0, 0.0042, 0.002, { seg: 8, color: WHITE });
  mb.beam([mt[0], mt[1] - 0.026, -0.018], [mt[0], mt[1] - 0.026, 0.018], 0.0024, 0.0024, { color: WHITE });
  mb.sphere(mt[0] + 0.0045, mt[1] - 0.012, 0, 0.0028, { seg: 6, rings: 3, color: 0xfff4d0, mat: MAT.LAMP, param: 0.45 });
  mb.beam([mt[0], mt[1] - 0.012, 0], [mt[0] + 0.004, mt[1] - 0.012, 0], 0.0015, 0.0015, { color: WHITE });
  mb.cylinder(-0.135, ry, 0.022, 0.0075, 0.009, { seg: 10, color: WHITE });
  mb.push(); mb.translate(-0.226, ry + 0.0065, -0.030); mb.rotateZ(Math.PI / 2);
  mb.cylinder(0, -0.014, 0, 0.0062, 0.028, { seg: 10, color: 0xf0eee8 });
  mb.pop();

  // bow: bollard and a little anchor winch, ahead of the frame
  const bo = { color: 0x2b2e33, mat: MAT.STEEL };
  for (const dz of [-0.007, 0.007]) mb.cylinder(0.226, FB_DECK, dz, 0.0032, 0.010, { seg: 8, ...bo });
  mb.box(0.205, FB_DECK, 0, 0.010, 0.006, 0.028, { color: 0x5d6970 });
  // fender tyres on the pier (port) side
  const rand = makeRand(obj * 7 + 3);
  for (const x of [-0.17, -0.02, 0.13]) {
    const y = 0.022, z = -(FISH_H.hb(x, y) + 0.0045);
    torus(mb, [x, y, z], [1, 0, 0], unit([0, 1, -0.18 + rand() * 0.06]), 0.0085, 0.004, 8, 5, { color: RUBBER, mat: MAT.RUBBER });
    const topY = FISH_H.warp(x, FB_ROWS[jT]) + 0.004, zr = -FISH_H.hb(x, 0.06);
    mb.tube([[x, y + 0.012, z], [x, topY - 0.002, zr - 0.004], [x, topY, zr + 0.002], [x, topY - 0.004, zr + 0.006]], 0.0008, { seg: 3, color: 0xd8cfb4, mat: MAT.CANVAS });
  }

  // underwater: keel, propeller, rudder
  mb.push(); mb.rotateX(-Math.PI / 2);
  mb.prism([[-0.222, -0.028], [0.17, -0.028], [0.20, -0.016], [0.17, -0.036], [-0.05, -0.044], [-0.222, -0.049]], -0.0045, 0.0045, { ...hull, bottom: true });
  mb.pop();
  mb.push(); mb.translate(-0.2335, -0.031, 0);
  propeller(mb, 0.0155, 0.0045, 0.008, { color: BRONZE, mat: MAT.STEEL });
  mb.pop();
  mb.push(); mb.translate(-0.222, -0.031, 0); mb.rotateZ(Math.PI / 2);
  mb.lathe(0, 0, [[0.0055, 0], [0.0045, 0.008]], { seg: 8, ...hull });
  mb.pop();
  fin(mb, [-0.244, -0.263, 0.006, 0.005], [-0.245, -0.262, -0.045, 0.004], hull);
  mb.beam([-0.222, -0.0475, 0], [-0.252, -0.0475, 0], 0.004, 0.003, hull);
  mb.pop();
}

// =================================================================================================
// BUOYS
// =================================================================================================
function chain(mb, top, links, o) {
  for (let i = 0; i < links; i++) {
    const c = [top[0], top[1] - 0.0065 - i * 0.0085, top[2]];
    const u = i % 2 ? [0, 0, 1] : [1, 0, 0];
    mb.push(); mb.translate(c[0], c[1], c[2]); mb.scale(1, 1.5, 1);
    torus(mb, [0, 0, 0], u, [0, 1, 0], 0.0032, 0.0012, 8, 4, o);
    mb.pop();
  }
}

function buildChannelBuoy(mb) {
  mb.push();
  mb.set({ obj: OBJ.CHANNEL_BUOY, mat: MAT.STEEL, color: 0x2e9b4f, param: 0 });
  const G = 0x2e9b4f;
  mb.lathe(0, 0, [[0, -0.032], [0.016, -0.031], [0.03, -0.026], [0.037, -0.016], [0.039, -0.004], [0.039, 0.012], [0.036, 0.017], [0.026, 0.020], [0, 0.0205]], { seg: 20, color: G });
  mb.cylinder(0, 0.0, 0, 0.0398, 0.006, { seg: 20, caps: false, color: 0xf3f2ee, mat: MAT.PAINT });
  // tower legs, platform, conical top mark, light
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.5;
    mb.beam([Math.cos(a) * 0.022, 0.019, Math.sin(a) * 0.022], [Math.cos(a) * 0.011, 0.062, Math.sin(a) * 0.011], 0.0034, 0.0034, { color: G });
  }
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.5, b = ((i + 1) / 3) * Math.PI * 2 + 0.5, r = 0.0165;
    mb.beam([Math.cos(a) * r, 0.04, Math.sin(a) * r], [Math.cos(b) * r, 0.04, Math.sin(b) * r], 0.0022, 0.0022, { color: G });
  }
  mb.cylinder(0, 0.061, 0, 0.016, 0.0035, { seg: 12, color: G });
  mb.cylinder(0, 0.0645, 0, 0.0025, 0.004, { seg: 6, color: DARK });
  mb.cylinder(0, 0.068, 0, 0.0125, 0.024, { seg: 14, r2: 0.0005, color: G });
  mb.cylinder(0, 0.068, 0, 0.0018, 0.03, { seg: 6, color: DARK });
  mb.cylinder(0, 0.096, 0, 0.0045, 0.0015, { seg: 10, color: DARK });
  mb.cylinder(0, 0.0975, 0, 0.0034, 0.0055, { seg: 10, color: 0x7dff9e, mat: MAT.LAMP, param: 0.55 });
  mb.cylinder(0, 0.103, 0, 0.0042, 0.0015, { seg: 10, color: DARK });
  // counterweight tail and chain
  mb.cylinder(0, -0.072, 0, 0.0055, 0.042, { seg: 8, r2: 0.0075, color: DARK, mat: MAT.PAINT });
  chain(mb, [0, -0.072, 0], 5, { color: 0x4a4d52, mat: MAT.STEEL });
  mb.pop();
}

function buildMooringBuoy(mb, obj) {
  mb.push();
  mb.set({ obj, mat: MAT.STEEL, color: 0xf2c230, param: 0 });
  mb.sphere(0, 0.004, 0, 0.030, { seg: 14, rings: 9 });
  mb.cylinder(0, 0.031, 0, 0.0045, 0.004, { seg: 8, color: DARK });
  torus(mb, [0, 0.0425, 0], [1, 0, 0], [0, 1, 0], 0.0068, 0.0016, 12, 5, { color: 0x6d7378 });
  mb.cylinder(0, -0.034, 0, 0.004, 0.009, { seg: 8, color: DARK });
  chain(mb, [0, -0.034, 0], 3, { color: 0x4a4d52 });
  mb.pop();
}

// =================================================================================================
export function build(mb, ctx) { // eslint-disable-line no-unused-vars
  mb.push();
  buildShip(mb);
  buildTug(mb);
  buildYacht(mb, OBJ.YACHT_1, 0xc8402f);
  buildYacht(mb, OBJ.YACHT_2, 0x2a4b7c);
  buildFishBoat(mb, OBJ.BOAT_A, 0xc23a2f);
  buildFishBoat(mb, OBJ.BOAT_B, 0x2f5f9e);
  buildChannelBuoy(mb);
  buildMooringBuoy(mb, OBJ.MOOR_1);
  buildMooringBuoy(mb, OBJ.MOOR_2);
  buildMooringBuoy(mb, OBJ.MOOR_3);
  mb.pop();
}

// Named positions in each vessel's own frame.
export const points = {
  ship: {
    funnelTop: FUNNEL_TOP,
    mastTop: SHIP_MAST_TOP_LOCAL.slice(),
    bridgeWings: [[-0.773, 0.2475, -(WING_Z - 0.008)], [-0.773, 0.2475, WING_Z - 0.008]],
    bowBollard: SHIP_BOW_BOLLARD_LOCAL.slice(),
    radar: RADAR_LOCAL.slice(),
    prop: PROP_LOCAL.slice(),
    sternBollards: [[-0.941, SHIP.deckY + 0.01, -0.09], [-0.941, SHIP.deckY + 0.01, 0.09]],
  },
  tug: { funnelTop: TUG_FUNNEL_TOP, hook: TUG_HOOK_LOCAL.slice(), mastTop: TUG_MAST_TOP, prop: TUG_PROP_LOCAL.slice() },
  yacht: { mastTop: [Y_MAST.x, Y_MAST.top, 0], bow: [0.126, yDeckAt(0.126), 0] },
  boat: { slots: boatSlots(), mastTop: FB_MAST_TOP, wheelhouseRoof: [-0.20, FB_WH.y1 + 0.005, 0.03] },
  channelBuoy: { light: [0, 0.1, 0], top: [0, 0.1045, 0] },
  mooringBuoy: { ring: [0, 0.0425, 0], top: [0, 0.034, 0] },
};

// Instanced templates: the orange-and-white lifebuoy ring, flat in the xz plane.
export function templates() {
  const mb = new MeshBuilder();
  mb.set({ mat: MAT.PAINT });
  for (let s = 0; s < 8; s++) {
    torusArc(mb, [0, 0, 0], [1, 0, 0], [0, 0, 1], 0.021, 0.009, (s * Math.PI) / 4, ((s + 1) * Math.PI) / 4, 4, 9, { color: s % 2 ? 0xf6f3ec : ORANGE });
  }
  return [{ name: 'lifebuoy', mesh: mb.finish() }];
}
