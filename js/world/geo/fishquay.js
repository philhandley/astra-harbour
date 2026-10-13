// Fish quay: the old stone fishing quay on the right (flagstones, cobbled promenade, granite kerbs), the fish-market
// shed, the cast-iron lamp posts, the L-shaped timber pier on mussel-covered piles, and the quay clutter
// (fish crates, creels, nets, benches, rope coils, barrels and a little fish derrick on the pier).
// Owns x from SPLIT_X to B, z from LAND_Z to QUAY_Z, plus the PIER footprint over the water.
// Debug: dev/view.html?b=fishquay&view=pier
import { MAT, mixHex } from '../../gpu/mesh.js';
import { makeRand } from '../../gpu/math.js';
import { B, QUAY_Z, QUAY_TOP, LAND_Z, SPLIT_X, PROMENADE_Z, SHED, LAMPS, PIER, BOAT_MOOR, FISHBOAT, floorHeight } from '../layout.js';

// ---- shared dimensions --------------------------------------------------------------------------------------
const G = QUAY_TOP + 0.002;              // top of flagstones and cobbles: everything on the quay stands here
const XE = B - 0.01;                     // keep clear of the block's right cut face
const KERB_Z = PROMENADE_Z[0];           // granite kerb between the flagstones and the cobbled promenade

// Shed
const SX0 = SHED.x0, SX1 = SHED.x1, SZ0 = SHED.z0, SZ1 = SHED.z1;
const SCX = (SX0 + SX1) / 2, SCZ = (SZ0 + SZ1) / 2;
const FY = G + 0.020;                    // shed floor / loading dock top
const DOOR_H = 0.066;
const WALL_H = 0.102;
const WY = FY + WALL_H;                  // eaves line
const ROOF_H = 0.050;                    // shallow pitch
const RIDGE_Y = WY + ROOF_H;
const OVZ = 0.016, OVX = 0.014;          // roof overhangs (eaves, verges)
const DOORS = [[1.17, 1.32], [1.48, 1.63]];

// Lamp posts
const LAMP_TOP = 0.1165;

// Pier
const PH = PIER.w / 2;
const DECK = PIER.deckY;
const DECK_BOT = DECK - 0.008;
const STR_BOT = DECK_BOT - 0.008;
const CAP_BOT = STR_BOT - 0.010;
const PILE_R = 0.012;
const IN = 0.012;                         // pile centre inset from the deck edge
const ARM_N = PIER.arm.z - PH, ARM_S = PIER.arm.z + PH;
const ROOT_W = PIER.root.x - PH, ROOT_E = PIER.root.x + PH;
const ARM_W = PIER.arm.x0, ARM_E = PIER.arm.x1;
const ROOT_Z0 = -0.608;                   // root deck starts here; the stair runs from the quay down to it
const STAIR_Z0 = QUAY_Z + 0.01;
const MUS_TOP = -0.014;                   // mussels and weed stay below this
const BOLLARD_H = 0.0138;
const CORNER_BOLLARDS = [[ARM_W + 0.015, ARM_N + 0.015], [ARM_W + 0.015, ARM_S - 0.015], [ROOT_E - 0.015, ARM_S - 0.015]];
const RING_POST = [ARM_W + 0.034, ARM_N + 0.036];

export const points = {
  // Gull perches: lamp tops, shed ridge ends, pier corner bollards.
  perches: [
    ...LAMPS.map(([x, z]) => [x, G + LAMP_TOP, z]),
    [SX0 - OVX + 0.004, RIDGE_Y + 0.005, SCZ],
    [SX1 + OVX - 0.004, RIDGE_Y + 0.005, SCZ],
    ...CORNER_BOLLARDS.map(([x, z]) => [x, DECK + BOLLARD_H * 1.15, z]),
  ],
  // Deck-level points at the pier's west end and at its corner (lifebuoys, feeding).
  pierEnds: [[ARM_W + 0.04, DECK, PIER.arm.z], [PIER.root.x, DECK, PIER.arm.z]],
  // Where the life ring hangs: the tip of the peg on the stand near the pier's west end (ring faces +z).
  ringHook: [RING_POST[0], DECK + 0.034, RING_POST[1] + 0.009],
};

// ---- palette ------------------------------------------------------------------------------------------------
const C = {
  flag: 0xcdc3b2, cobble: 0xb9ad9b, granite: 0xb4aea5,
  shed: 0x7fb3b0, roof: 0xb8473a, ridge: 0x8e3228, trim: 0xf4f1e8, door: 0xb8473a, sign: 0xfbfaf5, signFish: 0x2f6fb0,
  dock: 0xd9d3c7, dark: 0x2b3437, iron: 0x2f4a3a,
  deck: 0xa98b67, beam: 0x8a7155, pile: 0x6e5a45, kerb: 0x8f7356, slime: 0x5b6643,
  bollard: 0x2e3236, galv: 0xc9cdcf, yellow: 0xf2c230,
  blue: 0x2f6fb0, orange: 0xf08a24, white: 0xf2f2ee, ice: 0xe4f1f4, fish: 0xa8bccb,
  net: 0x3f8a4e, creel: 0x2f5560, creelBase: 0x8a6a4a, rope: 0xd9c28f,
};

// ---- small helpers ------------------------------------------------------------------------------------------
const O = (color, mat = MAT.PAINT, param = 0, extra) => ({ color, mat, param, ...extra });

function quadsInward(mb, x0, y0, z0, x1, y1, z1, colors) {
  // The inside faces of a box (for the shed's dark interior). colors: { floor, back, side, ceil }
  const f = O(colors.floor), b = O(colors.back), s = O(colors.side), c = O(colors.ceil);
  mb.quad([x0, y0, z1], [x1, y0, z1], [x1, y0, z0], [x0, y0, z0], f);
  mb.quad([x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], b);
  mb.quad([x0, y0, z1], [x0, y0, z0], [x0, y1, z0], [x0, y1, z1], s);
  mb.quad([x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0], s);
  mb.quad([x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], c);
}

// One roof slope with thickness. e = eave edge (two points), r = ridge edge (two points), th = thickness.
function roofSlab(mb, e0, e1, r1, r0, th, o, edge) {
  const d = p => [p[0], p[1] - th, p[2]];
  mb.quad(e0, e1, r1, r0, o);
  mb.quad(d(r0), d(r1), d(e1), d(e0), edge || o);
  mb.quad(d(e0), d(e1), e1, e0, edge || o);
  mb.quad(d(r0), d(e0), e0, r0, edge || o);
  mb.quad(d(e1), d(r1), r1, e1, edge || o);
}

// Torus lying flat (axis +y), as a lathe: ring radius R, tube radius r.
function torus(mb, x, y, z, R, r, o, seg = 10, tseg = 6) {
  // profile runs counter-clockwise in (radius, y): outer side going up first
  const p2 = [];
  for (let k = 0; k <= tseg; k++) { const t = -Math.PI / 2 + (k / tseg) * Math.PI * 2; p2.push([R + r * Math.cos(t), y + r + r * Math.sin(t)]); }
  mb.lathe(x, z, p2, { ...o, seg });
}

// ---- 1. quay surface ----------------------------------------------------------------------------------------
function surface(mb) {
  const y0 = QUAY_TOP - 0.004;
  // flagstones (masonry on a horizontal slab gives a stone-flag pattern)
  mb.boxMM(SPLIT_X + 0.012, y0, LAND_Z, XE, G, KERB_Z - 0.007, O(C.flag, MAT.MASONRY, 0, { skip: ['bottom', 'nz', 'pz', 'nx'] }));
  // cobbled promenade along the water's edge, up to the coping
  mb.boxMM(SPLIT_X + 0.012, y0, KERB_Z + 0.007, XE, G - 0.0005, QUAY_Z - 0.03, O(C.cobble, MAT.COBBLES, 0, { skip: ['bottom', 'pz', 'nz', 'nx'] }));
  // granite kerb line between the two, and a granite strip along the terminal boundary
  mb.boxMM(SPLIT_X, y0, KERB_Z - 0.007, XE, G + 0.0025, KERB_Z + 0.007, O(C.granite, MAT.MASONRY, 0, { skip: ['bottom'] }));
  mb.boxMM(SPLIT_X, y0, LAND_Z, SPLIT_X + 0.012, G + 0.0025, QUAY_Z - 0.03, O(C.granite, MAT.MASONRY, 0, { skip: ['bottom', 'nz', 'pz'] }));
}

// ---- 2. fish-market shed ------------------------------------------------------------------------------------
function shed(mb, rnd) {
  const t = 0.006;
  const wall = O(C.shed, MAT.CORRUGATED);
  const trim = O(C.trim);
  // plinth and loading dock (the dock runs along the front, under the doors)
  const dz1 = SZ1 + 0.036;
  mb.boxMM(SX0 - 0.01, QUAY_TOP - 0.004, SZ0 - 0.01, SX1 + 0.01, FY, dz1, O(C.dock, MAT.CONCRETE, 0, { skip: ['bottom'] }));
  // dark rubber buffer strip and a yellow safety line along the dock edge
  for (let k = 0; k < 6; k++) {
    const x = SX0 + 0.06 + k * ((SX1 - SX0 - 0.12) / 5);
    mb.boxMM(x - 0.0045, G + 0.006, dz1, x + 0.0045, FY - 0.004, dz1 + 0.004, O(0x3a3d40, MAT.RUBBER, 0, { skip: ['bottom', 'nz'] }));
  }
  mb.boxMM(SX0 - 0.01, FY, dz1 - 0.005, SX1 + 0.01, FY + 0.0006, dz1, O(C.yellow));
  // steps up to the dock at both ends
  for (const s of [-1, 1]) {
    const xe = s < 0 ? SX0 - 0.01 : SX1 + 0.01;
    for (let k = 0; k < 2; k++) {
      const ytop = G + (FY - G) * (2 - k) / 3;
      const xa = xe + s * (k * 0.012), xb = xe + s * ((k + 1) * 0.012);
      mb.boxMM(Math.min(xa, xb), QUAY_TOP - 0.004, SZ1 - 0.02, Math.max(xa, xb), ytop, dz1 - 0.004, O(C.dock, MAT.CONCRETE, 0, { skip: ['bottom'] }));
    }
  }

  // dark interior behind the doorways
  quadsInward(mb, DOORS[0][0] - 0.05, FY + 0.0004, SZ1 - 0.17, DOORS[1][1] + 0.05, FY + DOOR_H + 0.018, SZ1 - t - 0.001,
    { floor: 0x3e474a, back: 0x2b3437, side: 0x283033, ceil: 0x1f2629 });
  // inside: a stack of crates in door 1, a steel fish table with ice in door 2
  crate(mb, DOORS[0][0] + 0.03, FY, SZ1 - 0.04, 0.05, C.white, false);
  crate(mb, DOORS[0][0] + 0.03, FY + 0.014, SZ1 - 0.04, 0.02, C.blue, true, rnd);
  crate(mb, DOORS[0][1] - 0.035, FY, SZ1 - 0.05, -0.08, C.orange, true, rnd);
  mb.boxMM(DOORS[1][0] + 0.02, FY, SZ1 - 0.095, DOORS[1][1] - 0.02, FY + 0.016, SZ1 - 0.055, O(0xaab4b8, MAT.STEEL));
  mb.boxMM(DOORS[1][0] + 0.024, FY + 0.016, SZ1 - 0.091, DOORS[1][1] - 0.024, FY + 0.019, SZ1 - 0.059, O(C.ice));
  for (let k = 0; k < 5; k++) fish(mb, DOORS[1][0] + 0.04 + k * 0.018, FY + 0.019, SZ1 - 0.075 + (k % 2) * 0.008, 0.3 * (k % 3) - 0.3);

  // walls: back, two gable ends, front with two big doorways
  mb.boxMM(SX0, FY, SZ0, SX1, WY, SZ0 + t, { ...wall, skip: ['bottom'] });
  mb.boxMM(SX0, FY, SZ0 + t, SX0 + t, WY, SZ1 - t, { ...wall, skip: ['bottom'] });
  mb.boxMM(SX1 - t, FY, SZ0 + t, SX1, WY, SZ1 - t, { ...wall, skip: ['bottom'] });
  const fz0 = SZ1 - t, fz1 = SZ1;
  mb.boxMM(SX0, FY, fz0, DOORS[0][0], WY, fz1, { ...wall, skip: ['bottom'] });
  mb.boxMM(DOORS[0][1], FY, fz0, DOORS[1][0], WY, fz1, { ...wall, skip: ['bottom'] });
  mb.boxMM(DOORS[1][1], FY, fz0, SX1, WY, fz1, { ...wall, skip: ['bottom'] });
  for (const [a, b] of DOORS) mb.boxMM(a, FY + DOOR_H, fz0, b, WY, fz1, { ...wall, skip: ['bottom'] });
  // white door frames
  for (const [a, b] of DOORS) {
    mb.boxMM(a - 0.004, FY, fz1, a, FY + DOOR_H + 0.002, fz1 + 0.002, trim);
    mb.boxMM(b, FY, fz1, b + 0.004, FY + DOOR_H + 0.002, fz1 + 0.002, trim);
  }
  // sliding doors, slid open over the wall (barn style: red with a white frame and cross brace)
  const pw = 0.076, pz0 = fz1 + 0.002, pz1 = fz1 + 0.0055, py0 = FY + 0.001, py1 = FY + DOOR_H + 0.003;
  const panels = [[DOORS[0][0] - pw, DOORS[0][0]], [DOORS[0][1], DOORS[0][1] + pw], [DOORS[1][0] - pw, DOORS[1][0]], [DOORS[1][1], DOORS[1][1] + pw]];
  for (const [a, b0] of panels) {
    const b = b0 - 0.001;
    mb.boxMM(a + 0.001, py0, pz0, b, py1, pz1, O(C.door, MAT.BRICK));
    const fw = 0.004, zf = pz1 + 0.0012;
    mb.boxMM(a + 0.001, py0, pz1, b, py0 + fw, zf, trim);
    mb.boxMM(a + 0.001, py1 - fw, pz1, b, py1, zf, trim);
    mb.boxMM(a + 0.001, py0, pz1, a + 0.001 + fw, py1, zf, trim);
    mb.boxMM(b - fw, py0, pz1, b, py1, zf, trim);
    const zb = pz1 + 0.0006;
    mb.beam([a + 0.004, py0 + 0.004, zb], [b - 0.004, py1 - 0.004, zb], 0.0012, 0.0032, { ...trim, up: [0, 0, 1] });
    mb.beam([a + 0.004, py1 - 0.004, zb], [b - 0.004, py0 + 0.004, zb], 0.0012, 0.0032, { ...trim, up: [0, 0, 1] });
    // little roller hangers
    mb.boxMM(a + 0.008, py1, pz0 - 0.001, a + 0.012, py1 + 0.004, pz1, O(C.bollard, MAT.STEEL));
    mb.boxMM(b - 0.012, py1, pz0 - 0.001, b - 0.008, py1 + 0.004, pz1, O(C.bollard, MAT.STEEL));
  }
  // door track
  mb.boxMM(panels[0][0] - 0.004, py1 + 0.003, fz1, panels[3][1] + 0.004, py1 + 0.0065, fz1 + 0.0065, O(0x4a5054, MAT.STEEL));

  // corner boards
  for (const [x, z] of [[SX0, SZ0], [SX1, SZ0], [SX0, SZ1], [SX1, SZ1]]) {
    mb.boxMM(x - 0.004, FY, z - 0.004, x + 0.004, WY, z + 0.004, { ...trim, skip: ['bottom'] });
  }

  // east gable: a sales hatch under a striped awning
  {
    const hz0 = SCZ - 0.06, hz1 = SCZ + 0.06, hy0 = FY + 0.028, hy1 = FY + 0.066, x = SX1;
    mb.boxMM(x, hy0, hz0, x + 0.001, hy1, hz1, O(C.dark));
    mb.boxMM(x, hy0 - 0.003, hz0 - 0.004, x + 0.003, hy0, hz1 + 0.004, trim);
    mb.boxMM(x, hy1, hz0 - 0.004, x + 0.003, hy1 + 0.003, hz1 + 0.004, trim);
    mb.boxMM(x, hy0, hz0 - 0.004, x + 0.003, hy1, hz0, trim);
    mb.boxMM(x, hy0, hz1, x + 0.003, hy1, hz1 + 0.004, trim);
    mb.boxMM(x, hy0, SCZ - 0.0015, x + 0.0025, hy1, SCZ + 0.0015, trim);
    // counter shelf
    mb.boxMM(x, hy0 - 0.004, hz0 - 0.006, x + 0.014, hy0 - 0.001, hz1 + 0.006, O(C.deck, MAT.TIMBER, 1));
    // awning: stripes running down the slope
    const ay0 = FY + 0.082, ay1 = FY + 0.068, ax1 = x + 0.036, n = 7;
    const az0 = hz0 - 0.012, az1 = hz1 + 0.012;
    for (let k = 0; k < n; k++) {
      const za = az0 + (k / n) * (az1 - az0), zb = az0 + ((k + 1) / n) * (az1 - az0);
      const col = k % 2 ? 0xf6f2ea : 0xd2473b;
      mb.quad([x, ay0, za], [x, ay0, zb], [ax1, ay1, zb], [ax1, ay1, za], O(col, MAT.CANVAS));
      // scalloped valance
      mb.poly([[ax1, ay1, za], [ax1, ay1, zb], [ax1, ay1 - 0.006, zb], [ax1, ay1 - 0.009, (za + zb) / 2], [ax1, ay1 - 0.006, za]], O(col, MAT.CANVAS));
    }
    // awning side cheeks
    for (const z of [az0, az1]) mb.poly([[x, ay0, z], [ax1, ay1, z], [ax1, ay1 - 0.006, z]], O(0xd2473b, MAT.CANVAS));
  }
  // west gable: a plain window
  {
    const x = SX0 - 0.001;
    mb.boxMM(x, FY + 0.03, SCZ - 0.04, x + 0.001, FY + 0.07, SCZ + 0.04, O(0x34495a, MAT.GLASS));
    mb.boxMM(x - 0.002, FY + 0.027, SCZ - 0.043, x, FY + 0.03, SCZ + 0.043, trim);
    mb.boxMM(x - 0.002, FY + 0.07, SCZ - 0.043, x, FY + 0.073, SCZ + 0.043, trim);
    mb.boxMM(x - 0.002, FY + 0.03, SCZ - 0.0015, x, FY + 0.07, SCZ + 0.0015, trim);
  }
  // round louvred vents high in both gables
  for (const s of [-1, 1]) {
    const x = s < 0 ? SX0 : SX1;
    mb.push(); mb.translate(x, WY + ROOF_H * 0.42, SCZ); mb.rotateZ(-s * Math.PI / 2);
    mb.cylinder(0, 0, 0, 0.011, 0.002, { ...trim, seg: 14, bottom: false });
    mb.cylinder(0, 0.002, 0, 0.0082, 0.0004, { ...O(C.dark), seg: 14, bottom: false });
    mb.pop();
  }

  // roof: two corrugated slopes with thickness, ridge along x
  const slope = ROOF_H / ((SZ1 - SZ0) / 2);
  const ye = WY - slope * OVZ, xa = SX0 - OVX, xb = SX1 + OVX, rt = 0.004;
  const roof = O(C.roof, MAT.CORRUGATED), edge = O(mixHex(C.roof, 0x000000, 0.25));
  roofSlab(mb, [xa, ye, SZ1 + OVZ], [xb, ye, SZ1 + OVZ], [xb, RIDGE_Y, SCZ], [xa, RIDGE_Y, SCZ], rt, roof, edge);
  roofSlab(mb, [xb, ye, SZ0 - OVZ], [xa, ye, SZ0 - OVZ], [xa, RIDGE_Y, SCZ], [xb, RIDGE_Y, SCZ], rt, roof, edge);
  // gable-end wall triangles
  for (const x of [SX0, SX1]) mb.poly([[x, WY, SZ0], [x, WY, SZ1], [x, RIDGE_Y - 0.001, SCZ]], wall);
  // ridge cap
  mb.boxMM(xa - 0.002, RIDGE_Y - 0.002, SCZ - 0.007, xb + 0.002, RIDGE_Y + 0.004, SCZ + 0.007, O(C.ridge, MAT.STEEL));
  // white barge boards along the verges
  for (const x of [xa + 0.0015, xb - 0.0015]) for (const ze of [SZ1 + OVZ, SZ0 - OVZ]) {
    mb.beam([x, ye - rt - 0.003, ze], [x, RIDGE_Y - rt - 0.003, SCZ], 0.003, 0.008, trim);
  }
  // fascia (back) and gutter (front) with downpipes
  mb.boxMM(xa, ye - rt - 0.007, SZ0 - OVZ - 0.002, xb, ye - rt + 0.001, SZ0 - OVZ + 0.001, trim);
  mb.boxMM(xa, ye - rt - 0.007, SZ1 + OVZ - 0.002, xb, ye - rt + 0.001, SZ1 + OVZ + 0.004, trim);
  for (const x of [SX0 + 0.012, SX1 - 0.012]) {
    mb.cylinder(x, FY, SZ1 + 0.005, 0.0022, ye - rt - 0.012 - FY, { ...trim, seg: 6, bottom: false });
    mb.beam([x, ye - rt - 0.013, SZ1 + 0.005], [x, ye - rt - 0.004, SZ1 + OVZ + 0.001], 0.004, 0.004, trim);
  }
  // sign board standing up on the ridge, just in front of the ventilator (no text: a blue fish between little waves).
  // The front slope is kept clear for the Gulls on the Roof game, so the gulls stand against plain red.
  {
    const zs = SCZ + 0.042, yr = RIDGE_Y - slope * (zs - SCZ);
    const sy0 = RIDGE_Y + 0.006, sy1 = sy0 + 0.03, sx0 = SCX - 0.155, sx1 = SCX + 0.155, fz1 = zs + 0.004;
    const blue = O(C.signFish), dk = O(0x5a6066, MAT.STEEL);
    mb.boxMM(sx0, sy0, zs, sx1, sy1, fz1, O(C.sign));
    mb.boxMM(sx0 - 0.003, sy0 - 0.003, zs - 0.0005, sx1 + 0.003, sy0, fz1 + 0.0008, blue);
    mb.boxMM(sx0 - 0.003, sy1, zs - 0.0005, sx1 + 0.003, sy1 + 0.003, fz1 + 0.0008, blue);
    mb.boxMM(sx0 - 0.003, sy0, zs - 0.0005, sx0, sy1, fz1 + 0.0008, blue);
    mb.boxMM(sx1, sy0, zs - 0.0005, sx1 + 0.003, sy1, fz1 + 0.0008, blue);
    // legs and back struts down to the roof
    for (const x of [sx0 + 0.03, SCX, sx1 - 0.03]) {
      mb.beam([x, yr - 0.002, zs - 0.002], [x, sy0, zs - 0.002], 0.003, 0.003, dk);
      const zb = zs - 0.03, yb = RIDGE_Y - slope * (zb - SCZ);
      mb.beam([x, yb - 0.001, zb], [x, sy1 - 0.004, zs - 0.002], 0.0025, 0.0025, dk);
    }
    const fz = fz1 + 0.0003, cy = (sy0 + sy1) / 2;
    const body = [];
    for (let k = 0; k < 14; k++) { const a = (k / 14) * Math.PI * 2; body.push([SCX + 0.006 + 0.026 * Math.cos(a), cy + 0.0095 * Math.sin(a), fz]); }
    mb.poly(body, blue);
    mb.poly([[SCX - 0.016, cy, fz], [SCX - 0.036, cy + 0.0095, fz], [SCX - 0.036, cy - 0.0095, fz]], blue);
    mb.poly([[SCX + 0.019, cy + 0.0042, fz + 0.0002], [SCX + 0.0225, cy + 0.0042, fz + 0.0002], [SCX + 0.0225, cy + 0.0008, fz + 0.0002], [SCX + 0.019, cy + 0.0008, fz + 0.0002]], O(C.sign));
    const wave = O(0x4fa3a0);
    for (const sd of [-1, 1]) for (let k = 0; k < 3; k++) {
      const x = SCX + sd * (0.065 + k * 0.03);
      mb.beam([x - 0.009, cy - 0.003, fz], [x, cy + 0.003, fz], 0.0003, 0.0028, { ...wave, up: [0, 0, 1] });
      mb.beam([x, cy + 0.003, fz], [x + 0.009, cy - 0.003, fz], 0.0003, 0.0028, { ...wave, up: [0, 0, 1] });
    }
  }
  // louvred ventilator on the ridge, with its own little roof and a fish weathervane
  {
    const vx0 = SCX - 0.075, vx1 = SCX + 0.075, vz = 0.026, vy0 = RIDGE_Y - 0.008, vy1 = RIDGE_Y + 0.020;
    mb.boxMM(vx0, vy0, SCZ - vz, vx1, vy1, SCZ + vz, O(C.trim, MAT.BRICK, 0, { skip: ['bottom'] }));
    const vo = 0.008, vh = 0.014, vs = vh / vz, vye = vy1 - vs * vo, vr = vy1 + vh;
    roofSlab(mb, [vx0 - vo, vye, SCZ + vz + vo], [vx1 + vo, vye, SCZ + vz + vo], [vx1 + vo, vr, SCZ], [vx0 - vo, vr, SCZ], 0.003, roof, edge);
    roofSlab(mb, [vx1 + vo, vye, SCZ - vz - vo], [vx0 - vo, vye, SCZ - vz - vo], [vx0 - vo, vr, SCZ], [vx1 + vo, vr, SCZ], 0.003, roof, edge);
    for (const x of [vx0, vx1]) mb.poly([[x, vy1, SCZ - vz], [x, vy1, SCZ + vz], [x, vr, SCZ]], O(C.trim));
    mb.boxMM(vx0 - vo - 0.001, vr - 0.0015, SCZ - 0.004, vx1 + vo + 0.001, vr + 0.003, SCZ + 0.004, O(C.ridge, MAT.STEEL));
    // weathervane
    const gold = O(0xd9a441, MAT.STEEL);
    mb.cylinder(SCX, vr + 0.003, SCZ, 0.0009, 0.036, { ...gold, seg: 5 });
    mb.sphere(SCX, vr + 0.039, SCZ, 0.0018, { ...gold, seg: 6, rings: 4 });
    const fy = vr + 0.03, fz = SCZ;
    const fishPts = [];
    for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; fishPts.push([SCX + 0.004 + 0.012 * Math.cos(a), fy + 0.0045 * Math.sin(a), fz]); }
    mb.poly(fishPts, gold);
    mb.poly([[SCX - 0.007, fy, fz], [SCX - 0.016, fy + 0.005, fz], [SCX - 0.016, fy - 0.005, fz]], gold);
  }
}

// ---- crates, fish, creels, nets, ropes, benches -----------------------------------------------------------
const CW = 0.032, CD = 0.022, CH = 0.014;

function fish(mb, x, y, z, ang) {
  mb.push(); mb.translate(x, y + 0.0016, z); mb.rotateY(ang);
  mb.push(); mb.scale(1, 0.28, 0.42);
  mb.sphere(0, -0.0055, 0, 0.0058, { ...O(C.fish, MAT.STEEL), seg: 6, rings: 4 });
  mb.pop();
  mb.poly([[-0.0052, 0.0002, 0], [-0.0085, 0.0003, -0.0025], [-0.0085, 0.0003, 0.0025]], O(mixHex(C.fish, 0x334455, 0.4), MAT.STEEL));
  mb.pop();
}

// A fish crate standing at (x, y, z). Open crates are hollow; closed (stacked under others) are plain boxes.
function crate(mb, x, y, z, ang, col, open, rnd) {
  mb.push(); mb.translate(x, y, z); mb.rotateY(ang);
  const w = CW / 2, d = CD / 2, h = CH, t = 0.0016;
  const o = O(col);
  const hole = O(mixHex(col, 0x101820, 0.55));
  if (!open) {
    mb.boxMM(-w, 0, -d, w, h, d, { ...o, skip: ['bottom'] });
  } else {
    mb.boxMM(-w, 0, -d, w, h, d, { ...o, skip: ['bottom', 'top'] });
    const ic = O(mixHex(col, 0x000000, 0.18));
    const filled = rnd && rnd() < 0.6;
    const fy = filled ? h * 0.62 : 0.002;
    mb.quad([-w + t, fy, -d + t], [w - t, fy, -d + t], [w - t, h, -d + t], [-w + t, h, -d + t], ic);
    mb.quad([w - t, fy, d - t], [-w + t, fy, d - t], [-w + t, h, d - t], [w - t, h, d - t], ic);
    mb.quad([-w + t, fy, d - t], [-w + t, fy, -d + t], [-w + t, h, -d + t], [-w + t, h, d - t], ic);
    mb.quad([w - t, fy, -d + t], [w - t, fy, d - t], [w - t, h, d - t], [w - t, h, -d + t], ic);
    mb.quad([-w, h, d], [w, h, d], [w - t, h, d - t], [-w + t, h, d - t], o);
    mb.quad([w, h, -d], [-w, h, -d], [-w + t, h, -d + t], [w - t, h, -d + t], o);
    mb.quad([w, h, d], [w, h, -d], [w - t, h, -d + t], [w - t, h, d - t], o);
    mb.quad([-w, h, -d], [-w, h, d], [-w + t, h, d - t], [-w + t, h, -d + t], o);
    mb.quad([-w + t, fy, d - t], [w - t, fy, d - t], [w - t, fy, -d + t], [-w + t, fy, -d + t], filled ? O(C.ice) : ic);
    if (filled) {
      const n = 2 + Math.floor(rnd() * 2);
      for (let k = 0; k < n; k++) fish(mb, -w + 0.009 + k * 0.007, fy - 0.0004, (rnd() - 0.5) * 0.008, (rnd() - 0.5) * 0.8 + (k % 2) * Math.PI);
    }
  }
  // hand holds on the short ends
  mb.quad([w + 0.0002, h - 0.006, -0.004], [w + 0.0002, h - 0.006, 0.004], [w + 0.0002, h - 0.0035, 0.004], [w + 0.0002, h - 0.0035, -0.004], hole);
  mb.quad([-w - 0.0002, h - 0.006, 0.004], [-w - 0.0002, h - 0.006, -0.004], [-w - 0.0002, h - 0.0035, -0.004], [-w - 0.0002, h - 0.0035, 0.004], hole);
  mb.pop();
}

function crateStack(mb, x, y, z, n, rnd, ang = 0) {
  const cols = [C.blue, C.orange, C.white];
  for (let k = 0; k < n; k++) {
    const top = k === n - 1;
    crate(mb, x + (rnd() - 0.5) * 0.002, y + k * CH, z + (rnd() - 0.5) * 0.002, ang + (rnd() - 0.5) * 0.12, rnd.pick(cols), top, rnd);
  }
}

function pallet(mb, x, y, z, ang) {
  mb.push(); mb.translate(x, y, z); mb.rotateY(ang);
  const wood = O(0xc2a27a, MAT.TIMBER, 0);
  for (const zz of [-0.021, 0, 0.021]) mb.boxMM(-0.026, 0, zz - 0.003, 0.026, 0.0035, zz + 0.003, { ...wood, skip: ['bottom'] });
  for (let k = 0; k < 5; k++) { const zz = -0.022 + k * 0.011; mb.boxMM(-0.026, 0.0035, zz - 0.0038, 0.026, 0.0052, zz + 0.0038, wood); }
  mb.pop();
}

// Lobster pot: timber base with a netted half-barrel top and hoops.
function creel(mb, x, y, z, ang, rnd) {
  mb.push(); mb.translate(x, y, z); mb.rotateY(ang);
  const L = 0.021, R = 0.0125, by = 0.0035;
  mb.boxMM(-L, 0, -R, L, by, R, O(C.creelBase, MAT.TIMBER, 0, { skip: ['bottom'] }));
  const netCol = rnd.pick([0x2c5f8a, 0x2d6b55, 0xb5652e, 0x2c5f8a, 0x3a4a5a]);
  const net = O(netCol, MAT.CANVAS);
  const n = 7, arc = [];
  for (let k = 0; k <= n; k++) { const a = (k / n) * Math.PI; arc.push([R * Math.cos(a), by + R * 0.95 * Math.sin(a)]); }
  for (let k = 0; k < n; k++) {
    const [za, ya] = arc[k], [zb, yb] = arc[k + 1];
    mb.quad([-L, ya, za], [L, ya, za], [L, yb, zb], [-L, yb, zb], net);
  }
  mb.poly(arc.map(([zz, yy]) => [L, yy, zz]), net);
  mb.poly(arc.slice().reverse().map(([zz, yy]) => [-L, yy, zz]), net);
  // entrance eye on one end
  mb.push(); mb.translate(L + 0.0004, by + R * 0.45, 0); mb.rotateZ(-Math.PI / 2);
  mb.cylinder(0, 0, 0, 0.0045, 0.0005, { ...O(0x1a2124), seg: 8, bottom: false });
  mb.pop();
  const hoop = O(0xe6d8b4);
  for (const hx of [-L * 0.97, -L * 0.33, L * 0.33, L * 0.97]) mb.tube(arc.map(([zz, yy]) => [hx, yy + 0.0005, zz * 1.04]), 0.001, { ...hoop, seg: 4 });
  mb.tube([[-L, by + R * 0.95 + 0.0008, 0], [L, by + R * 0.95 + 0.0008, 0]], 0.0008, { ...hoop, seg: 4 });
  mb.pop();
}

// A heap of net: a lumpy, folded mound lofted through jittered rings, with a line of floats draped over it.
function netHeap(mb, x, y, z, R, H, col, rnd, floats = 5) {
  const n = 14, levels = [0, 0.18, 0.38, 0.56, 0.72, 0.85, 0.95, 1.0];
  const jr = Array.from({ length: n }, () => 0.86 + 0.28 * rnd());
  const ph = levels.map(() => rnd() * 6.28), ph2 = levels.map(() => rnd() * 6.28);
  const shape = t => Math.pow(Math.max(0, 1 - Math.pow(t, 1.6)), 0.5);
  const rings = [];
  levels.forEach((t, j) => {
    const ring = [];
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      const fold = 1 + 0.13 * Math.sin(a * 3 + ph[j]) + 0.07 * Math.sin(a * 5 + ph2[j]);
      const r = t === 1 ? 0.002 : R * shape(t) * jr[k] * fold;
      const yy = y + H * t * (t === 0 ? 0 : 0.85 + 0.3 * jr[(k + 4) % n]);
      ring.push([x + r * Math.cos(a), yy, z + r * Math.sin(a)]);
    }
    rings.push(ring);
  });
  mb.loft(rings, O(col, MAT.CANVAS));
  mb.polyFan(rings[rings.length - 1].slice().reverse(), O(col, MAT.CANVAS));
  if (!floats) return;
  // float line draped across the heap
  const a = rnd() * Math.PI, dx = Math.cos(a), dz = Math.sin(a), pts = [];
  for (let i = 0; i <= 10; i++) {
    const s = -1.15 + 2.3 * i / 10, d = Math.abs(s) * R;
    const h = d < R * 0.95 ? H * 0.95 * Math.sqrt(Math.max(0, 1 - Math.pow(d / (R * 0.95), 2))) : 0;
    pts.push([x + dx * s * R, y + h + 0.0018, z + dz * s * R + 0.004 * Math.sin(i * 1.7)]);
  }
  mb.tube(pts, 0.0007, { ...O(0xe8dcc0, MAT.CANVAS), seg: 4 });
  for (let i = 1; i < pts.length - 1; i += Math.max(1, Math.round(9 / floats))) {
    const p = pts[i];
    mb.push(); mb.translate(p[0], p[1], p[2]); mb.rotateY(-a); mb.rotateZ(Math.PI / 2);
    mb.cylinder(0, -0.0035, 0, 0.0028, 0.007, { ...O(i % 3 ? C.orange : 0xf5d046), seg: 6 });
    mb.pop();
  }
}

// A small harbour net store: yellow board cladding, slate roof, blue door.
function netHut(mb, x0, z0, x1, z1) {
  const wy0 = G, wy1 = G + 0.056, rh = 0.034, cz = (z0 + z1) / 2, ov = 0.01;
  const walls = O(0xf0cf6e, MAT.BRICK), trim = O(C.trim);
  mb.boxMM(x0, wy0, z0, x1, wy1, z1, { ...walls, skip: ['bottom', 'top'] });
  for (const x of [x0, x1]) mb.poly([[x, wy1, z0], [x, wy1, z1], [x, wy1 + rh, cz]], walls);
  const slope = rh / ((z1 - z0) / 2), ye = wy1 - slope * ov, yr = wy1 + rh;
  const roof = O(0x5d6a78, MAT.SLATE), edge = O(0x4a5560);
  roofSlab(mb, [x0 - ov, ye, z1 + ov], [x1 + ov, ye, z1 + ov], [x1 + ov, yr, cz], [x0 - ov, yr, cz], 0.004, roof, edge);
  roofSlab(mb, [x1 + ov, ye, z0 - ov], [x0 - ov, ye, z0 - ov], [x0 - ov, yr, cz], [x1 + ov, yr, cz], 0.004, roof, edge);
  mb.boxMM(x0 - ov - 0.001, yr - 0.002, cz - 0.004, x1 + ov + 0.001, yr + 0.003, cz + 0.004, O(0x4a5560, MAT.STEEL));
  for (const x of [x0 - ov + 0.0015, x1 + ov - 0.0015]) for (const ze of [z1 + ov, z0 - ov]) {
    mb.beam([x, ye - 0.006, ze], [x, yr - 0.006, cz], 0.0025, 0.006, trim);
  }
  for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) mb.boxMM(x - 0.003, wy0, z - 0.003, x + 0.003, wy1, z + 0.003, { ...trim, skip: ['bottom'] });
  // door and window on the front
  const dx = x0 + 0.045;
  mb.boxMM(dx - 0.016, wy0, z1, dx + 0.016, wy0 + 0.042, z1 + 0.002, O(0x2f6fb0, MAT.BRICK));
  mb.boxMM(dx - 0.019, wy0, z1, dx - 0.016, wy0 + 0.045, z1 + 0.003, trim);
  mb.boxMM(dx + 0.016, wy0, z1, dx + 0.019, wy0 + 0.045, z1 + 0.003, trim);
  mb.boxMM(dx - 0.019, wy0 + 0.042, z1, dx + 0.019, wy0 + 0.045, z1 + 0.003, trim);
  mb.sphere(dx + 0.011, wy0 + 0.021, z1 + 0.003, 0.0014, { ...O(0xd9a441, MAT.STEEL), seg: 6, rings: 3 });
  const wx = x1 - 0.05;
  mb.boxMM(wx - 0.022, wy0 + 0.02, z1, wx + 0.022, wy0 + 0.044, z1 + 0.001, O(0x34495a, MAT.GLASS));
  for (const [a, b, c, d] of [[-0.025, 0.017, 0.025, 0.02], [-0.025, 0.044, 0.025, 0.047], [-0.025, 0.02, -0.022, 0.044], [0.022, 0.02, 0.025, 0.044], [-0.0012, 0.02, 0.0012, 0.044]]) {
    mb.boxMM(wx + a, wy0 + b, z1, wx + c, wy0 + d, z1 + 0.0025, trim);
  }
  // window box with red flowers
  mb.boxMM(wx - 0.024, wy0 + 0.011, z1, wx + 0.024, wy0 + 0.017, z1 + 0.008, O(0x2f6fb0));
  for (let k = 0; k < 7; k++) mb.sphere(wx - 0.02 + k * 0.0067, wy0 + 0.0185, z1 + 0.004, 0.0028, { ...O(k % 2 ? 0xd2473b : 0x5f9a45, MAT.LEAF, 0.3), seg: 5, rings: 3 });
  // a chimney
  mb.boxMM(x1 - 0.03, yr - 0.016, z0 + 0.025, x1 - 0.018, yr + 0.016, z0 + 0.037, O(0xb05a3c, MAT.MASONRY));
  mb.boxMM(x1 - 0.032, yr + 0.016, z0 + 0.023, x1 - 0.016, yr + 0.019, z0 + 0.039, O(0x8a8a8a));
}

function ropeCoil(mb, x, y, z, R, col, turns = 3) {
  for (let k = 0; k < turns; k++) torus(mb, x, y + k * 0.0028, z, R - k * 0.0012, 0.0016, O(col, MAT.CANVAS), 12, 6);
  mb.cylinder(x, y, z, R - turns * 0.0012 - 0.0006, 0.0012, { ...O(mixHex(col, 0x000000, 0.35), MAT.CANVAS), seg: 10, bottom: false });
}

function barrel(mb, x, y, z, col) {
  mb.lathe(x, z, [[0.0072, y], [0.0080, y + 0.006], [0.0082, y + 0.011], [0.0080, y + 0.016], [0.0072, y + 0.022], [0.0055, y + 0.0222], [0, y + 0.0222]], { ...O(col, MAT.STEEL), seg: 12 });
}

function bench(mb, x, z, ang) {
  mb.push(); mb.translate(x, G, z); mb.rotateY(ang);
  const iron = O(C.iron, MAT.STEEL), wood = O(0x9c7b55, MAT.TIMBER, 0);
  for (const sx of [-0.0185, 0.0185]) {
    mb.boxMM(sx - 0.001, 0, -0.006, sx + 0.001, 0.0085, -0.004, iron);
    mb.boxMM(sx - 0.001, 0, 0.004, sx + 0.001, 0.0085, 0.006, iron);
    mb.boxMM(sx - 0.001, 0.0075, -0.007, sx + 0.001, 0.0085, 0.007, iron);
    mb.beam([sx, 0.0085, -0.0055], [sx, 0.021, -0.0085], 0.002, 0.0018, iron);
    mb.boxMM(sx - 0.001, 0.0012, -0.006, sx + 0.001, 0.0022, 0.006, iron);
  }
  for (const zz of [-0.0045, -0.0005, 0.0035]) mb.boxMM(-0.022, 0.0085, zz - 0.0017, 0.022, 0.0100, zz + 0.0017, wood);
  for (const yy of [0.013, 0.0178]) {
    const zz = -0.0068 - (yy - 0.0085) * 0.24;
    mb.boxMM(-0.022, yy - 0.0016, zz - 0.0007, 0.022, yy + 0.0016, zz + 0.0007, wood);
  }
  mb.pop();
}

// Dan buoy: a marker pole with a float and a flag, leaning at angle `lean` (radians from vertical) toward +x.
function danBuoy(mb, x, y, z, ang, lean, flagCol) {
  mb.push(); mb.translate(x, y, z); mb.rotateY(ang); mb.rotateZ(-lean);
  mb.cylinder(0, 0, 0, 0.0011, 0.085, { ...O(0xe8e4da), seg: 5 });
  mb.lathe(0, 0, [[0.0011, 0.010], [0.0055, 0.014], [0.0062, 0.020], [0.0055, 0.026], [0.0011, 0.030]], { ...O(C.orange), seg: 8 });
  mb.quad([0, 0.068, 0.0003], [0.016, 0.070, 0.0003], [0.016, 0.081, 0.0003], [0, 0.083, 0.0003], O(flagCol, MAT.CANVAS));
  mb.pop();
}

// ---- 3. lamp posts ------------------------------------------------------------------------------------------
function lampPost(mb, x, z) {
  const y0 = G;
  const g = O(C.iron, MAT.STEEL);
  mb.lathe(x, z, [[0.0074, y0], [0.0074, y0 + 0.0055], [0.0060, y0 + 0.0072], [0.0062, y0 + 0.0085], [0.0046, y0 + 0.0115], [0.0034, y0 + 0.016]], { ...g, seg: 10 });
  mb.cylinder(x, y0 + 0.016, z, 0.0031, 0.064, { ...g, r2: 0.0023, seg: 8, caps: false });
  mb.lathe(x, z, [[0.0023, y0 + 0.079], [0.0040, y0 + 0.0805], [0.0040, y0 + 0.0825], [0.0026, y0 + 0.084], [0.0024, y0 + 0.085]], { ...g, seg: 8 });
  // ladder rest bar
  mb.box(x, y0 + 0.0805, z, 0.022, 0.0016, 0.0016, g);
  for (const s of [-1, 1]) mb.sphere(x + s * 0.011, y0 + 0.0813, z, 0.0014, { ...g, seg: 6, rings: 3 });
  // lantern
  mb.lathe(x, z, [[0.0016, y0 + 0.085], [0.0052, y0 + 0.0885], [0.0062, y0 + 0.0895], [0.0060, y0 + 0.090]], { ...g, seg: 6 });
  const gy0 = y0 + 0.090, gy1 = y0 + 0.104, r0 = 0.0056, r1 = 0.0082;
  mb.cylinder(x, gy0, z, r0, gy1 - gy0, { ...O(0xffe7b0, MAT.LAMP, 0.7), r2: r1, seg: 6, caps: false });
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    mb.beam([x + c * (r0 + 0.0004), gy0, z + s * (r0 + 0.0004)], [x + c * (r1 + 0.0004), gy1, z + s * (r1 + 0.0004)], 0.0011, 0.0011, g);
  }
  mb.cylinder(x, gy1, z, 0.0104, 0.0016, { ...g, r2: 0.0098, seg: 6 });
  mb.cylinder(x, gy1 + 0.0016, z, 0.0098, 0.0068, { ...g, r2: 0.0016, seg: 6, bottom: false });
  mb.sphere(x, y0 + 0.1145, z, 0.0019, { ...g, seg: 6, rings: 4 });
}

// ---- 4. timber pier -----------------------------------------------------------------------------------------
function bollard(mb, x, y, z, s, col = C.bollard) {
  const p = [[0.0048, 0], [0.0048, 0.002], [0.0034, 0.0042], [0.0030, 0.009], [0.0042, 0.0105], [0.0046, 0.012], [0.0032, 0.0134], [0, BOLLARD_H]];
  mb.lathe(x, z, p.map(([r, h]) => [r * s, y + h * s]), { ...O(col, MAT.STEEL), seg: 10 });
}

function weed(mb, x, y, z, len, ang, rnd) {
  const col = rnd.pick([0x6fb04a, 0x86b84e, 0x9a8a3c, 0x5aa05a]);
  const n = 5, w0 = 0.0075;
  const dx = Math.cos(ang), dz = Math.sin(ang);
  const side = [-dz, 0, dx];
  const pts = [];
  const bend = 0.25 + rnd() * 0.4, ph = rnd() * 6;
  for (let i = 0; i <= n; i++) {
    const s = i / n;
    pts.push([x + dx * len * bend * s * s + 0.003 * Math.sin(ph + s * 5) * side[0], y + len * s, z + dz * len * bend * s * s + 0.003 * Math.sin(ph + s * 5) * side[2]]);
  }
  const base = mb.nv;
  for (let i = 0; i <= n; i++) {
    const s = i / n, w = w0 * (1 - 0.65 * s) * (0.7 + 0.6 * Math.sin(Math.PI * Math.min(1, s * 1.4 + 0.15)));
    const p = pts[i];
    const t = i < n ? [pts[i + 1][0] - p[0], pts[i + 1][1] - p[1], pts[i + 1][2] - p[2]] : [p[0] - pts[i - 1][0], p[1] - pts[i - 1][1], p[2] - pts[i - 1][2]];
    // normal = side x t
    let nx = side[1] * t[2] - side[2] * t[1], ny = side[2] * t[0] - side[0] * t[2], nz = side[0] * t[1] - side[1] * t[0];
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    const o = { color: col, mat: MAT.WEED, param: s };
    mb.vert([p[0] - side[0] * w / 2, p[1], p[2] - side[2] * w / 2], [nx, ny, nz], o);
    mb.vert([p[0] + side[0] * w / 2, p[1], p[2] + side[2] * w / 2], [nx, ny, nz], o);
  }
  for (let i = 0; i < n; i++) {
    const a = base + i * 2;
    mb.tri(a, a + 1, a + 3); mb.tri(a, a + 3, a + 2);
  }
}

function pile(mb, x, z, rnd, south) {
  const yb = floorHeight(x, z) - 0.012;
  // timber above the slime band, slime at the tide line, mussels below
  mb.cylinder(x, 0.03, z, PILE_R, CAP_BOT - 0.03, { ...O(C.pile, MAT.TIMBER, 1), seg: 8, caps: false });
  mb.cylinder(x, MUS_TOP - 0.004, z, PILE_R + 0.0004, 0.03 - MUS_TOP + 0.004, { ...O(C.slime, MAT.ROCK), seg: 8, caps: false });
  // mussel crust: jittered rings lofted from the seabed up to just below the low water line
  const n = 7, span = MUS_TOP - yb, nr = Math.max(3, Math.round(span / 0.034));
  const rings = [];
  for (let j = 0; j <= nr; j++) {
    const t = j / nr, y = yb + span * t;
    const ring = [];
    const top = j === nr;
    for (let k = 0; k < n; k++) {
      const a = (k / n + (rnd() - 0.5) * 0.08) * Math.PI * 2;
      const r = top ? PILE_R + 0.0008 : PILE_R + 0.0018 + 0.0032 * rnd() * (0.6 + 0.4 * Math.sin(Math.PI * t));
      ring.push([x + r * Math.cos(a), y + (top ? 0 : (rnd() - 0.5) * 0.006), z + r * Math.sin(a)]);
    }
    rings.push(ring);
  }
  mb.loft(rings, O(0x22262e, MAT.MUSSEL));
  // weed strands near the foot
  const nw = 3 + Math.floor(rnd() * 3);
  for (let k = 0; k < nw; k++) {
    const a = south ? Math.PI * (1.05 + 0.9 * rnd()) : rnd() * Math.PI * 2;
    const y0 = yb + 0.008 + rnd() * Math.min(0.14, span * 0.55);
    const len = Math.min(0.06 + rnd() * 0.07, MUS_TOP - 0.014 - y0);
    if (len < 0.02) continue;
    weed(mb, x + Math.cos(a) * (PILE_R + 0.004), y0, z + Math.sin(a) * (PILE_R + 0.004), len, a, rnd);
  }
}

function pier(mb, rnd) {
  const deckO = (param, skip) => O(C.deck, MAT.TIMBER, param, { skip });
  const beamO = (param, skip) => O(C.beam, MAT.TIMBER, param, { skip });
  // deck planks: across the root (along x), along the arm (along z)
  mb.boxMM(ROOT_W, DECK_BOT, ROOT_Z0, ROOT_E, DECK, ARM_N, deckO(0, ['bottom', 'pz']));
  mb.boxMM(ARM_W, DECK_BOT, ARM_N, ARM_E, DECK, ARM_S, deckO(1, ['bottom']));

  // pile layout
  const armX = [];
  const xr0 = ROOT_W + IN, xr1 = ROOT_E - IN, xa0 = ARM_W + IN;
  const nb = 11;
  for (let k = 0; k <= nb; k++) armX.push(xa0 + (xr0 - xa0) * k / nb);
  armX.push(xr1);
  const zN = ARM_N + IN, zS = ARM_S - IN;
  const rootZ = [];
  const zr0 = ROOT_Z0 + 0.008;
  for (let k = 0; k < 3; k++) rootZ.push(zr0 + (zN - zr0) * k / 3);

  // stringers under the planks, cap beams on the pile bents
  for (const z of [zN, PIER.arm.z, zS]) mb.boxMM(ARM_W + 0.003, STR_BOT, z - 0.005, ARM_E - 0.003, DECK_BOT, z + 0.005, beamO(0, ['top']));
  for (const x of [xr0, PIER.root.x, xr1]) mb.boxMM(x - 0.005, STR_BOT, ROOT_Z0 + 0.001, x + 0.005, DECK_BOT, ARM_N, beamO(1, ['top']));
  for (const x of armX) mb.boxMM(x - 0.008, CAP_BOT, ARM_N + 0.002, x + 0.008, STR_BOT, ARM_S - 0.002, beamO(1, ['top']));
  for (const z of rootZ) mb.boxMM(ROOT_W + 0.002, CAP_BOT, z - 0.008, ROOT_E - 0.002, STR_BOT, z + 0.008, beamO(0, ['top']));

  // piles
  const piles = [];
  for (const x of armX) piles.push([x, zN], [x, zS]);
  for (const z of rootZ) piles.push([xr0, z], [xr1, z]);
  for (const [x, z] of piles) pile(mb, x, z, rnd, z > PIER.arm.z);

  // X bracing between piles, below the deck
  const yb1 = CAP_BOT - 0.008, yb0 = -0.028;
  const br = O(0x7d6650, MAT.TIMBER, 0);
  const X = (a, b) => {
    mb.beam([a[0], yb1, a[1]], [b[0], yb0, b[1]], 0.004, 0.007, br);
    mb.beam([a[0], yb0, a[1]], [b[0], yb1, b[1]], 0.004, 0.007, br);
  };
  for (let k = 0; k < armX.length - 1; k++) { X([armX[k], zN], [armX[k + 1], zN]); X([armX[k], zS], [armX[k + 1], zS]); }
  for (const x of armX) X([x, zN], [x, zS]);
  const rz = [...rootZ, zN];
  for (let k = 0; k < rz.length - 1; k++) { X([xr0, rz[k]], [xr0, rz[k + 1]]); X([xr1, rz[k]], [xr1, rz[k + 1]]); }
  for (const z of rootZ) X([xr0, z], [xr1, z]);
  // horizontal walings just under the caps
  const wl = O(0x7d6650, MAT.TIMBER, 0);
  mb.boxMM(ARM_W + 0.004, yb1 - 0.004, zS + PILE_R, ARM_E - 0.004, yb1 + 0.004, zS + PILE_R + 0.004, wl);
  mb.boxMM(ARM_W + 0.004, yb1 - 0.004, zN - PILE_R - 0.004, xr0, yb1 + 0.004, zN - PILE_R, wl);
  mb.boxMM(xr0 - PILE_R - 0.004, yb1 - 0.004, ROOT_Z0 + 0.004, xr0 - PILE_R, yb1 + 0.004, zN - PILE_R, wl);
  mb.boxMM(xr1 + PILE_R, yb1 - 0.004, ROOT_Z0 + 0.004, xr1 + PILE_R + 0.004, yb1 + 0.004, ARM_S - 0.004, wl);

  // low kerb along the edges
  const kb = O(C.kerb, MAT.TIMBER, 0), kz = O(C.kerb, MAT.TIMBER, 1);
  const KH = 0.006, KW = 0.008;
  mb.boxMM(ARM_W, DECK, ARM_S - KW, ARM_E, DECK + KH, ARM_S, { ...kb, skip: ['bottom'] });
  mb.boxMM(ARM_W, DECK, ARM_N, ROOT_W + KW, DECK + KH, ARM_N + KW, { ...kb, skip: ['bottom'] });
  mb.boxMM(ARM_W, DECK, ARM_N + KW, ARM_W + KW, DECK + KH, ARM_S - KW, { ...kz, skip: ['bottom'] });
  mb.boxMM(ROOT_W, DECK, ROOT_Z0, ROOT_W + KW, DECK + KH, ARM_N, { ...kz, skip: ['bottom'] });
  mb.boxMM(ROOT_E - KW, DECK, ROOT_Z0, ROOT_E, DECK + KH, ARM_S - KW, { ...kz, skip: ['bottom'] });

  // stair from the quay down to the deck: two stringers and five treads
  {
    const nT = 5, rise = (G - DECK) / (nT + 1), td = (ROOT_Z0 - STAIR_Z0) / nT;
    for (const x of [ROOT_W + 0.0045, ROOT_E - 0.0045]) {
      mb.beam([x, G - 0.010, QUAY_Z - 0.004], [x, DECK - 0.006, ROOT_Z0 + 0.006], 0.007, 0.016, O(C.beam, MAT.TIMBER, 1));
    }
    for (let k = 0; k < nT; k++) {
      const y = G - (k + 1) * rise, z0 = STAIR_Z0 + k * td;
      mb.boxMM(ROOT_W + 0.008, y - 0.005, z0, ROOT_E - 0.008, y, z0 + td + 0.002, O(C.deck, MAT.TIMBER, 0));
    }
    // handrails
    const rail = O(C.galv, MAT.STEEL);
    for (const x of [ROOT_W + 0.004, ROOT_E - 0.004]) {
      const hTop = [x, G + 0.033, QUAY_Z - 0.012], hBot = [x, DECK + 0.033, ROOT_Z0 + 0.012], hEnd = [x, DECK + 0.033, ROOT_Z0 + 0.06];
      mb.tube([hTop, hBot, hEnd], 0.0012, { ...rail, seg: 5 });
      mb.cylinder(x, G + 0.006, QUAY_Z - 0.012, 0.0012, 0.027, { ...rail, seg: 5 });
      mb.cylinder(x, DECK + KH, ROOT_Z0 + 0.012, 0.0012, 0.027, { ...rail, seg: 5 });
      mb.cylinder(x, DECK + KH, ROOT_Z0 + 0.06, 0.0012, 0.027, { ...rail, seg: 5 });
    }
  }

  // ladder down to the water on the root's west face
  {
    const x = ROOT_W - 0.0035, zc = (rootZ[1] + rootZ[2]) / 2, galv = O(C.galv, MAT.STEEL);
    for (const s of [-1, 1]) {
      const z = zc + s * 0.0078;
      mb.tube([[x, -0.10, z], [x, DECK + 0.014, z], [x + 0.003, DECK + 0.022, z], [x + 0.010, DECK + 0.022, z], [x + 0.014, DECK + 0.014, z], [x + 0.014, DECK + KH, z]], 0.0011, { ...galv, seg: 5 });
    }
    for (let y = -0.092; y < DECK - 0.004; y += 0.0125) mb.beam([x, y, zc - 0.0078], [x, y, zc + 0.0078], 0.0014, 0.0014, { ...galv, caps: false });
  }

  // mooring bollards along the arm's south edge (two per boat) and bigger bollards at the corners
  for (const m of BOAT_MOOR) for (const s of [-1, 1]) bollard(mb, m.x + s * FISHBOAT.length * 0.37, DECK, ARM_S - 0.0125, 0.85);
  for (const [x, z] of CORNER_BOLLARDS) bollard(mb, x, DECK, z, 1.15);

  // old tyres hung along the boats' side as fenders
  for (const m of BOAT_MOOR) for (const s of [-1, 0, 1]) {
    const x = m.x + s * FISHBOAT.length * 0.3, y = 0.058, z = ARM_S + 0.0036;
    mb.push(); mb.translate(x, y, z); mb.rotateX(Math.PI / 2);
    torus(mb, 0, -0.0034, 0, 0.0072, 0.0034, O(0x232527, MAT.RUBBER), 10, 6);
    mb.pop();
    mb.tube([[x, DECK + KH, ARM_S - 0.004], [x, DECK + KH + 0.001, ARM_S + 0.001], [x, y + 0.0106, z]], 0.0007, { ...O(C.rope, MAT.CANVAS), seg: 4 });
  }

  // life-ring stand near the west end (the ring itself is an instance hung on ringHook)
  {
    const [x, z] = RING_POST, red = O(0xc8382c);
    mb.boxMM(x - 0.0025, DECK, z - 0.0025, x + 0.0025, DECK + 0.044, z + 0.0025, { ...red, skip: ['bottom'] });
    mb.boxMM(x - 0.0035, DECK + 0.044, z - 0.0035, x + 0.0035, DECK + 0.0465, z + 0.0035, O(C.trim));
    mb.boxMM(x - 0.0008, DECK + 0.0325, z + 0.0025, x + 0.0008, DECK + 0.0345, z + 0.009, O(C.galv, MAT.STEEL));
    mb.boxMM(x - 0.0008, DECK + 0.0345, z + 0.0075, x + 0.0008, DECK + 0.037, z + 0.009, O(C.galv, MAT.STEEL));
  }

  // little fish derrick between the two boats: yellow mast, jib reaching toward the boats, hook on a fall
  {
    const mx = (BOAT_MOOR[0].x + BOAT_MOOR[1].x) / 2, mz = ARM_N + 0.022;
    const y = O(C.yellow, MAT.STEEL), dk = O(0x3a3f44, MAT.STEEL);
    mb.boxMM(mx - 0.011, DECK, mz - 0.011, mx + 0.011, DECK + 0.003, mz + 0.011, { ...dk, skip: ['bottom'] });
    mb.cylinder(mx, DECK + 0.003, mz, 0.0038, 0.006, { ...dk, seg: 8, r2: 0.0034 });
    mb.cylinder(mx, DECK + 0.009, mz, 0.0042, 0.100, { ...y, seg: 8, r2: 0.0032 });
    mb.sphere(mx, DECK + 0.110, mz, 0.0042, { ...y, seg: 8, rings: 4 });
    mb.cylinder(mx, DECK + 0.020, mz, 0.0058, 0.004, { ...dk, seg: 8 });
    const heel = [mx, DECK + 0.024, mz + 0.004], tip = [mx - 0.024, DECK + 0.096, ARM_S - 0.016];
    mb.beam(heel, tip, 0.0048, 0.0048, y);
    mb.tube([[mx, DECK + 0.108, mz], tip], 0.0007, { ...O(0x2a2a2a), seg: 4 });
    mb.sphere(tip[0], tip[1], tip[2], 0.0024, { ...dk, seg: 6, rings: 3 });
    const hookY = DECK + 0.046;
    mb.tube([tip, [tip[0], hookY + 0.005, tip[2]]], 0.0005, { ...O(0x2a2a2a), seg: 4 });
    mb.box(tip[0], hookY, tip[2], 0.005, 0.006, 0.004, O(C.orange));
    mb.tube([[tip[0], hookY, tip[2]], [tip[0], hookY - 0.004, tip[2]], [tip[0] + 0.002, hookY - 0.006, tip[2]], [tip[0] + 0.003, hookY - 0.004, tip[2]]], 0.0006, { ...dk, seg: 4 });
    // winch on the mast's land side
    mb.boxMM(mx - 0.006, DECK + 0.003, mz - 0.011, mx + 0.006, DECK + 0.010, mz - 0.004, dk);
    mb.push(); mb.translate(mx - 0.006, DECK + 0.014, mz - 0.0075); mb.rotateZ(-Math.PI / 2);
    mb.cylinder(0, 0, 0, 0.004, 0.012, { ...O(C.yellow, MAT.STEEL), seg: 8 });
    mb.pop();
    // crates waiting by the derrick, and a rope coil
    crate(mb, mx + 0.032, DECK, ARM_N + 0.02, 0.05, C.blue, false);
    crate(mb, mx + 0.032, DECK + CH, ARM_N + 0.02, -0.04, C.orange, true, rnd);
    crate(mb, mx + 0.066, DECK, ARM_N + 0.02, 0.1, C.white, true, rnd);
  }
  ropeCoil(mb, BOAT_MOOR[0].x - 0.05, DECK, ARM_N + 0.02, 0.0095, 0x2f6fb0, 3);
  // a few creels waiting near the west end
  mb.push(); mb.translate(ARM_W + 0.11, DECK, ARM_N + 0.022); mb.rotateY(0.08);
  creel(mb, -0.022, 0, 0, 0, rnd); creel(mb, 0.022, 0, 0, 0.05, rnd); creel(mb, 0, 0.0158, 0, -0.04, rnd);
  mb.pop();
  ropeCoil(mb, BOAT_MOOR[1].x + 0.11, DECK, ARM_N + 0.02, 0.009, 0xf08a24, 2);
}

// Bunting strung between two lamp posts, sagging a little, with triangular flags.
function bunting(mb, a, b, y, sag) {
  const n = 14, pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push([a[0] + (b[0] - a[0]) * t, y - sag * 4 * t * (1 - t), a[1] + (b[1] - a[1]) * t]);
  }
  mb.tube(pts, 0.0004, { ...O(0xf4f1e8), seg: 3 });
  const cols = [0xd2473b, 0xf2c230, 0x2f6fb0, 0xf6f2ea, 0x3f9a5a, 0xf08a24];
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]), nf = Math.floor(L / 0.03);
  for (let k = 1; k < nf; k++) {
    const t = k / nf, x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t, yy = y - sag * 4 * t * (1 - t);
    const dx = (b[0] - a[0]) / L * 0.0055, dz = (b[1] - a[1]) / L * 0.0055;
    mb.poly([[x - dx, yy, z - dz], [x + dx, yy, z + dz], [x, yy - 0.011, z]], O(cols[k % cols.length], MAT.CANVAS));
  }
}

function planter(mb, x, z, rnd) {
  mb.boxMM(x - 0.012, G, z - 0.008, x + 0.012, G + 0.011, z + 0.008, O(0x8a6a4a, MAT.TIMBER, 0, { skip: ['bottom'] }));
  mb.boxMM(x - 0.0105, G + 0.011, z - 0.0065, x + 0.0105, G + 0.0115, z + 0.0065, O(0x5a4632));
  for (let k = 0; k < 6; k++) {
    const px = x - 0.0075 + (k % 3) * 0.0075, pz = z + (k < 3 ? -0.0032 : 0.0032);
    mb.sphere(px, G + 0.0135 + rnd() * 0.002, pz, 0.0042, { ...O(0x5f9a45, MAT.LEAF, 0.3), seg: 6, rings: 3 });
  }
  for (let k = 0; k < 7; k++) {
    mb.sphere(x - 0.009 + k * 0.003, G + 0.0185 + rnd() * 0.002, z + (rnd() - 0.5) * 0.009, 0.0024, { ...O(rnd.pick([0xd2473b, 0xf2c230, 0xe86fa0, 0xf6f2ea]), MAT.LEAF, 0.3), seg: 5, rings: 3 });
  }
}

// ---- 5. quay clutter ----------------------------------------------------------------------------------------
function clutter(mb, rnd) {
  // east of the shed: pallet of crates, crate stacks, creels, nets, barrels, rope
  pallet(mb, 1.86, G, -1.18, 0.08);
  for (const [dx, dz, n] of [[-0.012, -0.012, 3], [0.012, 0.012, 2], [0.014, -0.012, 3]]) {
    crateStack(mb, 1.86 + dx, G + 0.0052, -1.18 + dz * 0.9, n, rnd, 0.08);
  }
  crateStack(mb, 1.815, G, -1.32, 4, rnd, 0.1);
  crateStack(mb, 1.85, G, -1.335, 3, rnd, -0.05);
  crateStack(mb, 1.83, G, -1.40, 2, rnd, 0.2);
  crateStack(mb, 1.86, G, -1.425, 1, rnd, -0.3);
  // crates at the dock's east end
  crateStack(mb, SX1 - 0.025, FY, SZ1 + 0.018, 3, rnd, 0.06);

  // creel stack (pyramid) with a float
  {
    const x = 2.02, z = -1.27, a = 0.35;
    mb.push(); mb.translate(x, G, z); mb.rotateY(a);
    for (const zz of [-0.027, 0, 0.027]) creel(mb, 0, 0, zz, 0, rnd);
    for (const zz of [-0.0135, 0.0135]) creel(mb, 0.002, 0.0158, zz, 0.04, rnd);
    creel(mb, -0.002, 0.0316, 0, -0.05, rnd);
    mb.pop();
    mb.sphere(x + 0.03, G + 0.008, z - 0.03, 0.008, { ...O(C.orange), seg: 10, rings: 6 });
    danBuoy(mb, x - 0.04, G, z + 0.012, 0.3, 0.32, 0x222222);
    danBuoy(mb, x - 0.04, G, z - 0.004, 0.1, 0.28, C.orange);
  }
  // second, smaller creel stack near the right edge
  {
    const x = 2.47, z = -1.40;
    mb.push(); mb.translate(x, G, z); mb.rotateY(-0.25);
    creel(mb, 0, 0, -0.0135, 0, rnd); creel(mb, 0, 0, 0.0135, 0, rnd);
    creel(mb, 0, 0.0158, 0, 0.06, rnd);
    mb.pop();
  }
  netHeap(mb, 2.15, G, -1.47, 0.05, 0.028, C.net, rnd, 6);
  netHeap(mb, 2.24, G, -1.53, 0.03, 0.018, 0xc8553d, rnd, 3);
  barrel(mb, 2.32, G, -1.38, 0x2d6db5);
  barrel(mb, 2.345, G, -1.40, 0x2d6db5);
  barrel(mb, 2.33, G, -1.36 + 0.025, 0x3d8f5a);
  ropeCoil(mb, 1.97, G, -1.12, 0.012, 0xf08a24, 3);
  ropeCoil(mb, 2.43, G, -1.18, 0.011, 0x2f6fb0, 3);
  ropeCoil(mb, 2.50, G, -0.86, 0.010, C.rope, 2);
  creel(mb, 2.50, G, -0.92, 1.3, rnd);

  // west of the shed
  crateStack(mb, 0.86, G, -1.22, 3, rnd, 0.12);
  crateStack(mb, 0.895, G, -1.25, 2, rnd, -0.1);
  crateStack(mb, 0.87, G, -1.27, 1, rnd, 0.4);
  ropeCoil(mb, 0.92, G, -1.44, 0.011, C.rope, 3);
  {
    mb.push(); mb.translate(0.86, G, -1.50); mb.rotateY(1.2);
    creel(mb, 0, 0, -0.0135, 0, rnd); creel(mb, 0, 0, 0.0135, 0, rnd);
    mb.pop();
  }
  netHut(mb, 2.37, -1.665, 2.55, -1.545);
  // behind the shed
  crateStack(mb, 1.60, G, -1.64, 2, rnd, 0.05);
  crateStack(mb, 1.64, G, -1.645, 1, rnd, -0.2);
  barrel(mb, 1.30, G, -1.64, 0x2d6db5);

  // benches on the promenade, facing the water, each between two flower tubs
  for (const bx of [(LAMPS[0][0] + LAMPS[1][0]) / 2, (LAMPS[1][0] + LAMPS[2][0]) / 2]) {
    bench(mb, bx, -0.84, 0);
    planter(mb, bx - 0.04, -0.842, rnd);
    planter(mb, bx + 0.04, -0.842, rnd);
  }
  bench(mb, 1.62, -1.62, Math.PI);
  // bunting between the promenade lamps
  const prom = LAMPS.filter(l => l[1] > KERB_Z).sort((p, q) => p[0] - q[0]);
  for (let k = 0; k < prom.length - 1; k++) bunting(mb, [prom[k][0] + 0.004, prom[k][1]], [prom[k + 1][0] - 0.004, prom[k + 1][1]], G + 0.0815, 0.018);
}

// ---- build ------------------------------------------------------------------------------------------------
export function build(mb, ctx) {
  mb.push();
  mb.set({ obj: 0, param: 0, mat: MAT.PAINT, color: 0xcccccc });
  const rnd = makeRand(4242);
  surface(mb);
  shed(mb, makeRand(77));
  for (const [x, z] of LAMPS) lampPost(mb, x, z);
  pier(mb, makeRand(913));
  clutter(mb, rnd);
  mb.pop();
}
