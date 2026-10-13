// Smooth paths in the xz plane, sampled by arc length. Built from Hermite segments (point + heading) and circular arcs.

export class Path {
  constructor() { this.pts = []; this.len = [0]; }

  add(x, z) {
    const p = this.pts;
    if (p.length) {
      const [px, pz] = p[p.length - 1];
      const d = Math.hypot(x - px, z - pz);
      if (d < 1e-5) return this;
      this.len.push(this.len[this.len.length - 1] + d);
    }
    p.push([x, z]);
    return this;
  }

  // Cubic Hermite from (x0,z0) heading h0 to (x1,z1) heading h1 (headings are yaw: direction (cos, -sin)).
  hermite(x0, z0, h0, x1, z1, h1, tension = 1, n = 40) {
    const d = Math.hypot(x1 - x0, z1 - z0) * tension;
    const t0 = [Math.cos(h0) * d, -Math.sin(h0) * d], t1 = [Math.cos(h1) * d, -Math.sin(h1) * d];
    for (let i = this.pts.length ? 1 : 0; i <= n; i++) {
      const t = i / n, t2 = t * t, t3 = t2 * t;
      const a = 2 * t3 - 3 * t2 + 1, b = t3 - 2 * t2 + t, c = -2 * t3 + 3 * t2, e = t3 - t2;
      this.add(a * x0 + b * t0[0] + c * x1 + e * t1[0], a * z0 + b * t0[1] + c * z1 + e * t1[1]);
    }
    return this;
  }

  // Circular arc around (cx, cz) radius r, parameter phi with point (cx + r sin phi, cz - r cos phi).
  arc(cx, cz, r, phi0, phi1, step = 0.04) {
    const n = Math.max(2, Math.ceil(Math.abs(phi1 - phi0) / step));
    for (let i = 0; i <= n; i++) {
      const f = phi0 + (phi1 - phi0) * (i / n);
      this.add(cx + r * Math.sin(f), cz - r * Math.cos(f));
    }
    return this;
  }

  line(x, z, n = 10) {
    const [x0, z0] = this.pts[this.pts.length - 1];
    for (let i = 1; i <= n; i++) this.add(x0 + (x - x0) * (i / n), z0 + (z - z0) * (i / n));
    return this;
  }

  get length() { return this.len[this.len.length - 1]; }

  // Position and heading (yaw) at arc length s.
  at(s) {
    const L = this.len, p = this.pts;
    if (p.length < 2) return { x: p[0][0], z: p[0][1], yaw: 0 };
    s = Math.max(0, Math.min(this.length, s));
    let lo = 0, hi = L.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (L[m] <= s) lo = m; else hi = m; }
    const seg = L[hi] - L[lo] || 1e-6, t = (s - L[lo]) / seg;
    const a = p[lo], b = p[hi];
    // heading: blend neighbouring segment directions for smoothness
    const dir = (i) => { const j = Math.max(0, Math.min(p.length - 2, i)); return [p[j + 1][0] - p[j][0], p[j + 1][1] - p[j][1]]; };
    const d0 = dir(lo - 1), d1 = dir(lo), d2 = dir(lo + 1);
    const w = t;
    const dx = (d0[0] + d1[0]) * (1 - w) + (d1[0] + d2[0]) * w, dz = (d0[1] + d1[1]) * (1 - w) + (d1[1] + d2[1]) * w;
    return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, yaw: Math.atan2(-dz, dx) };
  }
}

// Smooth speed profile over a path of length L: accelerate over acc, cruise at v, decelerate over dec.
export function profileTime(L, v, acc, dec) {
  return L / v + (acc + dec) / (2 * v);
}
