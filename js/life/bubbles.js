// Bubbles caught in the jelly: tiny glassy beads drifting up very slowly, a few rising from the seabed weed and from
// the ship's propeller. When one reaches the surface it fades and starts again. Template: unit sphere. Kind 4
// (anim.x = wobble phase).
import { MeshBuilder, MAT } from '../gpu/mesh.js';
import { SEABED_SPOTS, QUAY_Z, BW } from '../world/layout.js';
import { OBJ } from '../world/env.js';
import { InstanceWriter, clamp } from './habitat.js';

export function bubbleTemplate() {
  const mb = new MeshBuilder();
  mb.sphere(0, 0, 0, 1, { seg: 6, rings: 4, color: 0xffffff, param: 0, mat: MAT.GLASS });
  return { name: 'life-bubble', mesh: mb.finish(), tris: mb.triangles };
}

const TINT = [232, 246, 250, 255];

export class Bubbles {
  constructor(scene, hab, rand) {
    this.scene = scene;
    this.hab = hab;
    this.rand = rand;
    this.writer = new InstanceWriter(scene, 'life-bubble', 64, false);
    this.list = [];
    // weed and rubble spots on the seabed that let off a slow string of bubbles
    this.spots = [SEABED_SPOTS.anchor, SEABED_SPOTS.tyre, [-0.3, QUAY_Z + 0.06], [1.55, QUAY_Z + 0.06], [1.8, BW.z - 0.36], [-1.9, 1.8]];
    for (let i = 0; i < 52; i++) {
      const kind = i < 32 ? 'free' : i < 44 ? 'weed' : 'prop';
      const b = { kind, spot: i % this.spots.length, x: 0, y: 0, z: 0, r: 0, rise: 0, phase: rand.range(0, 6.28), grow: 1, sx: 0, sz: 0 };
      this.reset(b, true);
      this.list.push(b);
    }
  }

  reset(b, initial) {
    const r = this.rand, h = this.hab;
    b.grow = initial ? 1 : 0;
    if (b.kind === 'free') {
      let x = 0, z = 1;
      for (let k = 0; k < 30; k++) { x = r.range(-2.45, 2.45); z = r.range(-0.62, 2.45); if (h.open(x, z, 0.03)) break; }
      const fl = h.floorAt(x, z), top = h.surfaceAt(x, z);
      b.x = x; b.z = z;
      b.y = initial ? r.range(fl + 0.02, top - 0.02) : r.range(fl + 0.02, fl + (top - fl) * 0.6);
      b.r = r.range(0.0022, 0.0055);
      b.rise = r.range(0.003, 0.009);
    } else if (b.kind === 'weed') {
      const [sx, sz] = this.spots[b.spot];
      b.x = sx + r.range(-0.03, 0.03); b.z = sz + r.range(-0.03, 0.03);
      const fl = h.floorAt(b.x, b.z);
      b.y = initial ? r.range(fl + 0.01, h.surfaceAt(b.x, b.z) - 0.03) : fl + 0.012;
      b.r = r.range(0.002, 0.004);
      b.rise = r.range(0.008, 0.016);
    } else {
      const p = this.scene.getObject(OBJ.PROP).pos;
      const ok = p[0] || p[2];
      b.x = (ok ? p[0] : -1.9) + r.range(-0.03, 0.03); b.z = (ok ? p[2] : -0.52) + r.range(-0.03, 0.03);
      const py = ok ? p[1] : -0.045;
      b.y = initial ? py + r.range(0, 0.04) : py + r.range(-0.01, 0.01);
      b.r = r.range(0.0018, 0.0035);
      b.rise = r.range(0.01, 0.02);
    }
    b.sx = b.x; b.sz = b.z;
  }

  update(dt) {
    const h = this.hab;
    for (const b of this.list) {
      b.phase += dt * (2.5 + b.rise * 120);
      b.y += b.rise * dt;
      // a lazy corkscrew round the column they rose from
      b.x = b.sx + Math.sin(b.phase * 0.31) * 0.004;
      b.z = b.sz + Math.cos(b.phase * 0.27) * 0.004;
      b.grow = Math.min(1, b.grow + dt * 1.5);
      const top = h.surfaceAt(b.x, b.z) - 0.008 - b.r;
      if (b.y > top) {
        b.y = top;
        b.grow = Math.max(0, b.grow - dt * 6);
        if (b.grow <= 0) this.reset(b, false);
      }
    }
    this.pack();
  }

  pack() {
    const w = this.writer, q = [0, 0, 0, 1];
    w.begin();
    for (const b of this.list) w.put(b.x, b.y, b.z, b.r * clamp(b.grow, 0.05, 1), q, TINT, 0, 4, b.phase, 0);
    w.end();
  }
}
