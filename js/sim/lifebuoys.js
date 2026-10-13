// Orange-and-white lifebuoys: pick one up, throw it, it splashes down and floats flat on the waves, drifts with the
// water, bounces off the pier, quay, breakwater and the block's sides, and is shoved aside by passing hulls.
import { quat, clamp } from '../gpu/math.js';
import { B, QUAY_Z, SEA, floorHeight, breakwaterHeight, inPier, PIER } from '../world/layout.js';

const STRIDE = 48, R = 0.03;

export class Lifebuoys {
  constructor(scene, harbour, particles, opts = {}) {
    this.scene = scene; this.harbour = harbour; this.particles = particles;
    this.onSplash = opts.onSplash || null;
    const start = [[PIER.arm.x0 + 0.1, -0.05], [-0.3, 0.45], [-1.6, 1.9]];
    this.items = start.map(([x, z], i) => ({ x, y: 0, z, vx: 0, vy: 0, vz: 0, held: false, flying: false, spin: i, tilt: [0, 0] }));
    this.buf = new ArrayBuffer(8 * STRIDE);
    this.f32 = new Float32Array(this.buf); this.u8 = new Uint8Array(this.buf);
    this.entry = { template: 'lifebuoy', data: this.buf, count: 0, shadow: true };
    scene.instanceGroups.push(this.entry);
  }

  // Ray pick (block-space ray). Returns the item or null.
  pick(ray) {
    let best = null, bt = Infinity;
    for (const it of this.items) {
      const c = [it.x, it.y + 0.01, it.z];
      const o = ray.origin, d = ray.dir;
      const oc = [o[0] - c[0], o[1] - c[1], o[2] - c[2]];
      const b = oc[0] * d[0] + oc[1] * d[1] + oc[2] * d[2];
      const cc = oc[0] * oc[0] + oc[1] * oc[1] + oc[2] * oc[2] - (R * 2.2) ** 2;
      const disc = b * b - cc;
      if (disc < 0) continue;
      const t = -b - Math.sqrt(disc);
      if (t > 0 && t < bt) { bt = t; best = it; }
    }
    return best;
  }
  hold(it) { it.held = true; it.flying = false; it.trail = []; }
  // Move a held buoy to a world point (it hovers above the water while carried).
  carry(it, p) {
    it.trail.push([p[0], p[2], performance.now()]);
    if (it.trail.length > 6) it.trail.shift();
    it.x = clamp(p[0], -B + 0.05, B - 0.05); it.z = clamp(p[2], -B + 0.05, B - 0.05); it.y = Math.max(p[1], this.scene.sea + 0.18);
  }
  release(it) {
    it.held = false;
    const tr = it.trail || [];
    if (tr.length >= 2) {
      const a = tr[0], b = tr[tr.length - 1], dt = Math.max(0.016, (b[2] - a[2]) / 1000);
      it.vx = clamp((b[0] - a[0]) / dt, -3, 3) * 0.8; it.vz = clamp((b[1] - a[1]) / dt, -3, 3) * 0.8;
    } else { it.vx = 0; it.vz = 0; }
    it.vy = 0.6 + Math.min(1.2, Math.hypot(it.vx, it.vz) * 0.4);
    it.flying = true;
  }

  blocked(x, z) {
    if (Math.abs(x) > B - 0.04 || z > B - 0.04) return true;
    if (z < QUAY_Z + 0.03) return true;
    if (breakwaterHeight(x, z) > this.scene.sea - 0.02) return true;
    if (inPier(x, z, 0.03)) return true;
    return false;
  }

  update(dt) {
    const sim = this.scene.sim, sea = this.scene.sea;
    const hulls = this.harbour ? this.harbour.hulls() : [];
    for (const it of this.items) {
      it.spin += dt * (it.flying ? 6 : 0.15);
      if (it.held) continue;
      if (it.flying) {
        it.vy -= 2.6 * dt;
        let nx = it.x + it.vx * dt, nz = it.z + it.vz * dt;
        // bounce off walls, buildings (land), the breakwater and the pier while in the air
        if (Math.abs(nx) > B - 0.04) { it.vx = -it.vx * 0.6; nx = it.x; }
        if (nz > B - 0.04) { it.vz = -it.vz * 0.6; nz = it.z; }
        const groundY = nz < QUAY_Z ? 0.6 : Math.max(breakwaterHeight(nx, nz), inPier(nx, nz, 0.02) ? PIER.deckY : -9, sea + sim.heightAt(nx, nz));
        it.y += it.vy * dt;
        if (it.y <= groundY + 0.01) {
          if (this.blocked(nx, nz) || nz < QUAY_Z) {
            // bounce back toward the open water
            it.y = groundY + 0.012; it.vy = Math.abs(it.vy) * 0.45 + 0.25;
            if (nz < QUAY_Z + 0.03) it.vz = Math.abs(it.vz) * 0.6 + 0.3; else { it.vx = -it.vx * 0.5; it.vz = -it.vz * 0.5 + 0.2; }
            nx = it.x; nz = it.z;
          } else {
            it.flying = false; it.vy = 0;
            const s = Math.min(1.5, Math.hypot(it.vx, it.vz) * 0.5 + 0.6);
            sim.disturb(nx, nz, 0.06, 0.012 * s);
            sim.addFoam(nx, nz, 0.06, 0.5);
            this.particles.splash(nx, sea, nz, 14, 0.8);
            if (this.onSplash) this.onSplash(nx, nz, s);
            it.vx *= 0.35; it.vz *= 0.35;
          }
        }
        it.x = nx; it.z = nz;
        continue;
      }
      // floating: drift with the water, slow down, stay off walls and hulls
      const v = sim.velAt(it.x, it.z);
      it.vx += (v[0] * 0.9 - it.vx) * dt * 1.5;
      it.vz += (v[1] * 0.9 - it.vz) * dt * 1.5;
      // downhill on the surface slope (sloshing jelly carries them)
      const e = 0.04, hx = (sim.heightAt(it.x + e, it.z) - sim.heightAt(it.x - e, it.z)) / (2 * e), hz = (sim.heightAt(it.x, it.z + e) - sim.heightAt(it.x, it.z - e)) / (2 * e);
      it.vx -= hx * 1.2 * dt; it.vz -= hz * 1.2 * dt;
      for (const h of hulls) {
        const c = Math.cos(h.yaw), s = Math.sin(h.yaw);
        const dx = it.x - h.x, dz = it.z - h.z;
        const lx = dx * c - dz * s, lz = dx * s + dz * c;
        const ex = h.halfL + R + 0.01, ez = h.halfB + R + 0.01;
        if (Math.abs(lx) < ex && Math.abs(lz) < ez) {
          // push out sideways (in the hull's frame) and give it the hull's motion
          const push = (ez - Math.abs(lz)) * Math.sign(lz || 1);
          const wx = s * push, wz = c * push;
          it.x += wx * 0.5; it.z += wz * 0.5;
          it.vx += wx * 4; it.vz += wz * 4;
        }
      }
      let nx = it.x + it.vx * dt, nz = it.z + it.vz * dt;
      if (this.blocked(nx, it.z)) { it.vx = -it.vx * 0.5; nx = it.x; }
      if (this.blocked(it.x, nz)) { it.vz = -it.vz * 0.5; nz = it.z; }
      if (this.blocked(nx, nz)) { nx = it.x; nz = it.z; }
      it.x = nx; it.z = nz;
      it.y = sea + sim.heightAt(it.x, it.z) - 0.004;
      it.tilt = [clamp(-hz * 0.8, -0.3, 0.3), clamp(hx * 0.8, -0.3, 0.3)];
    }
    this.pack();
  }

  pack() {
    const f = this.f32, u = this.u8;
    let n = 0;
    for (const it of this.items) {
      const o = n * 12, b = n * STRIDE;
      const q = it.flying || it.held ? quat.mul(quat.axisAngle([1, 0, 0], Math.sin(it.spin) * 0.6), quat.axisAngle([0, 1, 0], it.spin))
        : quat.mul(quat.mul(quat.axisAngle([1, 0, 0], it.tilt[0]), quat.axisAngle([0, 0, 1], it.tilt[1])), quat.axisAngle([0, 1, 0], it.spin));
      f[o] = it.x; f[o + 1] = it.y; f[o + 2] = it.z; f[o + 3] = 1;
      f[o + 4] = q[0]; f[o + 5] = q[1]; f[o + 6] = q[2]; f[o + 7] = q[3];
      u[b + 32] = 255; u[b + 33] = 255; u[b + 34] = 255; u[b + 35] = 255;
      u[b + 36] = 0; u[b + 37] = 0; u[b + 38] = 0; u[b + 39] = 0;
      f[o + 10] = 0; f[o + 11] = 0;
      n++;
    }
    this.entry.count = n;
  }
}

export { SEA, floorHeight };
