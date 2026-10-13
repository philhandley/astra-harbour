// Floating bodies ride the simulated water: heave, pitch (bow up) and roll (starboard down) follow the surface
// sampled just outside the hull, with springy smoothing so big hulls move slowly and buoys bob quickly.
import { quat } from '../gpu/math.js';

export class Floater {
  constructor(halfL, halfB, opts = {}) {
    this.hl = halfL; this.hb = halfB;
    this.k = opts.k || 26; this.c = opts.c || 6.5;
    this.kr = opts.kr || this.k * 1.4; this.cr = opts.cr || this.c;
    this.maxTilt = opts.maxTilt || 0.12;
    this.gain = opts.gain || 1;
    this.h = 0; this.vh = 0; this.p = 0; this.vp = 0; this.r = 0; this.vr = 0;
    this.extraRoll = 0; this.extraPitch = 0;
  }
  update(sim, x, z, yaw, dt) {
    if (dt <= 0) return;
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const fx = c, fz = -s, sx = s, sz = c;
    const L = this.hl * 1.12 + 0.02, Bm = this.hb * 1.35 + 0.02;
    const hb = sim.heightAt(x + fx * L, z + fz * L), hs = sim.heightAt(x - fx * L, z - fz * L);
    const hp = sim.heightAt(x - sx * Bm, z - sz * Bm), hst = sim.heightAt(x + sx * Bm, z + sz * Bm);
    const th = (hb + hs + hp + hst) * 0.25 * this.gain;
    const tp = Math.max(-this.maxTilt, Math.min(this.maxTilt, Math.atan2(hb - hs, 2 * L) * this.gain + this.extraPitch));
    const tr = Math.max(-this.maxTilt, Math.min(this.maxTilt, Math.atan2(hp - hst, 2 * Bm) * this.gain + this.extraRoll));
    const st = (v, vv, target, k, cc) => { const a = k * (target - v) - cc * vv; return vv + a * dt; };
    this.vh = st(this.h, this.vh, th, this.k, this.c); this.h += this.vh * dt;
    this.vp = st(this.p, this.vp, tp, this.kr, this.cr); this.p += this.vp * dt;
    this.vr = st(this.r, this.vr, tr, this.kr, this.cr); this.r += this.vr * dt;
  }
  // Orientation: yaw about +y, then pitch (bow up) about local z, then roll (starboard down) about local x.
  quat(yaw) {
    return quat.mul(quat.mul(quat.axisAngle([0, 1, 0], yaw), quat.axisAngle([0, 0, 1], this.p)), quat.axisAngle([1, 0, 0], this.r));
  }
}
