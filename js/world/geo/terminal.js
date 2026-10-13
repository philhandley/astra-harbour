// Container terminal: the yard surface (asphalt, concrete rail strips, crane rails, painted lines), the light towers,
// the terminal office, and the quay-edge furniture along the WHOLE quay wall (fenders, bollards, ladders, and the
// mussels and weed below the waterline). Containers are GPU instances placed by the game, never drawn here.
// Debug: dev/view.html?b=terminal&view=ship, or &cam=yaw,pitch,dist,tx,ty,tz for close-ups; &debugTerminal logs triangles per part.
import { MAT } from '../../gpu/mesh.js';
import { makeRand } from '../../gpu/math.js';
import {
  B, QUAY_Z, QUAY_TOP, LAND_Z, SPLIT_X, RAIL_WATER_Z, RAIL_LAND_Z, RAIL_X, STAGING_Z, YARD, OFFICE,
  LIGHT_TOWERS, BOX, BERTH, PIER, bayX, floorHeight,
} from '../layout.js';

// ---- levels and extents ----------------------------------------------------------------------------------------
const X0 = -B + 0.01, X1 = SPLIT_X;          // terminal surface in x (0.01 clear of the block cut)
const DECK = QUAY_TOP - 0.004;               // the plain deck terrain.js lays
const Y_ASPH = QUAY_TOP;                     // asphalt top
const Y_CONC = QUAY_TOP + 0.0006;            // concrete strips and apron
const Y_FILL = QUAY_TOP + 0.0013;            // painted areas on the asphalt
const Y_LINE = QUAY_TOP + 0.0020;            // painted lines (above fills)
const Y_PAVE = QUAY_TOP + 0.0045;            // office forecourt paving (kerbed)
const COPE_BACK = QUAY_Z - 0.03;             // coping (terrain.js): back edge, tops and front faces
const COPE_T = QUAY_TOP + 0.006, COPE_F = QUAY_TOP + 0.008;
const COPE_UNDER = QUAY_TOP - 0.025;
const COPE_FRONT_T = QUAY_Z + 0.008, COPE_FRONT_F = QUAY_Z + 0.01;
const COPE_MID = QUAY_Z - 0.011;             // bollard line on the coping

const LAND_STRIP = [RAIL_LAND_Z - 0.016, RAIL_LAND_Z + 0.016];
const WATER_STRIP = [RAIL_WATER_Z - 0.016, RAIL_WATER_Z + 0.016];
const LANE = { x0: -2.21, x1: 0.565, z0: LAND_STRIP[1] + 0.012, z1: WATER_STRIP[0] - 0.024 }; // truck lane under the gantries
const TRENCH = [WATER_STRIP[0] - 0.013, WATER_STRIP[0] - 0.003];                       // crane cable trench cover
const STAGE = { x0: -1.75, x1: -0.25, z0: STAGING_Z - 0.134, z1: Math.min(STAGING_Z + 0.134, LAND_STRIP[0]) };
const WALK_X = [-2.135, -2.085];             // pedestrian walk from the office to the quay

// office storey levels
const OFF = {};
OFF.y0 = Y_PAVE; OFF.g = OFF.y0 + 0.008; OFF.s1 = OFF.g + 0.056; OFF.s1t = OFF.s1 + 0.006; OFF.r = OFF.s1t + 0.054; OFF.rt = OFF.r + 0.007;
OFF.cabTop = OFF.rt + 0.006 + 0.04 + 0.006;
const PLOT = { x0: X0 + 0.008, x1: OFFICE.x1 + 0.035, z0: LAND_Z + 0.007, z1: OFFICE.z1 + 0.025 };
const BLD = { x0: OFFICE.x0 + 0.02, x1: OFFICE.x1 - 0.02, z0: OFFICE.z0 + 0.02, z1: OFFICE.z1 - 0.09 };

const COL = {
  asphalt: 0x55585d, concrete: 0xd4d0c7, strip: 0xc4c0b6, rail: 0x3a3f45, white: 0xf4f2ec, yellow: 0xf2c12e,
  stage: 0x48525d, walk: 0x6aa95e, hatchK: 0x2b2d31, trench: 0x777d84, pave: 0xe3dfd6, kerb: 0xbfbab0,
  bollard: 0x2f3439, iron: 0x1c1e21, rubber: 0x1c1e21, ladderT: 0xf0b92a, ladderF: 0x9ea5aa,
  lamp: 0xfff4d6, mast: 0xd3d8dc, housing: 0x50565d,
  wall: 0xf3f3f0, slab: 0xfbfbf9, glass: 0x86b9e6, roof: 0xb9bdc0, core: 0xe8743a, cab: 0x8fb8d6,
};

// ---- layout of the yard and the quay furniture (pure data, so points can be exported without building) ----------
const YARD_COLS = 6, YARD_ROWS = 4, AISLE = 0.10;
function yardBlocks() {
  const w = YARD_COLS * BOX.pitchX, total = 3 * w + 2 * AISLE;
  const start = (YARD.x0 + YARD.x1) / 2 - total / 2, zc = (YARD.z0 + YARD.z1) / 2;
  const out = [];
  for (let b = 0; b < 3; b++) {
    const x0 = start + b * (w + AISLE);
    out.push({ x0, x1: x0 + w, z0: zc - (YARD_ROWS * BOX.pitchZ) / 2, z1: zc + (YARD_ROWS * BOX.pitchZ) / 2 });
  }
  return out;
}
const BLOCKS = yardBlocks();
const BAYS = Array.from({ length: 10 }, (_, i) => BERTH.x + bayX(i));

const LADDERS = [-2.16, -1.26, -0.36, 0.66, 1.24, 2.52];
const FENDERS_T = [-2.34, -1.98, -1.71, -1.44, -1.08, -0.81, -0.54, -0.18, 0.09];
const TUG_FENDERS = [[0.20, 0.39], [0.42, 0.61]];
const BOLLARDS_T = [-2.30, -2.00, -1.70, -1.40, -1.10, -0.80, -0.50, -0.20, 0.10, 0.40, 0.72];
const BOLLARDS_F = [0.82, 1.08, 1.38, 1.68, 1.98];
const TYRES = [0.95, 1.53, 1.83, 2.10];
const TOWER = { base: QUAY_TOP + 0.008, top: QUAY_TOP + 0.70, cap: QUAY_TOP + 0.742 };
const BT_H = 0.019, BF_H = 0.0185;            // bollard heights above the coping

const pierClear = x => Math.abs(x - PIER.root.x) > 0.15;

export const points = {
  // Gull perches [x, y, z]: light tower tops first, then the office cab roof, then fishing quay bollard tops.
  perches: [
    ...LIGHT_TOWERS.map(([x, z]) => [x, TOWER.cap, z]),
    [(BLD.x0 + BLD.x1) / 2 - 0.015, OFF.cabTop, BLD.z1 - 0.06],
    ...BOLLARDS_F.filter(pierClear).slice(0, 3).map(x => [x, COPE_F + BF_H, COPE_MID]),
  ],
  // Mooring bollards on the coping [x, yTop, z] (terminal then fishing quay), for mooring lines.
  bollards: [
    ...BOLLARDS_T.map(x => [x, COPE_T + BT_H, COPE_MID]),
    ...BOLLARDS_F.filter(pierClear).map(x => [x, COPE_F + BF_H, COPE_MID]),
  ],
  // Painted yard slots: centre of each 20 ft footprint on the asphalt, long side along x. Three blocks of 6 x 4.
  yardSlots: BLOCKS.flatMap(b => {
    const s = [];
    for (let r = 0; r < YARD_ROWS; r++) for (let c = 0; c < YARD_COLS; c++) {
      s.push([b.x0 + (c + 0.5) * BOX.pitchX, Y_ASPH, b.z0 + (r + 0.5) * BOX.pitchZ]);
    }
    return s;
  }),
  // Staging lane under the backreach: one painted tick per ship bay at these x values, centred on STAGING_Z.
  stagingTicks: BAYS.slice(),
};

// ---- small paint helpers --------------------------------------------------------------------------------------
function rectY(mb, x0, z0, x1, z1, y, color, mat = MAT.PAINT) {
  mb.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], { color, mat, param: 0 });
}
function lineSeg(mb, ax, az, bx, bz, w, y, color) {
  const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz) || 1;
  const nx = (-dz / L) * w / 2, nz = (dx / L) * w / 2;
  mb.quad([ax + nx, y, az + nz], [bx + nx, y, bz + nz], [bx - nx, y, bz - nz], [ax - nx, y, az - nz], { color, mat: MAT.PAINT, param: 0 });
}
function dashedX(mb, x0, x1, z, w, y, dash, gap, color) {
  for (let x = x0; x < x1 - 1e-4; x += dash + gap) rectY(mb, x, z - w / 2, Math.min(x + dash, x1), z + w / 2, y, color);
}
function outline(mb, x0, z0, x1, z1, w, y, color) {
  rectY(mb, x0, z0, x1, z0 + w, y, color);
  rectY(mb, x0, z1 - w, x1, z1, y, color);
  rectY(mb, x0, z0 + w, x0 + w, z1 - w, y, color);
  rectY(mb, x1 - w, z0 + w, x1, z1 - w, y, color);
}
// Clip a polygon (xz pairs) to the half-plane f(p) >= 0.
function clipPoly(pts, f) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length], fa = f(a), fb = f(b);
    if (fa >= 0) out.push(a);
    if ((fa >= 0) !== (fb >= 0)) { const t = fa / (fa - fb); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
  }
  return out;
}
// Diagonal safety hatching inside a rectangle, with a border.
function hatch(mb, x0, z0, x1, z1, y, color, pitch = 0.028, frac = 0.45, border = 0.004) {
  const ix0 = x0 + border, iz0 = z0 + border, ix1 = x1 - border, iz1 = z1 - border;
  const R = [[ix0, iz1], [ix1, iz1], [ix1, iz0], [ix0, iz0]];
  const w = pitch * frac;
  for (let u = Math.floor((ix0 + iz0) / pitch) * pitch; u < ix1 + iz1; u += pitch) {
    let p = clipPoly(R, q => q[0] + q[1] - u);
    p = clipPoly(p, q => u + w - (q[0] + q[1]));
    if (p.length >= 3) mb.poly(p.map(q => [q[0], y, q[1]]), { color, mat: MAT.PAINT, param: 0 });
  }
  if (border > 0) outline(mb, x0, z0, x1, z1, border, y, color);
}
function arrow(mb, cx, cz, dir, y, color) {
  const s = dir;
  rectY(mb, Math.min(cx - 0.030 * s, cx + 0.004 * s), cz - 0.0035, Math.max(cx - 0.030 * s, cx + 0.004 * s), cz + 0.0035, y, color);
  const tri = [[cx + 0.004 * s, cz + 0.011], [cx + 0.030 * s, cz], [cx + 0.004 * s, cz - 0.011]];
  mb.poly((s > 0 ? tri : tri.slice().reverse()).map(q => [q[0], y, q[1]]), { color, mat: MAT.PAINT, param: 0 });
}

// ---- the build --------------------------------------------------------------------------------------------------
export function build(mb, ctx) {
  mb.push();
  mb.set({ obj: 0, param: 0, mat: MAT.PAINT, color: 0xffffff });
  const stats = {};
  const step = (name, fn) => { const t = mb.triangles; fn(); stats[name] = mb.triangles - t; };
  step('surface', () => surface(mb));
  step('markings', () => markings(mb));
  step('rails', () => rails(mb));
  step('office', () => office(mb));
  step('towers', () => { for (const [x, z] of LIGHT_TOWERS) lightTower(mb, x, z); });
  step('cones', () => cones(mb));
  step('quayEdge', () => quayEdge(mb));
  step('underwater', () => underwater(mb, makeRand(4242)));
  if (typeof location !== 'undefined' && /debugTerminal/.test(location.search)) console.log('TERMINAL tris', JSON.stringify(stats));
  mb.pop();
}

// Asphalt, concrete rail strips and the apron. Pieces abut, so nothing lies on top of anything else.
function surface(mb) {
  const slab = (z0, z1, top, color, mat) => mb.boxMM(X0, DECK, z0, X1, top, z1, { color, mat, param: 0, skip: ['bottom', 'nz', 'pz'] });
  slab(LAND_Z, LAND_STRIP[0], Y_ASPH, COL.asphalt, MAT.ASPHALT);
  slab(LAND_STRIP[0], LAND_STRIP[1], Y_CONC, COL.strip, MAT.CONCRETE);
  slab(LAND_STRIP[1], WATER_STRIP[0], Y_ASPH, COL.asphalt, MAT.ASPHALT);
  slab(WATER_STRIP[0], WATER_STRIP[1], Y_CONC, COL.strip, MAT.CONCRETE);
  slab(WATER_STRIP[1], COPE_BACK, Y_CONC, COL.concrete, MAT.CONCRETE);
  // crane cable trench: a run of steel cover plates beside the water-side rail
  mb.boxMM(RAIL_X[0], Y_ASPH - 0.001, TRENCH[0], RAIL_X[1], Y_ASPH + 0.0009, TRENCH[1], { color: COL.trench, mat: MAT.STEEL, skip: ['bottom'] });
  for (let x = RAIL_X[0] + 0.12; x < RAIL_X[1]; x += 0.12) rectY(mb, x - 0.0008, TRENCH[0], x + 0.0008, TRENCH[1], Y_ASPH + 0.0011, 0x4a4f55);
  // crisp kerbs: along the block edge, along the back, and at the fishing quay boundary
  const K = { color: 0xe6e2da, mat: MAT.CONCRETE, skip: ['bottom'] };
  mb.boxMM(X0, Y_ASPH - 0.001, LAND_Z, X0 + 0.008, Y_ASPH + 0.004, COPE_BACK, K);
  mb.boxMM(X0 + 0.008, Y_ASPH - 0.001, LAND_Z, X1 - 0.008, Y_ASPH + 0.004, LAND_Z + 0.007, K);
  mb.boxMM(X1 - 0.008, Y_ASPH - 0.001, LAND_Z, X1, Y_ASPH + 0.004, COPE_BACK, K);
  // office forecourt: kerbed paving
  mb.boxMM(PLOT.x0, Y_ASPH - 0.001, PLOT.z0, PLOT.x1, Y_PAVE, PLOT.z1, { color: COL.pave, mat: MAT.CONCRETE, skip: ['bottom'] });
}

function markings(mb) {
  const W = COL.white, Yl = COL.yellow;
  // quay edge safety line on the apron
  rectY(mb, X0 + 0.01, COPE_BACK - 0.012, X1 - 0.01, COPE_BACK - 0.008, Y_CONC + 0.0012, Yl);
  // tug berth: hatched apron
  hatch(mb, 0.20, WATER_STRIP[1] + 0.006, 0.61, COPE_BACK - 0.016, Y_CONC + 0.0012, COL.hatchK, 0.026, 0.5, 0);

  // ---- staging lane under the backreach, with a tick for every ship bay
  const S = STAGE;
  rectY(mb, S.x0, S.z0, S.x1, S.z1, Y_FILL, COL.stage);
  outline(mb, S.x0, S.z0, S.x1, S.z1, 0.004, Y_LINE, W);
  for (const x of BAYS) {
    rectY(mb, x - 0.0028, S.z0 + 0.004, x + 0.0028, S.z0 + 0.030, Y_LINE, W);
    rectY(mb, x - 0.0028, S.z1 - 0.030, x + 0.0028, S.z1 - 0.004, Y_LINE, W);
    rectY(mb, x - 0.0028, STAGING_Z - 0.006, x + 0.0028, STAGING_Z + 0.006, Y_LINE, W);
  }
  // little end chevrons on the lane (start and finish)
  for (const [x, d] of [[S.x0 + 0.03, 1], [S.x1 - 0.03, -1]]) {
    lineSeg(mb, x, STAGING_Z - 0.05, x + 0.016 * d, STAGING_Z, 0.004, Y_LINE, Yl);
    lineSeg(mb, x + 0.016 * d, STAGING_Z, x, STAGING_Z + 0.05, 0.004, Y_LINE, Yl);
  }

  // ---- yard blocks: parking-style slot grid, yellow block edges
  for (const b of BLOCKS) {
    const w = 0.0025;
    for (let r = 0; r <= YARD_ROWS; r++) {
      const z = b.z0 + r * BOX.pitchZ, edge = r === 0 || r === YARD_ROWS;
      rectY(mb, b.x0 - (edge ? 0.002 : 0), z - (edge ? 0.002 : w / 2), b.x1 + (edge ? 0.002 : 0), z + (edge ? 0.002 : w / 2), Y_LINE, edge ? Yl : W);
    }
    for (let c = 0; c <= YARD_COLS; c++) {
      const x = b.x0 + c * BOX.pitchX, edge = c === 0 || c === YARD_COLS;
      rectY(mb, x - (edge ? 0.002 : w / 2), b.z0 + 0.002, x + (edge ? 0.002 : w / 2), b.z1 - 0.002, Y_LINE, edge ? Yl : W);
    }
  }
  // service road behind the yard and down the aisles: dashed centre lines
  dashedX(mb, BLOCKS[0].x0, BLOCKS[2].x1, (LAND_Z + BLOCKS[0].z0) / 2 + 0.002, 0.003, Y_LINE, 0.04, 0.03, W);
  for (let k = 0; k < 2; k++) {
    const xa = (BLOCKS[k].x1 + BLOCKS[k + 1].x0) / 2;
    for (let z = BLOCKS[0].z0 + 0.01; z < BLOCKS[0].z1 - 0.02; z += 0.06) rectY(mb, xa - 0.0015, z, xa + 0.0015, z + 0.035, Y_LINE, W);
  }

  // ---- truck lane between the crane rails: edge lines, dashed centre, arrows, give-way bars
  const L = LANE, zc = (L.z0 + L.z1) / 2;
  rectY(mb, L.x0, L.z0 - 0.002, L.x1, L.z0 + 0.002, Y_LINE, W);
  rectY(mb, L.x0, L.z1 - 0.002, L.x1, L.z1 + 0.002, Y_LINE, W);
  dashedX(mb, WALK_X[1] + 0.04, L.x1 - 0.02, zc, 0.003, Y_LINE, 0.05, 0.04, W);
  for (const x of [-1.80, -1.00, -0.20, 0.42]) arrow(mb, x, (zc + L.z1) / 2, 1, Y_LINE, W);
  for (const x of [-1.95, -1.15, -0.35, 0.28]) arrow(mb, x, (zc + L.z0) / 2, -1, Y_LINE, W);

  // ---- pedestrian route: green walk from the office, zebra over the truck lane
  rectY(mb, WALK_X[0], PLOT.z1, WALK_X[1], LAND_STRIP[0], Y_FILL, COL.walk);
  outline(mb, WALK_X[0], PLOT.z1, WALK_X[1], LAND_STRIP[0], 0.003, Y_LINE, W);
  for (let z = LAND_STRIP[1] + 0.006; z < TRENCH[0] - 0.008; z += 0.017) rectY(mb, WALK_X[0], z, WALK_X[1], z + 0.0095, Y_LINE, W);

  // ---- hatched safety zones: crane stop zones at the rail ends, light tower bases
  hatch(mb, X0 + 0.008, L.z0 + 0.006, L.x0 - 0.075, L.z1 - 0.006, Y_FILL, Yl);
  hatch(mb, L.x1 + 0.012, L.z0 + 0.006, X1 - 0.016, L.z1 - 0.006, Y_FILL, Yl);
  const [tx, tz] = LIGHT_TOWERS[1];
  hatch(mb, tx - 0.042, tz - 0.042, tx + 0.042, tz + 0.042, Y_FILL, Yl, 0.022);
}

function rails(mb) {
  for (const z of [RAIL_WATER_Z, RAIL_LAND_Z]) {
    const xa = RAIL_X[0] - 0.006, xb = RAIL_X[1] + 0.006;
    mb.boxMM(xa, Y_CONC - 0.0005, z - 0.0045, xb, Y_CONC + 0.0008, z + 0.0045, { color: COL.rail, mat: MAT.STEEL, skip: ['bottom'] });
    mb.boxMM(xa, Y_CONC + 0.0008, z - 0.0017, xb, Y_CONC + 0.0034, z + 0.0017, { color: 0x5a6068, mat: MAT.STEEL, skip: ['bottom'] });
    // buffer stops at both ends: yellow steel block, black chevrons, rubber buffer facing the rail
    for (const [xe, d] of [[RAIL_X[0], -1], [RAIL_X[1], 1]]) {
      const xin = xe - d * 0.002, xout = xe + d * 0.016;
      const lo = Math.min(xin, xout), hi = Math.max(xin, xout);
      mb.boxMM(lo, Y_CONC, z - 0.013, hi, Y_CONC + 0.019, z + 0.013, { color: COL.yellow, mat: MAT.STEEL, skip: ['bottom'] });
      mb.boxMM(lo - 0.003, Y_CONC, z - 0.016, hi + 0.003, Y_CONC + 0.003, z + 0.016, { color: 0x3a3f45, mat: MAT.STEEL, skip: ['bottom'] });
      // black stripes on the top
      for (let k = -1; k <= 1; k++) rectY(mb, lo + 0.002, z + k * 0.008 - 0.0022, hi - 0.002, z + k * 0.008 + 0.0022, Y_CONC + 0.0192, COL.hatchK);
      mb.push(); mb.translate(xin, Y_CONC + 0.011, z); mb.rotateZ(d > 0 ? Math.PI / 2 : -Math.PI / 2);
      mb.cylinder(0, 0, 0, 0.0055, 0.008, { seg: 8, color: COL.rubber, mat: MAT.RUBBER, bottom: false });
      mb.pop();
    }
  }
}

// ---- terminal office -------------------------------------------------------------------------------------------
function office(mb) {
  const b = BLD, y0 = OFF.y0, yG = OFF.g, yS1 = OFF.s1, yS1t = OFF.s1t, yR = OFF.r, yRt = OFF.rt;
  const ox = 0.006;                  // slab overhang
  const P = { mat: MAT.PAINT };
  const midX = (b.x0 + b.x1) / 2;

  // plinth and ground floor
  mb.boxMM(b.x0 - 0.004, y0, b.z0 - 0.004, b.x1 + 0.004, yG, b.z1 + 0.004, { ...P, color: 0xb8bcc0, skip: ['bottom'] });
  mb.boxMM(b.x0, yG, b.z0, b.x1, yS1, b.z1, { ...P, color: COL.wall, skip: ['bottom', 'top'] });
  // ground floor windows (slightly proud) on every side
  const win = (x0, x1, z, side) => mb.boxMM(x0, yG + 0.018, side > 0 ? z : z - 0.0012, x1, yG + 0.044, side > 0 ? z + 0.0012 : z, { color: COL.glass, mat: MAT.GLASS, skip: ['bottom', side > 0 ? 'nz' : 'pz'] });
  const winX = (z0, z1, x, side) => mb.boxMM(side > 0 ? x : x - 0.0012, yG + 0.018, z0, side > 0 ? x + 0.0012 : x, yG + 0.044, z1, { color: COL.glass, mat: MAT.GLASS, skip: ['bottom', side > 0 ? 'nx' : 'px'] });
  for (const x of [b.x0 + 0.03, b.x0 + 0.085, b.x1 - 0.085, b.x1 - 0.03]) win(x - 0.02, x + 0.02, b.z1, 1);
  for (let x = b.x0 + 0.04; x < b.x1 - 0.02; x += 0.06) win(x - 0.02, x + 0.02, b.z0, -1);
  for (const s of [-1, 1]) for (let z = b.z0 + 0.04; z < b.z1 - 0.02; z += 0.065) winX(z - 0.02, z + 0.02, s > 0 ? b.x1 : b.x0, s);
  // entrance: glass door, canopy, two steps
  mb.boxMM(midX - 0.017, yG, b.z1, midX + 0.017, yG + 0.044, b.z1 + 0.0014, { color: 0x2c4256, mat: MAT.GLASS, skip: ['bottom', 'nz'] });
  mb.boxMM(midX - 0.0006, yG, b.z1 + 0.0014, midX + 0.0006, yG + 0.044, b.z1 + 0.0022, { color: COL.slab, ...P, skip: ['bottom', 'nz'] });
  mb.boxMM(midX - 0.03, yG + 0.049, b.z1, midX + 0.03, yG + 0.053, b.z1 + 0.03, { color: COL.slab, ...P, skip: ['nz'] });
  mb.boxMM(midX - 0.03, y0, b.z1 + 0.004, midX + 0.03, y0 + 0.004, b.z1 + 0.022, { color: 0xc9cccf, ...P, skip: ['bottom', 'nz'] });
  mb.boxMM(midX - 0.03, y0 + 0.004, b.z1 + 0.004, midX + 0.03, yG, b.z1 + 0.011, { color: 0xd3d6d8, ...P, skip: ['bottom', 'nz'] });

  // first floor slab edge (cantilevered), glazed upper storey with mullions, roof slab
  mb.boxMM(b.x0 - ox, yS1, b.z0 - ox, b.x1 + ox, yS1t, b.z1 + ox, { color: COL.slab, ...P });
  const gi = 0.004;
  mb.boxMM(b.x0 + gi, yS1t, b.z0 + gi, b.x1 - gi, yR, b.z1 - gi, { color: COL.glass, mat: MAT.GLASS, skip: ['bottom', 'top'] });
  const mull = (x, z, nx, nz) => {
    const hw = 0.0015, d = 0.0025;
    if (nz !== 0) mb.boxMM(x - hw, yS1t, nz > 0 ? z : z - d, x + hw, yR, nz > 0 ? z + d : z, { color: COL.slab, ...P, skip: ['bottom', 'top', nz > 0 ? 'nz' : 'pz'] });
    else mb.boxMM(nx > 0 ? x : x - d, yS1t, z - hw, nx > 0 ? x + d : x, yR, z + hw, { color: COL.slab, ...P, skip: ['bottom', 'top', nx > 0 ? 'nx' : 'px'] });
  };
  for (let x = b.x0 + gi + 0.04; x < b.x1 - gi - 0.01; x += 0.04) { mull(x, b.z1 - gi, 0, 1); mull(x, b.z0 + gi, 0, -1); }
  for (let z = b.z0 + gi + 0.04; z < b.z1 - gi - 0.01; z += 0.04) { mull(b.x1 - gi, z, 1, 0); mull(b.x0 + gi, z, -1, 0); }
  mb.boxMM(b.x0 - ox, yR, b.z0 - ox, b.x1 + ox, yRt, b.z1 + ox, { color: COL.slab, ...P, skip: ['top'] });
  // roof: membrane inside a parapet
  const rx0 = b.x0 - ox, rx1 = b.x1 + ox, rz0 = b.z0 - ox, rz1 = b.z1 + ox, pt = 0.004, ph = 0.007;
  rectY(mb, rx0 + pt, rz0 + pt, rx1 - pt, rz1 - pt, yRt, COL.roof);
  mb.boxMM(rx0, yRt, rz0, rx1, yRt + ph, rz0 + pt, { color: COL.slab, ...P, skip: ['bottom'] });
  mb.boxMM(rx0, yRt, rz1 - pt, rx1, yRt + ph, rz1, { color: COL.slab, ...P, skip: ['bottom'] });
  mb.boxMM(rx0, yRt, rz0 + pt, rx0 + pt, yRt + ph, rz1 - pt, { color: COL.slab, ...P, skip: ['pz', 'nz', 'bottom'] });
  mb.boxMM(rx1 - pt, yRt, rz0 + pt, rx1, yRt + ph, rz1 - pt, { color: COL.slab, ...P, skip: ['pz', 'nz', 'bottom'] });
  // roof railing
  const ry = yRt + ph + 0.011, ri = 0.002;
  const ring = [[rx0 + ri, ry, rz0 + ri], [rx1 - ri, ry, rz0 + ri], [rx1 - ri, ry, rz1 - ri], [rx0 + ri, ry, rz1 - ri], [rx0 + ri, ry, rz0 + ri]];
  mb.set({ color: 0xc6cbcf, mat: MAT.STEEL });
  for (let k = 0; k < 4; k++) mb.beam(ring[k], ring[k + 1], 0.0018, 0.0018, { caps: false });
  for (let k = 0; k < 4; k++) {
    const a = ring[k], c = ring[k + 1], n = Math.max(2, Math.round(Math.hypot(c[0] - a[0], c[2] - a[2]) / 0.05));
    for (let j = 0; j < n; j++) {
      const t = j / n, x = a[0] + (c[0] - a[0]) * t, z = a[2] + (c[2] - a[2]) * t;
      mb.beam([x, yRt + ph, z], [x, ry, z], 0.0014, 0.0014, { caps: false });
    }
  }
  mb.set({ mat: MAT.PAINT, color: 0xffffff });

  // stair core in colour, rising above the roof (the "toy" accent)
  const cx0 = b.x1 - 0.07, cx1 = b.x1 + 0.012, cz0 = b.z0 + 0.03, cz1 = b.z0 + 0.10;
  mb.boxMM(cx0, yG, cz0, cx1, yRt + 0.03, cz1, { color: COL.core, ...P, skip: ['bottom'] });
  mb.boxMM(cx1, yG + 0.012, cz0 + 0.022, cx1 + 0.0012, yRt + 0.02, cz1 - 0.022, { color: COL.glass, mat: MAT.GLASS, skip: ['bottom', 'nx'] });

  // control cab on the roof: glass box, white cap, antenna
  const kx = midX - 0.03, kz = b.z1 - 0.06, kw = 0.11, kd = 0.07, kh = 0.04;
  mb.boxMM(kx - kw / 2, yRt, kz - kd / 2, kx + kw / 2, yRt + 0.006, kz + kd / 2, { color: COL.slab, ...P, skip: ['bottom'] });
  mb.boxMM(kx - kw / 2 + 0.003, yRt + 0.006, kz - kd / 2 + 0.003, kx + kw / 2 - 0.003, yRt + 0.006 + kh, kz + kd / 2 - 0.003, { color: COL.cab, mat: MAT.GLASS, skip: ['bottom', 'top'] });
  for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    mb.boxMM(kx + x * (kw / 2 - 0.003) - 0.002, yRt + 0.006, kz + z * (kd / 2 - 0.003) - 0.002, kx + x * (kw / 2 - 0.003) + 0.002, yRt + 0.006 + kh, kz + z * (kd / 2 - 0.003) + 0.002, { color: COL.slab, ...P, skip: ['bottom', 'top'] });
  }
  const kTop = yRt + 0.006 + kh;
  mb.boxMM(kx - kw / 2 - 0.006, kTop, kz - kd / 2 - 0.006, kx + kw / 2 + 0.006, kTop + 0.006, kz + kd / 2 + 0.006, { color: COL.slab, ...P });
  // antenna mast with cross arms and a red tip light
  const ax = kx + kw / 2 - 0.012, az = kz - kd / 2 + 0.012;
  mb.cylinder(ax, kTop + 0.006, az, 0.0016, 0.07, { seg: 6, r2: 0.0009, color: 0xc9cdd1, mat: MAT.STEEL, bottom: false });
  mb.beam([ax - 0.012, kTop + 0.05, az], [ax + 0.012, kTop + 0.05, az], 0.0012, 0.0012, { color: 0xc9cdd1, mat: MAT.STEEL });
  mb.beam([ax, kTop + 0.035, az - 0.009], [ax, kTop + 0.035, az + 0.009], 0.0012, 0.0012, { color: 0xc9cdd1, mat: MAT.STEEL });
  mb.sphere(ax, kTop + 0.077, az, 0.0024, { seg: 6, rings: 3, color: 0xff4a3a, mat: MAT.LAMP, param: 0.4 });
  // radar bar on the cab roof
  mb.cylinder(kx - 0.03, kTop + 0.006, kz, 0.002, 0.008, { seg: 6, color: 0x9aa1a7, mat: MAT.STEEL, bottom: false });
  mb.boxMM(kx - 0.05, kTop + 0.014, kz - 0.0025, kx - 0.01, kTop + 0.019, kz + 0.0025, { color: 0xf4f4f2, mat: MAT.STEEL });
  // roof plant: air handling unit with a fan
  const hx = b.x0 + 0.06, hz = b.z0 + 0.06;
  mb.boxMM(hx - 0.035, yRt, hz - 0.025, hx + 0.035, yRt + 0.022, hz + 0.025, { color: 0xa9b0b6, mat: MAT.STEEL, skip: ['bottom'] });
  mb.cylinder(hx + 0.012, yRt + 0.022, hz, 0.014, 0.003, { seg: 10, color: 0x60676e, mat: MAT.STEEL, bottom: false });
  for (let k = 0; k < 3; k++) mb.boxMM(hx - 0.032, yRt + 0.006 + k * 0.005, hz + 0.025, hx - 0.006, yRt + 0.0075 + k * 0.005, hz + 0.0262, { color: 0x7d858c, mat: MAT.STEEL, skip: ['bottom', 'nz'] });

  // flag poles at the forecourt front: a blue-and-white harbour flag and a red pennant (no national flags)
  for (const [fx, kind] of [[b.x0 + 0.03, 'flag'], [b.x1 - 0.03, 'pennant']]) {
    const fz = PLOT.z1 - 0.012, top = y0 + 0.13;
    mb.cylinder(fx, y0, fz, 0.0028, 0.004, { seg: 6, color: 0xb8bcc0, mat: MAT.STEEL, bottom: false });
    mb.cylinder(fx, y0 + 0.004, fz, 0.0012, top - y0 - 0.004, { seg: 6, r2: 0.0009, color: 0xe9ecee, mat: MAT.STEEL, bottom: false });
    mb.sphere(fx, top + 0.0015, fz, 0.0019, { seg: 6, rings: 3, color: 0xd9b54a, mat: MAT.STEEL });
    const n = 5, len = kind === 'flag' ? 0.042 : 0.05, h = 0.026, fy = top - 0.004, yc = fy - h / 2;
    for (let k = 0; k < n; k++) {
      const t0 = k / n, t1 = (k + 1) / n;
      const w0 = Math.sin(t0 * 5.0) * 0.004 * t0, w1 = Math.sin(t1 * 5.0) * 0.004 * t1;
      const x0 = fx + t0 * len, x1 = fx + t1 * len;
      const Q = (ya0, ya1, yb0, yb1, color) => mb.quad([x0, ya0, fz + w0], [x1, ya1, fz + w1], [x1, yb1, fz + w1], [x0, yb0, fz + w0], { color, mat: MAT.CANVAS });
      if (kind === 'flag') {
        // split along the diagonal from the bottom of the hoist to the top of the fly
        const d0 = fy - h + h * t0, d1 = fy - h + h * t1;
        Q(fy - h, fy - h, d0, d1, 0x2f6bd0);
        Q(d0, d1, fy, fy, 0xf4f2ec);
      } else {
        const h0 = (h / 2) * (1 - 0.9 * t0), h1 = (h / 2) * (1 - 0.9 * t1);
        Q(yc - h0, yc - h1, yc + h0, yc + h1, k === 0 ? 0xf4f2ec : 0xe0402e);
      }
    }
  }
  // a bench and two planters on the forecourt
  mb.boxMM(midX + 0.05, y0, PLOT.z1 - 0.022, midX + 0.09, y0 + 0.006, PLOT.z1 - 0.014, { color: 0xa87b4f, mat: MAT.TIMBER, skip: ['bottom'] });
  for (const px of [midX - 0.075, midX + 0.12]) {
    mb.boxMM(px - 0.012, y0, PLOT.z1 - 0.03, px + 0.012, y0 + 0.01, PLOT.z1 - 0.006, { color: 0x8e9296, mat: MAT.CONCRETE, skip: ['bottom'] });
    mb.sphere(px, y0 + 0.016, PLOT.z1 - 0.018, 0.011, { seg: 7, rings: 4, sy: 0.75, color: 0x6fa84a, mat: MAT.LEAF, param: 0.3 });
  }
}

// ---- light towers ----------------------------------------------------------------------------------------------
function lightTower(mb, x, z) {
  const y0 = QUAY_TOP, yb = TOWER.base, yt = TOWER.top;
  const rb = 0.0105, rt = 0.0058;
  // concrete footing with a yellow collar
  mb.boxMM(x - 0.02, y0 - 0.001, z - 0.02, x + 0.02, yb, z + 0.02, { color: 0xcdc9c0, mat: MAT.CONCRETE, skip: ['bottom'] });
  mb.cylinder(x, yb, z, rb + 0.0035, 0.012, { seg: 10, color: COL.yellow, mat: MAT.STEEL, bottom: false });
  // tapered mast
  mb.cylinder(x, yb + 0.012, z, rb, yt - yb - 0.012, { seg: 8, r2: rt, color: COL.mast, mat: MAT.STEEL, bottom: false, caps: false });
  // access door at the foot
  mb.boxMM(x - 0.004, yb + 0.014, z + rb - 0.0006, x + 0.004, yb + 0.03, z + rb + 0.0012, { color: 0x9aa2a9, mat: MAT.STEEL, skip: ['bottom', 'nz'] });
  // ladder with a safety cage up the +z side
  const rAt = y => rb + (rt - rb) * (y - yb) / (yt - yb);
  const L0 = yb + 0.05, L1 = yt;
  const lz = y => z + rAt(y) + 0.0055;
  mb.set({ color: 0x9da4ab, mat: MAT.STEEL });
  for (const s of [-1, 1]) mb.beam([x + s * 0.0035, L0, lz(L0)], [x + s * 0.0035, L1, lz(L1)], 0.0011, 0.0011, { caps: false });
  for (let y = L0 + 0.01; y < L1; y += 0.03) mb.beam([x - 0.0035, y, lz(y)], [x + 0.0035, y, lz(y)], 0.0008, 0.0008, { caps: false });
  for (let y = L0 + 0.10; y < L1 - 0.01; y += 0.08) {
    const c = lz(y), pts = [];
    for (let k = 0; k <= 4; k++) { const a = Math.PI * k / 4; pts.push([x + Math.cos(a) * 0.0085, y, c + Math.sin(a) * 0.0075]); }
    mb.tube(pts, 0.0007, { seg: 3 });
  }
  for (const s of [-1, 0, 1]) {
    const a = Math.PI / 2 + s * 1.1;
    mb.beam([x + Math.cos(a) * 0.0085, L0 + 0.10, lz(L0 + 0.10) + Math.sin(a) * 0.0075], [x + Math.cos(a) * 0.0085, L1 - 0.01, lz(L1 - 0.01) + Math.sin(a) * 0.0075], 0.0008, 0.0008, { caps: false });
  }
  mb.set({ mat: MAT.PAINT, color: 0xffffff });

  // head: platform, railing, a crown of six floodlights, cap (the gull perch)
  const pr = 0.03, py = yt;
  const oct = [];
  for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2 + Math.PI / 8; oct.push([x + Math.cos(a) * pr, z - Math.sin(a) * pr]); }
  mb.prism(oct, py - 0.004, py, { color: 0x8d949b, mat: MAT.STEEL, bottom: true });
  const rail = oct.map(([px, pz]) => [px, py + 0.012, pz]); rail.push(rail[0]);
  for (let k = 0; k < 8; k++) {
    mb.beam(rail[k], rail[k + 1], 0.0012, 0.0012, { caps: false, color: COL.yellow, mat: MAT.STEEL });
    mb.beam([oct[k][0], py, oct[k][1]], rail[k], 0.0011, 0.0011, { caps: false, color: COL.yellow, mat: MAT.STEEL });
  }
  // short mast stub above the platform carrying the floodlight ring
  mb.cylinder(x, py, z, rt, 0.03, { seg: 8, color: COL.mast, mat: MAT.STEEL, bottom: false, caps: false });
  const fy = py + 0.022;
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + 0.3;
    mb.push();
    mb.translate(x, fy, z); mb.rotateY(a); mb.translate(0, 0, 0.017); mb.rotateX(0.55);
    mb.beam([0, 0, -0.012], [0, 0, -0.002], 0.0014, 0.0014, { caps: false, color: 0x7d858c, mat: MAT.STEEL });
    mb.boxMM(-0.0085, -0.0065, -0.004, 0.0085, 0.0065, 0.004, { color: COL.housing, mat: MAT.STEEL, skip: ['pz'] });
    mb.quad([-0.0075, -0.0055, 0.004], [0.0075, -0.0055, 0.004], [0.0075, 0.0055, 0.004], [-0.0075, 0.0055, 0.004], { color: COL.lamp, mat: MAT.LAMP, param: 0.6 });
    mb.pop();
  }
  // cap disc on top: the gull perch (TOWER.cap)
  mb.cylinder(x, py + 0.03, z, rt + 0.001, TOWER.cap - (py + 0.03) - 0.004, { seg: 8, r2: 0.0065, color: COL.mast, mat: MAT.STEEL, bottom: false });
  mb.cylinder(x, TOWER.cap - 0.004, z, 0.011, 0.004, { seg: 10, color: COL.yellow, mat: MAT.STEEL });
  // aviation light on the cap edge
  mb.sphere(x + 0.008, TOWER.cap + 0.002, z, 0.0018, { seg: 5, rings: 3, color: 0xff4a3a, mat: MAT.LAMP, param: 0.4 });
}

// A few traffic cones at the hatched zones.
function cones(mb) {
  const spots = [[-2.47, -0.90], [-2.40, -1.03], [-2.27, -0.86], [0.62, -1.02], [0.71, -0.86], [-0.10, -1.31]];
  for (const [x, z] of spots) {
    mb.boxMM(x - 0.0065, Y_LINE, z - 0.0065, x + 0.0065, Y_LINE + 0.0012, z + 0.0065, { color: 0x2b2d31, mat: MAT.RUBBER, skip: ['bottom'] });
    mb.cylinder(x, Y_LINE + 0.0012, z, 0.0048, 0.0075, { seg: 8, r2: 0.0029, color: 0xf2661b, mat: MAT.PAINT, bottom: false, caps: false });
    mb.cylinder(x, Y_LINE + 0.0087, z, 0.0029, 0.004, { seg: 8, r2: 0.0019, color: 0xf8f6f0, mat: MAT.PAINT, bottom: false, caps: false });
    mb.cylinder(x, Y_LINE + 0.0127, z, 0.0019, 0.0045, { seg: 8, r2: 0.0003, color: 0xf2661b, mat: MAT.PAINT, bottom: false });
  }
}

// ---- quay edge furniture along the whole wall -------------------------------------------------------------------
function quayEdge(mb) {
  for (const x of LADDERS) if (pierClear(x)) ladder(mb, x, x < SPLIT_X);
  for (const x of FENDERS_T) panelFender(mb, x);
  for (const [xa, xb] of TUG_FENDERS) tugFender(mb, xa, xb);
  for (const x of BOLLARDS_T) bollardT(mb, x);
  for (const x of BOLLARDS_F) if (pierClear(x)) bollardF(mb, x);
  for (const x of TYRES) if (pierClear(x)) tyre(mb, x);
}

function ladder(mb, x, terminal) {
  const top = terminal ? COPE_T : COPE_F, front = terminal ? COPE_FRONT_T : COPE_FRONT_F;
  const zf = front + 0.0045, yBot = -0.15, hw = 0.0105;
  mb.push();
  mb.set({ mat: MAT.STEEL, color: terminal ? COL.ladderT : COL.ladderF });
  for (const s of [-1, 1]) {
    const sx = x + s * hw;
    mb.tube([[sx, yBot, zf], [sx, top - 0.004, zf], [sx, top + 0.016, zf - 0.002], [sx, top + 0.025, zf - 0.010], [sx, top + 0.022, zf - 0.020], [sx, top - 0.001, zf - 0.026]], 0.0013, { seg: 5 });
    for (let y = yBot + 0.03; y < COPE_UNDER - 0.01; y += 0.085) mb.beam([sx, y, QUAY_Z - 0.001], [sx, y, zf], 0.002, 0.0018, { caps: false });
  }
  for (let y = yBot + 0.008; y < top - 0.006; y += 0.016) mb.beam([x - hw, y, zf], [x + hw, y, zf], 0.0015, 0.0015, { caps: false });
  mb.pop();
}

function panelFender(mb, x) {
  const zp0 = QUAY_Z + 0.013, zp1 = QUAY_Z + 0.0235, y0 = -0.05, y1 = 0.17, hw = 0.021;
  mb.push();
  mb.set({ mat: MAT.RUBBER, color: COL.rubber });
  // two rubber cone units between the wall and the panel
  for (const yc of [0.012, 0.118]) {
    mb.push(); mb.translate(x, yc, QUAY_Z); mb.rotateX(Math.PI / 2);
    mb.cylinder(0, 0, 0, 0.0145, zp0 - QUAY_Z, { seg: 8, r2: 0.0095, caps: false });
    mb.cylinder(0, 0, 0, 0.0175, 0.002, { seg: 8, caps: false, color: 0x3a3f45, mat: MAT.STEEL });
    mb.pop();
  }
  // front frame (dark steel) with a rubber face and pads
  mb.boxMM(x - hw, y0, zp0, x + hw, y1, zp1 - 0.003, { color: 0x2c3136, mat: MAT.STEEL, skip: ['nz'] });
  mb.boxMM(x - hw + 0.002, y0 + 0.003, zp1 - 0.003, x + hw - 0.002, y1 - 0.003, zp1, { skip: ['nz', 'bottom'] });
  // yellow top edge so the fenders read from afar
  mb.boxMM(x - hw, y1, zp0, x + hw, y1 + 0.003, zp1 - 0.003, { color: COL.yellow, mat: MAT.STEEL, skip: ['bottom'] });
  mb.pop();
}

function tugFender(mb, xa, xb) {
  const zc = QUAY_Z + 0.0125, yc = 0.035, r = 0.0115;
  mb.push();
  mb.translate(xa, yc, zc); mb.rotateZ(-Math.PI / 2);
  mb.cylinder(0, 0, 0, r, xb - xa, { seg: 10, color: COL.rubber, mat: MAT.RUBBER });
  mb.pop();
  for (const x of [xa + 0.012, xb - 0.012]) {
    mb.tube([[x, yc + r - 0.001, zc], [x, COPE_UNDER - 0.004, QUAY_Z + 0.002]], 0.0011, { seg: 4, color: 0x5f666d, mat: MAT.STEEL });
  }
}

// Chunky steel tee bollard on the terminal, with a yellow head.
function bollardT(mb, x) {
  const y = COPE_T, z = COPE_MID;
  mb.boxMM(x - 0.0095, y, z - 0.0095, x + 0.0095, y + 0.0022, z + 0.0095, { color: COL.bollard, mat: MAT.STEEL, skip: ['bottom'] });
  mb.lathe(x, z, [[0.0072, y + 0.0022], [0.0062, y + 0.0055], [0.0056, y + 0.0105], [0.0060, y + 0.0125], [0.0088, y + 0.0145], [0.0088, y + 0.0158]], { seg: 10, color: COL.bollard, mat: MAT.STEEL });
  mb.lathe(x, z, [[0.0088, y + 0.0158], [0.0089, y + 0.0172], [0.0062, y + 0.0186], [0.0, y + BT_H]], { seg: 10, color: COL.yellow, mat: MAT.STEEL });
}

// Classic black cast-iron bollard on the fishing quay.
function bollardF(mb, x) {
  const y = COPE_F, z = COPE_MID;
  mb.lathe(x, z, [[0.0074, y], [0.0068, y + 0.0025], [0.0052, y + 0.0085], [0.0050, y + 0.0115], [0.0060, y + 0.0135], [0.0082, y + 0.0150], [0.0080, y + 0.0165], [0.0052, y + 0.0180], [0.0, y + BF_H]], { seg: 10, color: COL.iron, mat: MAT.STEEL });
}

// Old car tyre hanging flat against the stone wall on a rope from an iron ring on the coping.
function tyre(mb, x) {
  const yc = 0.115, R = 0.0185, zc = COPE_FRONT_F + 0.0062;
  mb.push();
  mb.translate(x, yc, zc); mb.rotateX(Math.PI / 2);
  const prof = [[0.0105, -0.0045], [0.0150, -0.0058], [0.0178, -0.0045], [R, 0], [0.0178, 0.0045], [0.0150, 0.0058], [0.0105, 0.0045], [0.0095, 0], [0.0105, -0.0045]];
  mb.lathe(0, 0, prof, { seg: 12, color: 0x202226, mat: MAT.RUBBER });
  mb.pop();
  const rope = 0xcdb98e;
  mb.tube([[x, yc + 0.0105, zc], [x, yc + 0.03, zc - 0.002], [x, COPE_UNDER, COPE_FRONT_F + 0.002], [x, COPE_F - 0.004, COPE_FRONT_F + 0.0012], [x, COPE_F + 0.0012, COPE_FRONT_F - 0.006], [x, COPE_F + 0.0012, COPE_MID + 0.004]], 0.0011, { seg: 4, color: rope, mat: MAT.CANVAS });
  // mooring ring on the coping
  mb.push(); mb.translate(x, COPE_F + 0.0012, COPE_MID);
  const ring = [];
  for (let k = 0; k <= 8; k++) { const a = (k / 8) * Math.PI * 2; ring.push([Math.cos(a) * 0.0045, 0, Math.sin(a) * 0.0045]); }
  mb.tube(ring, 0.0009, { seg: 4, color: 0x3d4247, mat: MAT.STEEL });
  mb.pop();
}

// ---- below the waterline: mussel crust, tide band and weed on the wall face ---------------------------------------
function wallFloor(x) { return floorHeight(x, QUAY_Z + 0.004); }

function underwater(mb, rand) {
  const xa = -B + 0.012, xb = B - 0.012;
  const n = 190;
  const nearPier = (x, d) => Math.abs(x - PIER.root.x) < d;
  // smooth random wiggles
  const ph = Array.from({ length: 6 }, () => rand() * 6.283);
  const wig = (x, k) => 0.5 + 0.5 * Math.sin(x * (3.1 + k * 2.3) + ph[k % 6]) * Math.cos(x * (1.7 + k) + ph[(k + 3) % 6]);

  // tide band: a damp olive film just above mean sea level, running down into the mussels
  const tide = [], band = [];
  for (let k = 0; k <= n; k++) {
    const x = xa + ((xb - xa) * k) / n;
    tide.push([x, 0.004 + 0.009 * wig(x, 0) + 0.006 * rand(), -0.03]);
    band.push([x, -0.009 - 0.005 * rand(), -0.04 - 0.03 * wig(x, 1) - 0.02 * rand()]);
  }
  const W1 = QUAY_Z + 0.0006, W2 = QUAY_Z + 0.0012;
  for (let k = 0; k < n; k++) {
    const a = tide[k], b = tide[k + 1];
    mb.quad([a[0], a[2], W1], [b[0], b[2], W1], [b[0], b[1], W1], [a[0], a[1], W1], { color: 0x989a7c, mat: MAT.PAINT });
  }
  // continuous mussel band just under the waterline, ragged below
  for (let k = 0; k < n; k++) {
    const a = band[k], b = band[k + 1];
    if (nearPier((a[0] + b[0]) / 2, 0.08)) continue;
    mb.quad([a[0], a[2], W2], [b[0], b[2], W2], [b[0], b[1], W2], [a[0], a[1], W2], { color: 0x1d2433, mat: MAT.MUSSEL });
  }
  const bandBot = x => { const t = ((x - xa) / (xb - xa)) * n, k = Math.min(n - 1, Math.max(0, Math.floor(t))), f = t - k; return band[k][2] * (1 - f) + band[k + 1][2] * f; };
  // rounded lobes of crust hanging down from the band
  for (let k = 0; k < 80; k++) {
    const x = xa + 0.03 + rand() * (xb - xa - 0.06);
    if (nearPier(x, 0.1)) continue;
    const top = bandBot(x) + 0.004, w = 0.008 + rand() * 0.012, len = 0.008 + rand() * 0.026;
    const bot = Math.max(wallFloor(x) + 0.01, top - len);
    if (bot > top - 0.006) continue;
    const pts = [], sk = (rand() - 0.5) * 0.006;
    for (let j = 0; j <= 6; j++) {
      const a = Math.PI + (j / 6) * Math.PI;               // a half-ellipse from left to right, bulging down
      pts.push([x + sk * (1 + Math.sin(a)) + Math.cos(a) * w * (0.85 + 0.3 * rand()), top + Math.sin(a) * (top - bot), W2]);
    }
    mb.poly(pts, { color: 0x1d2433, mat: MAT.MUSSEL });
  }
  // barnacles: pale specks in the tide zone and on the band
  for (let k = 0; k < 60; k++) {
    const x = xa + 0.02 + rand() * (xb - xa - 0.04);
    if (nearPier(x, 0.1)) continue;
    const y = -0.035 + rand() * 0.04;
    mb.push(); mb.translate(x, y, QUAY_Z); mb.rotateX(Math.PI / 2);
    mb.cylinder(0, 0, 0, 0.0028 + rand() * 0.0016, 0.0024, { seg: 5, r2: 0.0012, color: 0xe2ddd0, mat: MAT.ROCK, bottom: false });
    mb.pop();
  }

  // mussel lumps: elongated domes in tight clusters, densest along the band, thinning out with depth
  const dome = (x, y, rx, ry, h, ang) => {
    mb.push(); mb.translate(x, y, QUAY_Z); mb.rotateZ(ang); mb.scale(rx, ry, h); mb.rotateX(Math.PI / 2);
    mb.lathe(0, 0, [[1, -0.3], [0.8, 0.5], [0, 1]], { seg: 4, mat: MAT.MUSSEL, color: 0x1d2433 });
    mb.pop();
  };
  for (let c = 0; c < 105; c++) {
    const x = xa + 0.03 + rand() * (xb - xa - 0.06);
    if (nearPier(x, 0.09)) continue;
    const fl = wallFloor(x) + 0.012;
    const deep = Math.pow(rand(), 2.4);                  // most clusters near the top
    const y0 = -0.02 - deep * (-0.02 - fl);
    const m = deep < 0.2 ? 3 + Math.floor(rand() * 3) : 2 + Math.floor(rand() * 2);
    const ang0 = rand() * Math.PI;
    for (let j = 0; j < m; j++) {
      const x1 = Math.min(xb - 0.014, Math.max(xa + 0.014, x + (rand() - 0.5) * 0.026)), y1 = Math.min(-0.012, Math.max(fl, y0 + (rand() - 0.5) * 0.02));
      const s = 0.85 + rand() * 0.6;
      dome(x1, y1, 0.0085 * s, 0.0042 * s, 0.0048 * s, ang0 + (rand() - 0.5) * 1.2);
    }
  }
  // a crunchy fringe of shells along the wall foot
  for (let k = 0; k < 45; k++) {
    const x = xa + 0.025 + rand() * (xb - xa - 0.05);
    if (nearPier(x, 0.09)) continue;
    dome(x, wallFloor(x) + 0.003 + rand() * 0.006, 0.008 + rand() * 0.004, 0.004, 0.0045, rand() * Math.PI);
  }

  // weed: ribbons rooted on the wall, growing up toward the light with a lean away from the wall
  const weedCols = [0x3f7d3a, 0x5a8f34, 0x6f9a35, 0x7a7b2c, 0x8a6a2c, 0x4e6f2e, 0xa24c3a];
  const strand = (x, y, len, lean, w, color, curl) => {
    const segs = 4, base = mb.nv;
    for (let k = 0; k <= segs; k++) {
      const t = k / segs;
      const px = x + curl * t * t, py = Math.min(-0.012, y + len * t), pz = QUAY_Z + 0.0015 + lean * Math.sin((t * Math.PI) / 2);
      const hw = (w / 2) * (1 - 0.7 * t) * (k === 0 ? 0.6 : 1);
      const nn = [0, -lean * 0.5, 1];
      mb.vert([px - hw, py, pz], nn, { color, mat: MAT.WEED, param: t });
      mb.vert([px + hw, py, pz], nn, { color, mat: MAT.WEED, param: t });
    }
    for (let k = 0; k < segs; k++) {
      const a = base + k * 2;
      mb.tri(a, a + 1, a + 3); mb.tri(a, a + 3, a + 2);
    }
  };
  for (let k = 0; k < 210; k++) {
    const x = xa + 0.025 + rand() * (xb - xa - 0.05);
    if (nearPier(x, 0.09)) continue;
    const fl = wallFloor(x) + 0.006;
    const berth = x > -1.98 && x < 0.08;                 // the ship lies alongside here: keep the weed hugging the wall
    const depth = Math.pow(rand(), 1.5);
    const y = -0.03 - depth * (-0.03 - fl);
    const len = Math.min(0.03 + rand() * 0.07, -0.016 - y);
    if (len < 0.014) continue;
    const lean = berth && y + len > -0.1 ? 0.003 + rand() * 0.004 : 0.006 + rand() * 0.016;
    strand(x, y, len, lean, 0.006 + rand() * 0.005, weedCols[Math.floor(rand() * weedCols.length)], (rand() - 0.5) * 0.024);
  }
  // bushy clumps at the wall foot
  for (let k = 0; k < 30; k++) {
    const x = xa + 0.045 + rand() * (xb - xa - 0.09);
    if (nearPier(x, 0.1)) continue;
    const fl = wallFloor(x) - 0.002, col = weedCols[Math.floor(rand() * 5)];
    const m = 3 + Math.floor(rand() * 3);
    for (let j = 0; j < m; j++) strand(x + (rand() - 0.5) * 0.014, fl, 0.035 + rand() * 0.05, 0.008 + rand() * 0.02, 0.006 + rand() * 0.004, col, (rand() - 0.5) * 0.045);
  }
}
