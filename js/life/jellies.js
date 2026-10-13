// Moon jellyfish: glassy pale bells (the four pink horseshoes are drawn by the glassy shader), frilly oral arms and a
// fringe of fine tentacles. They drift with the water, pulse, and keep to mid-water away from hulls and walls.
// Template: bell radius 1 (rim at y = 0, apex at y = 0.45); flex 0 on the bell rising to 1 at the arm and tentacle tips.
// Kind 3: anim.x = pulse phase, anim.y = sway seed.
import { MeshBuilder, MAT } from '../gpu/mesh.js';
import { InstanceWriter, Shape, qmul, clamp } from './habitat.js';

const BELL = 0xd9eaf1, ARM = 0xf0d2de, ARM_EDGE = 0xe7b3c8, TENT = 0xe6eef1;
const TWO_PI = Math.PI * 2;

export function jellyTemplate(rand) {
  const mb = new MeshBuilder();
  // the bell, a flattened saucer with a slightly turned-in margin
  mb.lathe(0, 0, [[0.95, -0.07], [1.0, -0.012], [0.975, 0.10], [0.87, 0.23], [0.69, 0.34], [0.43, 0.42], [0.0, 0.45]],
    { seg: 20, color: BELL, param: 0, mat: MAT.PAINT });
  const s = new Shape();
  // four frilly oral arms: V-section ribbons with wavy edges, curling gently as they hang
  for (let a = 0; a < 4; a++) {
    const phi0 = (a + 0.5) * (Math.PI / 2);
    const rows = [];
    const n = 10;
    for (let j = 0; j <= n; j++) {
      const t = j / n;
      const phi = phi0 + 0.5 * t;
      const rr = 0.08 + 0.2 * t, y = 0.03 - 0.78 * t;
      const cx = Math.cos(phi) * rr, cz = Math.sin(phi) * rr;
      const tx = -Math.sin(phi), tz = Math.cos(phi);             // across the arm
      const ox = Math.cos(phi), oz = Math.sin(phi);              // outward
      const w = (0.07 + 0.11 * Math.sin(Math.PI * Math.min(1, t * 1.15))) * (1 - 0.5 * t * t);
      // ruffled edges: the two lips of the arm flutter in and out of step
      const r1 = 0.075 * Math.sin(t * 19 + a) * Math.min(1, t * 3), r2 = 0.075 * Math.sin(t * 19 + a + 2.2) * Math.min(1, t * 3);
      const f = 0.12 + 0.88 * t;
      rows.push([
        s.vert([cx - tx * w + ox * r1, y + 0.03 * Math.sin(t * 17 + a), cz - tz * w + oz * r1], ARM_EDGE, f, MAT.PAINT),
        s.vert([cx - ox * 0.06 * (1 - 0.5 * t), y, cz - oz * 0.06 * (1 - 0.5 * t)], ARM, f, MAT.PAINT),
        s.vert([cx + tx * w + ox * r2, y + 0.03 * Math.cos(t * 15 + a), cz + tz * w + oz * r2], ARM_EDGE, f, MAT.PAINT),
      ]);
    }
    for (let j = 0; j < n; j++) for (let k = 0; k < 2; k++) {
      const p = rows[j][k], q = rows[j][k + 1], r = rows[j + 1][k], u = rows[j + 1][k + 1];
      s.tri(p, r, u); s.tri(p, u, q);
    }
  }
  // the fringe: fine tentacles round the margin
  const NT = 36;
  for (let i = 0; i < NT; i++) {
    const th = (i / NT) * TWO_PI + rand.range(-0.04, 0.04);
    const len = rand.range(0.28, 0.42);
    const c = Math.cos(th), sn = Math.sin(th);
    const pts = [[0.955, -0.05], [0.99, -0.05 - len * 0.35], [1.0, -0.05 - len * 0.7], [0.98, -0.05 - len]];
    const rings = pts.map(([r, y], j) => {
      const rad = 0.02 * (1 - j * 0.22);
      const f = 0.06 + 0.94 * (j / 3);
      const ids = [];
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * TWO_PI;
        // a small triangle section in the plane across the tentacle (radial + tangential)
        const dr = Math.cos(a) * rad, dt = Math.sin(a) * rad;
        ids.push(s.vert([c * (r + dr) - sn * dt, y, sn * (r + dr) + c * dt], TENT, f, MAT.PAINT));
      }
      return ids;
    });
    for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) {
      const a = rings[j][k], b = rings[j][(k + 1) % 3], cc = rings[j + 1][k], d = rings[j + 1][(k + 1) % 3];
      s.tri(a, cc, d); s.tri(a, d, b);
    }
  }
  s.emit(mb);
  return { name: 'life-jelly', mesh: mb.finish(), tris: mb.triangles };
}

export class Jellies {
  constructor(scene, hab, rand, count = 7) {
    this.scene = scene;
    this.hab = hab;
    this.rand = rand;
    this.writer = new InstanceWriter(scene, 'life-jelly', 12, false);
    this.list = [];
    this.tmp = [0, 0];
    // spread them over the basin, a couple in the fishing harbour, none where the hulls are
    const zones = [[-2.1, -0.6, 0.2, 1.3], [-0.6, 0.8, 0.3, 1.5], [-1.8, 0.0, 1.4, 2.3], [0.0, 1.6, 1.5, 2.3], [1.0, 2.3, -0.5, 0.3], [-2.2, -1.2, -0.1, 0.6], [0.6, 2.2, 1.4, 2.3]];
    for (let i = 0; i < count; i++) {
      const [x0, x1, z0, z1] = zones[i % zones.length];
      let x = (x0 + x1) / 2, z = (z0 + z1) / 2;
      for (let k = 0; k < 40; k++) {
        const tx = rand.range(x0, x1), tz = rand.range(z0, z1);
        if (this.roomy(tx, tz, 0.2)) { x = tx; z = tz; break; }
      }
      const r = rand.range(0.028, 0.036);
      const surf = hab.surfaceAt(x, z), fl = hab.floorAt(x, z);
      const y = clamp(surf - rand.range(0.08, 0.16), fl + 0.06 + r * 1.1, surf - 0.06);
      this.list.push({ x, y, z, vx: 0, vy: 0, vz: 0, r, phase: rand.range(0, TWO_PI), rate: rand.range(3.6, 4.6), seed: rand.range(0, TWO_PI),
        spin: rand.range(0, TWO_PI), spinRate: rand.range(-0.12, 0.12), wx: 0, wz: 0, wanderT: 0, depth: surf - y, tilt: [0, 0] });
    }
  }

  roomy(x, z, clear) {
    const h = this.hab;
    if (!h.open(x, z, clear)) return false;
    if (h.surfaceAt(x, z) - h.floorAt(x, z) < 0.22) return false;
    for (const hu of h.hulls) if (h.hullAway(hu, x, z, this.tmp) < 0.15) return false;
    return true;
  }

  push(x, z, radius, strength) {
    for (const j of this.list) {
      const dx = j.x - x, dz = j.z - z, d = Math.hypot(dx, dz);
      if (d > radius || d < 1e-4) continue;
      const k = strength * (1 - d / radius) * 0.04;
      j.vx += (dx / d) * k; j.vz += (dz / d) * k;
    }
  }

  // Obstacles for the fish: a sphere round each bell and its arms.
  obstacles(out) {
    out.length = 0;
    for (const j of this.list) out.push({ x: j.x, y: j.y - j.r * 0.25, z: j.z, r: j.r * 1.3 + 0.025 });
    return out;
  }

  update(dt) {
    const h = this.hab, sim = this.scene.sim, r = this.rand, tmp = this.tmp;
    for (const j of this.list) {
      // a slow wander, carried along by the water
      j.wanderT -= dt;
      if (j.wanderT <= 0) { const a = r.range(0, TWO_PI); j.wx = Math.cos(a) * 0.007; j.wz = Math.sin(a) * 0.007; j.wanderT = r.range(4, 9); }
      const [u, w] = sim.velAt(j.x, j.z);
      let ax = (u * 0.45 + j.wx - j.vx) * 0.8, az = (w * 0.45 + j.wz - j.vz) * 0.8;
      // walls and hulls
      const wd = h.wallDist(j.x, j.z);
      if (wd < 0.2) { h.wallAway(j.x, j.z, tmp); const k = (0.2 - wd) * 0.6; ax += tmp[0] * k; az += tmp[1] * k; }
      let ceilY = h.surfaceAt(j.x, j.z) - 0.055;
      for (const hu of h.hulls) {
        const d = h.hullAway(hu, j.x, j.z, tmp);
        if (d < 0.16) {
          const k = (0.16 - d) * (0.6 + hu.speed * 6);
          ax += tmp[0] * k; az += tmp[1] * k;
          if (d < 0.05) ceilY = Math.min(ceilY, this.scene.sea - hu.draft - 0.05);
        }
      }
      // pulse: each squeeze lifts the bell a little, then it sinks slowly while it relaxes
      j.phase += dt * j.rate;
      const squeeze = Math.max(0, Math.cos(j.phase));
      let ay = squeeze * 0.022 - 0.006;
      // stay mid-water, near its chosen depth
      const surf = h.surfaceAt(j.x, j.z), floorY = h.floorAt(j.x, j.z) + 0.07 + j.r * 0.9;
      const target = clamp(surf - j.depth, floorY + 0.02, ceilY - 0.02);
      ay += (target - j.y) * 0.25;
      if (j.y > ceilY) ay -= (j.y - ceilY) * 3;
      if (j.y < floorY) ay += (floorY - j.y) * 3;
      j.vx += ax * dt; j.vz += az * dt; j.vy += ay * dt;
      j.vy *= Math.exp(-dt * 1.6);
      const sp = Math.hypot(j.vx, j.vz);
      if (sp > 0.05) { j.vx *= 0.05 / sp; j.vz *= 0.05 / sp; }
      const ox = j.x, oz = j.z;
      j.x += j.vx * dt; j.y += j.vy * dt; j.z += j.vz * dt;
      if (h.wallDist(j.x, j.z) < 0.06 || !sim.isWater(j.x, j.z)) { j.x = ox; j.z = oz; j.vx *= -0.3; j.vz *= -0.3; }
      j.y = clamp(j.y, Math.min(floorY, ceilY), Math.max(ceilY, floorY));
      j.spin += j.spinRate * dt;
      // lean a little into the drift
      j.tilt[0] += (clamp(j.vx * 6, -0.25, 0.25) - j.tilt[0]) * Math.min(1, dt * 1.5);
      j.tilt[1] += (clamp(j.vz * 6, -0.25, 0.25) - j.tilt[1]) * Math.min(1, dt * 1.5);
    }
    this.pack();
  }

  pack() {
    const w = this.writer;
    w.begin();
    for (const j of this.list) w.put(j.x, j.y, j.z, j.r, jellyQuat(j.tilt[0], j.tilt[1], j.spin), TINT, 0, 3, j.phase, j.seed);
    w.end();
  }
}
const TINT = [255, 255, 255, 255];

// Bell leaning toward (tx, tz) by their size (radians), spun about its own axis.
export function jellyQuat(tx, tz, spin) {
  const a = Math.hypot(tx, tz);
  const qs = [0, Math.sin(spin / 2), 0, Math.cos(spin / 2)];
  if (a < 1e-5) return qs;
  // axis = up x lean direction = (tz, 0, -tx) / a
  const s = Math.sin(a / 2) / a;
  return qmul([tz * s, 0, -tx * s, Math.cos(a / 2)], qs);
}
