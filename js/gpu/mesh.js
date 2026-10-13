// MeshBuilder: the one way every model in the harbour is made.
// Each vertex is 32 bytes: position f32x3, normal f32x3, colour unorm8x4 (sRGB rgb + a = param), info uint8x4 (mat, obj, flags, 0).
// See ENGINE.md for the material list and the object ids.

export const MAT = {
  PAINT: 0,      // matte paint
  GLASS: 1,      // windows, lantern glass: dark tinted with a sharp studio reflection
  STEEL: 2,      // gloss steel / painted metal with a strong highlight
  TILES: 3,      // clay roof tiles: rows of little bumps along the slope
  TIMBER: 4,     // planks with grain (grain runs along the longest local axis of the face)
  CORRUGATED: 5, // corrugated sheet: normal-perturbed ribs
  MASONRY: 6,    // dressed stone blocks with mortar lines
  RUBBER: 7,     // black rubber, soft sheen
  ROCK: 8,       // rough rock, noisy shade
  LAMP: 9,       // glowing lamp (emissive, param = strength)
  WEED: 10,      // swaying weed (param = sway weight, 0 at the root, 1 at the tip)
  HULL: 11,      // ship hull: paint colour above the boot-top, antifouling red below (object-space y < 0)
  GRASS: 12,     // grass with soft mottling
  ASPHALT: 13,   // dark asphalt with fine grain
  SAND: 14,      // pale sand with ripples
  CONCRETE: 15,  // concrete with panel joints
  COBBLES: 16,   // cobble setts
  STRATA: 17,    // soil cut face: vertex colour is the band colour, gets grain and soft band edges
  SLATE: 18,     // slate roof: blue-grey courses
  LEAF: 19,      // tree foliage (param = sway weight)
  MUSSEL: 20,    // dark blue-black bumpy crust
  CANVAS: 21,    // furled sail / tarpaulin
  BRICK: 22,     // painted timber cladding (horizontal boards) for houses
  SKIN: 23,      // reserved
};

const STRIDE = 32;

function toRGB(c) {
  if (typeof c === 'number') return [(c >> 16) & 255, (c >> 8) & 255, c & 255];
  if (Array.isArray(c)) return c[0] > 1 || c[1] > 1 || c[2] > 1 ? c : c.map(x => Math.round(x * 255));
  return [255, 0, 255];
}

export function hex(c) { return toRGB(c); }

// Mix two colours (hex numbers) by t, returns a hex number.
export function mixHex(a, b, t) {
  const A = toRGB(a), B = toRGB(b);
  return (Math.round(A[0] + (B[0] - A[0]) * t) << 16) | (Math.round(A[1] + (B[1] - A[1]) * t) << 8) | Math.round(A[2] + (B[2] - A[2]) * t);
}

// 3x4 affine matrices stored as [m00 m01 m02 tx, m10 m11 m12 ty, m20 m21 m22 tz] (row-major rows).
const I34 = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];
function mul34(a, b) {
  const o = new Array(12);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) o[r * 4 + c] = a[r * 4] * b[c] + a[r * 4 + 1] * b[4 + c] + a[r * 4 + 2] * b[8 + c];
    o[r * 4 + 3] = a[r * 4] * b[3] + a[r * 4 + 1] * b[7] + a[r * 4 + 2] * b[11] + a[r * 4 + 3];
  }
  return o;
}

export class MeshBuilder {
  constructor() {
    this.cap = 1 << 16;
    this.buf = new ArrayBuffer(this.cap * STRIDE);
    this.f32 = new Float32Array(this.buf);
    this.u8 = new Uint8Array(this.buf);
    this.nv = 0;
    this.idx = [];
    this.m = I34();
    this.stack = [];
    this.color = 0xcccccc;
    this.mat = MAT.PAINT;
    this.obj = 0;
    this.param = 0;
    this.flags = 0;
  }

  // ---- state -------------------------------------------------------------------------------
  set(o) { for (const k in o) this[k] = o[k]; return this; }
  push() { this.stack.push({ m: this.m.slice(), color: this.color, mat: this.mat, obj: this.obj, param: this.param, flags: this.flags }); return this; }
  pop() { const s = this.stack.pop(); Object.assign(this, s); return this; }
  translate(x, y, z) { this.m = mul34(this.m, [1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, z]); return this; }
  rotateY(a) { const c = Math.cos(a), s = Math.sin(a); this.m = mul34(this.m, [c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0]); return this; }
  rotateX(a) { const c = Math.cos(a), s = Math.sin(a); this.m = mul34(this.m, [1, 0, 0, 0, 0, c, -s, 0, 0, s, c, 0]); return this; }
  rotateZ(a) { const c = Math.cos(a), s = Math.sin(a); this.m = mul34(this.m, [c, -s, 0, 0, s, c, 0, 0, 0, 0, 1, 0]); return this; }
  scale(x, y = x, z = x) { this.m = mul34(this.m, [x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0]); return this; }

  xp(p) { const m = this.m; return [m[0] * p[0] + m[1] * p[1] + m[2] * p[2] + m[3], m[4] * p[0] + m[5] * p[1] + m[6] * p[2] + m[7], m[8] * p[0] + m[9] * p[1] + m[10] * p[2] + m[11]]; }
  xn(n) {
    // Normal transform: fine for rotations and uniform-ish scales; renormalised.
    const m = this.m;
    // inverse-transpose of the 3x3 via cofactors
    const a = m[0], b = m[1], c = m[2], d = m[4], e = m[5], f = m[6], g = m[8], h = m[9], i = m[10];
    const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
    const D = -(b * i - c * h), E = a * i - c * g, F = -(a * h - b * g);
    const G = b * f - c * e, H = -(a * f - c * d), K = a * e - b * d;
    const x = A * n[0] + D * n[1] + G * n[2], y = B * n[0] + E * n[1] + H * n[2], z = C * n[0] + F * n[1] + K * n[2];
    const l = Math.hypot(x, y, z) || 1;
    return [x / l, y / l, z / l];
  }

  // ---- raw vertices ------------------------------------------------------------------------
  grow() {
    this.cap *= 2;
    const nb = new ArrayBuffer(this.cap * STRIDE);
    new Uint8Array(nb).set(this.u8);
    this.buf = nb; this.f32 = new Float32Array(nb); this.u8 = new Uint8Array(nb);
  }

  // Add a vertex in local (current transform) space. Options override the current state for this vertex.
  vert(p, n, o) {
    if (this.nv >= this.cap) this.grow();
    const P = this.xp(p), N = this.xn(n);
    const i = this.nv++, f = i * 8, b = i * STRIDE;
    this.f32[f] = P[0]; this.f32[f + 1] = P[1]; this.f32[f + 2] = P[2];
    this.f32[f + 3] = N[0]; this.f32[f + 4] = N[1]; this.f32[f + 5] = N[2];
    const col = toRGB(o && o.color !== undefined ? o.color : this.color);
    const param = o && o.param !== undefined ? o.param : this.param;
    this.u8[b + 24] = col[0]; this.u8[b + 25] = col[1]; this.u8[b + 26] = col[2];
    this.u8[b + 27] = Math.max(0, Math.min(255, Math.round(param * 255)));
    this.u8[b + 28] = o && o.mat !== undefined ? o.mat : this.mat;
    this.u8[b + 29] = o && o.obj !== undefined ? o.obj : this.obj;
    this.u8[b + 30] = o && o.flags !== undefined ? o.flags : this.flags;
    this.u8[b + 31] = 0;
    return i;
  }

  // Add a vertex already in world space (no transform), used by cables.
  vertWorld(P, N, o) {
    const m = this.m; this.m = I34();
    const i = this.vert(P, N, o);
    this.m = m;
    return i;
  }

  tri(a, b, c) { this.idx.push(a, b, c); }

  // Flat polygon (convex, counter-clockwise when seen from the front). Normal from the first three points.
  poly(pts, o) {
    const n = faceNormal(pts);
    const base = this.nv;
    for (const p of pts) this.vert(p, n, o);
    for (let k = 1; k < pts.length - 1; k++) this.tri(base, base + k, base + k + 1);
    return this;
  }
  quad(a, b, c, d, o) { return this.poly([a, b, c, d], o); }

  // ---- primitives --------------------------------------------------------------------------
  // Axis-aligned box from min to max corner (local space). o.skip: list of faces to leave out ('top','bottom','px','nx','pz','nz').
  boxMM(x0, y0, z0, x1, y1, z1, o) {
    const skip = o && o.skip;
    const s = f => !(skip && skip.includes(f));
    if (s('top')) this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], o);
    if (s('bottom')) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], o);
    if (s('pz')) this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], o);
    if (s('nz')) this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], o);
    if (s('px')) this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], o);
    if (s('nx')) this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], o);
    return this;
  }
  // Box by centre of its base (cx, y0, cz) and full size.
  box(cx, y0, cz, sx, sy, sz, o) { return this.boxMM(cx - sx / 2, y0, cz - sz / 2, cx + sx / 2, y0 + sy, cz + sz / 2, o); }

  // Cylinder / frustum along +y from (x, y0, z). o.r2 top radius, o.caps (default true), o.seg.
  cylinder(x, y0, z, r, h, o = {}) {
    const seg = o.seg || 12, r2 = o.r2 !== undefined ? o.r2 : r;
    const base = this.nv;
    const slope = (r - r2) / h;
    for (let k = 0; k <= seg; k++) {
      const a = (k / seg) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      const n = norm3([c, slope, s]);
      this.vert([x + c * r, y0, z + s * r], n, o);
      this.vert([x + c * r2, y0 + h, z + s * r2], n, o);
    }
    for (let k = 0; k < seg; k++) {
      const a = base + k * 2;
      this.tri(a, a + 1, a + 3); this.tri(a, a + 3, a + 2);
    }
    if (o.caps !== false) {
      const top = [], bot = [];
      for (let k = seg - 1; k >= 0; k--) { const a = (k / seg) * Math.PI * 2; top.push([x + Math.cos(a) * r2, y0 + h, z + Math.sin(a) * r2]); }
      for (let k = 0; k < seg; k++) { const a = (k / seg) * Math.PI * 2; bot.push([x + Math.cos(a) * r, y0, z + Math.sin(a) * r]); }
      if (r2 > 0) this.poly(top, o);
      if (o.bottom !== false && r > 0) this.poly(bot, o);
    }
    return this;
  }

  // Lathe: profile is [[radius, y], ...] from bottom to top, revolved around the local y axis at (x, z).
  lathe(x, z, profile, o = {}) {
    const seg = o.seg || 16, base = this.nv, n = profile.length;
    for (let k = 0; k <= seg; k++) {
      const a = (k / seg) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      for (let j = 0; j < n; j++) {
        const [r, y] = profile[j];
        const p0 = profile[Math.max(0, j - 1)], p1 = profile[Math.min(n - 1, j + 1)];
        const dr = p1[0] - p0[0], dy = p1[1] - p0[1];
        const nn = norm3([c * dy, -dr, s * dy]);
        this.vert([x + c * r, y, z + s * r], nn, o);
      }
    }
    for (let k = 0; k < seg; k++) for (let j = 0; j < n - 1; j++) {
      const a = base + k * n + j, b = a + n;
      this.tri(a, a + 1, b + 1); this.tri(a, b + 1, b);
    }
    return this;
  }

  sphere(x, y, z, r, o = {}) {
    const seg = o.seg || 10, rings = o.rings || Math.max(4, Math.round(seg / 2));
    const prof = [];
    for (let j = 0; j <= rings; j++) { const t = -Math.PI / 2 + (j / rings) * Math.PI; prof.push([Math.cos(t) * r * (o.sx || 1), y + Math.sin(t) * r * (o.sy || 1)]); }
    return this.lathe(x, z, prof, { ...o, seg });
  }

  // A beam (box section w by h) from point a to point b in local space. o.up picks the section orientation.
  beam(a, b, w, h = w, o = {}) {
    const d = sub3(b, a), L = len3(d);
    if (L < 1e-6) return this;
    const fwd = scale3(d, 1 / L);
    let up = o.up || (Math.abs(fwd[1]) > 0.95 ? [1, 0, 0] : [0, 1, 0]);
    const side = norm3(cross3(fwd, up));
    up = cross3(side, fwd);
    const hw = w / 2, hh = h / 2;
    const corner = (p, sx, sy) => [p[0] + side[0] * sx + up[0] * sy, p[1] + side[1] * sx + up[1] * sy, p[2] + side[2] * sx + up[2] * sy];
    const A = [corner(a, -hw, -hh), corner(a, hw, -hh), corner(a, hw, hh), corner(a, -hw, hh)];
    const B = [corner(b, -hw, -hh), corner(b, hw, -hh), corner(b, hw, hh), corner(b, -hw, hh)];
    for (let k = 0; k < 4; k++) {
      const k2 = (k + 1) % 4;
      this.quad(A[k], A[k2], B[k2], B[k], o);
    }
    if (o.caps !== false) { this.quad(A[3], A[2], A[1], A[0], o); this.quad(B[0], B[1], B[2], B[3], o); }
    return this;
  }

  // Round tube along a polyline (rails, ropes, chains, handrails). Smooth normals.
  tube(points, r, o = {}) {
    const seg = o.seg || 6, base = this.nv, n = points.length;
    for (let j = 0; j < n; j++) {
      const p = points[j];
      const t = norm3(sub3(points[Math.min(n - 1, j + 1)], points[Math.max(0, j - 1)]));
      let up = Math.abs(t[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
      const s = norm3(cross3(t, up)); up = cross3(s, t);
      for (let k = 0; k <= seg; k++) {
        const a = (k / seg) * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a);
        const nn = [s[0] * c + up[0] * sn, s[1] * c + up[1] * sn, s[2] * c + up[2] * sn];
        this.vert([p[0] + nn[0] * r, p[1] + nn[1] * r, p[2] + nn[2] * r], nn, o);
      }
    }
    for (let j = 0; j < n - 1; j++) for (let k = 0; k < seg; k++) {
      const a = base + j * (seg + 1) + k, b = a + seg + 1;
      this.tri(a, b, b + 1); this.tri(a, b + 1, a + 1);
    }
    return this;
  }

  // Extrude a polygon given in the local xz plane (counter-clockwise seen from above) from y0 to y1.
  prism(pts, y0, y1, o = {}) {
    const n = pts.length;
    if (o.top !== false) this.polyFan(pts.map(p => [p[0], y1, p[1]]), o);
    if (o.bottom) this.polyFan(pts.slice().reverse().map(p => [p[0], y0, p[1]]), o);
    for (let k = 0; k < n; k++) {
      const a = pts[k], b = pts[(k + 1) % n];
      this.quad([b[0], y0, b[1]], [a[0], y0, a[1]], [a[0], y1, a[1]], [b[0], y1, b[1]], o);
    }
    return this;
  }

  // Simple polygon (may be concave) triangulated by ear clipping; pts in 3D, all on one plane.
  polyFan(pts, o) {
    const n = faceNormal(pts);
    const base = this.nv;
    for (const p of pts) this.vert(p, n, o);
    const ids = earclip(pts, n);
    for (let k = 0; k < ids.length; k += 3) this.tri(base + ids[k], base + ids[k + 1], base + ids[k + 2]);
    return this;
  }

  // Gabled roof: ridge along local x, footprint w (x) by d (z), eaves at y0, ridge at y0 + h, overhang ov.
  gable(cx, y0, cz, w, d, h, o = {}) {
    const ov = o.overhang !== undefined ? o.overhang : 0.012;
    const x0 = cx - w / 2 - ov, x1 = cx + w / 2 + ov, z0 = cz - d / 2 - ov, z1 = cz + d / 2 + ov;
    const yr = y0 + h, th = o.thick !== undefined ? o.thick : 0.006;
    // two slopes
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, yr, cz], [x0, yr, cz], o);
    this.quad([x1, y0, z0], [x0, y0, z0], [x0, yr, cz], [x1, yr, cz], o);
    // thickness strip along eaves and verges
    if (th > 0) {
      this.quad([x0, y0 - th, z1], [x1, y0 - th, z1], [x1, y0, z1], [x0, y0, z1], o);
      this.quad([x1, y0 - th, z0], [x0, y0 - th, z0], [x0, y0, z0], [x1, y0, z0], o);
    }
    // gable ends (wall colour if given)
    const wall = o.wallColor !== undefined ? { ...o, color: o.wallColor, mat: o.wallMat !== undefined ? o.wallMat : MAT.PAINT } : o;
    const gx0 = cx - w / 2, gx1 = cx + w / 2, gz0 = cz - d / 2, gz1 = cz + d / 2;
    this.poly([[gx1, y0, gz1], [gx1, y0, gz0], [gx1, yr, cz]], wall);
    this.poly([[gx0, y0, gz0], [gx0, y0, gz1], [gx0, yr, cz]], wall);
    return this;
  }

  // Loft through rings of points (each ring the same count, ordered consistently). Smooth normals. Ends capped if o.caps.
  loft(rings, o = {}) {
    const n = rings[0].length, base = this.nv, R = rings.length;
    for (let j = 0; j < R; j++) {
      for (let k = 0; k < n; k++) {
        const p = rings[j][k];
        const pn = rings[j][(k + 1) % n], pp = rings[j][(k - 1 + n) % n];
        const rn = rings[Math.min(R - 1, j + 1)][k], rp = rings[Math.max(0, j - 1)][k];
        const nn = norm3(cross3(sub3(rn, rp), sub3(pn, pp)));
        this.vert(p, o.flip ? scale3(nn, -1) : nn, o);
      }
    }
    for (let j = 0; j < R - 1; j++) for (let k = 0; k < n; k++) {
      const a = base + j * n + k, b = base + j * n + ((k + 1) % n), c = a + n, d = b + n;
      if (o.flip) { this.tri(a, b, d); this.tri(a, d, c); } else { this.tri(a, d, b); this.tri(a, c, d); }
    }
    if (o.caps) {
      this.polyFan(rings[0].slice(), o);
      this.polyFan(rings[R - 1].slice().reverse(), o);
    }
    return this;
  }

  // A cable from point a (in object objA's local frame) to point b (in objB's frame). It stretches as the objects move.
  // Drawn as a thin 4-sided prism; ends get their own object ids. Points are given in each object's local frame.
  cable(a, objA, b, objB, r = 0.003, o = {}) {
    const side = [r, 0, 0], side2 = [0, 0, r];
    const base = this.nv;
    const ring = [[side[0], 0, 0], [0, 0, side2[2]], [-side[0], 0, 0], [0, 0, -side2[2]]];
    const nrm = [[1, 0, 0], [0, 0, 1], [-1, 0, 0], [0, 0, -1]];
    for (let k = 0; k < 4; k++) {
      this.vertWorld([a[0] + ring[k][0], a[1], a[2] + ring[k][2]], nrm[k], { ...o, obj: objA });
      this.vertWorld([b[0] + ring[k][0], b[1], b[2] + ring[k][2]], nrm[k], { ...o, obj: objB });
    }
    for (let k = 0; k < 4; k++) {
      const k2 = (k + 1) % 4;
      const a0 = base + k * 2, a1 = base + k2 * 2;
      this.tri(a0, a1, a1 + 1); this.tri(a0, a1 + 1, a0 + 1);
    }
    return this;
  }

  // Append another builder's output (already in its own world space).
  append(other) {
    while (this.nv + other.nv > this.cap) this.grow();
    this.u8.set(other.u8.subarray(0, other.nv * STRIDE), this.nv * STRIDE);
    const off = this.nv;
    for (const i of other.idx) this.idx.push(i + off);
    this.nv += other.nv;
    return this;
  }

  // Final arrays for upload.
  finish() {
    return { vertices: new Uint8Array(this.buf, 0, this.nv * STRIDE).slice(), indices: new Uint32Array(this.idx), count: this.idx.length, nv: this.nv };
  }

  get triangles() { return this.idx.length / 3; }
}

export const VERTEX_STRIDE = STRIDE;

// ---- small helpers -----------------------------------------------------------------------------
function sub3(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function scale3(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
function cross3(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function len3(a) { return Math.hypot(a[0], a[1], a[2]); }
function norm3(a) { const l = len3(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }

function faceNormal(pts) {
  // Newell's method: robust for any planar polygon.
  let x = 0, y = 0, z = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    x += (a[1] - b[1]) * (a[2] + b[2]);
    y += (a[2] - b[2]) * (a[0] + b[0]);
    z += (a[0] - b[0]) * (a[1] + b[1]);
  }
  return norm3([x, y, z]);
}

function earclip(pts, n) {
  // Project to the dominant plane, then clip ears.
  const ax = Math.abs(n[0]), ay = Math.abs(n[1]), az = Math.abs(n[2]);
  const P = pts.map(p => (ay >= ax && ay >= az ? [p[0], -p[2] * Math.sign(n[1] || 1)] : ax >= az ? [p[2] * Math.sign(n[0] || 1), p[1]] : [-p[0] * Math.sign(n[2] || 1), p[1]]));
  // Make counter-clockwise in projected space.
  let area = 0;
  for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; area += a[0] * b[1] - b[0] * a[1]; }
  const V = P.map((_, i) => i);
  if (area < 0) V.reverse();
  const out = [];
  const isEar = (i0, i1, i2) => {
    const a = P[i0], b = P[i1], c = P[i2];
    const cr = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    if (cr <= 1e-12) return false;
    for (const j of V) {
      if (j === i0 || j === i1 || j === i2) continue;
      const p = P[j];
      const d1 = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
      const d2 = (c[0] - b[0]) * (p[1] - b[1]) - (c[1] - b[1]) * (p[0] - b[0]);
      const d3 = (a[0] - c[0]) * (p[1] - c[1]) - (a[1] - c[1]) * (p[0] - c[0]);
      if (d1 >= 0 && d2 >= 0 && d3 >= 0) return false;
    }
    return true;
  };
  let guard = 0;
  while (V.length > 3 && guard++ < 10000) {
    let clipped = false;
    for (let k = 0; k < V.length; k++) {
      const i0 = V[(k - 1 + V.length) % V.length], i1 = V[k], i2 = V[(k + 1) % V.length];
      if (isEar(i0, i1, i2)) {
        out.push(...(area < 0 ? [i0, i2, i1] : [i0, i1, i2]).map(x => x));
        V.splice(k, 1); clipped = true; break;
      }
    }
    if (!clipped) break;
  }
  if (V.length === 3) out.push(...(area < 0 ? [V[0], V[2], V[1]] : V));
  // Re-orient so triangles face along n.
  const fixed = [];
  for (let k = 0; k < out.length; k += 3) {
    const a = pts[out[k]], b = pts[out[k + 1]], c = pts[out[k + 2]];
    const cn = cross3(sub3(b, a), sub3(c, a));
    if (cn[0] * n[0] + cn[1] * n[1] + cn[2] * n[2] < 0) fixed.push(out[k], out[k + 2], out[k + 1]);
    else fixed.push(out[k], out[k + 1], out[k + 2]);
  }
  return fixed;
}
