// The town on the hill behind the harbour: three terraces of gabled Nordic houses, the white church with its
// copper spire at CHURCH, round lollipop trees, the street along the foot of the hill on a stone retaining wall,
// stairs up the grassy banks and garden hedges. Everything is static world geometry (obj 0).
// The plan is made once at import (seeded), so `points` is ready before build() runs and the town is the same every load.
// Test: bash tools/shot.sh town-1 "dev/view.html?b=town&view=home"
//       bash tools/shot.sh town-2 "dev/view.html?b=town&cam=0.2,0.55,3.2,0,0.3,-2.0"
import { MAT, mixHex } from '../../gpu/mesh.js';
import { makeRand } from '../../gpu/math.js';
import { B, TOWN_ROWS, CHURCH, landHeight } from '../layout.js';

// ---- palette ---------------------------------------------------------------------------------------------
const WALLS = [0x9e3b2a, 0xd9a441, 0xf2efe6, 0xa9c6dd, 0xa8d5bd, 0xe9b4b0, 0xecd27a, 0xb9c79a];
const FALU = 0x9e3b2a;
const TILE_COLS = [0xc4603e, 0xb14f36, 0xd27a4f];
const SLATE_COLS = [0x56606b, 0x4a535d];
const DOORS = [0x2f5a4b, 0x2c4a6e, 0x8e2f25, 0xc9922f, 0x3c7f88, 0x6a4430];
const TRIM = 0xf7f4ec, GLASS = 0x2f3f4c, PLINTH = 0xa9a399, STEP = 0xd6cfc2, CHEEK = 0xc9bfae;
const CHIMNEYS = [0xeeeae2, 0xa4513b, 0x6b6d70];
const LEAVES = [0x6fa84a, 0x5c9a45, 0x8dbb5a];
const HEDGE = 0x4f8a3c, TRUNK = 0x7b5b3e;
const FLOWERS = [0xd8463c, 0xe887a8, 0xf0c64a];
const COPPER = 0x5fae95, CHURCH_WHITE = 0xf4f1ea;

// ---- dimensions -------------------------------------------------------------------------------------------
const EDGE = B - 0.05;                       // house walls stay inside +-EDGE; overhangs reach ~0.013 further
const STOREY = 0.055;
const WIN_W = 0.02, WIN_H = 0.028;
const FRONT = [-1.806, -2.046, -2.306];      // street-facing wall line of each row
const BACK_MIN = [-1.975, -2.215, -2.468];   // how far back a house may reach (into the bank behind it)
const ROAD = { wall: -1.7035, z1: -1.800, y: 0.306, pave: -1.785 };
const STAIR_X = [-1.58, CHURCH.x, 1.84];
const ALLEY = 0.06;
const BANKS = [[-1.928, FRONT[1]], [-2.188, FRONT[2]]]; // stair flights: foot of bank to the next row's front

const ground = landHeight;
const D2R = Math.PI / 180;

// ---- the plan ----------------------------------------------------------------------------------------------
const PLAN = makePlan();
export const points = { perches: PLAN.perches };

function makePlan() {
  const r = makeRand(5150);
  const houses = [], trees = [], hedges = [];
  const church = planChurch();

  // reserved strips along each row: stair alleys, tree gardens, the church
  const gardens = [
    [[-2.08, 0.085], [-0.62, 0.08], [1.22, 0.09], [2.495, 0.11]],
    [[-2.495, 0.11], [-1.02, 0.08], [0.98, 0.085], [2.12, 0.085]],
    [[-2.2, 0.085], [-0.98, 0.08], [1.42, 0.085], [2.495, 0.11]],
  ];
  const usedCols = new Map();
  for (let ri = 0; ri < 3; ri++) {
    const row = TOWN_ROWS[ri];
    const res = [];
    for (const sx of STAIR_X) if (!(ri === 2 && sx === CHURCH.x)) res.push([sx - ALLEY / 2, sx + ALLEY / 2, 'alley']);
    for (const [gx, gw] of gardens[ri]) res.push([Math.max(-EDGE, gx - gw / 2), Math.min(EDGE, gx + gw / 2), 'garden']);
    if (ri === 2) res.push([church.x0 - 0.03, church.x1 + 0.10, 'church']);
    res.sort((a, b) => a[0] - b[0]);
    // gardens: a tree and a hedge along the street side
    for (const [a, b, kind] of res) {
      if (kind === 'garden') {
        const gx = (a + b) / 2, gz = FRONT[ri] - 0.062;
        trees.push(makeTree(r, gx + r.range(-0.006, 0.006), gz, 0.046 + r.range(0, 0.01), r.range(0.035, 0.055)));
        hedges.push([a + 0.006, b - 0.006, FRONT[ri] - 0.013, FRONT[ri] - 0.002, r() < 0.4 ? 'wall' : 'hedge']);
      }
      if (kind === 'church') {
        trees.push(makeTree(r, b - 0.045, FRONT[2] - 0.05, 0.042));
        trees.push(makeTree(r, b - 0.05, FRONT[2] - 0.135, 0.036));
      }
    }
    // free intervals between the reserved strips, filled with houses
    const free = [];
    let x = -EDGE;
    for (const [a, b] of res) { if (a > x) free.push([x, a]); x = Math.max(x, b); }
    if (x < EDGE) free.push([x, EDGE]);
    const rowHouses = [];
    for (const [a, b] of free) fillInterval(r, a, b, ri, row, rowHouses);
    // colours, heights and details, left to right so neighbours differ
    let p1 = -1, p2 = -1, n1 = 0, n2 = 0;
    for (const H of rowHouses) {
      let cands = WALLS.filter(c => c !== p1 && c !== p2);
      // gently balance the palette across the town
      cands.sort((u, v) => (usedCols.get(u) || 0) - (usedCols.get(v) || 0));
      const wall = cands[Math.min(cands.length - 1, Math.floor(r() * r() * cands.length))];
      usedCols.set(wall, (usedCols.get(wall) || 0) + 1);
      p2 = p1; p1 = wall;
      H.wall = wall;
      H.wm = wall === FALU || r() < 0.62 ? MAT.BRICK : MAT.PAINT;
      // storeys
      let n;
      if (H.turned) n = H.w < 0.15 ? (r() < 0.6 ? 3 : 2) : 2;
      else { const q = r(); n = q < 0.2 ? 1 : q < 0.76 ? 2 : 3; }
      if (n === n1 && n === n2) n = n === 2 ? (r() < 0.5 ? 1 : 3) : 2;
      n2 = n1; n1 = n;
      H.n = n;
      finishHouse(r, H);
      houses.push(H);
    }
    // neighbours (for side windows)
    for (let k = 0; k < rowHouses.length; k++) {
      rowHouses[k].left = k > 0 ? rowHouses[k - 1] : null;
      rowHouses[k].right = k < rowHouses.length - 1 ? rowHouses[k + 1] : null;
    }
  }

  // trees on the hilltop behind the top row, peeking over its roofs
  for (let k = 0; k < 15; k++) {
    const x = -2.46 + k * (4.92 / 14) + r.range(-0.05, 0.05);
    trees.push(makeTree(r, x, -2.515, 0.04 + r.range(0, 0.007), r.range(0.06, 0.095)));
  }
  // a few small trees on the banks between the rows
  for (const [x, z] of [[-2.36, -2.006], [-0.3, -2.008], [2.36, -2.004], [-1.25, -2.268], [0.15, -2.27], [2.02, -2.266]]) {
    trees.push(makeTree(r, x, z, 0.031 + r.range(0, 0.006), 0.024));
  }
  // round bushes dotted over the banks and the hilltop
  const bushes = [];
  for (const [x, z] of [[-1.92, -1.99], [-0.98, -1.985], [0.72, -1.995], [1.48, -1.99], [-2.05, -2.25], [-0.62, -2.255], [0.98, -2.245],
    [1.62, -2.25], [-1.35, -2.53], [0.05, -2.535], [1.15, -2.53], [2.28, -2.535]]) {
    const T = makeTree(r, x + r.range(-0.03, 0.03), z, 0.02 + r.range(0, 0.007), 0);
    T.bush = true; T.sy = r.range(0.7, 0.85);
    bushes.push(T);
  }

  // seagull perches: ridge tops spread over the town plus the spire tip
  const perches = [];
  const want = [[0, -2.0], [0, -0.75], [0, 0.55], [0, 1.95], [1, -1.6], [1, -0.3], [1, 1.25], [1, 2.2], [2, -1.9], [2, -0.55], [2, 1.1], [2, 2.05]];
  for (const [ri, wx] of want) {
    let best = null;
    for (const H of houses) if (H.row === ri && (!best || Math.abs(H.cx - wx) < Math.abs(best.cx - wx))) best = H;
    if (!best) continue;
    // on the ridge, away from the chimney
    const t = best.chimney ? -Math.sign(best.chimney.u || 1) * 0.3 : 0;
    const px = best.turned ? best.cx : best.cx + t * best.w, pz = best.turned ? best.cz + t * best.d : best.cz;
    perches.push([round3(px), round3(best.e + best.rh + 0.009), round3(pz)]);
  }
  perches.push([round3(CHURCH.x), round3(church.tip), round3(CHURCH.z)]);
  return { houses, trees, bushes, hedges, church, perches };
}

function round3(v) { return Math.round(v * 1000) / 1000; }

function fillInterval(r, a, b, ri, row, out) {
  const L = b - a;
  if (L < 0.11) return;
  const n = Math.max(1, Math.round(L / 0.19));
  const widths = [], gaps = [];
  for (let k = 0; k < n; k++) widths.push(r() < 0.3 ? r.range(0.13, 0.155) : r.range(0.15, 0.22));
  for (let k = 0; k <= n; k++) gaps.push(k === 0 || k === n ? r.range(0.004, 0.01) : r.range(0.003, 0.02));
  const gsum = gaps.reduce((s, v) => s + v, 0), wsum = widths.reduce((s, v) => s + v, 0);
  const k = (L - gsum) / wsum;
  let x = a + gaps[0];
  for (let i = 0; i < n; i++) {
    const w = widths[i] * k;
    out.push(makeHouse(r, x, x + w, ri));
    x += w + gaps[i + 1];
  }
}

function makeHouse(r, x0, x1, ri) {
  const w = x1 - x0, cx = (x0 + x1) / 2;
  const turned = w < 0.165 ? r() < 0.5 : r() < 0.1;
  const zf = FRONT[ri] + r.range(-0.008, 0.003);
  let d = turned ? r.range(0.13, 0.16) : r.range(0.12, 0.16);
  d = Math.min(d, zf - BACK_MIN[ri]);
  const zb = zf - d, cz = (zf + zb) / 2;
  const front = [ground(x0, zf), ground(x1, zf), ground(cx, zf), ground(cx, cz)];
  const all = front.concat([ground(x0, zf + 0.004), ground(x1, zf + 0.004), ground(cx, zf + 0.004)]);
  const yf = Math.max(...front) + 0.011 + r.range(0, 0.004);
  const g0 = Math.min(...all) - 0.01;
  return { row: ri, x0, x1, zf, zb, cx, cz, w, d, yf, g0, turned };
}

function finishHouse(r, H) {
  const { w, d, n } = H;
  H.e = H.yf + n * STOREY + 0.008;
  H.ark = !H.turned && w >= 0.16 && d >= 0.135 && n >= 2 && r() < 0.45;
  // steep Nordic pitches; they also keep the front slopes out of the studio highlight seen from the usual views
  const pitch = H.turned ? r.range(48, 58) : H.ark ? r.range(52, 57) : r.range(46, 56);
  H.rh = (H.turned ? w / 2 : d / 2) * Math.tan(pitch * D2R);
  if (H.ark) {
    H.aw = r.range(0.05, 0.062);
    H.agh = H.aw / 2 * Math.tan(45 * D2R);
    H.adh = H.rh - 0.01 - H.agh;
    if (H.adh < 0.04) H.ark = false;
  }
  const slate = r() < 0.38;
  H.rm = slate ? MAT.SLATE : MAT.TILES;
  H.roof = slate ? r.pick(SLATE_COLS) : r.pick(TILE_COLS);
  // front windows in columns; the door takes one column on the ground floor
  const ncol = H.turned ? (w < 0.15 ? 2 : 3) : (w < 0.15 ? 2 : w < 0.192 ? 3 : 4);
  const m = 0.021 + WIN_W / 2;
  H.cols = [];
  for (let c = 0; c < ncol; c++) H.cols.push(ncol === 1 ? H.cx : H.x0 + m + (w - 2 * m) * c / (ncol - 1));
  H.doorCol = ncol === 3 ? (r() < 0.7 ? 1 : r.pick([0, 2])) : ncol === 4 ? r.pick([1, 2]) : r.int(0, 1);
  let dc = r.pick(DOORS);
  if (dc === 0x8e2f25 && H.wall === FALU) dc = 0x2f5a4b;
  H.door = dc;
  H.porch = r() < 0.22;
  H.flowers = H.wm === MAT.PAINT ? r() < 0.25 : r() < 0.4;
  H.flowerCol = r.pick(FLOWERS);
  H.chimney = r() < 0.6 ? { u: r.range(-0.3, 0.3), v: r.range(-0.25, 0.25), col: r.pick(CHIMNEYS), dx: r.range(0.014, 0.018) } : null;
  // the attic window in a street-facing gable
  H.attic = H.turned && H.rh > 0.06;
  H.corner = H.wm === MAT.BRICK;
}

function makeTree(r, x, z, rad, trunk) {
  const lim = B - 0.03 - rad * 1.12;
  x = Math.max(-lim, Math.min(lim, x));
  z = Math.max(-lim, z);
  const g = ground(x, z);
  const jit = [];
  for (let k = 0; k < 42; k++) jit.push(r.range(-0.09, 0.09));
  return {
    x, z, g, r: rad, sy: r.range(0.98, 1.22), th: trunk !== undefined ? trunk : r.range(0.03, 0.05),
    col: mixHex(r.pick(LEAVES), r() < 0.5 ? 0xffffff : 0x2d4a1e, r.range(0, 0.1)), rot: r.range(0, Math.PI * 2), jit,
    shade: r.range(0, 1000),
  };
}

function planChurch() {
  const tx = CHURCH.x, tz = CHURCH.z, ts = 0.043;
  const x0 = tx - ts, nx0 = tx + ts - 0.003, x1 = tx + 0.33;
  const nz0 = -2.455, nz1 = -2.322;
  const front = [[x0, tz + ts], [tx + ts, tz + ts], [x1, nz1], [(nx0 + x1) / 2, nz1], [tx, tz], [(nx0 + x1) / 2, (nz0 + nz1) / 2]];
  const low = front.concat([[x1, nz0], [x0, tz - ts]]);
  const gTop = Math.max(...front.map(([x, z]) => ground(x, z)));
  const gLow = Math.min(...low.map(([x, z]) => ground(x, z + 0.004)));
  const fl = gTop + 0.012;
  const towerTop = fl + 0.29;
  const spireBase = towerTop + 0.004;
  const spireH = 0.235;
  return { tx, tz, ts, x0, x1, nx0, nz0, nz1, fl, gLow, towerTop, spireBase, spireH, tip: spireBase + spireH + 0.03 };
}

// ---- build -----------------------------------------------------------------------------------------------
export function build(mb) {
  mb.push();
  mb.set({ obj: 0, param: 0, mat: MAT.PAINT, color: 0xffffff });
  street(mb);
  for (const sx of STAIR_X) {
    path(mb, sx, ROAD.z1, BANKS[0][0]);
    stairs(mb, sx, BANKS[0][0], BANKS[0][1], 0.04);
    path(mb, sx, BANKS[0][1], BANKS[1][0]);
    stairs(mb, sx, BANKS[1][0], BANKS[1][1], 0.04);
    if (sx !== CHURCH.x) path(mb, sx, BANKS[1][1], -2.47);
  }
  for (const H of PLAN.houses) house(mb, H);
  church(mb, PLAN.church);
  for (const T of PLAN.trees) tree(mb, T);
  for (const T of PLAN.bushes) tree(mb, T);
  for (const [a, b, z0, z1, kind] of PLAN.hedges) {
    const g = Math.min(ground(a, z1), ground(b, z1), ground(a, z0), ground(b, z0)) - 0.006;
    const top = Math.max(ground(a, z0), ground(b, z0));
    if (kind === 'hedge') mb.boxMM(a, g, z0, b, top + 0.02, z1, { color: HEDGE, mat: MAT.LEAF, param: 0, skip: ['bottom'] });
    else {
      const zc = (z0 + z1) / 2;
      mb.boxMM(a, g, zc - 0.0035, b, top + 0.013, zc + 0.0035, { color: 0xeeeae1, mat: MAT.MASONRY, skip: ['bottom'] });
      mb.boxMM(a - 0.0015, top + 0.013, zc - 0.005, b + 0.0015, top + 0.0165, zc + 0.005, { color: 0xd9d3c6, mat: MAT.PAINT, skip: ['bottom'] });
      // a little garden of flowers behind it
      mb.boxMM(a + 0.004, g, z0 - 0.012, b - 0.004, top + 0.006, z0 - 0.001, { color: 0x5f9a45, mat: MAT.LEAF, param: 0, skip: ['bottom'] });
    }
  }
  mb.pop();
}

// Flip a polygon's winding if needed so its normal points along n.
function face(mb, pts, n, o) {
  const a = pts[0], b = pts[1], c = pts[2];
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const cr = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  mb.poly(cr[0] * n[0] + cr[1] * n[1] + cr[2] * n[2] < 0 ? pts.slice().reverse() : pts, o);
}

// Gabled roof, ridge along local x, over walls x0..x1, z0..z1 whose tops are at e; h = ridge rise above e.
// The slab has thickness, white fascias along the eaves and barge boards on the verges; the gable-end
// triangles take the wall colour.
function roofX(mb, x0, x1, z0, z1, e, h, R) {
  const ovE = R.ovE !== undefined ? R.ovE : 0.012, ovV = R.ovV !== undefined ? R.ovV : 0.007;
  const th = R.th !== undefined ? R.th : 0.005;
  const cz = (z0 + z1) / 2, hd = (z1 - z0) / 2, s = h / hd;
  const xa = x0 - ovV, xb = x1 + ovV, za = z0 - ovE, zb = z1 + ovE;
  const ye = e - ovE * s, yr = e + h;
  const ro = { color: R.color, mat: R.mat };
  // The slopes are flat, but their shading normals lean a little steeper than the slope (more at the eaves): a broad
  // flat roof facing the camera would otherwise catch the whole studio highlight and turn white from the usual views.
  const a = Math.atan(s);
  const nR = [Math.cos(a + 7 * D2R), Math.sin(a + 7 * D2R)], nE = [Math.cos(a + 13 * D2R), Math.sin(a + 13 * D2R)];
  const slope = (p0, p1, p2, p3, dz) => {
    const base = mb.nv;
    mb.vert(p0, [0, nE[0], nE[1] * dz], ro); mb.vert(p1, [0, nE[0], nE[1] * dz], ro);
    mb.vert(p2, [0, nR[0], nR[1] * dz], ro); mb.vert(p3, [0, nR[0], nR[1] * dz], ro);
    if (dz > 0) { mb.tri(base, base + 1, base + 2); mb.tri(base, base + 2, base + 3); }
    else { mb.tri(base, base + 2, base + 1); mb.tri(base, base + 3, base + 2); }
  };
  slope([xa, ye + th, zb], [xb, ye + th, zb], [xb, yr + th, cz], [xa, yr + th, cz], 1);
  slope([xa, ye + th, za], [xb, ye + th, za], [xb, yr + th, cz], [xa, yr + th, cz], -1);
  const fo = { color: R.trim, mat: MAT.PAINT };
  const fb = R.fb !== undefined ? R.fb : 0.003, bb = R.bb !== undefined ? R.bb : 0.004;
  mb.quad([xa, ye - fb, zb], [xb, ye - fb, zb], [xb, ye + th, zb], [xa, ye + th, zb], fo);
  if (R.back !== false) mb.quad([xb, ye - fb, za], [xa, ye - fb, za], [xa, ye + th, za], [xb, ye + th, za], fo);
  for (const [x, nx] of [[xa, -1], [xb, 1]]) {
    face(mb, [[x, ye - fb, zb], [x, yr - bb, cz], [x, yr + th, cz], [x, ye + th, zb]], [nx, 0, 0], fo);
    face(mb, [[x, ye - fb, za], [x, yr - bb, cz], [x, yr + th, cz], [x, ye + th, za]], [nx, 0, 0], fo);
  }
  const wo = { color: R.wall, mat: R.wallMat !== undefined ? R.wallMat : MAT.PAINT };
  if (R.gx1 !== false) mb.poly([[x1, e, z1], [x1, e, z0], [x1, yr, cz]], wo);
  if (R.gx0 !== false) mb.poly([[x0, e, z0], [x0, e, z1], [x0, yr, cz]], wo);
  if (R.ridge !== false) {
    const rc = 0.0032;
    mb.boxMM(xa, yr + th - 0.002, cz - rc, xb, yr + th + rc, cz + rc, { color: mixHex(R.color, 0x1c1c1c, 0.22), mat: R.mat === MAT.TILES ? MAT.PAINT : R.mat, skip: ['bottom'] });
  }
}

// A white-framed window on the local z = 0 wall plane, facing +z, centred at u, sill at y0.
function windowAt(mb, u, y0, w, h, flower) {
  const f = 0.003, fd = 0.0022, hw = w / 2;
  mb.boxMM(u - hw - f, y0 - f, 0, u + hw + f, y0 + h + f, fd, { color: TRIM, mat: MAT.PAINT, skip: ['nz', 'bottom'] });
  const gz = fd + 0.0011;
  mb.quad([u - hw, y0, gz], [u + hw, y0, gz], [u + hw, y0 + h, gz], [u - hw, y0 + h, gz], { color: GLASS, mat: MAT.GLASS });
  const mz = gz + 0.0009, mw = 0.0011, ym = y0 + h * 0.62;
  mb.quad([u - mw, y0, mz], [u + mw, y0, mz], [u + mw, y0 + h, mz], [u - mw, y0 + h, mz], { color: TRIM, mat: MAT.PAINT });
  mb.quad([u - hw, ym - mw, mz], [u + hw, ym - mw, mz], [u + hw, ym + mw, mz], [u - hw, ym + mw, mz], { color: TRIM, mat: MAT.PAINT });
  if (flower) {
    mb.boxMM(u - hw - 0.002, y0 - f - 0.007, 0, u + hw + 0.002, y0 - f - 0.001, 0.0085, { color: 0x7d5236, mat: MAT.PAINT, skip: ['nz', 'bottom'] });
    mb.boxMM(u - hw - 0.001, y0 - f - 0.001, 0.001, u + hw + 0.001, y0 - f + 0.0045, 0.0075, { color: flower, mat: MAT.LEAF, param: 0, skip: ['nz', 'bottom'] });
  } else {
    mb.boxMM(u - hw - f - 0.0015, y0 - f - 0.0018, 0, u + hw + f + 0.0015, y0 - f + 0.0004, fd + 0.0024, { color: TRIM, mat: MAT.PAINT, skip: ['nz', 'bottom', 'px', 'nx'] });
  }
}

// A door with a white frame and a little glazed fanlight, on the local z = 0 plane at u, threshold at y0.
function doorAt(mb, u, y0, color, gStep) {
  const w = 0.021, h = 0.037, f = 0.003, fd = 0.0022, hw = w / 2;
  mb.boxMM(u - hw - f, y0, 0, u + hw + f, y0 + h + f, fd, { color: TRIM, mat: MAT.PAINT, skip: ['nz', 'bottom'] });
  const dz = fd + 0.0011;
  mb.quad([u - hw, y0, dz], [u + hw, y0, dz], [u + hw, y0 + h - 0.008, dz], [u - hw, y0 + h - 0.008, dz], { color, mat: MAT.PAINT });
  mb.quad([u - hw, y0 + h - 0.0065, dz], [u + hw, y0 + h - 0.0065, dz], [u + hw, y0 + h, dz], [u - hw, y0 + h, dz], { color: GLASS, mat: MAT.GLASS });
  // panel line and knob
  mb.quad([u - 0.0006, y0 + 0.004, dz + 0.0006], [u + 0.0006, y0 + 0.004, dz + 0.0006], [u + 0.0006, y0 + h - 0.011, dz + 0.0006], [u - 0.0006, y0 + h - 0.011, dz + 0.0006], { color: mixHex(color, 0x000000, 0.35), mat: MAT.PAINT });
  // stone step down to the ground
  mb.boxMM(u - hw - 0.006, gStep, 0.003, u + hw + 0.006, y0 + 0.001, 0.013, { color: STEP, mat: MAT.CONCRETE, skip: ['nz', 'bottom'] });
}

function nbHeight(N, z) {
  if (!N || z > N.zf || z < N.zb) return N ? N.g0 : -1;
  return N.turned ? N.e + 0.004 : N.e + N.rh * Math.max(0, 1 - Math.abs(z - N.cz) / (N.d / 2)) + 0.004;
}

function house(mb, H) {
  const { x0, x1, zb, zf, yf, e, rh, cx, cz, w, d } = H;
  const wo = { color: H.wall, mat: H.wm };
  mb.boxMM(x0 - 0.002, H.g0, zb, x1 + 0.002, yf, zf + 0.003, { color: PLINTH, mat: MAT.MASONRY, skip: ['bottom', 'nz'] });
  mb.boxMM(x0, yf, zb, x1, e, zf, { ...wo, skip: ['top', 'bottom'] });
  const R = { color: H.roof, mat: H.rm, trim: TRIM, wall: H.wall, wallMat: H.wm };
  if (!H.turned) roofX(mb, x0, x1, zb, zf, e, rh, R);
  else {
    mb.push(); mb.translate(cx, 0, cz); mb.rotateY(Math.PI / 2);
    roofX(mb, -d / 2, d / 2, -w / 2, w / 2, e, rh, { ...R, ovE: 0.010, ovV: 0.008 });
    mb.pop();
  }
  // white corner boards on the street corners of board-clad houses
  if (H.corner) {
    const cb = 0.0045, cp = 0.0015;
    mb.boxMM(x0 - cp, yf, zf - cb, x0 + cb, e, zf + cp, { color: TRIM, mat: MAT.PAINT, skip: ['top', 'bottom', 'nz', 'px'] });
    mb.boxMM(x1 - cb, yf, zf - cb, x1 + cp, e, zf + cp, { color: TRIM, mat: MAT.PAINT, skip: ['top', 'bottom', 'nz', 'nx'] });
  }
  // street front
  mb.push(); mb.translate(0, 0, zf);
  for (let s = 0; s < H.n; s++) {
    for (let c = 0; c < H.cols.length; c++) {
      const u = H.cols[c];
      if (s === 0 && c === H.doorCol) doorAt(mb, u, yf, H.door, Math.min(ground(u, zf + 0.012), ground(u, zf)) - 0.004);
      else windowAt(mb, u, yf + 0.014 + s * STOREY, WIN_W, WIN_H, H.flowers && s === 1 ? H.flowerCol : 0);
    }
  }
  if (H.attic) {
    const ah = Math.min(0.026, rh * 0.36);
    windowAt(mb, cx, e + 0.008, WIN_W * 0.9, ah, 0);
  }
  mb.pop();
  // the top row's backs face the hilltop and show when the camera swings round
  if (H.row === 2) {
    mb.push(); mb.translate(0, 0, zb); mb.rotateY(Math.PI);
    for (let s = 0; s < H.n; s++) for (const u of H.cols) windowAt(mb, -u, yf + 0.014 + s * STOREY, WIN_W, WIN_H, 0);
    if (H.attic) windowAt(mb, -cx, e + 0.008, WIN_W * 0.9, Math.min(0.026, rh * 0.36), 0);
    mb.pop();
  }
  if (H.porch) porch(mb, H);
  if (H.ark) ark(mb, H);
  // side windows where the neighbour leaves the wall in view
  for (const side of [-1, 1]) {
    const N = side < 0 ? H.left : H.right;
    const gap = N ? (side < 0 ? x0 - N.x1 : N.x0 - x1) : 1;
    const open = gap > 0.045;
    mb.push();
    if (side < 0) { mb.translate(x0, 0, 0); mb.rotateY(-Math.PI / 2); } else { mb.translate(x1, 0, 0); mb.rotateY(Math.PI / 2); }
    const U = z => (side < 0 ? z : -z);
    const zs = H.turned ? (d > 0.14 ? [zf - d * 0.26, zb + d * 0.3] : [zf - d * 0.3]) : [zf - Math.min(0.045, d * 0.3)];
    for (let s = 0; s < H.n; s++) {
      const y0 = yf + 0.014 + s * STOREY;
      for (const z of zs) if (open || y0 + WIN_H > nbHeight(N, z) + 0.006) windowAt(mb, U(z), y0, WIN_W, WIN_H, 0);
    }
    if (!H.turned && rh > 0.055) {
      const y0 = e + 0.008, ah = Math.min(0.024, rh * 0.34);
      if (open || y0 + ah > nbHeight(N, cz) + 0.006) windowAt(mb, U(cz), y0, WIN_W * 0.9, ah, 0);
    }
    mb.pop();
  }
  // chimney
  if (H.chimney) {
    const C = H.chimney, s = C.dx / 2;
    let x, z, yb;
    if (!H.turned) { x = cx + C.u * w; z = cz + C.v * d * 0.5; yb = e + rh * (1 - Math.abs(z - cz) / (d / 2)) - 0.004; }
    else { z = cz + C.u * d; x = cx + C.v * w * 0.4; yb = e + rh * (1 - Math.abs(x - cx) / (w / 2)) - 0.004; }
    const yt = e + rh + 0.026;
    mb.boxMM(x - s, yb, z - s, x + s, yt, z + s, { color: C.col, mat: C.col === 0xa4513b ? MAT.MASONRY : MAT.PAINT, skip: ['bottom'] });
    mb.boxMM(x - s - 0.0025, yt, z - s - 0.0025, x + s + 0.0025, yt + 0.0045, z + s + 0.0025, { color: 0x3d4045, mat: MAT.PAINT, skip: ['bottom'] });
  }
}

// A wall dormer ("kvist"): the street wall rises through the eaves under its own little gable.
function ark(mb, H) {
  const { cx, cz, zf, e, rh, d } = H;
  const aw = H.aw, dh = H.adh, gh = H.agh, th = 0.005, hd = d / 2;
  const top = e + dh, ridge = top + gh;
  // the main roof's top surface reaches height y at z = cz + hd * (1 - (y - e - th) / rh)
  const zBody = cz + hd * (1 - (top - e - th) / rh) - 0.004;
  const zRidge = cz + hd * (1 - (ridge - e - th) / rh) - 0.004;
  mb.boxMM(cx - aw / 2, e - 0.002, zBody, cx + aw / 2, top, zf, { color: H.wall, mat: H.wm, skip: ['top', 'bottom', 'nz'] });
  const L = zf - zRidge;
  mb.push(); mb.translate(cx, 0, zf - L / 2); mb.rotateY(Math.PI / 2);
  // ridge along world z; local x runs from the front (-L/2 -> world z = zf) back into the main roof
  roofX(mb, -L / 2, L / 2 + 0.006, -aw / 2, aw / 2, top, gh, { color: H.roof, mat: H.rm, trim: TRIM, wall: H.wall, wallMat: H.wm, ovE: 0.005, ovV: 0.005, th: 0.004, gx1: false, ridge: true });
  mb.pop();
  mb.push(); mb.translate(0, 0, zf);
  const wh = Math.min(WIN_H, dh - 0.016);
  windowAt(mb, cx, e + 0.009, WIN_W, wh, 0);
  mb.pop();
}

// A little gabled porch canopy on two white posts over the door.
function porch(mb, H) {
  const u = H.cols[H.doorCol], zf = H.zf, yf = H.yf;
  const yc = yf + 0.046, dep = 0.026, hw = 0.02;
  mb.push(); mb.translate(u, 0, zf); mb.rotateY(Math.PI / 2);
  roofX(mb, -dep, 0, -hw, hw, yc, 0.015, { color: H.roof, mat: H.rm, trim: TRIM, wall: TRIM, wallMat: MAT.PAINT, ovE: 0.003, ovV: 0.003, th: 0.003, fb: 0.002, bb: 0.002, ridge: false, gx1: false });
  mb.pop();
  for (const s of [-1, 1]) {
    const px = u + s * (hw - 0.002), pz = zf + dep - 0.003;
    mb.boxMM(px - 0.0018, yf, pz - 0.0018, px + 0.0018, yc, pz + 0.0018, { color: TRIM, mat: MAT.PAINT, skip: ['top', 'bottom'] });
  }
}

// ---- the street on its retaining wall at the foot of the hill ------------------------------------------------
function street(mb) {
  const xa = -B + 0.035, xb = B - 0.035, y = ROAD.y;
  const z0 = ROAD.wall, z1 = ROAD.z1;
  // retaining wall face (stone) from below the quay deck up to the road
  mb.set({ mat: MAT.MASONRY, color: 0xc9bfae });
  mb.quad([xa, 0.19, z0], [xb, 0.19, z0], [xb, y, z0], [xa, y, z0]);
  // the road (cobbles) and a pavement of flags along the houses
  mb.quad([xa, y, z0], [xb, y, z0], [xb, y, z1], [xa, y, z1], { color: 0xa39b8f, mat: MAT.COBBLES });
  const yp = y + 0.003;
  mb.boxMM(xa, y - 0.002, z1, xb, yp, ROAD.pave, { color: 0xddd6c9, mat: MAT.CONCRETE, skip: ['bottom', 'nz'] });
  // coping along the wall top, with a railing
  mb.boxMM(xa, y - 0.006, z0 - 0.012, xb, y + 0.005, z0 + 0.0025, { color: 0xe2dbcf, mat: MAT.MASONRY, skip: ['bottom'] });
  const rail = { color: 0x34393f, mat: MAT.STEEL };
  const yr = y + 0.005 + 0.02;
  for (let x = xa + 0.01; x <= xb - 0.005; x += 0.06) mb.boxMM(x - 0.0012, y + 0.005, z0 - 0.0055, x + 0.0012, yr, z0 - 0.0031, { ...rail, skip: ['bottom', 'top'] });
  mb.boxMM(xa + 0.005, yr, z0 - 0.006, xb - 0.005, yr + 0.0025, z0 - 0.0026, { ...rail, skip: ['bottom'] });
  mb.boxMM(xa + 0.005, yr - 0.011, z0 - 0.0052, xb - 0.005, yr - 0.0095, z0 - 0.0034, { ...rail, skip: ['bottom', 'top'] });
  // end faces where the block is cut, so the road does not float over the bank
  for (const [x, nx] of [[xa, -1], [xb, 1]]) {
    const seg = 6;
    for (let k = 0; k < seg; k++) {
      const za = z0 + (z1 - z0) * k / seg, zb2 = z0 + (z1 - z0) * (k + 1) / seg;
      const ga = k === 0 ? 0.19 : ground(x, za) - 0.003, gb = ground(x, zb2) - 0.003;
      face(mb, [[x, ga, za], [x, gb, zb2], [x, y, zb2], [x, y, za]], [nx, 0, 0], { color: 0xc9bfae, mat: MAT.MASONRY });
    }
  }
  // street lamps on the coping
  for (const lx of [-2.28, -1.36, -0.5, 0.95, 1.62, 2.3]) {
    const lz = z0 - 0.0045;
    mb.cylinder(lx, y + 0.005, lz, 0.0026, 0.082, { seg: 6, caps: false, color: 0x2f3438, mat: MAT.STEEL });
    mb.boxMM(lx - 0.006, y + 0.087, lz - 0.006, lx + 0.006, y + 0.1, lz + 0.006, { color: 0xffe2a8, mat: MAT.LAMP, param: 0.5, skip: ['bottom'] });
    mb.cylinder(lx, y + 0.1, lz, 0.009, 0.006, { seg: 6, r2: 0.002, bottom: false, color: 0x2f3438, mat: MAT.STEEL });
  }
}

// A cobbled path on the ground between z0 and z1 (z0 > z1), centred at x.
function path(mb, x, z0, z1) {
  const w = 0.042, seg = 6;
  for (let k = 0; k < seg; k++) {
    const za = z0 + (z1 - z0) * k / seg, zb = z0 + (z1 - z0) * (k + 1) / seg;
    mb.quad([x - w / 2, ground(x, za) + 0.0025, za], [x + w / 2, ground(x, za) + 0.0025, za], [x + w / 2, ground(x, zb) + 0.0025, zb], [x - w / 2, ground(x, zb) + 0.0025, zb], { color: 0xb3ab9e, mat: MAT.COBBLES });
  }
}

// Stone steps hugging the bank from z0 (foot) to z1 (top), with stepped cheek walls.
function stairs(mb, x, z0, z1, w) {
  const y0 = ground(x, z0), y1 = ground(x, z1);
  const n = Math.max(3, Math.round((y1 - y0) / 0.0155));
  const rise = (y1 - y0) / n;
  const zAt = y => { let lo = z1, hi = z0; for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (ground(x, m) < y) hi = m; else lo = m; } return (lo + hi) / 2; };
  let zF = z0 + 0.002;
  for (let k = 0; k < n; k++) {
    const yt = y0 + rise * (k + 1);
    const zB = k === n - 1 ? z1 : zAt(yt);
    const yl = ground(x, zF) - 0.012;
    mb.boxMM(x - w / 2, yl, zB, x + w / 2, yt + 0.0015, zF, { color: STEP, mat: MAT.CONCRETE, skip: ['bottom', 'nz'] });
    for (const s of [-1, 1]) {
      const a = s < 0 ? x - w / 2 - 0.007 : x + w / 2, b = a + 0.007;
      mb.boxMM(a, yl, zB, b, yt + 0.012, zF, { color: CHEEK, mat: MAT.MASONRY, skip: ['bottom', 'nz'] });
    }
    zF = zB;
  }
}

// ---- church --------------------------------------------------------------------------------------------------
function archPts(u, y0, w, h, z, seg = 6) {
  const r = w / 2, yc = y0 + h - r, pts = [[u - r, y0, z], [u + r, y0, z]];
  for (let k = 0; k <= seg; k++) { const a = (k / seg) * Math.PI; pts.push([u + r * Math.cos(a), yc + r * Math.sin(a), z]); }
  return pts;
}

// An arched window (or louvre, or door) on the local z = 0 plane facing +z.
function archWindow(mb, u, y0, w, h, glass = GLASS, mat = MAT.GLASS) {
  mb.poly(archPts(u, y0 - 0.003, w + 0.007, h + 0.0065, 0.0016), { color: 0xd9d3c6, mat: MAT.PAINT });
  mb.poly(archPts(u, y0, w, h, 0.0032), { color: glass, mat });
  if (mat === MAT.GLASS) {
    mb.quad([u - 0.0007, y0, 0.0042], [u + 0.0007, y0, 0.0042], [u + 0.0007, y0 + h - 0.002, 0.0042], [u - 0.0007, y0 + h - 0.002, 0.0042], { color: 0xd9d3c6, mat: MAT.PAINT });
  }
  mb.boxMM(u - w / 2 - 0.005, y0 - 0.0055, 0, u + w / 2 + 0.005, y0 - 0.0025, 0.005, { color: 0xd9d3c6, mat: MAT.PAINT, skip: ['nz', 'bottom'] });
}

function church(mb, C) {
  const { tx, tz, ts, x1, nx0, nz0, nz1, fl, gLow, towerTop } = C;
  const W = { color: CHURCH_WHITE, mat: MAT.PAINT };
  // plinths
  mb.boxMM(tx - ts - 0.003, gLow, tz - ts - 0.003, tx + ts + 0.003, fl, tz + ts + 0.003, { color: PLINTH, mat: MAT.MASONRY, skip: ['bottom'] });
  mb.boxMM(nx0, gLow, nz0 - 0.002, x1 + 0.002, fl, nz1 + 0.002, { color: PLINTH, mat: MAT.MASONRY, skip: ['bottom', 'nx'] });
  // nave
  const ne = fl + 0.125, nd = nz1 - nz0, nh = nd / 2 * Math.tan(50 * D2R);
  mb.boxMM(nx0, fl, nz0, x1, ne, nz1, { ...W, skip: ['top', 'bottom', 'nx'] });
  roofX(mb, nx0, x1, nz0, nz1, ne, nh, { color: 0x4a535d, mat: MAT.SLATE, trim: TRIM, wall: CHURCH_WHITE, wallMat: MAT.PAINT, ovE: 0.012, ovV: 0.008, gx0: false });
  mb.push(); mb.translate(0, 0, nz1);
  const nw = 4;
  for (let k = 0; k < nw; k++) {
    const u = nx0 + 0.012 + (x1 - nx0 - 0.012) * (k + 0.5) / nw;
    archWindow(mb, u, fl + 0.032, 0.022, 0.066);
  }
  mb.pop();
  mb.push(); mb.translate(0, 0, nz0); mb.rotateY(Math.PI);
  for (let k = 0; k < nw; k++) {
    const u = nx0 + 0.012 + (x1 - nx0 - 0.012) * (k + 0.5) / nw;
    archWindow(mb, -u, fl + 0.032, 0.022, 0.066);
  }
  mb.pop();
  // east end: tall window and a round window in the gable
  mb.push(); mb.translate(x1, 0, 0); mb.rotateY(Math.PI / 2);
  const ncz = (nz0 + nz1) / 2;
  archWindow(mb, -ncz, fl + 0.032, 0.026, 0.07);
  mb.push(); mb.translate(-ncz, ne + 0.03, 0); mb.rotateX(Math.PI / 2);
  mb.cylinder(0, 0, 0, 0.0135, 0.0018, { seg: 12, bottom: false, color: 0xd9d3c6, mat: MAT.PAINT });
  mb.cylinder(0, 0.0018, 0, 0.0095, 0.0012, { seg: 12, bottom: false, color: GLASS, mat: MAT.GLASS });
  mb.pop();
  mb.pop();
  // tower
  const tx0 = tx - ts, tx1 = tx + ts, tz0 = tz - ts, tz1 = tz + ts;
  mb.boxMM(tx0, fl, tz0, tx1, towerTop - 0.008, tz1, { ...W, skip: ['top', 'bottom'] });
  // string course and cornice
  mb.boxMM(tx0 - 0.0025, fl + 0.208, tz0 - 0.0025, tx1 + 0.0025, fl + 0.213, tz1 + 0.0025, { ...W, skip: ['bottom'] });
  mb.boxMM(tx0 - 0.005, towerTop - 0.008, tz0 - 0.005, tx1 + 0.005, towerTop, tz1 + 0.005, { ...W });
  // front: door, window, clock; belfry louvres on all four faces
  for (let k = 0; k < 4; k++) {
    mb.push(); mb.translate(tx, 0, tz); mb.rotateY(k * Math.PI / 2); mb.translate(0, 0, ts);
    archWindow(mb, 0, fl + 0.232, 0.026, 0.046, 0x3a3f45, MAT.PAINT);
    // louvre slats
    for (let j = 0; j < 4; j++) {
      const yy = fl + 0.238 + j * 0.008;
      mb.boxMM(-0.012, yy, 0.0032, 0.012, yy + 0.0022, 0.0052, { color: 0x6c7176, mat: MAT.PAINT, skip: ['nz', 'bottom'] });
    }
    if (k === 0) {
      archWindow(mb, 0, fl + 0.108, 0.016, 0.042);
      // arched door with a stone surround
      mb.poly(archPts(0, fl, 0.036, 0.062, 0.0016), { color: 0xd9d3c6, mat: MAT.PAINT });
      mb.poly(archPts(0, fl, 0.027, 0.056, 0.0032), { color: 0x6a4430, mat: MAT.TIMBER, param: 0.2 });
      mb.boxMM(-0.024, C.gLow, 0.003, 0.024, fl + 0.001, 0.016, { color: STEP, mat: MAT.CONCRETE, skip: ['nz', 'bottom'] });
    }
    if (k === 0 || k === 3) {
      // clock face (front and west)
      mb.push(); mb.translate(0, fl + 0.172, 0); mb.rotateX(Math.PI / 2);
      mb.cylinder(0, 0, 0, 0.023, 0.0022, { seg: 16, bottom: false, color: 0x2e3a36, mat: MAT.PAINT });
      mb.cylinder(0, 0.0022, 0, 0.0195, 0.001, { seg: 16, bottom: false, color: 0xf8f3e3, mat: MAT.PAINT });
      mb.pop();
      const cy = fl + 0.172, hz = 0.0042;
      const hand = { color: 0x1d2224, mat: MAT.PAINT, up: [0, 0, 1] };
      mb.beam([0, cy, hz], [-0.0085, cy + 0.0055, hz], 0.0024, 0.0008, hand);
      mb.beam([0, cy, hz], [0.0085, cy + 0.0125, hz], 0.0016, 0.0008, hand);
      mb.cylinder(0, cy - 0.0015, hz, 0.0018, 0.003, { seg: 6, color: 0xc9a23a, mat: MAT.STEEL });
    }
    mb.pop();
  }
  // copper spire: a crisp octagonal needle with four corner pinnacles, a gilt ball and a cross
  const ys = C.spireBase, sh = C.spireH, sr = ts + 0.002;
  const cop = { color: COPPER, mat: MAT.STEEL };
  const ring = [];
  for (let k = 0; k < 8; k++) { const a = (k + 0.5) / 8 * Math.PI * 2; ring.push([tx + Math.cos(a) * sr, ys, tz + Math.sin(a) * sr]); }
  const apex = [tx, ys + sh, tz];
  for (let k = 0; k < 8; k++) {
    const a = ring[k], b = ring[(k + 1) % 8];
    const mid = [(a[0] + b[0]) / 2 - tx, 0, (a[2] + b[2]) / 2 - tz];
    face(mb, [a, b, apex], [mid[0], 0.2, mid[2]], cop);
  }
  // copper skirt on the cornice top
  mb.boxMM(tx0 - 0.004, towerTop, tz0 - 0.004, tx1 + 0.004, towerTop + 0.004, tz1 + 0.004, { ...cop, skip: ['bottom'] });
  for (const [px, pz] of [[tx0, tz0], [tx1, tz0], [tx0, tz1], [tx1, tz1]]) {
    mb.push(); mb.translate(px, 0, pz); mb.rotateY(Math.PI / 4);
    mb.cylinder(0, towerTop + 0.004, 0, 0.0075, 0.036, { seg: 4, r2: 0, bottom: false, ...cop });
    mb.pop();
  }
  const top = ys + sh;
  mb.sphere(tx, top + 0.003, tz, 0.0055, { seg: 8, rings: 5, color: 0xd8b44a, mat: MAT.STEEL });
  mb.boxMM(tx - 0.0009, top + 0.007, tz - 0.0009, tx + 0.0009, top + 0.03, tz + 0.0009, { color: 0xd8b44a, mat: MAT.STEEL, skip: ['bottom'] });
  mb.boxMM(tx - 0.0065, top + 0.019, tz - 0.0009, tx + 0.0065, top + 0.0208, tz + 0.0009, { color: 0xd8b44a, mat: MAT.STEEL });
}

// ---- trees ---------------------------------------------------------------------------------------------------
const ICO = (() => {
  const t = (1 + Math.sqrt(5)) / 2;
  const nrm = v => { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; };
  const V = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]].map(nrm);
  const F0 = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
  const cache = new Map();
  const mid = (a, b) => {
    const k = a < b ? a * 64 + b : b * 64 + a;
    if (!cache.has(k)) { V.push(nrm([(V[a][0] + V[b][0]) / 2, (V[a][1] + V[b][1]) / 2, (V[a][2] + V[b][2]) / 2])); cache.set(k, V.length - 1); }
    return cache.get(k);
  };
  const F = [];
  for (const [a, b, c] of F0) { const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a); F.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]); }
  return { V, F };
})();

function tree(mb, T) {
  const { x, z, g, r, sy, th } = T;
  if (!T.bush) mb.cylinder(x, g - 0.008, z, 0.0055, th + 0.008 + r * 0.5, { seg: 6, caps: false, color: TRUNK, mat: MAT.PAINT });
  const cy = T.bush ? g + r * sy * 0.45 : g + th + r * sy * 0.92;
  mb.push(); mb.translate(x, cy, z); mb.rotateY(T.rot);
  const P = ICO.V.map((v, i) => { const k = 1 + T.jit[i]; return [v[0] * r * k, v[1] * r * sy * k * (v[1] < -0.5 ? 0.85 : 1), v[2] * r * k]; });
  let fi = 0;
  for (const f of ICO.F) {
    const a = P[f[0]], b = P[f[1]], c = P[f[2]];
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const ctr = [a[0] + b[0] + c[0], a[1] + b[1] + c[1], a[2] + b[2] + c[2]];
    let order = [a, b, c];
    if (n[0] * ctr[0] + n[1] * ctr[1] + n[2] * ctr[2] < 0) { n = [-n[0], -n[1], -n[2]]; order = [a, c, b]; }
    const l = Math.hypot(n[0], n[1], n[2]) || 1;
    n = [n[0] / l, n[1] / l, n[2] / l];
    const hsh = Math.sin(T.shade + fi * 12.9898) * 43758.5453;
    const col = mixHex(T.col, (hsh - Math.floor(hsh)) < 0.5 ? 0xffffff : 0x000000, 0.05 * ((hsh * 7) - Math.floor(hsh * 7)));
    const base = mb.nv;
    for (const p of order) {
      const rl = Math.hypot(p[0], p[1] / sy, p[2]) || 1;
      const m = [n[0] * 0.45 + p[0] / rl * 0.55, n[1] * 0.45 + p[1] / sy / rl * 0.55, n[2] * 0.45 + p[2] / rl * 0.55];
      const ml = Math.hypot(m[0], m[1], m[2]);
      const param = T.bush ? 0.15 : 0.3 + 0.7 * Math.max(0, Math.min(1, p[1] / (r * sy) * 0.5 + 0.5));
      mb.vert(p, [m[0] / ml, m[1] / ml, m[2] / ml], { color: col, mat: MAT.LEAF, param });
    }
    mb.tri(base, base + 1, base + 2);
    fi++;
  }
  mb.pop();
}
