// Camera-facing sprites drawn after the water: steam from the ship's funnel, tug smoke, splash droplets, fish food.
const MAX = 3000;

export class Particles {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
    this.f32 = new Float32Array(scene.sprites.data);
    this.u8 = new Uint8Array(scene.sprites.data);
    this.onLand = null;  // (p) => void, for pellets hitting the water
    this.onEaten = null; // (p) => void, when a fish takes a pellet (the wildlife sets its age to its life)
  }
  // kind 0: soft puff (steam, smoke), 1: hard droplet / pellet
  emit(p) {
    if (this.list.length >= MAX) return;
    this.list.push({
      x: p.x, y: p.y, z: p.z, vx: p.vx || 0, vy: p.vy || 0, vz: p.vz || 0,
      size: p.size || 0.02, grow: p.grow || 0, life: p.life || 1, age: 0,
      col: p.col || [255, 255, 255], alpha: p.alpha ?? 0.8, kind: p.kind || 0, g: p.g || 0, drag: p.drag ?? 0.5,
      tag: p.tag || null, float: !!p.float,
    });
  }
  steam(x, y, z, n = 26) {
    for (let i = 0; i < n; i++) {
      this.emit({ x: x + rnd(0.01), y: y + i * 0.002, z: z + rnd(0.01), vx: rnd(0.05) + 0.03, vy: 0.22 + Math.random() * 0.18, vz: rnd(0.05),
        size: 0.018 + Math.random() * 0.012, grow: 0.07, life: 1.6 + Math.random() * 1.2, col: [250, 250, 248], alpha: 0.75, drag: 1.2 });
    }
  }
  smoke(x, y, z) {
    this.emit({ x, y, z, vx: 0.03 + rnd(0.01), vy: 0.12, vz: rnd(0.02), size: 0.008, grow: 0.03, life: 1.6, col: [120, 122, 128], alpha: 0.45, drag: 0.8 });
  }
  splash(x, y, z, n = 18, strength = 1) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, r = (0.12 + Math.random() * 0.25) * strength;
      this.emit({ x, y: y + 0.005, z, vx: Math.cos(a) * r, vy: (0.35 + Math.random() * 0.45) * strength, vz: Math.sin(a) * r,
        size: 0.004 + Math.random() * 0.004, life: 1.2, col: [240, 252, 252], alpha: 0.95, kind: 1, g: 2.4, drag: 0.1, float: false });
    }
  }
  pellets(x, y, z, n = 26) {
    for (let i = 0; i < n; i++) {
      this.emit({ x: x + rnd(0.02), y, z: z + rnd(0.02), vx: -0.22 - Math.random() * 0.3, vy: 0.25 + Math.random() * 0.3, vz: rnd(0.22),
        size: 0.0065, life: 9, col: [214, 142, 66], alpha: 1, kind: 1, g: 2.2, drag: 0.15, tag: 'pellet', float: true });
    }
  }
  update(dt) {
    const sim = this.scene.sim, sea = this.scene.sea;
    const out = [];
    for (const p of this.list) {
      if (p.tag === 'pellet' && p.landed && p.age >= p.life && !p.expiring) { if (this.onEaten) this.onEaten(p); continue; }
      p.age += dt;
      if (p.age >= p.life) continue;
      if (p.tag === 'pellet' && p.age > p.life - dt * 1.5) p.expiring = true;
      p.vy -= p.g * dt;
      const d = Math.exp(-p.drag * dt);
      p.vx *= d; p.vz *= d; if (!p.g) p.vy *= d;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.size += p.grow * dt;
      if (p.kind === 1 && p.g) {
        const wl = sea + sim.heightAt(p.x, p.z);
        if (p.y <= wl && sim.isWater(p.x, p.z)) {
          if (p.tag === 'pellet') {
            if (!p.landed) { p.landed = true; if (this.onLand) this.onLand(p); }
            // pellets drift just under the surface and slowly sink
            p.g = 0; p.vy = -0.01; p.vx *= 0.2; p.vz *= 0.2; p.y = wl - 0.004; p.sinking = true;
          } else continue;
        }
      }
      if (p.sinking) { p.y -= 0.012 * dt; }
      out.push(p);
    }
    this.list = out;
    this.pack();
  }
  pack() {
    const f = this.f32, u = this.u8;
    let n = 0;
    for (const p of this.list) {
      const o = n * 6, b = n * 24;
      const t = p.age / p.life;
      const fade = p.kind === 0 ? Math.min(1, t * 6) * (1 - t) : 1 - Math.max(0, (t - 0.8) / 0.2);
      f[o] = p.x; f[o + 1] = p.y; f[o + 2] = p.z; f[o + 3] = p.size;
      u[b + 16] = p.col[0]; u[b + 17] = p.col[1]; u[b + 18] = p.col[2]; u[b + 19] = Math.round(255 * Math.max(0, Math.min(1, p.alpha * fade)));
      u[b + 20] = 0; u[b + 21] = p.kind; u[b + 22] = 0; u[b + 23] = 0;
      n++;
    }
    this.scene.sprites.count = n;
  }
  get pelletsInWater() { return this.list.filter(p => p.tag === 'pellet' && p.landed); }
}

function rnd(s) { return (Math.random() * 2 - 1) * s; }
