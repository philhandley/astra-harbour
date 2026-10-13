// The ship's day: work at the berth, booms up, the tug comes round to the bow, casts her off, the ship sails a lap
// of the harbour past the lighthouse, the tug waits at standby, noses in and pushes her onto the fenders, booms down.
// Also floats the yachts, buoys and fishing boats, and hands every moving hull to the water simulation.
import { quat, clamp, wrapAngle, lerp, damp } from '../gpu/math.js';
import { OBJ } from '../world/env.js';
import {
  BERTH, SHIP, LAP, APPROACH_Z, TUG_STANDBY, YACHT_MOOR, MOORING_BUOYS, CHANNEL_BUOY, BOAT_MOOR, FISHBOAT, LIGHTHOUSE,
} from '../world/layout.js';
import { TUG_HOME, RADAR_LOCAL, PROP_LOCAL, TUG_PROP_LOCAL, TUG_HOOK_LOCAL, SHIP_BOW_BOLLARD_LOCAL } from '../world/rig.js';
import { Director, tween, waitTime, waitUntil, easeInOut, linear, frame } from './co.js';
import { Path } from './path.js';
import { Floater } from './floats.js';

const HL = SHIP.length / 2, HB = SHIP.beam / 2;
export const TUG = { halfL: 0.17, halfB: 0.065, draft: 0.05 };
const SWING = -0.30;                 // ship yaw after the tug has pulled her bow off
const PIVOT_LOCAL = [-0.96, -HB];    // port quarter stays on the fenders while the bow swings out
const LINE_LEN = 0.28;

export const STATUS = {
  work: 'Working cargo', unloading: 'Unloading', loading: 'Loading', boomsUp: 'Booms up', tugComing: 'Tug coming',
  castingOff: 'Casting off', atSea: 'At sea', comingIn: 'Coming in', berthing: 'Berthing', boomsDown: 'Booms down',
};

function fwd(yaw) { return [Math.cos(yaw), -Math.sin(yaw)]; }
function stb(yaw) { return [Math.sin(yaw), Math.cos(yaw)]; }
function localToWorld(x, z, yaw, lx, lz) { const f = fwd(yaw), s = stb(yaw); return [x + f[0] * lx + s[0] * lz, z + f[1] * lx + s[1] * lz]; }

export class Harbour {
  constructor(scene, cranes) {
    this.scene = scene;
    this.cranes = cranes;
    this.dir = new Director();
    this.ship = { x: BERTH.x, z: BERTH.z, yaw: BERTH.yaw, speed: 0, float: new Floater(HL, HB, { k: 9, c: 4.2, kr: 10, cr: 4.5, maxTilt: 0.035, gain: 0.8 }), prop: 0, propSpin: 0 };
    this.tug = { x: TUG_HOME.x, z: TUG_HOME.z, yaw: TUG_HOME.yaw, float: new Floater(TUG.halfL, TUG.halfB, { k: 22, c: 5, maxTilt: 0.09 }), prop: 0, propSpin: 0, wash: 0, smoke: 0 };
    this.line = 0;              // 0 stowed at the tug, 1 made fast on the ship's bow
    this.phase = 'work';
    this.progress = 0;
    this.status = STATUS.work;
    this.hurry = 1;
    this.lampAngle = 0;
    this.radar = 0;
    this.voyages = 0;
    this.listeners = {};
    this.workDone = false;      // set by whoever runs the cargo work (the auto worker or a game) to let her sail
    this.hold = false;          // true while something (the fishing boats' parade) needs the ship to stay put
    this.paused = false;
    // other floats
    this.yachts = YACHT_MOOR.map((m, i) => ({ id: i ? OBJ.YACHT_2 : OBJ.YACHT_1, buoy: m, ang: i ? 2.4 : 0.6, yaw: 0, float: new Floater(0.13, 0.045, { k: 30, c: 5, maxTilt: 0.16 }) }));
    this.buoys = [
      { id: OBJ.CHANNEL_BUOY, x: CHANNEL_BUOY[0], z: CHANNEL_BUOY[1], float: new Floater(0.04, 0.04, { k: 40, c: 5, maxTilt: 0.3, gain: 1.4 }) },
      ...MOORING_BUOYS.map((b, i) => ({ id: OBJ.MOOR_1 + i, x: b[0], z: b[1], float: new Floater(0.03, 0.03, { k: 45, c: 5, maxTilt: 0.3, gain: 1.4 }) })),
    ];
    this.boats = BOAT_MOOR.map((m, i) => ({ id: i ? OBJ.BOAT_B : OBJ.BOAT_A, x: m.x, z: m.z, yaw: m.yaw, home: m, float: new Floater(FISHBOAT.length / 2, FISHBOAT.beam / 2, { k: 24, c: 5, maxTilt: 0.1 }), speed: 0, away: false }));
    this.voyagePath = this.buildVoyage();
  }

  on(ev, fn) { (this.listeners[ev] = this.listeners[ev] || []).push(fn); }
  emit(ev, ...a) { for (const fn of this.listeners[ev] || []) fn(...a); }
  setPhase(p, status) { this.phase = p; this.status = status || STATUS[p] || p; this.emit('phase', p); }

  // ---- geometry of the manoeuvres ----------------------------------------------------------------------
  swingPose(k, out = 0) {
    const pivot = localToWorld(BERTH.x, BERTH.z, BERTH.yaw, PIVOT_LOCAL[0], PIVOT_LOCAL[1]);
    const yaw = SWING * k;
    const c = localToWorld(pivot[0], pivot[1], yaw, -PIVOT_LOCAL[0], -PIVOT_LOCAL[1]);
    return { x: c[0], z: c[1] + 0.12 * out, yaw };
  }

  buildVoyage() {
    const s = this.swingPose(1, 1);
    const phi0 = 1.0;
    const e = { x: LAP.cx + LAP.r * Math.sin(phi0), z: LAP.cz - LAP.r * Math.cos(phi0) };
    const p = new Path();
    p.hermite(s.x, s.z, s.yaw, e.x, e.z, -phi0, 0.9, 40);
    p.arc(LAP.cx, LAP.cz, LAP.r, phi0, Math.PI * 2, 0.035);
    p.hermite(LAP.cx, LAP.cz - LAP.r, 0, BERTH.x, APPROACH_Z, 0, 1, 12);
    return p;
  }

  shipBollardWorld() {
    const sh = this.ship;
    const p = localToWorld(sh.x, sh.z, sh.yaw, SHIP_BOW_BOLLARD_LOCAL[0], SHIP_BOW_BOLLARD_LOCAL[2]);
    return [p[0], this.scene.sea + SHIP_BOW_BOLLARD_LOCAL[1], p[1]];
  }

  // ---- the day ----------------------------------------------------------------------------------------
  start() { this.dayHandle = this.dir.run(this.day(), 'day'); }

  *day() {
    for (;;) {
      this.workDone = false;
      this.setPhase('work');
      this.emit('workStart');
      yield waitUntil(() => this.workDone && !this.hold);
      yield* this.departure();
      yield* this.voyage();
      yield* this.arrival();
    }
  }

  *departure() {
    this.setPhase('boomsUp');
    yield waitUntil(() => this.cranes.idle());
    yield waitPromise(this.cranes.parkTrolleys());
    yield waitPromise(this.cranes.setBooms(true));
    // the tug leaves its berth and comes round to the bow
    this.setPhase('tugComing');
    const b = this.shipBollardWorld();
    const u = norm2([0.618, 0.786]);
    const pull = { x: b[0] + u[0] * (LINE_LEN + TUG_HOOK_LOCAL[0]), z: b[2] + u[1] * (LINE_LEN + TUG_HOOK_LOCAL[0]), yaw: Math.atan2(u[1], -u[0]) };
    yield* this.tugRoute([
      { x: TUG_HOME.x, z: TUG_HOME.z, yaw: TUG_HOME.yaw },
      { x: 0.66, z: -0.42, yaw: Math.PI * 0.88 },
      { x: 0.62, z: -0.12, yaw: 2.5 },
      { x: pull.x + 0.05, z: pull.z + 0.06, yaw: pull.yaw },
      pull,
    ], 0.24);
    // pass the line, back away pulling the bow off
    this.setPhase('castingOff');
    yield tween(1.0, k => { this.line = k; });
    yield waitTime(0.3);
    const tug = this.tug;
    yield tween(5.5 / this.hurry, k => {
      const a = easeInOut(Math.min(1, k * 1.25)), o = easeInOut(clamp((k - 0.55) / 0.45, 0, 1));
      const pose = this.swingPose(a, o);
      Object.assign(this.ship, pose);
      const bb = this.shipBollardWorld();
      tug.x = bb[0] + u[0] * (LINE_LEN + TUG_HOOK_LOCAL[0]); tug.z = bb[2] + u[1] * (LINE_LEN + TUG_HOOK_LOCAL[0]);
      tug.prop = -0.8; tug.wash = 0.8;
    }, linear);
    tug.prop = 0; tug.wash = 0;
    // cast off, pivot on the spot and head home
    yield tween(0.8, k => { this.line = 1 - k; });
    const y0 = tug.yaw;
    yield tween(1.8 / this.hurry, k => { tug.yaw = y0 + (wrapAngle(-0.65 - y0)) * k; tug.prop = 0.5; });
    this.horn();
    this.dir.run(this.tugHome(), 'tug');
  }

  *tugHome() {
    const t = this.tug;
    yield* this.tugRoute([
      { x: t.x, z: t.z, yaw: t.yaw },
      { x: t.x + 0.25, z: t.z - 0.12, yaw: -0.6 },
      { x: 0.64, z: -0.02, yaw: Math.PI * 0.75 },
      { x: 0.68, z: -0.42, yaw: Math.PI },
      { x: TUG_HOME.x, z: TUG_HOME.z, yaw: TUG_HOME.yaw },
    ], 0.24);
  }

  *voyage() {
    this.setPhase('atSea');
    const P = this.voyagePath, L = P.length;
    let s = 0, v = 0;
    const vmax = 0.27, acc = 0.07, dec = 0.05;
    this.voyages += 1;
    let tugOut = false;
    this.hurry = 1;
    while (s < L - 0.0005) {
      const dt = yield* frame();
      const vm = vmax * this.hurry;
      const rem = L - s;
      const want = Math.min(vm, Math.sqrt(2 * dec * rem) + 0.004);
      v = v < want ? Math.min(want, v + acc * dt * this.hurry) : Math.max(want, v - dec * 2 * dt);
      s = Math.min(L, s + v * dt);
      const p = P.at(s);
      this.ship.x = p.x; this.ship.z = p.z; this.ship.yaw = p.yaw; this.ship.speed = v; this.ship.prop = v / vmax;
      this.progress = s / L;
      if (this.progress > 0.82 && this.phase === 'atSea') this.setPhase('comingIn');
      else if (this.phase === 'atSea') this.status = `${STATUS.atSea} ${Math.round(this.progress * 100)}%`;
      if (!tugOut && this.progress > 0.35) { tugOut = true; this.dir.run(this.tugToStandby(), 'tug'); }
    }
    this.ship.speed = 0; this.ship.prop = 0;
    this.progress = 1;
  }

  *tugToStandby() {
    yield waitUntil(() => !this.tugBusy);
    const t = this.tug;
    yield* this.tugRoute([
      { x: t.x, z: t.z, yaw: t.yaw },
      { x: 0.66, z: -0.40, yaw: 0.6 },
      { x: 0.66, z: 0.02, yaw: -1.2 },
      { x: TUG_STANDBY.x, z: TUG_STANDBY.z, yaw: Math.PI * 0.85 },
    ], 0.22);
  }

  *arrival() {
    this.setPhase('berthing');
    yield waitUntil(() => !this.tugBusy);
    const t = this.tug, sh = this.ship;
    const contactZ = sh.z + HB + TUG.halfL + 0.014;
    yield* this.tugRoute([
      { x: t.x, z: t.z, yaw: t.yaw },
      { x: 0.25, z: 0.50, yaw: Math.PI },
      { x: -0.55, z: 0.52, yaw: Math.PI * 0.9 },
      { x: BERTH.x + 0.02, z: contactZ + 0.16, yaw: Math.PI / 2 },
      { x: BERTH.x, z: contactZ + 0.02, yaw: Math.PI / 2 },
    ], 0.24);
    yield tween(0.6, k => { t.z = contactZ + 0.02 - 0.021 * k; });
    // push her sideways onto the fenders, prop wash churning
    const z0 = sh.z, z1 = BERTH.z;
    yield tween(6.0 / this.hurry, k => {
      sh.z = z0 + (z1 - z0) * k; sh.x = lerp(sh.x, BERTH.x, 0.05); sh.yaw = lerp(sh.yaw, 0, 0.05);
      t.z = sh.z + HB + TUG.halfL + 0.013; t.x = sh.x;
      t.prop = 1; t.wash = 1;
    }, easeInOut);
    Object.assign(sh, { x: BERTH.x, z: BERTH.z, yaw: BERTH.yaw });
    t.prop = 0; t.wash = 0;
    yield waitTime(0.6);
    // back off and go home
    this.dir.run(this.tugHomeFromPush(), 'tug');
    this.setPhase('boomsDown');
    yield waitPromise(this.cranes.setBooms(false));
    this.hurry = 1;
  }

  *tugHomeFromPush() {
    const t = this.tug;
    yield* this.tugRoute([
      { x: t.x, z: t.z, yaw: t.yaw },
      { x: t.x, z: t.z + 0.16, yaw: Math.PI / 2 },
      { x: t.x + 0.45, z: 0.36, yaw: 0.3 },
      { x: 0.45, z: 0.10, yaw: 0.6 },
      { x: 0.64, z: -0.06, yaw: Math.PI * 0.75 },
      { x: 0.68, z: -0.42, yaw: Math.PI },
      { x: TUG_HOME.x, z: TUG_HOME.z, yaw: TUG_HOME.yaw },
    ], 0.24);
  }

  // The tug follows waypoints (position spline, heading blended separately: tugs can crab sideways).
  *tugRoute(pts, speed) {
    this.tugBusy = true;
    const t = this.tug;
    const path = new Path();
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const ha = i === 0 ? headingTo(a, b) : headingTo(pts[i - 1], b);
      const hb = i === pts.length - 2 ? headingTo(a, b) : headingTo(a, pts[i + 2]);
      path.hermite(a.x, a.z, ha, b.x, b.z, hb, 0.5, 24);
    }
    // arc length at each waypoint, for heading blending
    const marks = [0];
    let acc = 0;
    for (let i = 1; i < pts.length; i++) { acc += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z); marks.push(acc); }
    const scale = path.length / Math.max(acc, 1e-6);
    const L = path.length;
    let s = 0, v = 0;
    const yaw0 = t.yaw;
    while (s < L - 0.0005) {
      const dt = yield* frame();
      const vm = speed * this.hurry;
      const want = Math.min(vm, Math.sqrt(2 * 0.09 * (L - s)) + 0.003);
      v = v < want ? Math.min(want, v + 0.18 * dt) : Math.max(want, v - 0.3 * dt);
      s = Math.min(L, s + v * dt);
      const p = path.at(s);
      t.x = p.x; t.z = p.z;
      // heading: interpolate between the waypoint headings by distance
      const d = s / scale;
      let i = 1; while (i < marks.length - 1 && marks[i] < d) i++;
      const k = clamp((d - marks[i - 1]) / Math.max(marks[i] - marks[i - 1], 1e-6), 0, 1);
      const ya = i === 1 ? yaw0 : pts[i - 1].yaw, yb = pts[i].yaw;
      t.yaw = ya + wrapAngle(yb - ya) * easeInOut(k);
      // propeller: forward if moving along the heading, astern if backing
      const f = fwd(t.yaw);
      const dirMove = [Math.cos(p.yaw), -Math.sin(p.yaw)];
      t.prop = (f[0] * dirMove[0] + f[1] * dirMove[1]) * (v / speed);
      t.wash = Math.abs(t.prop) * 0.4;
    }
    t.prop = 0; t.wash = 0;
    this.tugBusy = false;
  }

  horn() { this.emit('horn'); }
  finishWork() { this.workDone = true; }
  callIn() { this.hurry = 2.2; }
  get atBerth() { return this.phase === 'work' || this.phase === 'unloading' || this.phase === 'loading'; }

  // ---- every frame --------------------------------------------------------------------------------------
  update(dt) {
    if (this.paused) dt = 0;
    this.dir.tick(dt);
    const sc = this.scene, sim = sc.sim, sea = sc.sea;
    // ship
    const sh = this.ship;
    sh.float.update(sim, sh.x, sh.z, sh.yaw, dt);
    const sq = sh.float.quat(sh.yaw);
    const shipPos = [sh.x, sea + sh.float.h, sh.z];
    sc.setObject(OBJ.SHIP, shipPos, sq);
    sh.propSpin += dt * (2 + sh.prop * 22);
    this.radar += dt * 2.4;
    setChild(sc, OBJ.RADAR, shipPos, sq, RADAR_LOCAL, quat.axisAngle([0, 1, 0], this.radar));
    setChild(sc, OBJ.PROP, shipPos, sq, PROP_LOCAL, quat.axisAngle([1, 0, 0], sh.propSpin));
    // tug
    const t = this.tug;
    t.float.update(sim, t.x, t.z, t.yaw, dt);
    t.float.extraPitch = damp(t.float.extraPitch, -Math.abs(t.prop) * 0.03, 3, dt);
    const tq = t.float.quat(t.yaw);
    const tugPos = [t.x, sea + t.float.h, t.z];
    sc.setObject(OBJ.TUG, tugPos, tq);
    t.propSpin += dt * (3 + Math.abs(t.prop) * 30) * (t.prop < 0 ? -1 : 1);
    setChild(sc, OBJ.TUG_PROP, tugPos, tq, TUG_PROP_LOCAL, quat.axisAngle([1, 0, 0], t.propSpin));
    // tow line end: at the tug's hook when stowed, on the ship's bow bollard when out
    const hook = addv(tugPos, quat.rotate(tq, TUG_HOOK_LOCAL));
    const boll = addv(shipPos, quat.rotate(sq, SHIP_BOW_BOLLARD_LOCAL));
    const lk = easeInOut(this.line);
    const mid = [lerp(hook[0], boll[0], lk), lerp(hook[1], boll[1], lk) + Math.sin(Math.PI * lk) * 0.06 * (1 - lk), lerp(hook[2], boll[2], lk)];
    sc.setObject(OBJ.TOWLINE, mid, [0, 0, 0, 1]);
    // lighthouse lamp
    this.lampAngle += dt * 1.1;
    sc.setObject(OBJ.LAMP, [LIGHTHOUSE.x, LIGHTHOUSE.towerTop + 0.055, LIGHTHOUSE.z], quat.axisAngle([0, 1, 0], this.lampAngle));
    // yachts swing on their moorings
    for (const y of this.yachts) {
      y.ang += dt * 0.06 * Math.sin(sc.time * 0.13 + y.id);
      const r = 0.13;
      const x = y.buoy.x + Math.cos(y.ang) * r, z = y.buoy.z + Math.sin(y.ang) * r;
      const yaw = Math.atan2(-(y.buoy.z - z), y.buoy.x - x); // bow toward the buoy
      y.yaw = yaw;
      y.float.update(sim, x, z, yaw, dt);
      sc.setObject(y.id, [x, sea + y.float.h, z], y.float.quat(yaw));
    }
    for (const b of this.buoys) {
      b.float.update(sim, b.x, b.z, 0, dt);
      sc.setObject(b.id, [b.x, sea + b.float.h, b.z], b.float.quat(Math.sin(sc.time * 0.3 + b.id) * 0.4));
    }
    for (const b of this.boats) {
      b.float.update(sim, b.x, b.z, b.yaw, dt);
      sc.setObject(b.id, [b.x, sea + b.float.h, b.z], b.float.quat(b.yaw));
    }
    // hand the hulls to the water
    sim.clearPress();
    sim.addHull(sh.x, sh.z, sh.yaw, HL, HB, SHIP.draft * 0.42);
    sim.addHull(t.x, t.z, t.yaw, TUG.halfL, TUG.halfB, TUG.draft * 0.5);
    for (const b of this.boats) if (b.speed > 0.01) sim.addHull(b.x, b.z, b.yaw, FISHBOAT.length / 2, FISHBOAT.beam / 2, 0.02);
    // prop wash and white water
    if (t.wash > 0.05) {
      const back = localToWorld(t.x, t.z, t.yaw, -TUG.halfL - 0.04, 0);
      sim.addFoam(back[0], back[1], 0.06, t.wash * dt * 3);
      if (Math.random() < t.wash * 0.5) sim.disturb(back[0], back[1], 0.05, 0.0012 * t.wash);
    }
    if (sh.speed > 0.03) {
      const bow = localToWorld(sh.x, sh.z, sh.yaw, HL * 0.95, 0), stern = localToWorld(sh.x, sh.z, sh.yaw, -HL * 1.02, 0);
      sim.addFoam(bow[0], bow[1], 0.05, sh.speed * dt * 4);
      sim.addFoam(stern[0], stern[1], 0.07, sh.speed * dt * 6);
    }
  }

  // Hulls for the fish and the lifebuoys to avoid.
  hulls() {
    const s = this.ship, t = this.tug;
    const out = [{ x: s.x, z: s.z, yaw: s.yaw, halfL: HL, halfB: HB, draft: SHIP.draft, speed: s.speed, id: OBJ.SHIP },
      { x: t.x, z: t.z, yaw: t.yaw, halfL: TUG.halfL, halfB: TUG.halfB, draft: TUG.draft, speed: Math.abs(t.prop) * 0.2, id: OBJ.TUG }];
    for (const b of this.boats) out.push({ x: b.x, z: b.z, yaw: b.yaw, halfL: FISHBOAT.length / 2, halfB: FISHBOAT.beam / 2, draft: 0.04, speed: b.speed, id: b.id });
    for (const y of this.yachts) { const o = this.scene.getObject(y.id); out.push({ x: o.pos[0], z: o.pos[2], yaw: y.yaw, halfL: 0.13, halfB: 0.045, draft: 0.06, speed: 0, id: y.id }); }
    return out;
  }
}

// ---- helpers ------------------------------------------------------------------------------------------------
function waitPromise(p) { let done = false; p.then(() => { done = true; }, () => { done = true; }); return () => done; }
function headingTo(a, b) { return Math.atan2(-(b.z - a.z), b.x - a.x); }
function norm2(v) { const l = Math.hypot(v[0], v[1]); return [v[0] / l, v[1] / l]; }
function addv(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
function setChild(sc, id, ppos, pq, local, spin) {
  const p = quat.rotate(pq, local);
  sc.setObject(id, [ppos[0] + p[0], ppos[1] + p[1], ppos[2] + p[2]], quat.mul(pq, spin));
}
