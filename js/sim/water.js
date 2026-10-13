// Linear shallow-water simulation on a staggered grid: heights at cell centres, velocities on faces.
// A little surface tension (a Laplacian term in the pressure) makes short waves stiffer, so the sea quivers like jelly.
// Hulls press on the surface (a moving pressure patch), which makes real bow waves and wakes.
import { B } from '../world/layout.js';

export class WaterSim {
  constructor(N, terrain) {
    this.N = N;
    this.cell = (2 * B) / N;
    const n = N * N;
    this.h = new Float32Array(n);
    this.u = new Float32Array((N + 1) * N);   // u[j*(N+1)+i]: face between cell i-1 and i on row j
    this.v = new Float32Array(N * (N + 1));   // v[j*N+i]: face between row j-1 and j in column i
    this.foam = new Float32Array(n);
    this.foam2 = new Float32Array(n);
    this.press = new Float32Array(n);         // hull pressure this frame (submerged depth)
    this.pressPrev = new Float32Array(n);
    this.p = new Float32Array(n);
    this.solid = terrain.solid;
    this.depth = new Float32Array(n);
    this.out = new Float32Array(n * 4);
    this.setSea(0, terrain.floor);
    // rows that are all land (the quay and the town) never need simulating
    this.j0 = 0;
    for (let j = 0; j < N; j++) { let any = false; for (let i = 0; i < N; i++) if (!this.solid[j * N + i]) { any = true; break; } if (any) { this.j0 = Math.max(0, j - 1); break; } }
    this.g = 1.6;
    this.sigma = 0.0015;      // surface tension (Firmness)
    this.damping = 0.35;      // velocity damping per second (Wave damping)
    this.accel = [0, 0];      // tangential gravity from the tilt + slosh from the wobble
    this.time = 0;
    this.energy = 0;
  }

  setSea(sea, floor) {
    if (floor) this.floor = floor;
    const N = this.N;
    for (let k = 0; k < N * N; k++) this.depth[k] = this.solid[k] ? 0 : Math.max(0.02, sea - this.floor[k]);
  }

  idx(i, j) { return j * this.N + i; }

  // Height at a world xz point (bilinear).
  heightAt(x, z) {
    const N = this.N, c = this.cell;
    const gx = (x + B) / c - 0.5, gz = (z + B) / c - 0.5;
    let i0 = Math.floor(gx), j0 = Math.floor(gz);
    const fx = gx - i0, fz = gz - j0;
    const cl = (a) => (a < 0 ? 0 : a > N - 1 ? N - 1 : a);
    const i1 = cl(i0 + 1), j1 = cl(j0 + 1); i0 = cl(i0); j0 = cl(j0);
    const h = this.h;
    const a = h[j0 * N + i0], b = h[j0 * N + i1], cc = h[j1 * N + i0], d = h[j1 * N + i1];
    return (a + (b - a) * fx) + ((cc + (d - cc) * fx) - (a + (b - a) * fx)) * fz;
  }

  // Surface velocity at xz (cell-centred average), for drifting things.
  velAt(x, z) {
    const N = this.N, c = this.cell;
    const i = Math.max(0, Math.min(N - 1, Math.floor((x + B) / c)));
    const j = Math.max(0, Math.min(N - 1, Math.floor((z + B) / c)));
    return [(this.u[j * (N + 1) + i] + this.u[j * (N + 1) + i + 1]) * 0.5, (this.v[j * N + i] + this.v[(j + 1) * N + i]) * 0.5];
  }

  isWater(x, z) {
    const N = this.N, c = this.cell;
    const i = Math.floor((x + B) / c), j = Math.floor((z + B) / c);
    if (i < 0 || j < 0 || i >= N || j >= N) return false;
    return !this.solid[j * N + i];
  }

  // Push the surface down (amount > 0) or up (amount < 0) with a soft round brush.
  disturb(x, z, radius, amount) {
    const N = this.N, c = this.cell;
    const r = Math.ceil(radius / c) + 1;
    const ci = Math.floor((x + B) / c), cj = Math.floor((z + B) / c);
    for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      const i = ci + di, j = cj + dj;
      if (i < 1 || j < 1 || i >= N - 1 || j >= N - 1) continue;
      const k = j * N + i;
      if (this.solid[k]) continue;
      const px = -B + (i + 0.5) * c, pz = -B + (j + 0.5) * c;
      const d = Math.hypot(px - x, pz - z) / radius;
      if (d > 1) continue;
      const w = 0.5 + 0.5 * Math.cos(Math.PI * d);
      this.h[k] -= amount * w;
    }
  }

  addFoam(x, z, radius, amount) {
    const N = this.N, c = this.cell;
    const r = Math.ceil(radius / c);
    const ci = Math.floor((x + B) / c), cj = Math.floor((z + B) / c);
    for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      const i = ci + di, j = cj + dj;
      if (i < 0 || j < 0 || i >= N || j >= N) continue;
      const d = Math.hypot(di, dj) * c / radius;
      if (d > 1) continue;
      const k = j * N + i;
      this.foam[k] = Math.min(1.5, this.foam[k] + amount * (1 - d * d));
    }
  }

  // Hull pressure: call clearPress() then addHull() for each hull, once per frame, before step().
  clearPress() { const t = this.pressPrev; this.pressPrev = this.press; this.press = t; this.press.fill(0); }

  // An elliptical hull footprint (centre, heading, half length, half beam, draft) with a pointed bow.
  addHull(cx, cz, yaw, halfL, halfB, draft) {
    const N = this.N, c = this.cell;
    const R = Math.ceil(Math.max(halfL, halfB) / c) + 1;
    const ci = Math.floor((cx + B) / c), cj = Math.floor((cz + B) / c);
    const ca = Math.cos(yaw), sa = Math.sin(yaw);
    for (let dj = -R; dj <= R; dj++) for (let di = -R; di <= R; di++) {
      const i = ci + di, j = cj + dj;
      if (i < 0 || j < 0 || i >= N || j >= N) continue;
      const px = -B + (i + 0.5) * c - cx, pz = -B + (j + 0.5) * c - cz;
      // into hull frame: +x bow (yaw rotates local x toward -z for positive yaw, matching quat.fromYPR)
      const lx = px * ca - pz * sa, lz = px * sa + pz * ca;
      const tx = lx / halfL;
      if (tx < -1 || tx > 1) continue;
      const width = halfB * (tx > 0.45 ? Math.sqrt(Math.max(0, 1 - ((tx - 0.45) / 0.55) ** 2)) : 1 - 0.12 * Math.max(0, -tx - 0.6) / 0.4);
      const tz = Math.abs(lz) / Math.max(width, 1e-3);
      if (tz > 1) continue;
      const k = j * N + i;
      if (this.solid[k]) continue;
      this.press[k] = Math.max(this.press[k], draft * Math.sqrt(1 - tz * tz) * Math.min(1, (1 - Math.abs(tx)) * 6));
    }
  }

  step(dt) {
    const N = this.N, c = this.cell, g = this.g, sig = this.sigma;
    const h = this.h, u = this.u, v = this.v, D = this.depth, S = this.solid, P = this.p, pr = this.press, pp = this.pressPrev;
    const cdt = Math.min(dt, 1 / 30), subs = Math.max(1, Math.ceil(cdt * 120 - 1e-6)), sdt = cdt / subs;
    const inv = 1 / c, inv2 = 1 / (c * c);
    const damp = Math.exp(-this.damping * sdt);
    const ax = this.accel[0], az = this.accel[1];
    const J0 = this.j0, K0 = J0 * N;
    // foam from hulls moving: where the pressure patch grows or shrinks quickly
    for (let k = K0; k < N * N; k++) {
      const dp = Math.abs(pr[k] - pp[k]);
      if (dp > 0.0006) this.foam[k] = Math.min(1.4, this.foam[k] + dp * 55);
    }
    for (let s = 0; s < subs; s++) {
      // pressure = g * (h + hull) - sigma * laplacian(h)
      for (let j = J0; j < N; j++) for (let i = 0; i < N; i++) {
        const k = j * N + i;
        if (S[k]) { P[k] = 0; continue; }
        const hc = h[k];
        const hl = i > 0 && !S[k - 1] ? h[k - 1] : hc;
        const hr = i < N - 1 && !S[k + 1] ? h[k + 1] : hc;
        const hd = j > 0 && !S[k - N] ? h[k - N] : hc;
        const hu = j < N - 1 && !S[k + N] ? h[k + N] : hc;
        P[k] = g * (hc + pr[k] * 0.9) - sig * g * (hl + hr + hd + hu - 4 * hc) * inv2;
      }
      // velocities
      for (let j = J0; j < N; j++) {
        const row = j * (N + 1);
        u[row] = 0; u[row + N] = 0;
        for (let i = 1; i < N; i++) {
          const k = j * N + i;
          if (S[k] || S[k - 1]) { u[row + i] = 0; continue; }
          u[row + i] = (u[row + i] - sdt * ((P[k] - P[k - 1]) * inv - ax)) * damp;
        }
      }
      for (let i = 0; i < N; i++) { v[i] = 0; v[N * N + i] = 0; }
      for (let j = Math.max(1, J0); j < N; j++) for (let i = 0; i < N; i++) {
        const k = j * N + i;
        if (S[k] || S[k - N]) { v[k] = 0; continue; }
        v[k] = (v[k] - sdt * ((P[k] - P[k - N]) * inv - az)) * damp;
      }
      // heights
      for (let j = J0; j < N; j++) for (let i = 0; i < N; i++) {
        const k = j * N + i;
        if (S[k]) { h[k] = 0; continue; }
        const row = j * (N + 1);
        const dL = i > 0 ? (D[k] + D[k - 1]) * 0.5 : 0, dR = i < N - 1 ? (D[k] + D[k + 1]) * 0.5 : 0;
        const dD = j > 0 ? (D[k] + D[k - N]) * 0.5 : 0, dU = j < N - 1 ? (D[k] + D[k + N]) * 0.5 : 0;
        const div = (dR * u[row + i + 1] - dL * u[row + i]) * inv + (dU * v[(j + 1) * N + i] - dD * v[k]) * inv;
        h[k] -= sdt * div;
      }
    }
    // gentle smoothing keeps grid-scale noise down
    let energy = 0;
    for (let j = Math.max(1, J0); j < N - 1; j++) for (let i = 1; i < N - 1; i++) {
      const k = j * N + i;
      if (S[k]) continue;
      const nb = (S[k - 1] ? h[k] : h[k - 1]) + (S[k + 1] ? h[k] : h[k + 1]) + (S[k - N] ? h[k] : h[k - N]) + (S[k + N] ? h[k] : h[k + N]);
      h[k] += (nb * 0.25 - h[k]) * 0.02;
      energy += h[k] * h[k];
    }
    this.energy = energy;
    this.advectFoam(dt);
    this.time += dt;
  }

  advectFoam(dt) {
    const N = this.N, c = this.cell, f = this.foam, f2 = this.foam2, u = this.u, v = this.v, h = this.h, S = this.solid;
    const decay = Math.exp(-dt * 0.55);
    const k2 = dt / c * 1.6;
    for (let j = this.j0; j < N; j++) for (let i = 0; i < N; i++) {
      const k = j * N + i;
      if (S[k]) { f2[k] = 0; continue; }
      const uc = (u[j * (N + 1) + i] + u[j * (N + 1) + i + 1]) * 0.5;
      const vc = (v[k] + v[(j + 1) * N + i]) * 0.5;
      let x = i - uc * k2, y = j - vc * k2;
      x = x < 0 ? 0 : x > N - 1 ? N - 1 : x; y = y < 0 ? 0 : y > N - 1 ? N - 1 : y;
      const i0 = Math.floor(x), j0 = Math.floor(y), i1 = Math.min(N - 1, i0 + 1), j1 = Math.min(N - 1, j0 + 1);
      const fx = x - i0, fy = y - j0;
      const a = f[j0 * N + i0], b = f[j0 * N + i1], cc = f[j1 * N + i0], d = f[j1 * N + i1];
      let val = ((a + (b - a) * fx) * (1 - fy) + (cc + (d - cc) * fx) * fy) * decay;
      // whitecaps where a crest is sharp (a tilted but flat surface makes none)
      if (i > 0 && j > 0 && i < N - 1 && j < N - 1) {
        const hc = h[k];
        const peak = hc - 0.25 * ((S[k - 1] ? hc : h[k - 1]) + (S[k + 1] ? hc : h[k + 1]) + (S[k - N] ? hc : h[k - N]) + (S[k + N] ? hc : h[k + N]));
        if (peak > 0.0025) val += (peak - 0.0025) * 40 * dt * 60;
      }
      f2[k] = val > 1.5 ? 1.5 : val;
    }
    this.foam = f2; this.foam2 = f;
  }

  // Pack h, u, v, foam for the GPU.
  pack() {
    const N = this.N, o = this.out, h = this.h, u = this.u, v = this.v, f = this.foam;
    for (let j = this.j0; j < N; j++) for (let i = 0; i < N; i++) {
      const k = j * N + i, q = k * 4;
      o[q] = h[k];
      o[q + 1] = (u[j * (N + 1) + i] + u[j * (N + 1) + i + 1]) * 0.5;
      o[q + 2] = (v[k] + v[(j + 1) * N + i]) * 0.5;
      o[q + 3] = f[k];
    }
    return o;
  }

  reset() { this.h.fill(0); this.u.fill(0); this.v.fill(0); this.foam.fill(0); }
}
