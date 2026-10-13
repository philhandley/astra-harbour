// Fish: two mackerel schools, three herring schools (boids) and a dozen orange wrasse loitering by the quay wall,
// the breakwater rocks and the pier. Templates are length 1 (nose at +0.5, tail tip at -0.5, +x is the head),
// flex (vertex param) 0 at the head rising to 1 at the tail tip; white vertices take the species tint. Kind 1.
import { MeshBuilder, MAT } from '../gpu/mesh.js';
import { QUAY_Z, BW, PIER } from '../world/layout.js';
import { InstanceWriter, Shape, quatYPR, wrap, clamp, hexRGB } from './habitat.js';

const W = 0xffffff; // "take the tint"
const CELL = 0.14;   // neighbour grid cell (>= the widest school radius)

const SPECIES = {
  mackerel: { tpl: 'life-mackerel', len: 0.045, cruise: 0.11, max: 0.42, depth: [0.035, 0.10], sep: 0.026, R: 0.13, wall: 0.14,
    tint: 0x1d5c58, tintVar: 8 },
  herring: { tpl: 'life-herring', len: 0.035, cruise: 0.085, max: 0.36, depth: [0.03, 0.085], sep: 0.021, R: 0.11, wall: 0.12,
    tint: 0x2b5a82, tintVar: 8 },
  wrasse: { tpl: 'life-wrasse', len: 0.028, cruise: 0.03, max: 0.26, depth: [0.03, 0.075], sep: 0.02, R: 0, wall: 0.035,
    tint: 0xee6a22, tintVar: 14 },
};

// ---- templates ----------------------------------------------------------------------------------------------------
const ANG = [0, 1, 2, 3, 4, 5].map(k => (k * Math.PI) / 3);
const flexAt = x => clamp((0.30 - x) / 0.80, 0, 1);

// rings: [{ x, y, h, w, c: [top, upper, lower, belly] }] from the nose back; nose/tail tip points close the ends.
function body(s, rings, nose, tail) {
  const R = rings.map(r => ANG.map((a, k) => {
    const ci = k === 0 ? 0 : k === 3 ? 3 : (k === 1 || k === 5) ? 1 : 2;
    return s.vert([r.x, (r.y || 0) + r.h * Math.cos(a), r.w * Math.sin(a)], r.c[ci], flexAt(r.x), MAT.STEEL);
  }));
  const tipN = s.vert([nose.x, nose.y || 0, 0], nose.c, 0, MAT.STEEL);
  for (let k = 0; k < 6; k++) s.tri(tipN, R[0][k], R[0][(k + 1) % 6]);
  for (let j = 0; j < R.length - 1; j++) for (let k = 0; k < 6; k++) {
    const a = R[j][k], b = R[j][(k + 1) % 6], c = R[j + 1][k], d = R[j + 1][(k + 1) % 6];
    s.tri(a, d, b); s.tri(a, c, d);
  }
  const L = R[R.length - 1];
  const tipT = s.vert([tail.x, tail.y || 0, 0], tail.c, flexAt(tail.x), MAT.STEEL);
  for (let k = 0; k < 6; k++) s.tri(L[k], tipT, L[(k + 1) % 6]);
}
// A small round eye on each side: dark glassy pupil with a pale ring.
function eyes(s, x, y, z, r, ring) {
  for (const side of [1, -1]) {
    const c = s.vert([x, y, side * (z + 0.002)], 0x0d0f10, 0, MAT.GLASS);
    const ids = [];
    for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; ids.push(s.vert([x + Math.cos(a) * r, y + Math.sin(a) * r, side * z], ring, 0, MAT.GLASS)); }
    for (let k = 0; k < 6; k++) side > 0 ? s.tri(c, ids[k], ids[(k + 1) % 6]) : s.tri(c, ids[(k + 1) % 6], ids[k]);
  }
}
const fin = (s, pts, col) => s.flat(pts, col, pts.map(p => flexAt(p[0])), MAT.PAINT);

function mackerel() {
  const s = new Shape();
  const D = 0x0a2128, U = 0x3d8276, L = 0xc9d6da, BE = 0xf0f2ee;
  // dark wavy bars: the back and the upper flank alternate, so the bars zig-zag down the sides
  body(s, [
    { x: 0.40, y: 0.005, h: 0.050, w: 0.034, c: [W, U, L, BE] },
    { x: 0.28, y: 0.004, h: 0.080, w: 0.055, c: [W, U, L, BE] },
    { x: 0.14, y: 0.003, h: 0.090, w: 0.060, c: [D, W, L, BE] },
    { x: 0.00, y: 0.003, h: 0.086, w: 0.056, c: [W, D, L, BE] },
    { x: -0.12, y: 0.003, h: 0.070, w: 0.046, c: [D, W, L, BE] },
    { x: -0.23, y: 0.002, h: 0.046, w: 0.031, c: [W, D, L, BE] },
    { x: -0.32, y: 0.002, h: 0.022, w: 0.016, c: [D, W, L, L] },
    { x: -0.37, y: 0.002, h: 0.015, w: 0.010, c: [W, W, L, L] },
  ], { x: 0.5, y: -0.004, c: 0x6f8d88 }, { x: -0.385, y: 0.002, c: 0x9fb3b4 });
  eyes(s, 0.38, 0.012, 0.031, 0.03, 0xdcd9c2);
  const F = 0x52696a, T = 0x40585c;
  fin(s, [[-0.37, 0.016, 0], [-0.50, 0.15, 0], [-0.43, 0.0, 0]], T);           // forked tail: upper lobe
  fin(s, [[-0.37, 0.016, 0], [-0.43, 0.0, 0], [-0.37, -0.012, 0]], T);
  fin(s, [[-0.37, -0.012, 0], [-0.43, 0.0, 0], [-0.50, -0.145, 0]], T);       // lower lobe
  fin(s, [[0.17, 0.09, 0], [0.10, 0.165, 0], [0.04, 0.09, 0]], F);             // first dorsal
  fin(s, [[-0.10, 0.07, 0], [-0.15, 0.115, 0], [-0.18, 0.055, 0]], F);         // second dorsal
  fin(s, [[-0.10, -0.068, 0], [-0.18, -0.052, 0], [-0.15, -0.11, 0]], 0xb7c3c4); // anal
  for (const z of [1, -1]) fin(s, [[0.27, -0.02, z * 0.05], [0.16, -0.04, z * 0.085], [0.18, -0.005, z * 0.06]], 0x7d8f8c); // pectorals
  return s;
}

function herring() {
  const s = new Shape();
  const U = 0x6f97b3, L = 0xd6e0e6, BE = 0xf1f4f3;
  body(s, [
    { x: 0.40, y: 0.004, h: 0.058, w: 0.032, c: [W, U, L, BE] },
    { x: 0.27, y: 0.002, h: 0.095, w: 0.048, c: [W, U, L, BE] },
    { x: 0.12, y: 0.0, h: 0.108, w: 0.052, c: [W, U, L, BE] },
    { x: -0.03, y: 0.0, h: 0.100, w: 0.048, c: [W, U, L, BE] },
    { x: -0.17, y: 0.0, h: 0.072, w: 0.036, c: [W, U, L, BE] },
    { x: -0.29, y: 0.0, h: 0.036, w: 0.020, c: [W, U, L, L] },
    { x: -0.36, y: 0.0, h: 0.020, w: 0.011, c: [W, U, L, L] },
  ], { x: 0.5, y: 0.01, c: 0x6d8fa8 }, { x: -0.375, y: 0.0, c: 0xa9bccb });
  eyes(s, 0.385, 0.014, 0.029, 0.034, 0xe2e4dc);
  const T = 0x5f7d93, F = 0x7c95a6;
  fin(s, [[-0.36, 0.02, 0], [-0.50, 0.15, 0], [-0.44, 0.0, 0]], T);
  fin(s, [[-0.36, 0.02, 0], [-0.44, 0.0, 0], [-0.36, -0.02, 0]], T);
  fin(s, [[-0.36, -0.02, 0], [-0.44, 0.0, 0], [-0.50, -0.15, 0]], T);
  fin(s, [[0.06, 0.10, 0], [-0.01, 0.18, 0], [-0.08, 0.09, 0]], F);            // single dorsal mid-body
  fin(s, [[-0.18, -0.07, 0], [-0.27, -0.035, 0], [-0.24, -0.09, 0]], 0xc4d0d8);
  for (const z of [1, -1]) fin(s, [[0.27, -0.04, z * 0.044], [0.15, -0.06, z * 0.075], [0.17, -0.025, z * 0.052]], 0xb2c2cc);
  return s;
}

function wrasse() {
  const s = new Shape();
  const U = 0xf09650, L = 0xf6b787, BE = 0xf8e2c2, SP = 0x3a2626;
  body(s, [
    { x: 0.40, y: 0.0, h: 0.085, w: 0.050, c: [W, U, L, BE] },
    { x: 0.28, y: 0.005, h: 0.140, w: 0.070, c: [W, U, L, BE] },
    { x: 0.12, y: 0.005, h: 0.160, w: 0.074, c: [W, W, L, BE] },
    { x: -0.05, y: 0.005, h: 0.150, w: 0.068, c: [SP, W, L, BE] },
    { x: -0.18, y: 0.005, h: 0.115, w: 0.052, c: [W, W, L, BE] },
    { x: -0.28, y: 0.005, h: 0.070, w: 0.032, c: [SP, W, U, L] },
    { x: -0.34, y: 0.005, h: 0.050, w: 0.022, c: [W, W, U, L] },
  ], { x: 0.49, y: -0.012, c: 0xe56f3a }, { x: -0.35, y: 0.005, c: 0xec8a4a });
  eyes(s, 0.37, 0.03, 0.044, 0.036, 0x9ad0c8);
  const T = 0xe5733a, F = 0xee8a48;
  // rounded tail fan
  const tb = [-0.34, 0.005];
  const tail = [[-0.34, 0.06], [-0.44, 0.10], [-0.49, 0.04], [-0.49, -0.035], [-0.44, -0.095], [-0.34, -0.05]];
  for (let k = 0; k < tail.length - 1; k++) fin(s, [[tb[0], tb[1], 0], [tail[k][0], tail[k][1], 0], [tail[k + 1][0], tail[k + 1][1], 0]], k === 1 || k === 2 ? 0xd96430 : T);
  // long dorsal fin running down the back
  fin(s, [[0.24, 0.135, 0], [0.12, 0.215, 0], [-0.05, 0.20, 0], [-0.05, 0.15, 0]], F);
  fin(s, [[-0.05, 0.15, 0], [-0.05, 0.20, 0], [-0.24, 0.16, 0], [-0.27, 0.07, 0]], F);
  fin(s, [[-0.06, -0.14, 0], [-0.26, -0.065, 0], [-0.22, -0.13, 0]], F);
  for (const z of [1, -1]) fin(s, [[0.25, -0.03, z * 0.065], [0.13, -0.02, z * 0.11], [0.15, 0.03, z * 0.075]], 0xf2a060);
  return s;
}

export function fishTemplates() {
  const out = [];
  for (const [name, fn] of [['life-mackerel', mackerel], ['life-herring', herring], ['life-wrasse', wrasse]]) {
    const mb = new MeshBuilder();
    const s = fn();
    s.emit(mb);
    out.push({ name, mesh: mb.finish(), tris: s.triangles });
  }
  return out;
}

// ---- the swimmers -------------------------------------------------------------------------------------------------
export class Fish {
  constructor(scene, hab, rand) {
    this.scene = scene;
    this.hab = hab;
    this.rand = rand;
    this.writers = {};
    for (const k of Object.keys(SPECIES)) this.writers[k] = new InstanceWriter(scene, SPECIES[k].tpl, 64, true);
    this.fish = [];
    this.schools = [];
    this.food = [];          // { x, y, z, alive } targets shared with life.js
    this.jellies = [];       // [{ x, y, z, r }] obstacles, set by life.js
    this.time = 0;
    this.GN = Math.ceil(5.2 / CELL);
    this.head = new Int32Array(this.GN * this.GN);
    this.next = new Int32Array(128);
    const plan = [
      ['mackerel', 15, [-2.2, 0.6, 0.0, 2.2]], ['mackerel', 15, [-1.0, 2.2, 0.4, 2.3]],
      ['herring', 16, [-2.3, 0.4, -0.45, 1.6]], ['herring', 16, [-0.6, 1.0, 0.0, 2.3]], ['herring', 14, [0.9, 2.45, -0.62, 0.3]],
    ];
    for (const [sp, n, region] of plan) {
      const sc = { sp: SPECIES[sp], kind: sp, region, goal: null, timer: 0, members: [] };
      sc.goal = this.pickGoal(region);
      this.schools.push(sc);
      for (let i = 0; i < n; i++) {
        let x = sc.goal[0], z = sc.goal[1];
        for (let k = 0; k < 12; k++) {
          const tx = sc.goal[0] + rand.range(-0.1, 0.1), tz = sc.goal[1] + rand.range(-0.1, 0.1);
          if (this.validFor(SPECIES[sp], tx, tz)) { x = tx; z = tz; break; }
        }
        const f = this.spawn(sp, x, z);
        f.school = sc; sc.members.push(f);
      }
    }
    // wrasse homes: along the quay wall, round the breakwater rocks, by the pier piles
    const homes = [];
    for (const x of [-1.9, -0.25, 0.85, 1.3, 1.75]) homes.push([x + rand.range(-0.1, 0.1), QUAY_Z + 0.075]);
    for (const x of [1.45, 1.9, 2.3]) homes.push([x, BW.z - 0.25]);
    homes.push([1.0, BW.z + 0.3]);
    homes.push([PIER.root.x - 0.12, -0.45], [PIER.arm.x0 + 0.15, PIER.arm.z - 0.13], [1.65, PIER.arm.z - 0.14]);
    for (const [hx, hz] of homes) {
      let x = hx, z = hz;
      for (let k = 0; k < 30 && !this.validFor(SPECIES.wrasse, x, z); k++) { x = hx + rand.range(-0.15, 0.15); z = hz + rand.range(-0.15, 0.15); }
      const f = this.spawn('wrasse', x, z);
      f.home = [x, z];
      f.target = [x, z];
    }
  }

  validFor(sp, x, z) {
    const h = this.hab;
    return h.open(x, z, sp.wall + 0.01) && h.surfaceAt(x, z) - h.floorAt(x, z) > 0.1;
  }
  pickGoal([x0, x1, z0, z1]) {
    const r = this.rand;
    // now and then swim along just inside the front or right cut face, where the crew can see them side-on
    const edge = r() < 0.35 ? (r() < 0.65 ? 'front' : 'right') : null;
    for (let k = 0; k < 40; k++) {
      let x = r.range(x0, x1), z = r.range(z0, z1);
      if (edge === 'front' && z1 > 1.6 && k < 20) z = r.range(2.2, 2.4);
      if (edge === 'right' && x1 > 1.6 && z1 > 1.3 && k < 20) { x = r.range(2.2, 2.4); z = r.range(Math.max(z0, 1.35), z1); }
      if (this.hab.open(x, z, 0.2) && this.hab.surfaceAt(x, z) - this.hab.floorAt(x, z) > 0.12) return [x, z];
    }
    return [(x0 + x1) / 2, Math.max(z0, 0.2)];
  }
  spawn(kind, x, z) {
    const sp = SPECIES[kind], r = this.rand, h = this.hab;
    const tint = hexRGB(sp.tint).map(c => clamp(Math.round(c + r.range(-sp.tintVar, sp.tintVar)), 0, 254));
    const prefDepth = r.range(sp.depth[0], sp.depth[1]);
    const a = r.range(0, Math.PI * 2);
    const f = {
      kind, sp, x, z, y: h.surfaceAt(x, z) - prefDepth, vx: Math.cos(a) * sp.cruise, vy: 0, vz: Math.sin(a) * sp.cruise,
      scale: sp.len * r.range(0.86, 1.14), tint: [...tint, 255], prefDepth, phase: r.range(0, 6.28), yaw: 0, bend: 0, roll: 0, pitch: 0,
      fright: 0, fx: 0, fy: 0, fz: 0, feeding: 0, nibble: 0, school: null, home: null, target: null, wanderT: r.range(0, 3), hover: 0,
      cruise: sp.cruise * r.range(0.85, 1.15),
    };
    f.yaw = Math.atan2(-f.vz, f.vx);
    this.fish.push(f);
    return f;
  }

  // ---- events ----------------------------------------------------------------------------------------------------
  scare(x, z, radius, strength, down = 0.3) {
    for (const f of this.fish) {
      const dx = f.x - x, dz = f.z - z, d = Math.hypot(dx, dz);
      if (d > radius) continue;
      const k = strength * (1 - d / radius);
      const ux = d > 1e-4 ? dx / d : Math.cos(f.phase), uz = d > 1e-4 ? dz / d : Math.sin(f.phase);
      f.fx += ux * k * 1.4; f.fz += uz * k * 1.4; f.fy -= k * down;
      f.fright = Math.max(f.fright, Math.min(1, k * 1.3));
    }
  }
  startFeeding(x, z, until) {
    for (const f of this.fish) {
      const d = Math.hypot(f.x - x, f.z - z);
      if (d < (f.kind === "wrasse" ? 0.9 : 1.3)) f.feeding = until + this.rand.range(-0.8, 0.8);
    }
  }

  // ---- simulation --------------------------------------------------------------------------------------------------
  update(dt) {
    this.time += dt;
    const h = this.hab, fish = this.fish, n = fish.length, r = this.rand, t = this.time;
    const tmp = [0, 0];
    // school goals wander: a new goal when the school arrives or gets bored
    for (const sc of this.schools) {
      let cx = 0, cz = 0;
      for (const f of sc.members) { cx += f.x; cz += f.z; }
      cx /= sc.members.length; cz /= sc.members.length;
      sc.cx = cx; sc.cz = cz;
      sc.timer -= dt;
      if (sc.timer <= 0 || Math.hypot(cx - sc.goal[0], cz - sc.goal[1]) < 0.18) { sc.goal = this.pickGoal(sc.region); sc.timer = r.range(9, 18); }
    }
    // fast hulls push fish aside
    for (const hu of h.hulls) {
      if (hu.speed < 0.025) continue;
      const k0 = clamp(hu.speed * 5, 0, 1);
      for (const f of fish) {
        if (Math.abs(f.x - hu.x) > hu.reach + 0.3 || Math.abs(f.z - hu.z) > hu.reach + 0.3) continue;
        const d = h.hullAway(hu, f.x, f.z, tmp);
        if (d > 0.28) continue;
        const k = k0 * (1 - d / 0.28);
        f.fx += tmp[0] * k * dt * 6; f.fz += tmp[1] * k * dt * 6; f.fy -= k * dt * 2;
        f.fright = Math.max(f.fright, k * 0.8);
      }
    }
    const food = this.food.filter(p => p.alive);
    // bucket the fish on a coarse grid so each one only looks at its neighbours
    if (this.next.length < n) this.next = new Int32Array(n * 2);
    const GN = this.GN, head = this.head, next = this.next;
    head.fill(-1);
    for (let i = 0; i < n; i++) {
      const f = fish[i];
      const c = (clamp(((f.z + 2.6) / CELL) | 0, 0, GN - 1)) * GN + clamp(((f.x + 2.6) / CELL) | 0, 0, GN - 1);
      f.cell = c; next[i] = head[c]; head[c] = i;
    }
    for (let i = 0; i < n; i++) {
      const f = fish[i], sp = f.sp;
      let ax = 0, ay = 0, az = 0;
      // neighbours: separation from everyone, cohesion and alignment with the school
      let cnt = 0, px = 0, py = 0, pz = 0, vx = 0, vy = 0, vz = 0;
      const R = sp.R, sep = sp.sep;
      let feedingNow = f.feeding > t;
      if (feedingNow && !food.length) { f.feeding = t; feedingNow = false; }
      const ci = f.cell % GN, cj = (f.cell / GN) | 0;
      for (let gj = Math.max(0, cj - 1); gj <= Math.min(GN - 1, cj + 1); gj++) for (let gi = Math.max(0, ci - 1); gi <= Math.min(GN - 1, ci + 1); gi++) {
        for (let j = head[gj * GN + gi]; j >= 0; j = next[j]) {
          if (j === i) continue;
          const g = fish[j];
          const dx = g.x - f.x, dz = g.z - f.z;
          if (dx > CELL || dx < -CELL || dz > CELL || dz < -CELL) continue;
          const dy = g.y - f.y;
          const d2 = dx * dx + dy * dy + dz * dz;
          const s2 = Math.max(sep, g.sp.sep) * (feedingNow ? 0.7 : 1);
          if (d2 < s2 * s2 && d2 > 1e-10) {
            const d = Math.sqrt(d2), k = (1 - d / s2) * 1.4 / d;
            ax -= dx * k; ay -= dy * k * 0.6; az -= dz * k;
          }
          if (g.school === f.school && f.school && d2 < R * R) {
            cnt++; px += g.x; py += g.y; pz += g.z; vx += g.vx; vy += g.vy; vz += g.vz;
          }
        }
      }
      const fright = f.fright;
      if (cnt > 0 && !feedingNow) {
        const coh = 1.4 * (1 - fright * 0.7), ali = 1.6 * (1 - fright * 0.6);
        ax += (px / cnt - f.x) * coh; ay += (py / cnt - f.y) * coh * 0.5; az += (pz / cnt - f.z) * coh;
        ax += (vx / cnt - f.vx) * ali; ay += (vy / cnt - f.vy) * ali; az += (vz / cnt - f.vz) * ali;
      }
      // where to go: food, the school's goal, or (wrasse) a spot near home
      let want = f.cruise;
      if (feedingNow && food.length) {
        let best = null, bd = 1e9;
        for (const p of food) { const d = (p.x - f.x) ** 2 + (p.z - f.z) ** 2 + (p.y - f.y) ** 2; if (d < bd) { bd = d; best = p; } }
        const d = Math.sqrt(bd);
        if (d < 1.8) {
          const k = 1.6 / Math.max(d, 0.02);
          ax += (best.x - f.x) * k; ay += (best.y - f.y) * k; az += (best.z - f.z) * k;
          want = Math.min(sp.max * 0.85, 0.06 + d * 0.9);
          if (d < f.scale * 0.5 && f.nibble <= 0) {
            // a nibble: each bit of food takes a few bites, then the fish darts back for a moment
            best.bites = (best.bites || 1) - 1;
            if (best.bites <= 0) { best.alive = false; if (best.onEat) best.onEat(); }
            f.nibble = r.range(1.0, 1.8);
            f.fx -= (best.x - f.x) / Math.max(d, 0.01) * 0.12; f.fz -= (best.z - f.z) / Math.max(d, 0.01) * 0.12;
          }
        }
      } else if (f.feeding > 0 && t >= f.feeding) {
        // the food is gone: scatter outwards, then back to normal schooling
        f.feeding = 0;
        const a = r.range(0, Math.PI * 2);
        f.fx += Math.cos(a) * 0.5; f.fz += Math.sin(a) * 0.5; f.fright = Math.max(f.fright, 0.45);
        if (f.school) f.school.timer = 0;
      } else if (f.school) {
        const gx = f.school.goal[0] - f.x, gz = f.school.goal[1] - f.z, gd = Math.hypot(gx, gz) || 1;
        ax += (gx / gd) * 0.16; az += (gz / gd) * 0.16;
      } else if (f.home) {
        f.wanderT -= dt;
        if (f.wanderT <= 0) {
          f.wanderT = r.range(1.5, 4.5);
          f.hover = r() < 0.4 ? r.range(0.8, 2.5) : 0;
          for (let k = 0; k < 8; k++) {
            const x = f.home[0] + r.range(-0.14, 0.14), z = f.home[1] + r.range(-0.12, 0.12);
            if (this.validFor(sp, x, z)) { f.target = [x, z]; break; }
          }
        }
        const gx = f.target[0] - f.x, gz = f.target[1] - f.z, gd = Math.hypot(gx, gz);
        if (gd > 0.01) { ax += (gx / gd) * 0.1 * Math.min(1, gd * 12); az += (gz / gd) * 0.1 * Math.min(1, gd * 12); }
        if (f.hover > 0) { f.hover -= dt; want = 0.006; }
      }
      // preferred depth, seabed and surface (and the hulls above)
      const floor = h.floorAt(f.x, f.z) + 0.02;
      const ceil = h.ceilingAt(f.x, f.z);
      const prefY = Math.max(floor + 0.02, ceil + 0.025 - f.prefDepth);
      ay += clamp((prefY - f.y) * 2.2, -0.2, 0.2);
      if (f.y < floor + 0.03) ay += (floor + 0.03 - f.y) * 10;
      if (f.y > ceil - 0.02) ay -= (f.y - ceil + 0.02) * 10;
      // walls
      const wd = h.wallDist(f.x, f.z);
      if (wd < sp.wall) {
        h.wallAway(f.x, f.z, tmp);
        const k = (1 - wd / sp.wall) * 1.6;
        ax += tmp[0] * k; az += tmp[1] * k;
        const vn = f.vx * tmp[0] + f.vz * tmp[1];
        if (vn < 0) { ax -= tmp[0] * vn * 3; az -= tmp[1] * vn * 3; }
      }
      // jellyfish: swim round them
      for (const jf of this.jellies) {
        const dx = f.x - jf.x, dy = f.y - jf.y, dz = f.z - jf.z, d = Math.hypot(dx, dy, dz);
        if (d < jf.r && d > 1e-4) { const k = (1 - d / jf.r) * 1.5 / d; ax += dx * k; ay += dy * k * 0.5; az += dz * k; }
      }
      // fright (fingers, splashes, hulls)
      ax += f.fx * 3; ay += f.fy * 3; az += f.fz * 3;
      // keep a comfortable speed
      const sp0 = Math.hypot(f.vx, f.vy, f.vz) || 1e-4;
      const top = feedingNow ? sp.max * 0.85 : f.cruise + (sp.max - f.cruise) * fright;
      want = Math.max(want, f.cruise + (top - f.cruise) * fright);
      const ks = (want - sp0) * 1.8 / sp0;
      ax += f.vx * ks; ay += f.vy * ks * 0.3; az += f.vz * ks;
      // integrate
      f.vx += ax * dt; f.vy += ay * dt; f.vz += az * dt;
      let s = Math.hypot(f.vx, f.vy, f.vz);
      const smax = Math.max(top, want) * 1.15, smin = f.home && f.hover > 0 ? 0.002 : f.cruise * 0.3;
      if (s > smax) { const k = smax / s; f.vx *= k; f.vy *= k; f.vz *= k; s = smax; }
      else if (s < smin && s > 1e-6) { const k = smin / s; f.vx *= k; f.vy *= k; f.vz *= k; s = smin; }
      const vh = Math.hypot(f.vx, f.vz);
      const vyMax = vh * 0.5 + 0.01;
      if (f.vy > vyMax) f.vy = vyMax; else if (f.vy < -vyMax) f.vy = -vyMax;
      const ox = f.x, oz = f.z;
      f.x += f.vx * dt; f.y += f.vy * dt; f.z += f.vz * dt;
      if ((h.wallDist(f.x, f.z) < 0.01 || !h.sim.isWater(f.x, f.z)) && h.wallDist(ox, oz) >= 0.01 && h.sim.isWater(ox, oz)) {
        f.x = ox; f.z = oz;
        h.wallAway(f.x, f.z, tmp);
        const vn = f.vx * tmp[0] + f.vz * tmp[1];
        if (vn < 0) { f.vx -= 2 * vn * tmp[0]; f.vz -= 2 * vn * tmp[1]; }
      }
      const fl = h.floorAt(f.x, f.z) + 0.02, ce = h.ceilingAt(f.x, f.z);
      f.y = ce < fl ? (fl + ce) / 2 : clamp(f.y, fl, ce);
      if (f.nibble > 0) f.nibble -= dt;
      // decay the fright
      f.fright *= Math.exp(-dt * 0.7);
      const kd = Math.exp(-dt * 2.2);
      f.fx *= kd; f.fy *= kd; f.fz *= kd;
      // pose: heading from the velocity, a little pitch, the body curls into turns, the tail beats with speed
      if (vh > 1e-4) {
        const yaw = Math.atan2(-f.vz, f.vx);
        const rate = wrap(yaw - f.yaw) / Math.max(dt, 1e-3);
        f.yaw = yaw;
        f.bend += (clamp(-rate * 0.16, -0.9, 0.9) - f.bend) * Math.min(1, dt * 6);
        f.roll += (clamp(-rate * 0.05, -0.3, 0.3) - f.roll) * Math.min(1, dt * 4);
      }
      f.pitch += (clamp(Math.atan2(f.vy, vh), -0.45, 0.45) * 0.8 - f.pitch) * Math.min(1, dt * 5);
      f.phase += dt * 2 * Math.PI * (0.9 + 1.0 * s / f.scale);
      if (f.phase > 1e4) f.phase -= 2 * Math.PI * 1000;
    }
    this.pack();
  }

  pack() {
    for (const k in this.writers) this.writers[k].begin();
    const q = [0, 0, 0, 1];
    for (const f of this.fish) {
      quatYPR(f.yaw, f.pitch, f.roll, q);
      this.writers[f.kind].put(f.x, f.y, f.z, f.scale, q, f.tint, 0, 1, f.phase, f.bend);
    }
    for (const k in this.writers) this.writers[k].end();
  }
}

export { SPECIES };
