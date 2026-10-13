// Orbit camera with smooth glides between views. Angles: yaw about +y (0 looks from +z toward -z), pitch above the horizon.
import { clamp, damp, wrapAngle } from '../gpu/math.js';

export const VIEWS = {
  home: { yaw: 0.40, pitch: 0.60, dist: 13.6, target: [-0.05, -0.30, 0.25] },
  ship: { yaw: 0.18, pitch: 0.72, dist: 4.9, target: [-0.98, 0.0, -0.58] },
  pier: { yaw: -0.10, pitch: 1.02, dist: 2.75, target: [1.63, 0.0, -0.02] },
  sea: { yaw: 0.35, pitch: 0.58, dist: 9.0, target: [-0.3, -0.1, 0.6] },
  gulls: { yaw: 0.0, pitch: 0.32, dist: 1.38, target: [1.40, 0.38, -1.30] },
  gulls20: { yaw: 0.0, pitch: 0.44, dist: 1.5, target: [1.40, 0.35, -1.21] },
  feed: { yaw: -0.3, pitch: 0.92, dist: 2.6, target: [0.58, -0.06, -0.08] },
};

export class OrbitCamera {
  constructor() {
    const h = VIEWS.home;
    this.yaw = h.yaw; this.pitch = h.pitch; this.dist = h.dist; this.target = h.target.slice();
    this.goal = { yaw: h.yaw, pitch: h.pitch, dist: h.dist, target: h.target.slice() };
    this.fov = 0.52;
    this.shiftX = 0; this.shiftY = 0;
    this.gliding = 0;
    this.distScale = 1;   // portrait screens step back so the whole block fits
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
    const d = this.dist * this.distScale;
    return [this.target[0] + d * cp * Math.sin(this.yaw), this.target[1] + d * sp, this.target[2] + d * cp * Math.cos(this.yaw)];
  }
  state() { return { eye: this.eye, target: this.target, fov: this.fov, shiftX: this.shiftX, shiftY: this.shiftY }; }
}
