// The scene: renderer + terrain + water simulation + static harbour mesh + object transforms + jelly physics.
// Systems (cranes, ships, life, game) write into scene.objects, scene.instanceGroups and scene.sprites each frame.
import { createRenderer } from '../gpu/renderer.js';
import { MeshBuilder } from '../gpu/mesh.js';
import { quat, mat4, clamp } from '../gpu/math.js';
import { buildTerrain, buildTerrainGrid, buildWaterMesh } from './terrain.js';
import { WaterSim } from '../sim/water.js';
import { OBJ, LIGHT, flavourUniforms } from './env.js';
import { OrbitCamera } from './camera.js';
import { B, BOTTOM, SEA, TIDE } from './layout.js';

export const BUILDERS = ['terminal', 'fishquay', 'town', 'breakwater', 'seabed', 'vessels', 'cranes', 'gamemarks'];

export class Scene {
  static async create(canvas, opts = {}) {
    const s = new Scene();
    s.canvas = canvas;
    s.opts = opts;
    s.r = await createRenderer(canvas, { onLost: opts.onLost, msaa: opts.msaa, causticGrid: opts.causticGrid, simN: opts.simN });
    s.N = s.r.N;
    s.terrain = buildTerrainGrid(s.N);
    s.r.uploadTerrain(s.terrain.data);
    s.sim = new WaterSim(s.N, s.terrain);
    s.r.setWaterMesh(buildWaterMesh(s.N + 1));
    s.camera = new OrbitCamera();
    s.objects = new Float32Array(OBJ.COUNT * 8);
    for (let i = 0; i < OBJ.COUNT; i++) s.objects[i * 8 + 7] = 1;
    s.instanceGroups = [];
    s.sprites = { data: new ArrayBuffer(3000 * 24), count: 0 };
    s.flavour = 'seaglass';
    s.flav = flavourUniforms(s.flavour);
    s.time = 0;
    s.tide = 0;            // -1..1 of TIDE
    s.firmness = 1;        // 0.4..1.6
    s.lampGlow = 0.6;
    s.reducedMotion = !!opts.reducedMotion;
    s.exposure = 1.0;
    s.jel = { ax: 0, az: 0, vax: 0, vaz: 0, tax: 0, taz: 0, held: false, sx: 0, sz: 0, vsx: 0, vsz: 0, sq: 0, vsq: 0, accX: 0, accZ: 0 };
    s.tiltMat = mat4.ident();
    s.buildStats = {};
    await s.buildStatic(opts.builders || BUILDERS);
    return s;
  }

  async buildStatic(names) {
    const mb = new MeshBuilder();
    buildTerrain(mb);
    this.buildStats.terrain = mb.triangles;
    this.templates = [];
    this.points = {};
    for (const name of names) {
      try {
        const mod = await import(`./geo/${name}.js`);
        const before = mb.triangles;
        mod.build(mb, { scene: this });
        this.buildStats[name] = mb.triangles - before;
        if (mod.templates) for (const t of mod.templates()) this.templates.push(t);
        if (mod.points) this.points[name] = mod.points;
      } catch (err) {
        if (!String(err).includes('Failed to fetch') && !String(err).includes('dynamically imported')) console.error('builder', name, err);
        else console.warn('builder missing', name);
      }
    }
    this.staticMesh = mb.finish();
    this.r.setStatic(this.staticMesh);
    if (this.templates.length) this.r.setTemplates(this.templates);
  }

  setTemplates(list) { this.templates = list; this.r.setTemplates(list); }
  // Systems that bring their own instanced meshes (life, lifebuoys) add them here.
  addTemplates(list) {
    for (const t of list) { this.templates = this.templates.filter(x => x.name !== t.name); this.templates.push(t); }
    this.r.setTemplates(this.templates);
  }

  setObject(id, pos, q) {
    const o = this.objects, k = id * 8;
    o[k] = pos[0]; o[k + 1] = pos[1]; o[k + 2] = pos[2];
    o[k + 4] = q[0]; o[k + 5] = q[1]; o[k + 6] = q[2]; o[k + 7] = q[3];
  }
  getObject(id) {
    const o = this.objects, k = id * 8;
    return { pos: [o[k], o[k + 1], o[k + 2]], q: [o[k + 4], o[k + 5], o[k + 6], o[k + 7]] };
  }

  setFlavour(id) { this.flavour = id; this.flav = flavourUniforms(id); }

  get sea() { return SEA + this.tide * TIDE; }

  // ---- jelly ---------------------------------------------------------------------------------
  // Hold a tilt (radians about x and z) while dragging; release lets it spring back and quiver.
  holdTilt(ax, az) { const j = this.jel; j.held = true; j.tax = clamp(ax, -0.17, 0.17); j.taz = clamp(az, -0.17, 0.17); }
  releaseTilt() { this.jel.held = false; }
  poke(dx, dz, squash = 0) { const j = this.jel; j.vsx += dx; j.vsz += dz; j.vsq += squash; }

  updateJelly(dt) {
    const j = this.jel, f = this.firmness;
    const kT = 30 * f, cT = 4.2 * Math.sqrt(f);
    const tx = j.held ? j.tax : 0, tz = j.held ? j.taz : 0;
    const aax = kT * (tx - j.ax) - cT * j.vax, aaz = kT * (tz - j.az) - cT * j.vaz;
    j.vax += aax * dt; j.vaz += aaz * dt; j.ax += j.vax * dt; j.az += j.vaz * dt;
    // shear and squash ring like jelly, driven by the tilt's acceleration
    const kS = 120 * f, cS = 2.4 * Math.sqrt(f);
    const asx = -kS * j.sx - cS * j.vsx + aaz * 0.06;
    const asz = -kS * j.sz - cS * j.vsz - aax * 0.06;
    j.vsx += asx * dt; j.vsz += asz * dt; j.sx += j.vsx * dt; j.sz += j.vsz * dt;
    j.sx = clamp(j.sx, -0.25, 0.25); j.sz = clamp(j.sz, -0.25, 0.25);
    const kQ = 160 * f, cQ = 3.0 * Math.sqrt(f);
    j.vsq += (-kQ * j.sq - cQ * j.vsq) * dt; j.sq += j.vsq * dt; j.sq = clamp(j.sq, -0.12, 0.12);
    j.accX = asx; j.accZ = asz;
    // tilt matrix: rotate about the base centre, lifted so the low corner stays on the paper
    const q = quat.mul(quat.axisAngle([1, 0, 0], j.ax), quat.axisAngle([0, 0, 1], j.az));
    const lift = B * (Math.abs(Math.sin(j.ax)) + Math.abs(Math.sin(j.az)));
    const R = quatToMat(q);
    const T1 = mat4.ident(); T1[13] = -BOTTOM;
    const T2 = mat4.ident(); T2[13] = BOTTOM + lift;
    this.tiltMat = mat4.mul(T2, mat4.mul(R, T1));
    // gravity in the block's frame drives the slosh
    const gb = quat.rotate(quat.conj(q), [0, -1, 0]);
    this.sim.accel[0] = gb[0] * this.sim.g - asx * 0.9;
    this.sim.accel[1] = gb[2] * this.sim.g - asz * 0.9;
    this.tiltQ = q;
  }

  // ---- frame -------------------------------------------------------------------------------------
  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, this.opts.maxDpr || 1.5) * (this.renderScale || 1);
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    this.r.resize(w * dpr, h * dpr);
  }

  step(dt) {
    this.time += dt;
    this.updateJelly(dt);
    this.sim.step(dt);
    this.camera.update(dt);
  }

  render() {
    this.r.uploadSim(this.sim.pack());
    const f = this.flav;
    const j = this.jel;
    this.r.draw({
      cam: this.camera.state(),
      time: this.time,
      sea: this.sea,
      light: LIGHT,
      tilt: this.tiltMat,
      jelly: [j.sx, j.sz, j.sq, this.reducedMotion ? 0.35 : 1],
      water: { A: f.A, B: f.B, C: f.C },
      misc: [this.lampGlow, this.reducedMotion ? 1 : 0, 1.0, this.exposure],
      strata: f.strata,
      objects: this.objects,
      instances: this.instanceGroups,
      sprites: this.sprites,
      exposure: this.exposure,
    });
  }

  // World ray from a canvas pixel (CSS px) -> { origin, dir } in world space (with the jelly tilt undone approximately).
  ray(px, py) {
    const cm = this.r.camera;
    if (!cm) return null;
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    const nx = (px / w) * 2 - 1, ny = 1 - (py / h) * 2;
    const a = mat4.xform(cm.inv, [nx, ny, 0]), b = mat4.xform(cm.inv, [nx, ny, 1]);
    // undo the tilt so the ray lives in block space
    const inv = mat4.invert(this.tiltMat);
    const A = mat4.xform(inv, a), Bp = mat4.xform(inv, b);
    const d = [Bp[0] - A[0], Bp[1] - A[1], Bp[2] - A[2]];
    const l = Math.hypot(d[0], d[1], d[2]);
    return { origin: A, dir: [d[0] / l, d[1] / l, d[2] / l] };
  }

  // Project a block-space point to CSS pixels.
  project(p) {
    const cm = this.r.camera;
    if (!cm) return null;
    const w = mat4.xform(this.tiltMat, p);
    const c = mat4.xform(cm.vp, w);
    return [(c[0] * 0.5 + 0.5) * this.canvas.clientWidth, (0.5 - c[1] * 0.5) * this.canvas.clientHeight, c[2]];
  }
}

function quatToMat(q) {
  const [x, y, z, w] = q, m = mat4.ident();
  m[0] = 1 - 2 * (y * y + z * z); m[1] = 2 * (x * y + z * w); m[2] = 2 * (x * z - y * w);
  m[4] = 2 * (x * y - z * w); m[5] = 1 - 2 * (x * x + z * z); m[6] = 2 * (y * z + x * w);
  m[8] = 2 * (x * z + y * w); m[9] = 2 * (y * z - x * w); m[10] = 1 - 2 * (x * x + y * y);
  return m;
}
