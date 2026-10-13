// Crane kinematics and jobs. Each crane: gantry x along the rails, boom angle, trolley z (local), rope length, spreader sway.
// A job moves one group between the staging lane and a ship bay as a smooth sequence:
// travel, trolley out, lower (tracking the ship's heave), latch, hoist, trolley across, lower, unlatch, hoist.
import { quat, clamp } from '../gpu/math.js';
import { OBJ } from '../world/env.js';
import { CRANE, QUAY_TOP, RAIL_WATER_Z, RAIL_X, STAGING_Z, BERTH, BOX, SHIP, bayX } from '../world/layout.js';
import { Director, tween, waitTime, waitUntil, easeInOut } from './co.js';

const SPREADER_REST = 0.20;         // rope length when idle
const TRAVEL_Y = 0.50;              // spreader underside height (world) while carrying
const TROLLEY_WORLD_Y = QUAY_TOP + CRANE.trolleyY;

export class Crane {
  constructor(scene, ids, startX, name) {
    this.scene = scene;
    this.ids = ids;           // { g, b, t, s }
    this.name = name;
    this.x = startX; this.boom = 0; this.tz = CRANE.parkZ; this.rope = SPREADER_REST;
    this.sway = [0, 0]; this.swayV = [0, 0];
    this.prevTz = this.tz; this.prevX = this.x; this.vel = [0, 0]; this.prevVel = [0, 0];
    this.busy = false;
    this.carrying = null;
    this.targetX = startX;
    this.speed = 1;
  }

  get spreaderY() { return TROLLEY_WORLD_Y - this.rope; }
  trolleyWorldZ() { return RAIL_WATER_Z + this.tz; }

  apply() {
    const s = this.scene, id = this.ids;
    const base = [this.x, QUAY_TOP, RAIL_WATER_Z];
    s.setObject(id.g, base, [0, 0, 0, 1]);
    s.setObject(id.b, [this.x, QUAY_TOP + CRANE.hingeY, RAIL_WATER_Z], quat.axisAngle([1, 0, 0], -this.boom));
    s.setObject(id.t, [this.x, TROLLEY_WORLD_Y, this.trolleyWorldZ()], [0, 0, 0, 1]);
    const sx = this.sway[0], sz = this.sway[1];
    const tilt = quat.mul(quat.axisAngle([0, 0, 1], -sx / Math.max(this.rope, 0.05)), quat.axisAngle([1, 0, 0], sz / Math.max(this.rope, 0.05)));
    s.setObject(id.s, [this.x + sx, this.spreaderY, this.trolleyWorldZ() + sz], tilt);
  }

  // Pendulum sway driven by the trolley and gantry accelerations (visual only).
  updateSway(dt) {
    if (dt <= 0) return;
    const vx = (this.x - this.prevX) / dt, vz = (this.tz - this.prevTz) / dt;
    const ax = (vx - this.prevVel[0]) / dt, az = (vz - this.prevVel[1]) / dt;
    this.prevX = this.x; this.prevTz = this.tz; this.prevVel = [vx, vz];
    const L = Math.max(this.rope, 0.05), w2 = 3.2 / L;
    for (let i = 0; i < 2; i++) {
      const a = i === 0 ? ax : az;
      const acc = -w2 * this.sway[i] - 2.2 * this.swayV[i] - clamp(a, -4, 4) * 0.25 * (L / 0.3);
      this.swayV[i] += acc * dt; this.sway[i] += this.swayV[i] * dt;
      this.sway[i] = clamp(this.sway[i], -0.03, 0.03);
    }
  }
}

export class CraneYard {
  constructor(scene, cargo) {
    this.scene = scene;
    this.cargo = cargo;
    this.dir = new Director();
    this.a = new Crane(scene, { g: OBJ.CRANE_A, b: OBJ.BOOM_A, t: OBJ.TROLLEY_A, s: OBJ.SPREADER_A }, CRANE.startX[0], 'A');
    this.b = new Crane(scene, { g: OBJ.CRANE_B, b: OBJ.BOOM_B, t: OBJ.TROLLEY_B, s: OBJ.SPREADER_B }, CRANE.startX[1], 'B');
    this.cranes = [this.a, this.b];
    this.speed = 1;
    this.boomsUp = false;
    this.onLatch = null;   // callbacks for sounds
    this.onLand = null;
  }

  other(c) { return c === this.a ? this.b : this.a; }

  // World x of a bay at the berth.
  bayWorldX(bay) { return BERTH.x + bayX(bay); }

  // Limits that keep the cranes apart: A always stays left of B by minGap.
  allowedRange(c) {
    const o = this.other(c), gap = CRANE.minGap;
    if (c === this.a) return [RAIL_X[0], Math.min(RAIL_X[1] - gap, Math.min(o.x, o.targetX) - gap)];
    return [Math.max(RAIL_X[0] + gap, Math.max(o.x, o.targetX) + gap), RAIL_X[1]];
  }

  // Pick the better crane for a bay: one that can reach it (pushing an idle neighbour out of the way).
  pickCrane(bay) {
    const x = this.bayWorldX(bay);
    const free = this.cranes.filter(c => !c.busy);
    if (!free.length) return null;
    free.sort((p, q) => Math.abs(p.x - x) - Math.abs(q.x - x));
    return free[0];
  }

  // ---- routines -----------------------------------------------------------------------------------------
  *travelTo(c, x) {
    c.targetX = x;
    // wait until the other crane is clear; nudge it if it is idle
    const o = this.other(c);
    const gap = CRANE.minGap;
    const conflict = () => (c === this.a ? x > o.x - gap || x > o.targetX - gap : x < o.x + gap || x < o.targetX + gap);
    yield () => {
      if (!conflict()) return true;
      if (!o.busy) {
        const ox = c === this.a ? Math.min(RAIL_X[1], x + gap + 0.02) : Math.max(RAIL_X[0], x - gap - 0.02);
        this.dir.run(this.moveIdle(o, ox), 'crane-' + o.name);
      }
      return false;
    };
    const x0 = c.x, d = Math.abs(x - x0);
    if (d > 0.002) yield tween((0.4 + d / 0.42) / this.speed, k => { c.x = x0 + (x - x0) * k; });
  }

  *moveIdle(c, x) {
    c.busy = true;
    c.targetX = x;
    const x0 = c.x, d = Math.abs(x - x0);
    yield tween((0.4 + d / 0.42) / this.speed, k => { c.x = x0 + (x - x0) * k; });
    c.busy = false;
  }

  *trolleyTo(c, z) {
    const z0 = c.tz, d = Math.abs(z - z0);
    if (d > 0.002) yield tween((0.35 + d / 0.55) / this.speed, k => { c.tz = z0 + (z - z0) * k; });
  }

  // Lower the spreader until its underside reaches targetY() (a function, so it can track a bobbing ship).
  *lowerTo(c, targetY) {
    const r0 = c.rope;
    let t = 0;
    const dur = (0.45 + Math.abs(TROLLEY_WORLD_Y - targetY() - r0) / 0.45) / this.speed;
    yield dt => {
      t += dt;
      const k = Math.min(1, t / dur);
      const goal = TROLLEY_WORLD_Y - targetY();
      c.rope = r0 + (goal - r0) * easeInOut(k);
      return k >= 1;
    };
  }

  *hoistTo(c, y) {
    const r0 = c.rope, goal = TROLLEY_WORLD_Y - y;
    yield tween((0.4 + Math.abs(goal - r0) / 0.45) / this.speed, k => { c.rope = r0 + (goal - r0) * k; });
  }

  // The deck top under a ship bay right now (follows heave and pitch).
  shipDeckY(bay) {
    const ship = this.scene.getObject(OBJ.SHIP);
    const q = ship.q;
    const lx = bayX(bay);
    // local point on the hatch top at the bay's centre
    const p = rotate(q, [lx, SHIP.hatchY, 0]);
    return ship.pos[1] + p[1];
  }

  // Move a group from where it is to { kind: 'ship' | 'staging', bay }.
  *moveGroup(c, g, dest, onLatch, onLand) {
    c.busy = true;
    const src = g.where;
    const srcBay = src.bay;
    const hTop = this.cargo.heightOf(g);
    const zOf = w => (w.kind === 'ship' ? (shipZ(this.scene) - RAIL_WATER_Z) : STAGING_Z - RAIL_WATER_Z);
    const topOf = w => (w.kind === 'ship' ? () => this.shipDeckY(w.bay) + hTop : () => QUAY_TOP + 0.002 + hTop);
    // go
    if (this.boomsUp) yield* this.boomRoutine(c, 0);
    if (c.spreaderY < TRAVEL_Y + 0.1) yield* this.hoistTo(c, TRAVEL_Y + 0.12);
    yield* this.travelTo(c, this.bayWorldX(srcBay));
    yield* this.trolleyTo(c, zOf(src));
    yield* this.lowerTo(c, topOf(src));
    yield waitTime(0.12 / this.speed);
    g.where = { kind: 'spreader', obj: c.ids.s };
    c.carrying = g;
    if (onLatch) onLatch(g);
    if (this.onLatch) this.onLatch(c);
    yield* this.hoistTo(c, TRAVEL_Y + hTop * 0.5);
    if (dest.bay !== srcBay) yield* this.travelTo(c, this.bayWorldX(dest.bay));
    yield* this.trolleyTo(c, zOf(dest));
    yield* this.lowerTo(c, topOf(dest));
    yield waitTime(0.1 / this.speed);
    g.where = { kind: dest.kind, bay: dest.bay };
    c.carrying = null;
    if (this.onLand) this.onLand(c, g, dest);
    if (onLand) onLand(g);
    yield* this.hoistTo(c, TRAVEL_Y + 0.12);
    c.busy = false;
  }

  // Run a move; returns a promise that resolves when the group lands (and the crane has hoisted clear).
  move(g, dest, opts = {}) {
    const c = opts.crane || this.pickFor(dest.bay);
    let landed;
    const p = new Promise(res => { landed = res; });
    const h = this.dir.run(this.moveGroup(c, g, dest, opts.onLatch, gg => { landed(gg); if (opts.onLand) opts.onLand(gg); }), 'crane-' + c.name);
    h.promise.then(ok => { if (!ok) landed(null); });
    return p;
  }

  // Choose a crane for a bay: prefer the one already closest; it may push the other aside.
  pickFor(bay) {
    const x = this.bayWorldX(bay);
    const a = this.a, b = this.b;
    if (a.busy && !b.busy) return b;
    if (b.busy && !a.busy) return a;
    // A works the left side, B the right; split at the midpoint between them
    return Math.abs(a.x - x) <= Math.abs(b.x - x) ? a : b;
  }

  idle() { return !this.a.busy && !this.b.busy && !this.dir.busy; }

  *boomRoutine(c, angle) {
    if (angle > 0) yield* this.trolleyTo(c, CRANE.parkZ);
    if (angle > 0) yield* this.hoistTo(c, TROLLEY_WORLD_Y - SPREADER_REST);
    const a0 = c.boom;
    yield tween(Math.max(0.6, Math.abs(angle - a0) * 2.4) / this.speed, k => { c.boom = a0 + (angle - a0) * k; });
  }

  // Booms up (both), resolves when done.
  setBooms(up) {
    this.boomsUp = up;
    const ps = this.cranes.map(c => {
      const h = this.dir.run((function* (self) { c.busy = true; yield* self.boomRoutine(c, up ? 1.22 : 0); c.busy = false; })(this), 'boom-' + c.name);
      return h.promise;
    });
    return Promise.all(ps);
  }

  parkTrolleys() {
    return Promise.all(this.cranes.map(c => this.dir.run((function* (self) { c.busy = true; yield* self.trolleyTo(c, CRANE.parkZ); yield* self.hoistTo(c, TROLLEY_WORLD_Y - SPREADER_REST); c.busy = false; })(this), 'park').promise));
  }

  update(dt) {
    this.dir.tick(dt);
    for (const c of this.cranes) { c.updateSway(dt); c.apply(); }
  }
}

function shipZ(scene) { return scene.getObject(OBJ.SHIP).pos[2]; }
function rotate(q, v) {
  const [x, y, z, w] = q;
  const ix = w * v[0] + y * v[2] - z * v[1], iy = w * v[1] + z * v[0] - x * v[2], iz = w * v[2] + x * v[1] - y * v[0], iw = -x * v[0] - y * v[1] - z * v[2];
  return [ix * w + iw * -x + iy * -z - iz * -y, iy * w + iw * -y + iz * -x - ix * -z, iz * w + iw * -z + ix * -y - iy * -x];
}
