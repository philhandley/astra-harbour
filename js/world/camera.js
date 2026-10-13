// Orbit camera with smooth glides between views. Angles: yaw about +y (0 looks from +z toward -z), pitch above the horizon.
import { clamp, damp, wrapAngle } from '../gpu/math.js';

export const VIEWS = {
  home: { yaw: 0.42, pitch: 0.62, dist: 10.4, target: [0.05, -0.12, 0.15] },
  ship: { yaw: 0.20, pitch: 0.70, dist: 4.1, target: [-0.95, 0.05, -0.62] },
  pier: { yaw: 0.05, pitch: 0.78, dist: 3.1, target: [1.63, 0.02, -0.10] },
  sea: { yaw: 0.35, pitch: 0.58, dist: 9.0, target: [-0.3, -0.1, 0.6] },
};

export class OrbitCamera {
  constructor() {
    const h = VIEWS.home;
    this.yaw = h.yaw; this.pitch = h.pitch; this.dist = h.dist; this.target = h.target.slice();
    this.goal = { yaw: h.yaw, pitch: h.pitch, dist: h.dist, target: h.target.slice() };
    this.fov = 0.52;
    this.shiftX = 0; this.shiftY = 0;
    this.gliding = 0;
  }
  go(view, instant = false) {
    const v = typeof view === 'string' ? VIEWS[view] : view;
    this.goal = { yaw: v.yaw, pitch: v.pitch, dist: v.dist, target: v.target.slice() };
    // keep the glide short: unwrap yaw to the nearest turn
    this.goal.yaw = this.yaw + wrapAngle(this.goal.yaw - this.yaw);
    this.gliding = 1;
    if (instant) { this.yaw = this.goal.yaw; this.pitch = this.goal.pitch; this.dist = this.goal.dist; this.target = this.goal.target.slice(); }
  }
  orbit(dyaw, dpitch) {
    this.goal.yaw += dyaw;
    this.goal.pitch = clamp(this.goal.pitch + dpitch, 0.12, 1.45);
    this.yaw = this.goal.yaw - (this.goal.yaw - this.yaw) * 0.3;
    this.pitch = clamp(this.pitch + dpitch, 0.12, 1.45);
  }
  zoom(f) {
    this.goal.dist = clamp(this.goal.dist * f, 2.0, 18);
  }
  update(dt) {
    const r = 5.5;
    this.yaw = damp(this.yaw, this.goal.yaw, r, dt);
    this.pitch = damp(this.pitch, this.goal.pitch, r, dt);
    this.dist = damp(this.dist, this.goal.dist, r * 0.8, dt);
    for (let i = 0; i < 3; i++) this.target[i] = damp(this.target[i], this.goal.target[i], r * 0.8, dt);
  }
  get eye() {
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    return [this.target[0] + this.dist * cp * Math.sin(this.yaw), this.target[1] + this.dist * sp, this.target[2] + this.dist * cp * Math.cos(this.yaw)];
  }
  state() { return { eye: this.eye, target: this.target, fov: this.fov, shiftX: this.shiftX, shiftY: this.shiftY }; }
}
