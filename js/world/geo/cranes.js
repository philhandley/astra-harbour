// The two ship-to-shore gantry cranes (red A, blue B). Each crane is four rigs:
//   gantry (portal legs, backreach, A-frame, machinery house) - moves along the rails
//   boom (hinged at the top of the water-side legs, swings up) - forestays stretch from the apex to it
//   trolley (runs under the girder, with the operator's cab)
//   spreader (yellow frame on four wire falls from the trolley)
// Local frames: gantry origin at (craneX, QUAY_TOP, RAIL_WATER_Z), world-aligned; landside rail at local z = -gauge.
// Boom origin at the hinge (local y = hingeY above the quay); trolley origin at its wheel line; spreader origin at its underside.
import { MAT, MeshBuilder } from '../../gpu/mesh.js';
import { OBJ } from '../env.js';
import { CRANE, BOX } from '../layout.js';

const G = CRANE.gauge;            // 0.32
const HX = CRANE.legSpanX / 2;    // legs at x = +-0.12
const TOP = CRANE.hingeY;         // portal top / girder underside
const GH = 0.034;                 // girder depth
const GX = 0.042;                 // girders at x = +-GX
const APEX = [0, CRANE.apexY, -0.10];

export const CRANE_POINTS = {
  apex: APEX,                                   // gantry-local, gull perch
  boomTip: [0, GH, CRANE.boomLen],              // boom-local
  forestayBoom: [[-GX, GH, 0.50], [GX, GH, 0.50]],
  trolleySheaves: [[-0.03, -0.028, -0.035], [0.03, -0.028, -0.035], [-0.03, -0.028, 0.035], [0.03, -0.028, 0.035]],
  spreaderEars: [[-0.045, 0.014, -0.115], [0.045, 0.014, -0.115], [-0.045, 0.014, 0.115], [0.045, 0.014, 0.115]],
};

export const points = {
  perches: [{ obj: OBJ.CRANE_A, local: [0, CRANE.apexY + 0.025, -0.10] }, { obj: OBJ.CRANE_B, local: [0, CRANE.apexY + 0.025, -0.10] }],
};

const SPEC = [
  { g: OBJ.CRANE_A, b: OBJ.BOOM_A, t: OBJ.TROLLEY_A, s: OBJ.SPREADER_A, color: 0xc8392e, dark: 0x8f241d },
  { g: OBJ.CRANE_B, b: OBJ.BOOM_B, t: OBJ.TROLLEY_B, s: OBJ.SPREADER_B, color: 0x2f62b0, dark: 0x1f437c },
];

export function build(mb) {
  mb.push();
  for (const c of SPEC) {
    gantry(mb, c);
    boom(mb, c);
    trolley(mb, c);
    spreader(mb, c);
    // forestays (boom hoist): apex (gantry) to the boom - they stretch as the boom swings up
    mb.set({ mat: MAT.STEEL, color: 0x30343a, obj: 0 });
    for (const p of CRANE_POINTS.forestayBoom) mb.cable([APEX[0] + p[0] * 0.6, APEX[1] - 0.01, APEX[2] + 0.02], c.g, p, c.b, 0.0022);
    // wire falls: trolley sheaves to spreader ears
    for (let k = 0; k < 4; k++) mb.cable(CRANE_POINTS.trolleySheaves[k], c.t, CRANE_POINTS.spreaderEars[k], c.s, 0.0016);
  }
  mb.pop();
}

function gantry(mb, c) {
  mb.push();
  mb.set({ obj: c.g, mat: MAT.STEEL, color: c.color, param: 0 });
  const legW = 0.024;
  // four legs, slightly tapered (wider at the bottom)
  for (const x of [-HX, HX]) for (const z of [0, -G]) {
    mb.beam([x, 0.045, z], [x * 0.92, TOP, z * 0.97 + (z === 0 ? 0 : -0.0)], legW, legW, { up: [0, 0, 1] });
  }
  // bogies on the rails, with wheels
  mb.set({ color: 0x3b3f45 });
  for (const x of [-HX, HX]) for (const z of [0, -G]) {
    mb.box(x, 0.012, z, 0.075, 0.03, 0.022, { skip: ['bottom'] });
    mb.box(x, 0.0, z, 0.068, 0.012, 0.016, { skip: ['bottom'], color: 0x23262a });
  }
  mb.set({ color: c.color });
  // sill ties between water and land legs (along z) and the diagonal braces
  for (const x of [-HX, HX]) {
    mb.beam([x, 0.13, 0], [x, 0.13, -G], 0.016, 0.02);
    mb.beam([x * 0.96, 0.15, -0.01], [x * 0.94, TOP - 0.03, -G + 0.02], 0.012, 0.012);
  }
  // portal beams along z at the top of each side, cross beams along x
  for (const x of [-HX, HX]) mb.boxMM(x - 0.016, TOP - 0.03, -G - 0.02, x + 0.016, TOP, 0.02);
  mb.boxMM(-HX - 0.016, TOP - 0.035, -0.018, HX + 0.016, TOP - 0.002, 0.018);
  mb.boxMM(-HX - 0.016, TOP - 0.035, -G - 0.018, HX + 0.016, TOP - 0.002, -G + 0.018);
  // the backreach girders (fixed), from the hinge back to -backreach
  for (const x of [-GX, GX]) mb.boxMM(x - 0.012, TOP, -CRANE.backreach, x + 0.012, TOP + GH, 0.0);
  for (let z = -0.05; z > -CRANE.backreach; z -= 0.1) mb.boxMM(-GX, TOP + GH - 0.008, z - 0.006, GX, TOP + GH, z + 0.006);
  // machinery house on the backreach
  mb.set({ color: 0xf1efe9, mat: MAT.STEEL });
  mb.boxMM(-0.07, TOP + GH, -CRANE.backreach + 0.01, 0.07, TOP + GH + 0.065, -CRANE.backreach + 0.16, { skip: ['bottom'] });
  mb.set({ color: c.color });
  mb.boxMM(-0.071, TOP + GH + 0.045, -CRANE.backreach + 0.009, 0.071, TOP + GH + 0.055, -CRANE.backreach + 0.161, { skip: ['bottom', 'top'] });
  mb.set({ color: 0x2b3640, mat: MAT.GLASS });
  mb.boxMM(-0.05, TOP + GH + 0.02, -CRANE.backreach + 0.159, 0.05, TOP + GH + 0.035, -CRANE.backreach + 0.162, { skip: ['bottom', 'top'] });
  // A-frame: two struts each side from the portal corners up to the apex
  mb.set({ color: c.color, mat: MAT.STEEL });
  for (const s of [-1, 1]) {
    const top = [s * 0.035, APEX[1], APEX[2]];
    mb.beam([s * HX * 0.85, TOP + 0.002, 0.0], top, 0.018, 0.018);
    mb.beam([s * HX * 0.85, TOP + 0.002, -G], top, 0.018, 0.018);
  }
  mb.boxMM(-0.05, APEX[1] - 0.012, APEX[2] - 0.014, 0.05, APEX[1] + 0.008, APEX[2] + 0.014);
  // back-stays from the apex to the backreach end
  mb.set({ color: c.dark });
  for (const s of [-1, 1]) mb.beam([s * 0.03, APEX[1] - 0.004, APEX[2] - 0.01], [s * GX, TOP + GH, -CRANE.backreach + 0.02], 0.009, 0.009);
  // apex beacon (red)
  mb.set({ color: 0xff4a3a, mat: MAT.LAMP, param: 0.8 });
  mb.sphere(0, APEX[1] + 0.016, APEX[2], 0.008, { seg: 8, rings: 4 });
  // stairs/ladders hint on a landside leg, walkway rails along the backreach
  mb.set({ color: 0xf2f0ea, mat: MAT.STEEL, param: 0 });
  for (const x of [-GX - 0.016, GX + 0.016]) mb.tube([[x, TOP + GH + 0.018, -CRANE.backreach + 0.16], [x, TOP + GH + 0.018, -0.02]], 0.0018, { seg: 4 });
  mb.pop();
}

function boom(mb, c) {
  mb.push();
  mb.set({ obj: c.b, mat: MAT.STEEL, color: c.color, param: 0 });
  const L = CRANE.boomLen;
  for (const x of [-GX, GX]) mb.boxMM(x - 0.012, 0, 0.0, x + 0.012, GH, L, { skip: ['nz'] });
  // cross ties and a light lattice on top
  for (let z = 0.06; z < L; z += 0.11) mb.boxMM(-GX, GH - 0.008, z - 0.006, GX, GH, z + 0.006);
  mb.set({ color: c.dark });
  for (let z = 0.06; z < L - 0.1; z += 0.22) {
    mb.beam([-GX, GH, z], [GX, GH, z + 0.11], 0.006, 0.006);
    mb.beam([GX, GH, z + 0.11], [-GX, GH, z + 0.22], 0.006, 0.006);
  }
  // boom tip with a light, and the forestay ears
  mb.set({ color: c.color });
  mb.boxMM(-GX - 0.012, 0, L - 0.012, GX + 0.012, GH + 0.006, L);
  mb.set({ color: 0xfff2c8, mat: MAT.LAMP, param: 0.5 });
  mb.sphere(0, GH + 0.012, L - 0.006, 0.006, { seg: 6, rings: 3 });
  // walkway rails
  mb.set({ color: 0xf2f0ea, mat: MAT.STEEL, param: 0 });
  for (const x of [-GX - 0.016, GX + 0.016]) mb.tube([[x, GH + 0.018, 0.02], [x, GH + 0.018, L - 0.02]], 0.0018, { seg: 4 });
  mb.pop();
}

function trolley(mb, c) {
  mb.push();
  mb.set({ obj: c.t, mat: MAT.STEEL, color: 0xe9e6de, param: 0 });
  // carriage
  mb.boxMM(-0.06, -0.026, -0.045, 0.06, 0.0, 0.045);
  mb.set({ color: c.dark });
  mb.boxMM(-0.062, -0.012, -0.047, 0.062, -0.004, 0.047, { skip: ['top', 'bottom'] });
  // sheave block underneath
  mb.set({ color: 0x3a3e44 });
  mb.boxMM(-0.04, -0.034, -0.04, 0.04, -0.026, 0.04);
  // operator's cab hanging on the water side, beside the falls
  mb.set({ color: 0xf4f2ec });
  mb.boxMM(0.045, -0.07, 0.01, 0.085, -0.026, 0.05);
  mb.set({ color: 0x2b3a46, mat: MAT.GLASS });
  mb.boxMM(0.046, -0.064, 0.049, 0.084, -0.04, 0.0515, { skip: ['top', 'bottom'] });
  mb.boxMM(0.0465, -0.072, 0.014, 0.0835, -0.0698, 0.046, { skip: ['top'] });
  mb.pop();
}

function spreader(mb, c) {
  mb.push();
  mb.set({ obj: c.s, mat: MAT.STEEL, color: 0xf0c232, param: 0 });
  const hz = 0.135, hx = 0.06;
  // two long beams along z (they span a row of five boxes across the ship) and end beams
  for (const x of [-hx, hx]) mb.boxMM(x - 0.009, 0.0, -hz, x + 0.009, 0.012, hz);
  for (const z of [-hz, hz]) mb.boxMM(-hx, 0.0, z - 0.008, hx, 0.012, z + 0.008);
  // headblock where the falls meet
  mb.set({ color: 0x3a3e44 });
  mb.boxMM(-0.05, 0.012, -0.12, 0.05, 0.02, -0.105);
  mb.boxMM(-0.05, 0.012, 0.105, 0.05, 0.02, 0.12);
  // twistlock flippers (dark) at the corners
  mb.set({ color: 0x2a2c30 });
  for (const x of [-hx, hx]) for (const z of [-hz, hz]) mb.box(x, -0.004, z, 0.014, 0.004, 0.014);
  mb.pop();
}

// ---- instanced templates: the container (white = livery tint) and the fish crate --------------------
export function templates() {
  return [{ name: 'container', mesh: containerMesh() }, { name: 'crate', mesh: crateMesh() }];
}

export function containerMesh() {
  const mb = new MeshBuilder();
  const L = BOX.L, H = BOX.H, W = BOX.W;
  const x0 = -L / 2, x1 = L / 2, y0 = -H / 2, y1 = H / 2, z0 = -W / 2, z1 = W / 2;
  const post = 0.0045;
  // corrugated body (white: takes the livery colour)
  mb.set({ mat: MAT.CORRUGATED, color: 0xffffff, param: 0.7 });
  mb.boxMM(x0 + post * 0.5, y0 + post * 0.5, z0 + 0.0006, x1 - post * 0.5, y1 - post * 0.5, z1 - 0.0006, { skip: ['nx', 'px'] });
  // door end (-x) and front end (+x): flat-ish panels in the livery colour
  mb.set({ mat: MAT.PAINT, color: 0xffffff, param: 0 });
  mb.quad([x0 + 0.001, y0, z1], [x0 + 0.001, y0, z0], [x0 + 0.001, y1, z0], [x0 + 0.001, y1, z1]);
  mb.quad([x1 - 0.001, y0, z0], [x1 - 0.001, y0, z1], [x1 - 0.001, y1, z1], [x1 - 0.001, y1, z0]);
  // door locking bars and the door split
  mb.set({ mat: MAT.STEEL, color: 0x4a4f55 });
  for (const z of [-0.016, -0.006, 0.006, 0.016]) mb.boxMM(x0 - 0.0006, y0 + 0.004, z - 0.0007, x0 + 0.0012, y1 - 0.004, z + 0.0007, { skip: ['px'] });
  // darker corner posts and top/bottom rails
  mb.set({ mat: MAT.STEEL, color: 0x3c4046 });
  for (const x of [x0, x1 - post]) for (const z of [z0, z1 - post]) mb.boxMM(x, y0, z, x + post, y1, z + post);
  for (const y of [y0, y1 - 0.0035]) {
    for (const z of [z0, z1 - 0.0035]) mb.boxMM(x0 + post, y, z, x1 - post, y + 0.0035, z + 0.0035, { skip: ['nx', 'px'] });
    for (const x of [x0, x1 - 0.0035]) mb.boxMM(x, y, z0 + post, x + 0.0035, y + 0.0035, z1 - post, { skip: ['nz', 'pz'] });
  }
  // roof (livery colour, slightly ribbed)
  mb.set({ mat: MAT.PAINT, color: 0xffffff });
  mb.boxMM(x0 + post, y1 - 0.003, z0 + post, x1 - post, y1 - 0.0005, z1 - post, { skip: ['bottom', 'nx', 'px', 'nz', 'pz'] });
  return mb.finish();
}

export function crateMesh() {
  // A fish crate: open-top box (white = tint) with ice and fish inside. 0.050 x 0.030 x 0.050, origin at its base centre.
  const mb = new MeshBuilder();
  const s = 0.025, h = 0.030, t = 0.004;
  mb.set({ mat: MAT.PAINT, color: 0xffffff });
  mb.boxMM(-s, 0, -s, s, 0.004, s, { skip: [] });
  mb.boxMM(-s, 0, -s, s, h, -s + t);
  mb.boxMM(-s, 0, s - t, s, h, s);
  mb.boxMM(-s, 0, -s + t, -s + t, h, s - t);
  mb.boxMM(s - t, 0, -s + t, s, h, s - t);
  // hand holes (dark slots) on the long sides
  mb.set({ color: 0x1f2a33 });
  mb.boxMM(-0.008, h - 0.009, s + 0.0002, 0.008, h - 0.005, s + 0.0006, { skip: ['nz'] });
  mb.boxMM(-0.008, h - 0.009, -s - 0.0006, 0.008, h - 0.005, -s - 0.0002, { skip: ['pz'] });
  // crushed ice and three silver fish
  mb.set({ color: 0xeef6f8, mat: MAT.PAINT });
  mb.boxMM(-s + t, 0.004, -s + t, s - t, h - 0.008, s - t, { skip: ['bottom', 'nx', 'px', 'nz', 'pz'] });
  mb.set({ color: 0xaab8c4, mat: MAT.STEEL });
  for (const [x, z, a] of [[-0.008, -0.009, 0.3], [0.006, 0.0, -0.2], [-0.004, 0.011, 0.1]]) {
    mb.push(); mb.translate(x, h - 0.006, z); mb.rotateY(a); mb.scale(1, 0.28, 0.4);
    mb.sphere(0, 0, 0, 0.012, { seg: 6, rings: 3 });
    mb.pop();
  }
  return mb.finish();
}
