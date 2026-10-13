// WGSL for the harbour. One shared prelude (frame uniforms, jelly deformation, object transforms, sampling helpers),
// then one module per pass. Bind group layouts (see renderer.js):
//   A  (shadow, caustics):  0 frame, 1 sim, 2 terrain
//   B  (opaque, sprites):   A + 3 shadow map, 4 compare sampler, 5 caustics, 6 linear sampler
//   C  (water):             B + 7 scene colour (a = view distance), 8 back-face distance

export const PRELUDE = /* wgsl */`
struct Frame {
  viewProj: mat4x4f,
  invViewProj: mat4x4f,
  lightViewProj: mat4x4f,
  tilt: mat4x4f,
  camPos: vec4f,     // xyz eye, w time (s)
  lightDir: vec4f,   // xyz toward the key light, w sea level (with tide)
  jelly: vec4f,      // x shear x, y shear z, z squash, w detail-wave strength
  screen: vec4f,     // w, h, 1/w, 1/h
  waterA: vec4f,     // absorption per unit rgb, w scatter strength
  waterB: vec4f,     // body (scatter) colour rgb, w foam amount
  waterC: vec4f,     // shallow tint rgb, w clarity
  misc: vec4f,       // x lamp glow, y reduced motion, z caustic strength, w exposure
  sim: vec4f,        // grid origin x, origin z, cell size, N
  strata: array<vec4f, 8>,
  objects: array<vec4f, 64>,
};

@group(0) @binding(0) var<uniform> F: Frame;
@group(0) @binding(1) var simTex: texture_2d<f32>;
@group(0) @binding(2) var terTex: texture_2d<f32>;

const PI = 3.14159265;
const BLOCK_B = 2.6;
const BLOCK_BOTTOM = -0.95;
const BLOCK_H = 1.7;

fn qrot(q: vec4f, v: vec3f) -> vec3f {
  let t = 2.0 * cross(q.xyz, v);
  return v + q.w * t + cross(q.xyz, t);
}
fn objPos(id: u32, p: vec3f) -> vec3f {
  return F.objects[id * 2u].xyz + qrot(F.objects[id * 2u + 1u], p);
}
fn objDir(id: u32, n: vec3f) -> vec3f { return qrot(F.objects[id * 2u + 1u], n); }

// The jelly: shear and squash grow with height above the block's base, then the whole block tilts.
fn jellyBend(p: vec3f) -> vec3f {
  let h = max(p.y - BLOCK_BOTTOM, 0.0);
  let t = h / BLOCK_H;
  let bend = t * (0.65 + 0.35 * t);
  var q = p;
  q.x += F.jelly.x * bend;
  q.z += F.jelly.y * bend;
  q.y = BLOCK_BOTTOM + h * (1.0 - F.jelly.z);
  let bulge = 1.0 + 0.5 * F.jelly.z * sin(clamp(t, 0.0, 1.0) * PI);
  q.x *= bulge; q.z *= bulge;
  return q;
}
fn jelly(p: vec3f) -> vec3f { return (F.tilt * vec4f(jellyBend(p), 1.0)).xyz; }
fn jellyN(n: vec3f) -> vec3f { return normalize((F.tilt * vec4f(n, 0.0)).xyz); }

// Integer hash on the lattice point (a sin-based hash falls apart in 32-bit floats for large inputs).
fn hashU(x: u32) -> u32 {
  var h = x * 747796405u + 2891336453u;
  h = ((h >> ((h >> 28u) + 4u)) ^ h) * 277803737u;
  return (h >> 22u) ^ h;
}
fn hash2(p: vec2f) -> f32 {
  let q = vec2u(vec2i(floor(p)) + vec2i(65536));
  return f32(hashU(q.x ^ hashU(q.y))) / 4294967295.0;
}
fn hash3(p: vec3f) -> f32 { return fract(sin(dot(p, vec3f(12.9898, 78.233, 37.719))) * 43758.5453); }
fn noise2(p: vec2f) -> f32 {
  let i = floor(p); let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash2(i), hash2(i + vec2f(1.0, 0.0)), u.x), mix(hash2(i + vec2f(0.0, 1.0)), hash2(i + vec2f(1.0, 1.0)), u.x), u.y);
}
fn fbm2(p: vec2f) -> f32 {
  var s = 0.0; var a = 0.5; var q = p;
  for (var i = 0; i < 4; i++) { s += a * noise2(q); q = q * 2.03 + vec2f(1.7, 9.2); a *= 0.5; }
  return s;
}
fn srgb2lin(c: vec3f) -> vec3f { return pow(max(c, vec3f(0.0)), vec3f(2.2)); }

// Bilinear reads of the unfilterable simulation and terrain grids (cell centres at (i + 0.5) * cell).
fn gridLoad(tex: texture_2d<f32>, xz: vec2f) -> vec4f {
  let n = i32(F.sim.w);
  let g = (xz - F.sim.xy) / F.sim.z - vec2f(0.5);
  let i0 = vec2i(floor(g));
  let f = g - floor(g);
  let hi = vec2i(n - 1);
  let a = textureLoad(tex, clamp(i0, vec2i(0), hi), 0);
  let b = textureLoad(tex, clamp(i0 + vec2i(1, 0), vec2i(0), hi), 0);
  let c = textureLoad(tex, clamp(i0 + vec2i(0, 1), vec2i(0), hi), 0);
  let d = textureLoad(tex, clamp(i0 + vec2i(1, 1), vec2i(0), hi), 0);
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
fn simAt(xz: vec2f) -> vec4f { return gridLoad(simTex, xz); }
fn terAt(xz: vec2f) -> vec4f { return gridLoad(terTex, xz); }

// Small travelling ripples on top of the simulated waves (height, d/dx, d/dz). Amplitude follows F.jelly.w.
fn ripples(xz: vec2f, t: f32) -> vec3f {
  var h = 0.0; var d = vec2f(0.0);
  for (var i = 0; i < 7; i++) {
    let fi = f32(i);
    let a = fi * 2.39996 + 0.4;
    let dir = vec2f(cos(a), sin(a));
    let k = 16.0 + fi * 8.5;
    let w = sqrt(2.2 * k) * 0.9;
    let amp = 0.0011 / (1.0 + fi * 0.3);
    let ph = dot(dir, xz) * k + t * w + fi * 1.7;
    h += amp * sin(ph);
    d += amp * k * cos(ph) * dir;
  }
  return vec3f(h, d) * F.jelly.w;
}

// Water surface height and slope at xz (block space, without the jelly bend).
fn waterSurf(xz: vec2f) -> vec4f {
  let e = F.sim.z;
  let c = simAt(xz).x;
  let hx = simAt(xz + vec2f(e, 0.0)).x - simAt(xz - vec2f(e, 0.0)).x;
  let hz = simAt(xz + vec2f(0.0, e)).x - simAt(xz - vec2f(0.0, e)).x;
  let edgeFade = smoothstep(0.0, 0.12, BLOCK_B - max(abs(xz.x), abs(xz.y)));
  let r = ripples(xz, F.camPos.w) * edgeFade;
  return vec4f(F.lightDir.w + c + r.x, hx / (2.0 * e) + r.y, hz / (2.0 * e) + r.z, 0.0);
}
`;

// ---- shared lighting (opaque pass) -------------------------------------------------------------
export const LIGHTING = /* wgsl */`
@group(0) @binding(3) var shadowTex: texture_depth_2d;
@group(0) @binding(4) var shadowSamp: sampler_comparison;
@group(0) @binding(5) var causTex: texture_2d<f32>;
@group(0) @binding(6) var linSamp: sampler;

fn shadowAt(wp: vec3f, n: vec3f) -> f32 {
  let L = normalize(F.lightDir.xyz);
  let slope = 1.0 - abs(dot(n, L));
  let p = F.lightViewProj * vec4f(wp + n * (0.006 + 0.014 * slope) + L * 0.003, 1.0);
  let uv = vec2f(p.x * 0.5 + 0.5, 0.5 - p.y * 0.5);
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { return 1.0; }
  let z = p.z - 0.0012;
  let ts = 1.0 / 2048.0;
  var s = 0.0;
  for (var y = -1; y <= 1; y++) {
    for (var x = -1; x <= 1; x++) {
      s += textureSampleCompareLevel(shadowTex, shadowSamp, uv + vec2f(f32(x), f32(y)) * ts * 1.5, z);
    }
  }
  return s / 9.0;
}

fn causticAt(wp: vec3f) -> f32 {
  // project along the light onto the seabed map
  let uv = (wp.xz + vec2f(BLOCK_B)) / (2.0 * BLOCK_B);
  return textureSampleLevel(causTex, linSamp, uv, 0.0).r;
}

// Studio environment: warm paper sweep below, soft white above, two softboxes.
fn studioEnv(r: vec3f) -> vec3f {
  let up = clamp(r.y * 0.5 + 0.5, 0.0, 1.0);
  var c = mix(vec3f(0.80, 0.74, 0.66), vec3f(1.05, 1.04, 1.02), smoothstep(0.35, 0.75, up));
  let L = normalize(F.lightDir.xyz);
  c += vec3f(5.0, 4.8, 4.5) * pow(max(dot(r, L), 0.0), 220.0);
  let box1 = normalize(vec3f(-0.6, 0.55, 0.6));
  let box2 = normalize(vec3f(0.7, 0.6, 0.3));
  c += vec3f(1.6) * smoothstep(0.93, 0.97, dot(r, box1));
  c += vec3f(0.9, 0.95, 1.0) * smoothstep(0.95, 0.98, dot(r, box2));
  return c;
}

struct Surf { base: vec3f, n: vec3f, rough: f32, spec: f32, emit: vec3f, ao: f32 };

fn matSurface(mat: u32, base0: vec3f, param: f32, wp: vec3f, lp: vec3f, n0: vec3f) -> Surf {
  var s: Surf;
  s.base = base0; s.n = n0; s.rough = 0.8; s.spec = 0.04; s.emit = vec3f(0.0); s.ao = 1.0;
  let t = F.camPos.w;
  switch mat {
    case 1u: { // glass
      s.base = base0 * 0.35; s.rough = 0.08; s.spec = 0.6;
    }
    case 2u: { // gloss steel / painted metal
      s.rough = 0.25; s.spec = 0.35;
    }
    case 3u: { // roof tiles: courses up the slope, joints along the ridge
      let along = dot(lp.xz, normalize(vec2f(-n0.z, n0.x) + vec2f(1e-4)));
      let course = lp.y * 95.0;
      let row = floor(course);
      let fy = fract(course);
      let fx = fract(along * 70.0 + row * 0.5);
      let bump = smoothstep(0.0, 0.25, fy) * (1.0 - 0.45 * smoothstep(0.6, 1.0, fy));
      let v = 0.86 + 0.14 * hash2(vec2f(row, floor(along * 70.0 + row * 0.5)));
      s.base = base0 * (0.72 + 0.28 * bump) * v * (0.9 + 0.1 * smoothstep(0.0, 0.12, fx) * smoothstep(1.0, 0.88, fx));
      s.rough = 0.88; s.spec = 0.02;
    }
    case 4u: { // timber planks (param < .5: planks along x, else along z)
      let across = select(lp.z, lp.x, param > 0.5);
      let alongP = select(lp.x, lp.z, param > 0.5) + lp.y * 0.3;
      let plank = floor(across * 55.0);
      let fp = fract(across * 55.0);
      let grain = noise2(vec2f(alongP * 30.0, plank * 3.1 + across * 400.0));
      let v = 0.82 + 0.18 * hash2(vec2f(plank, 3.0));
      s.base = base0 * v * (0.85 + 0.25 * grain) * (0.6 + 0.4 * smoothstep(0.0, 0.08, fp) * smoothstep(1.0, 0.92, fp));
      s.rough = 0.75;
    }
    case 5u: { // corrugated sheet: ribs
      var tang: vec3f;
      if (abs(n0.y) > 0.5) { tang = normalize(cross(n0, vec3f(1.0, 0.0, 0.0)) + vec3f(1e-4)); tang = normalize(cross(tang, n0)); }
      else { tang = normalize(vec3f(-n0.z, 0.0, n0.x) + vec3f(1e-4)); }
      let ph = dot(lp, tang) * 260.0 * (1.0 + param * 3.0);
      s.n = normalize(n0 + tang * sin(ph) * 0.55);
      s.base = base0 * (0.9 + 0.1 * sin(ph));
      s.rough = 0.45; s.spec = 0.12;
    }
    case 6u: { // dressed stone masonry
      let horiz = select(lp.x, lp.z, abs(n0.x) > abs(n0.z));
      let coord = select(vec2f(horiz, lp.y), lp.xz, abs(n0.y) > 0.7);
      let row = floor(coord.y * 32.0);
      let fx = fract(coord.x * 16.0 + row * 0.47);
      let fy = fract(coord.y * 32.0);
      let id = vec2f(floor(coord.x * 16.0 + row * 0.47), row);
      let mortar = smoothstep(0.0, 0.07, fx) * smoothstep(1.0, 0.93, fx) * smoothstep(0.0, 0.12, fy) * smoothstep(1.0, 0.88, fy);
      let v = 0.84 + 0.16 * hash2(id) + 0.06 * noise2(coord * 90.0);
      s.base = mix(base0 * 0.62, base0 * v, mortar);
      s.rough = 0.85;
    }
    case 7u: { // rubber
      s.base = base0; s.rough = 0.5; s.spec = 0.06;
    }
    case 8u: { // rock
      let nn = fbm2(lp.xz * 22.0 + lp.y * 13.0);
      s.base = base0 * (0.72 + 0.45 * nn);
      s.rough = 0.9;
    }
    case 9u: { // lamp glow
      s.emit = srgb2lin(base0) * (0.6 + 7.0 * param * F.misc.x);
    }
    case 10u: { // weed
      s.base = base0 * (0.8 + 0.3 * noise2(lp.xz * 40.0 + lp.y * 20.0));
      s.rough = 0.7;
    }
    case 11u: { // hull: antifouling below the boot-top, a dark boot-top band, paint above
      if (lp.y < -0.012) { s.base = vec3f(0.62, 0.13, 0.10); s.rough = 0.7; }
      else if (lp.y < 0.004) { s.base = vec3f(0.10, 0.10, 0.11); }
      else { s.rough = 0.35; s.spec = 0.15; }
    }
    case 12u: { // grass
      let m = fbm2(wp.xz * 9.0);
      let fine = noise2(wp.xz * 140.0);
      s.base = base0 * (0.78 + 0.32 * m) * (0.92 + 0.12 * fine);
      s.rough = 0.95;
    }
    case 13u: { // asphalt
      s.base = base0 * (0.88 + 0.2 * noise2(wp.xz * 220.0) + 0.06 * fbm2(wp.xz * 6.0));
      s.rough = 0.92;
    }
    case 14u: { // sand with ripples and silt drifts
      let rip = sin(dot(wp.xz, vec2f(0.8, 0.6)) * 70.0 + noise2(wp.xz * 6.0) * 6.0);
      let silt = fbm2(wp.xz * 3.0);
      s.base = mix(base0, base0 * vec3f(0.82, 0.80, 0.74), smoothstep(0.45, 0.75, silt)) * (0.95 + 0.05 * rip);
      s.rough = 0.95;
    }
    case 15u: { // concrete with panel joints
      let g = fract(wp.xz * vec2f(4.0, 4.0));
      let j = smoothstep(0.0, 0.015, g.x) * smoothstep(1.0, 0.985, g.x) * smoothstep(0.0, 0.015, g.y) * smoothstep(1.0, 0.985, g.y);
      let jv = select(1.0, j, abs(n0.y) > 0.7);
      s.base = base0 * (0.92 + 0.1 * noise2(wp.xz * 60.0 + wp.y * 40.0)) * (0.82 + 0.18 * jv);
      s.rough = 0.85;
    }
    case 16u: { // cobbles
      let c = wp.xz * vec2f(70.0, 85.0);
      let row = floor(c.y);
      let cell = vec2f(c.x + row * 0.5, c.y);
      let f = fract(cell) - vec2f(0.5);
      let d = max(abs(f.x), abs(f.y));
      let bump = 1.0 - smoothstep(0.32, 0.5, d);
      let v = 0.78 + 0.3 * hash2(floor(cell));
      s.base = base0 * mix(0.45, v, bump);
      s.n = normalize(n0 + vec3f(f.x, 0.0, f.y) * 0.6 * (1.0 - bump));
      s.rough = 0.75;
    }
    case 17u: { // strata band (param = band index / 8): soft candy layers with a fine grain and a few pebbles
      let band = min(u32(param * 8.0 + 0.5), 7u);
      let c = F.strata[band].rgb;
      let horiz = select(wp.x, wp.z, abs(n0.x) > 0.5);
      let pebble = smoothstep(0.9, 0.95, noise2(vec2f(horiz, wp.y) * 70.0));
      let grain = noise2(vec2f(horiz * 30.0, wp.y * 220.0));
      let wave = 0.5 + 0.5 * sin(horiz * 9.0 + wp.y * 3.0);
      s.base = c * (0.97 + 0.04 * grain + 0.02 * wave) * (1.0 - 0.07 * pebble);
      s.rough = 0.95; s.spec = 0.0;
    }
    case 18u: { // slate courses
      let along = dot(lp.xz, normalize(vec2f(-n0.z, n0.x) + vec2f(1e-4)));
      let row = floor(lp.y * 120.0);
      let id = vec2f(row, floor(along * 55.0 + row * 0.5));
      let fy = fract(lp.y * 120.0);
      s.base = base0 * (0.82 + 0.25 * hash2(id)) * (0.7 + 0.3 * smoothstep(0.0, 0.2, fy));
      s.rough = 0.75; s.spec = 0.035;
    }
    case 19u: { // leaves
      s.base = base0 * (0.75 + 0.4 * fbm2(lp.xz * 60.0 + lp.y * 50.0));
      s.rough = 0.95; s.spec = 0.015;
    }
    case 20u: { // mussels
      let b = noise2(wp.xz * 300.0 + wp.y * 250.0);
      s.base = mix(vec3f(0.06, 0.07, 0.10), vec3f(0.22, 0.24, 0.30), b * b);
      s.rough = 0.4; s.spec = 0.1;
    }
    case 21u: { // canvas
      s.base = base0 * (0.9 + 0.1 * sin(lp.y * 300.0 + lp.x * 40.0));
      s.rough = 0.95;
    }
    case 22u: { // board cladding
      let fy = fract(lp.y * 75.0);
      s.base = base0 * (0.88 + 0.12 * smoothstep(0.0, 0.18, fy));
      s.rough = 0.8;
    }
    default: {}
  }
  return s;
}

// Light a surface. wp is the (jellied) world position, bp the block-space position before the jelly.
fn lightSurface(sf: Surf, wp: vec3f, bp: vec3f, V: vec3f) -> vec3f {
  let base = srgb2lin(sf.base);
  let L = normalize(F.lightDir.xyz);
  let n = sf.n;
  let ndl = dot(n, L);
  var sh = shadowAt(wp, n);
  var sun = vec3f(1.0, 0.96, 0.90) * 1.3 * max(ndl, 0.0) * sh;
  // underwater: sunlight comes through the surface as caustics and fades with depth
  let sea = F.lightDir.w;
  if (bp.y < sea + 0.02 && abs(bp.x) < BLOCK_B - 0.01 && abs(bp.z) < BLOCK_B - 0.01) {
    let ter = terAt(bp.xz);
    if (ter.y < 0.5) {
      let wl = sea + simAt(bp.xz).x;
      let depth = max(wl - bp.y, 0.0);
      let c = causticAt(bp);
      let fade = exp(-depth * 2.2);
      sun = sun * fade * (0.42 + min(c, 1.8) * 0.85 * F.misc.z);
    }
  }
  let skyAmt = n.y * 0.5 + 0.5;
  let amb = mix(vec3f(0.60, 0.54, 0.47), vec3f(0.64, 0.68, 0.76), skyAmt) * 0.5 * sf.ao;
  // soft wrap for a studio feel
  let wrap = max((ndl + 0.35) / 1.35, 0.0) * 0.12 * vec3f(1.0, 0.95, 0.9);
  var col = base * (sun + amb + wrap);
  let H = normalize(L + V);
  let gloss = mix(900.0, 8.0, sf.rough);
  let spec = pow(max(dot(n, H), 0.0), gloss) * sf.spec * min((gloss + 8.0) / 8.0, 10.0) * sh;
  col += vec3f(1.0, 0.97, 0.92) * spec * 1.4;
  // a little studio reflection on glossy things
  let fres = pow(1.0 - max(dot(n, V), 0.0), 5.0);
  col += studioEnv(reflect(-V, n)) * (sf.spec * 0.3 + fres * 0.06 * (1.0 - sf.rough)) * 0.5 * smoothstep(0.95, 0.4, sf.rough);
  col += sf.emit;
  return col;
}
`;

// ---- static props (and terrain) ------------------------------------------------------------------
export const PROPS = /* wgsl */`
struct VIn {
  @location(0) pos: vec3f,
  @location(1) nrm: vec3f,
  @location(2) col: vec4f,
  @location(3) info: vec4u,
};
struct VOut {
  @builtin(position) clip: vec4f,
  @location(0) wp: vec3f,
  @location(1) n: vec3f,
  @location(2) col: vec4f,
  @location(3) lp: vec3f,
  @location(4) @interpolate(flat) mat: u32,
  @location(5) bp: vec3f,
};

fn swayOffset(mat: u32, param: f32, p: vec3f) -> vec3f {
  let t = F.camPos.w;
  if (mat == 10u) { // weed sways with a slow current
    let a = param * param;
    return vec3f(sin(t * 1.1 + p.x * 4.0 + p.z * 3.0), 0.0, cos(t * 0.9 + p.x * 3.0)) * 0.018 * a;
  }
  if (mat == 19u) {
    return vec3f(sin(t * 1.7 + p.x * 9.0), 0.0, sin(t * 1.3 + p.z * 8.0)) * 0.0025 * param;
  }
  return vec3f(0.0);
}

@vertex fn vs(v: VIn) -> VOut {
  var o: VOut;
  let id = v.info.y;
  var p = objPos(id, v.pos);
  p += swayOffset(v.info.x, v.col.a, p);
  o.bp = p;
  let w = jelly(p);
  o.wp = w;
  o.n = jellyN(objDir(id, v.nrm));
  o.col = v.col;
  o.lp = select(v.pos, p, id == 0u);
  o.mat = v.info.x;
  o.clip = F.viewProj * vec4f(w, 1.0);
  return o;
}

struct FOut { @location(0) color: vec4f };

@fragment fn fs(i: VOut, @builtin(front_facing) ff: bool) -> FOut {
  var n = normalize(i.n);
  if (!ff) { n = -n; }
  let V = normalize(F.camPos.xyz - i.wp);
  let sf = matSurface(i.mat, i.col.rgb, i.col.a, i.wp, i.lp, n);
  let c = lightSurface(sf, i.wp, i.bp, V);
  var o: FOut;
  o.color = vec4f(c, length(F.camPos.xyz - i.wp));
  return o;
}

@vertex fn vsShadow(v: VIn) -> @builtin(position) vec4f {
  let id = v.info.y;
  var p = objPos(id, v.pos);
  p += swayOffset(v.info.x, v.col.a, p);
  return F.lightViewProj * vec4f(jelly(p), 1.0);
}
`;

// ---- instanced templates: containers, crates, fish, gulls, jellyfish, lifebuoys, bubbles ----------
// Instance: pos f32x3, scale f32, quat f32x4, tint unorm8x4, info uint8x4 (parent, kind, flags, 0), anim f32x2.
// kinds: 0 rigid, 1 fish (tail sway), 2 gull (wing flap; anim.y = flap amount), 3 jellyfish (bell pulse), 4 bubble.
export const INST = /* wgsl */`
struct VIn {
  @location(0) pos: vec3f,
  @location(1) nrm: vec3f,
  @location(2) col: vec4f,
  @location(3) info: vec4u,
  @location(4) ipos: vec3f,
  @location(5) iscale: f32,
  @location(6) iquat: vec4f,
  @location(7) itint: vec4f,
  @location(8) iinfo: vec4u,
  @location(9) ianim: vec2f,
};
struct VOut {
  @builtin(position) clip: vec4f,
  @location(0) wp: vec3f,
  @location(1) n: vec3f,
  @location(2) col: vec4f,
  @location(3) lp: vec3f,
  @location(4) @interpolate(flat) mat: u32,
  @location(5) bp: vec3f,
  @location(6) @interpolate(flat) kind: u32,
};

fn deform(kind: u32, p: vec3f, flex: f32, anim: vec2f) -> vec3f {
  var q = p;
  if (kind == 1u) {
    // Fish (js/life/fish.js): template length 1, nose at +0.5, tail tip at -0.5; flex 0 at the head .. 1 at the tail tip.
    // anim.x = tail-beat phase (radians), anim.y = turn curl (-1..1, + curls the tail toward +z).
    let wave = sin(anim.x - flex * 4.2) * (0.012 + 0.11 * flex * flex);
    q.z += wave + anim.y * 0.2 * flex * flex;
    q.x -= abs(wave) * 0.12 * flex;
  } else if (kind == 2u) {
    // Herring gull (js/life/gulls.js): template length 1, +x head, wings along z from the shoulder (x 0.02, y 0.08,
    // |z| 0.12); flex 0 on the body .. 1 at the wingtip; legs hang below y = -0.162.
    // anim.y >= 0, flying: anim.y = 2k + a with a in [0, 1) the flap amount and k / 8 the legs lowered (0 tucked .. 8 down);
    //   anim.x = flap phase.
    // anim.y < 0, perched or stooping: -anim.y = wing fold (0 spread .. 1 folded along the back), legs down,
    //   anim.x = head turn (radians, positive turns the bill toward -z).
    var amt = 0.0; var legs = 1.0; var fold = 0.0; var head = 0.0;
    if (anim.y < 0.0) { fold = min(-anim.y, 1.0); head = anim.x; }
    else { let k = floor(anim.y * 0.5); amt = clamp(anim.y - 2.0 * k, 0.0, 1.0); legs = clamp(k / 8.0, 0.0, 1.0); }
    if (flex > 0.0) {
      let s = select(-1.0, 1.0, p.z >= 0.0);
      // wing coordinates from the shoulder: u outward along the span, c forward along the chord, h up
      let u = (abs(p.z) - 0.12) * (1.0 - 0.52 * fold);
      let c = (p.x - 0.02) * (1.0 - 0.6 * fold);
      let h = p.y - 0.08;
      // flap: the arm swings about the shoulder, the hand follows a little later (and droops a touch when gliding)
      let a1 = (0.10 + amt * 0.85 * sin(anim.x)) * (1.0 - fold);
      let a2 = (-0.10 + amt * 0.45 * sin(anim.x - 1.1)) * (1.0 - fold);
      let uw = 0.48 * (1.0 - 0.52 * fold);
      var uu = u * cos(a1) - h * sin(a1);
      var hh = u * sin(a1) + h * cos(a1);
      if (u > uw) {
        let a = a1 + a2; let du = u - uw;
        uu = uw * cos(a1) + du * cos(a) - h * sin(a);
        hh = uw * sin(a1) + du * sin(a) + h * cos(a);
      }
      // fold: tip the leading edge down over the flank, then sweep the wing back along the body
      let dr = fold * 1.0;
      let c1 = c * cos(dr) + hh * sin(dr);
      let h1 = hh * cos(dr) - c * sin(dr);
      let th = fold * 1.6;
      let c2 = c1 * cos(th) - uu * sin(th);
      let u2 = c1 * sin(th) + uu * cos(th);
      // the folded primaries slope down to rest over the tail
      let rear = clamp(-c2 / 0.5, 0.0, 1.0);
      q = vec3f(0.02 + c2, 0.08 + h1 - fold * (0.02 + 0.045 * rear), s * (0.12 + u2));
    } else {
      if (p.y < -0.162) {
        // legs fold back under the tail in flight
        let tk = 1.0 - legs;
        let a = -tk * 1.45;
        let d = vec2f(p.x + 0.02, p.y + 0.12) * (1.0 - 0.3 * tk);
        q.x = -0.02 + d.x * cos(a) - d.y * sin(a);
        q.y = -0.12 + d.x * sin(a) + d.y * cos(a) + tk * 0.05;
        q.z = p.z * (1.0 - 0.5 * tk);
      }
      let hw = smoothstep(0.2, 0.32, p.x) * head;
      if (hw != 0.0) {
        let dx = q.x - 0.2; let qz = q.z;
        q.x = 0.2 + dx * cos(hw) + qz * sin(hw);
        q.z = qz * cos(hw) - dx * sin(hw);
      }
    }
  } else if (kind == 3u) {
    // Moon jellyfish (js/life/jellies.js): template bell radius 1, rim at y 0, apex at y 0.45; flex 0 on the bell rising
    // to 1 at the arm and tentacle tips. anim.x = pulse phase, anim.y = sway seed.
    let sq = 0.5 + 0.5 * sin(anim.x);
    let k = sq * sq;                                   // 0 relaxed .. 1 squeezed
    let rimW = 1.0 - 0.7 * clamp(p.y / 0.45, 0.0, 1.0);
    let rs = 1.0 - 0.15 * k * rimW + 0.05 * (1.0 - k) * flex;
    q.x *= rs; q.z *= rs;
    if (p.y > 0.0) { q.y = p.y * (1.0 + 0.14 * k); }
    let ang = atan2(p.z, p.x);
    let f2 = flex * flex;
    q.x += sin(anim.x * 0.5 + anim.y + ang * 2.0 - flex * 2.6) * 0.10 * f2;
    q.z += cos(anim.x * 0.43 + anim.y * 1.3 + ang * 3.0 - flex * 2.2) * 0.10 * f2;
    q.y -= 0.07 * k * flex;
  } else if (kind == 4u) {
    // bubble: a slow jelly wobble
    q.x *= 1.0 + 0.08 * sin(anim.x);
    q.y *= 1.0 - 0.08 * sin(anim.x);
    q.z *= 1.0 + 0.06 * cos(anim.x * 1.3);
  }
  return q;
}

@vertex fn vs(v: VIn) -> VOut {
  var o: VOut;
  let kind = v.iinfo.y;
  let lp = deform(kind, v.pos, v.col.a, v.ianim) * v.iscale;
  let local = v.ipos + qrot(v.iquat, lp);
  let parent = v.iinfo.x;
  let p = objPos(parent, local);
  o.bp = p;
  let w = jelly(p);
  o.wp = w;
  o.n = jellyN(objDir(parent, qrot(v.iquat, v.nrm)));
  // white vertices take the instance tint (container liveries, fish colours)
  var c = v.col.rgb;
  if (c.r > 0.98 && c.g > 0.98 && c.b > 0.98) { c = v.itint.rgb; }
  else if (v.itint.a < 0.99) { c = mix(c, v.itint.rgb, 1.0 - v.itint.a); }
  o.col = vec4f(c, v.col.a);
  o.lp = v.pos;
  o.mat = v.info.x;
  o.kind = kind;
  o.clip = F.viewProj * vec4f(w, 1.0);
  return o;
}

struct FOut { @location(0) color: vec4f };

@fragment fn fs(i: VOut, @builtin(front_facing) ff: bool) -> FOut {
  var n = normalize(i.n);
  if (!ff) { n = -n; }
  let V = normalize(F.camPos.xyz - i.wp);
  var sf = matSurface(i.mat, i.col.rgb, i.col.a, i.wp, i.lp, n);
  var c: vec3f;
  if (i.kind == 3u || i.kind == 4u) {
    // Glassy (jellyfish, bubbles): the gel's own colour shows through the middle, a milky body, a bright Fresnel rim
    // and a small glint. Moon jellyfish bells (flex 0) show their four pink horseshoes through the top.
    let L = normalize(F.lightDir.xyz);
    let ndv = abs(dot(n, V));
    let rim = pow(1.0 - ndv, 2.2);
    let gel = srgb2lin(F.waterB.rgb);
    var base = srgb2lin(i.col.rgb);
    var clear = select(0.62, 0.8, i.kind == 4u);
    if (i.kind == 3u && i.col.a < 0.02) {
      let xz = i.lp.xz;
      let ca = PI * 0.25 + round((atan2(xz.y, xz.x) - PI * 0.25) / (PI * 0.5)) * PI * 0.5;
      let ctr = vec2f(cos(ca), sin(ca)) * 0.4;
      let dv = xz - ctr;
      let d = length(dv);
      let ring = 1.0 - smoothstep(0.03, 0.065, abs(d - 0.16));
      let outward = dot(dv / max(d, 1e-4), ctr / 0.4);
      let shoe = ring * (1.0 - smoothstep(0.35, 0.8, outward));
      base = mix(base, srgb2lin(vec3f(1.0, 0.42, 0.66)), shoe);
      clear = clear * (1.0 - 0.85 * shoe);
      // the margin is a little milkier
      clear = clear * (1.0 - 0.45 * smoothstep(0.75, 0.98, length(xz)));
    }
    let lit = 0.45 + 0.4 * max(dot(n, L), 0.0) + 0.3 * min(causticAt(i.bp), 1.5);
    c = mix(base * lit, gel * 1.08, clear * ndv);
    c += vec3f(0.85, 0.95, 1.0) * rim * select(0.7, 1.1, i.kind == 4u);
    let H = normalize(L + V);
    c += vec3f(1.0, 0.98, 0.95) * pow(max(dot(n, H), 0.0), 90.0) * select(0.8, 2.0, i.kind == 4u);
  } else {
    c = lightSurface(sf, i.wp, i.bp, V);
  }
  var o: FOut;
  o.color = vec4f(c, length(F.camPos.xyz - i.wp));
  return o;
}

@vertex fn vsShadow(v: VIn) -> @builtin(position) vec4f {
  let kind = v.iinfo.y;
  let lp = deform(kind, v.pos, v.col.a, v.ianim) * v.iscale;
  let p = objPos(v.iinfo.x, v.ipos + qrot(v.iquat, lp));
  if (kind == 4u) { return vec4f(0.0, 0.0, -2.0, 1.0); }
  return F.lightViewProj * vec4f(jelly(p), 1.0);
}
`;

// ---- paper backdrop and floor ------------------------------------------------------------------------
export const BACKDROP = /* wgsl */`
struct VOut { @builtin(position) clip: vec4f, @location(0) ndc: vec2f };

@vertex fn vsFull(@builtin(vertex_index) i: u32) -> VOut {
  var p = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  var o: VOut;
  o.clip = vec4f(p[i], 1.0, 1.0);
  o.ndc = p[i];
  return o;
}

fn paperAt(dir: vec3f, px: vec2f) -> vec3f {
  // a warm studio sweep: slightly brighter towards the top, soft falloff at the edges
  let up = dir.y;
  var c = mix(vec3f(0.885, 0.860, 0.820), vec3f(0.935, 0.920, 0.890), smoothstep(-0.6, 0.4, up));
  let grain = noise2(px * 0.9) * 0.012 + noise2(px * 0.23) * 0.01;
  c *= 1.0 - grain;
  return srgb2lin(c);
}

struct FOut { @location(0) color: vec4f };

@fragment fn fsBack(i: VOut) -> FOut {
  let w = F.invViewProj * vec4f(i.ndc, 1.0, 1.0);
  let dir = normalize(w.xyz / w.w - F.camPos.xyz);
  var o: FOut;
  o.color = vec4f(paperAt(dir, i.clip.xy) * 1.35, 9000.0);
  return o;
}

// The floor the block stands on: same paper, catching the block's shadow and a soft contact shade.
struct FV { @builtin(position) clip: vec4f, @location(0) wp: vec3f };
@vertex fn vsFloor(@builtin(vertex_index) i: u32) -> FV {
  var q = array<vec2f, 6>(vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0), vec2f(-1.0, -1.0), vec2f(1.0, 1.0), vec2f(-1.0, 1.0));
  let p = vec3f(q[i].x * 40.0, BLOCK_BOTTOM - 0.002, q[i].y * 40.0);
  var o: FV;
  o.wp = p;
  o.clip = F.viewProj * vec4f(p, 1.0);
  return o;
}
@fragment fn fsFloor(i: FV) -> FOut {
  let dir = normalize(i.wp - F.camPos.xyz);
  var c = paperAt(dir, i.clip.xy) * 1.35;
  let sh = shadowAt(i.wp, vec3f(0.0, 1.0, 0.0));
  // contact shade from the block's footprint (tilt moves the block, approximate with the untilted square)
  let d = max(abs(i.wp.x), abs(i.wp.z)) - BLOCK_B;
  let ao = 1.0 - 0.35 * exp(-max(d, 0.0) * 9.0);
  c *= mix(0.62, 1.0, sh) * ao;
  var o: FOut;
  o.color = vec4f(c, length(F.camPos.xyz - i.wp));
  return o;
}
`;

// ---- caustics: refract a grid of light rays through the surface onto the seabed map --------------------
export const CAUSTICS = /* wgsl */`
struct VOut { @builtin(position) clip: vec4f, @location(0) oldP: vec2f, @location(1) newP: vec2f, @location(2) depth: f32 };

@vertex fn vs(@location(0) g: vec2f) -> VOut {
  var o: VOut;
  let xz = g * BLOCK_B;
  let s = waterSurf(xz);
  let n = normalize(vec3f(-s.y, 1.0, -s.z));
  let L = -normalize(F.lightDir.xyz);
  let flat = refract(L, vec3f(0.0, 1.0, 0.0), 1.0 / 1.33);
  let r = refract(L, n, 1.0 / 1.33);
  let ter = terAt(xz);
  let floorY = ter.x;
  let depth = max(s.x - floorY, 0.0);
  let pOld = xz + flat.xz * (depth / max(-flat.y, 0.2));
  let pNew = xz + r.xz * (depth / max(-r.y, 0.2));
  o.oldP = pOld;
  o.newP = pNew;
  o.depth = select(depth, 0.0, ter.y > 0.5);
  o.clip = vec4f(pNew.x / BLOCK_B, -pNew.y / BLOCK_B, 0.0, 1.0);
  return o;
}

@fragment fn fs(i: VOut) -> @location(0) vec4f {
  let oldA = length(dpdx(i.oldP)) * length(dpdy(i.oldP));
  let newA = length(dpdx(i.newP)) * length(dpdy(i.newP));
  let ratio = oldA / max(newA, 1e-9);
  let k = select(0.0, 1.0, i.depth > 0.003);
  return vec4f(vec3f(ratio * 0.5 * k), 1.0);
}
`;

// ---- water: surface and cut faces --------------------------------------------------------------------
// Vertex: vec4f (x, z, kind, side). kind 0 surface grid; 1 side bottom; 2 side top. side 0..3 = -x, +x, -z, +z.
export const WATER_COMMON = /* wgsl */`
struct WV {
  @builtin(position) clip: vec4f,
  @location(0) wp: vec3f,
  @location(1) bp: vec3f,
  @location(2) @interpolate(flat) kind: u32,
  @location(3) @interpolate(flat) side: u32,
  @location(4) edgeT: f32,
};

fn sideNormal(side: u32) -> vec3f {
  switch side {
    case 0u: { return vec3f(-1.0, 0.0, 0.0); }
    case 1u: { return vec3f(1.0, 0.0, 0.0); }
    case 2u: { return vec3f(0.0, 0.0, -1.0); }
    default: { return vec3f(0.0, 0.0, 1.0); }
  }
}

@vertex fn vsWater(@location(0) v: vec4f) -> WV {
  var o: WV;
  let xz = v.xy;
  let kind = u32(v.z + 0.5);
  let ter = terAt(xz);
  let surf = F.lightDir.w + simAt(xz).x;
  var y = surf;
  if (kind == 1u) { y = min(ter.x, surf); }
  // cut faces sit a hair outside the strata so they never z-fight
  var off = vec2f(0.0);
  if (kind != 0u) { off = sideNormal(u32(v.w + 0.5)).xz * 0.003; }
  let bp = vec3f(xz.x + off.x, y, xz.y + off.y);
  o.bp = bp;
  o.wp = jelly(bp);
  o.kind = select(0u, 1u, kind != 0u);
  o.side = u32(v.w + 0.5);
  o.edgeT = select(0.0, 1.0, kind == 2u);
  o.clip = F.viewProj * vec4f(o.wp, 1.0);
  return o;
}
`;

export const WATER_BACK = /* wgsl */`
@fragment fn fsBack(i: WV) -> @location(0) vec4f {
  if (i.kind == 0u && terAt(i.bp.xz).w > 0.5) { discard; }
  return vec4f(length(F.camPos.xyz - i.wp), 0.0, 0.0, 1.0);
}
`;

export const WATER_FRONT = /* wgsl */`
@group(0) @binding(7) var sceneTex: texture_2d<f32>;
@group(0) @binding(8) var backTex: texture_2d<f32>;

fn sceneAt(uv: vec2f) -> vec4f { return textureSampleLevel(sceneTex, linSamp, uv, 0.0); }

@fragment fn fsWater(i: WV) -> @location(0) vec4f {
  let ter = terAt(i.bp.xz);
  if (i.kind == 0u && ter.w > 0.5) { discard; }
  let V = normalize(F.camPos.xyz - i.wp);
  let uv = i.clip.xy * F.screen.zw;
  let px = vec2i(i.clip.xy);
  let frontD = length(F.camPos.xyz - i.wp);
  let sim = simAt(i.bp.xz);

  var n: vec3f;
  var foam = 0.0;
  var edge = 0.0;
  if (i.kind == 0u) {
    let s = waterSurf(i.bp.xz);
    n = jellyN(normalize(vec3f(-s.y, 1.0, -s.z)));
    // meniscus where the surface meets the cut faces
    let toEdge = BLOCK_B - max(abs(i.bp.x), abs(i.bp.z));
    edge = 1.0 - smoothstep(0.0, 0.03, toEdge);
    // foam: simulated (wakes, splashes) plus a lace along every shore
    let shore = ter.z;
    let lace = (1.0 - smoothstep(0.0, 0.07, shore)) * (0.55 + 0.45 * sin(F.camPos.w * 1.3 + shore * 90.0));
    let pattern = smoothstep(0.35, 0.75, fbm2(i.bp.xz * 26.0 + vec2f(F.camPos.w * 0.15, 0.0)));
    foam = clamp(sim.w * 1.4 + lace * 0.8 * F.waterB.w, 0.0, 1.0) * (0.35 + 0.65 * pattern);
    foam = max(foam, clamp(sim.w * 2.0 - 1.0, 0.0, 1.0));
  } else {
    n = jellyN(sideNormal(i.side));
    // the waterline along the top of each cut face glows like a meniscus
    let below = (F.lightDir.w + sim.x) - i.bp.y;
    edge = 1.0 - smoothstep(0.0, 0.012, below);
  }

  // thickness of jelly along the view ray
  let sceneHere = textureLoad(sceneTex, px, 0);
  let backD = textureLoad(backTex, px, 0).r;
  let exitD = min(sceneHere.a, backD);
  let thick = clamp(exitD - frontD, 0.0, 3.0);

  // refraction: offset the lookup by the surface tilt, but only onto things behind the water
  // the surface bends the view by its slope; the flat cut faces only shimmer a little (a constant offset, so
  // nothing behind them shows twice)
  var off = n.xz * 0.06 * min(thick, 0.7);
  if (i.kind != 0u) { off = vec2f(sin(i.bp.y * 60.0 + F.camPos.w), cos(i.bp.x * 50.0 + i.bp.z * 40.0)) * 0.0015; }
  var uv2 = uv + vec2f(off.x, off.y);
  var sc = sceneAt(uv2);
  if (sc.a < frontD) { uv2 = uv; sc = sceneHere; }
  let pathLen = clamp(sc.a - frontD, 0.0, 3.0);

  // light shafts: march down the ray and pick up the caustic pattern
  let dir = -V;
  var shaft = 0.0;
  let steps = 8;
  for (var k = 1; k <= steps; k++) {
    let d = pathLen * (f32(k) - 0.5) / f32(steps);
    let p = i.bp + dir * d;
    let wl = F.lightDir.w + simAt(p.xz).x;
    let dd = max(wl - p.y, 0.0);
    let L = normalize(F.lightDir.xyz);
    let q = p + L * (dd / max(L.y, 0.3));
    let c = textureSampleLevel(causTex, linSamp, (q.xz + vec2f(BLOCK_B)) / (2.0 * BLOCK_B), 0.0).r;
    shaft += c * exp(-dd * 2.5);
  }
  shaft = shaft / f32(steps) * pathLen;

  // absorption and in-scattering give the jelly its body colour
  let absorb = F.waterA.rgb;
  let T = exp(-absorb * pathLen * (1.9 - F.waterC.w));
  let body = srgb2lin(F.waterB.rgb);
  var col = sc.rgb * T + body * (1.0 - T) * F.waterA.w;
  col += srgb2lin(F.waterC.rgb) * shaft * 0.55 * F.misc.z;
  // a little light glowing through the gel near the top
  col += body * 0.18 * exp(-pathLen * 3.0);

  // Fresnel studio reflection and a sun glint
  let cosT = max(dot(n, V), 0.0);
  let fres = 0.03 + 0.97 * pow(1.0 - cosT, 5.0);
  let R = reflect(-V, n);
  let env = studioEnv(R);
  col = mix(col, env * 0.85, clamp(fres, 0.0, 1.0) * select(0.55, 0.9, i.kind == 0u));
  let L = normalize(F.lightDir.xyz);
  let H = normalize(L + V);
  col += vec3f(1.0, 0.97, 0.9) * (pow(max(dot(n, H), 0.0), 900.0) * 3.0 + pow(max(dot(n, H), 0.0), 60.0) * 0.12);

  // foam and meniscus
  let foamCol = vec3f(1.05, 1.06, 1.06) * (0.75 + 0.35 * max(dot(n, L), 0.0));
  col = mix(col, foamCol, foam);
  col = mix(col, vec3f(1.15, 1.18, 1.18), edge * 0.85);

  return vec4f(col, frontD);
}
`;

// ---- translucent sprites: steam, smoke, splashes, pellets ------------------------------------------
// Instance: pos f32x3, size f32, colour unorm8x4 (rgb + alpha), parent+kind uint8x4
export const SPRITES = /* wgsl */`
struct VOut { @builtin(position) clip: vec4f, @location(0) uv: vec2f, @location(1) col: vec4f, @location(2) @interpolate(flat) kind: u32 };

@vertex fn vs(@builtin(vertex_index) vi: u32, @location(0) pos: vec3f, @location(1) size: f32, @location(2) col: vec4f, @location(3) info: vec4u) -> VOut {
  var q = array<vec2f, 6>(vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0), vec2f(-1.0, -1.0), vec2f(1.0, 1.0), vec2f(-1.0, 1.0));
  let c = q[vi];
  let p = jelly(objPos(info.x, pos));
  // camera-facing quad
  let fwd = normalize(F.camPos.xyz - p);
  let right = normalize(cross(vec3f(0.0, 1.0, 0.0), fwd));
  let up = cross(fwd, right);
  let w = p + (right * c.x + up * c.y) * size;
  var o: VOut;
  o.clip = F.viewProj * vec4f(w, 1.0);
  o.uv = c;
  o.col = col;
  o.kind = info.y;
  return o;
}

@fragment fn fs(i: VOut) -> @location(0) vec4f {
  let r = length(i.uv);
  if (r > 1.0) { discard; }
  var a: f32;
  if (i.kind == 1u) { a = smoothstep(1.0, 0.75, r); } // hard-ish droplet / pellet
  else { a = smoothstep(1.0, 0.0, r); a = a * a; }    // soft puff
  let c = srgb2lin(i.col.rgb) * 1.25;
  return vec4f(c * a * i.col.a, a * i.col.a);
}
`;

// ---- final: tone map, gentle vignette, dither ----------------------------------------------------------
export const TONEMAP = /* wgsl */`
@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var<uniform> P: vec4f; // exposure, time, 0, 0

struct VOut { @builtin(position) clip: vec4f, @location(0) uv: vec2f };
@vertex fn vs(@builtin(vertex_index) i: u32) -> VOut {
  var p = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  var o: VOut;
  o.clip = vec4f(p[i], 0.0, 1.0);
  o.uv = vec2f(p[i].x * 0.5 + 0.5, 0.5 - p[i].y * 0.5);
  return o;
}

fn aces(x: vec3f) -> vec3f {
  let a = 2.51; let b = 0.03; let c = 2.43; let d = 0.59; let e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), vec3f(0.0), vec3f(1.0));
}

@fragment fn fs(i: VOut) -> @location(0) vec4f {
  let c = textureLoad(src, vec2i(i.clip.xy), 0).rgb * P.x;
  var m = aces(c);
  let d = vec2f(i.uv.x - 0.42, i.uv.y - 0.5);
  m *= 1.0 - 0.08 * dot(d, d);
  var g = pow(m, vec3f(1.0 / 2.2));
  let pi = vec2u(i.clip.xy);
  var h = (pi.x * 1973u + pi.y * 9277u + u32(P.y * 60.0) * 26699u) | 1u;
  h = h * 747796405u + 2891336453u; h = ((h >> ((h >> 28u) + 4u)) ^ h) * 277803737u; h = (h >> 22u) ^ h;
  let n = f32(h) / 4294967295.0;
  g += (n - 0.5) / 255.0;
  return vec4f(g, 1.0);
}
`;
