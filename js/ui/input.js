// Pointer interaction on the harbour: drag the water to make waves, drag the block's side to tip it, pick up and
// throw lifebuoys, tap an empty crate place in the bonds game, drag empty space (or right-drag) to orbit,
// scroll or pinch to zoom. Touch: one finger as above, two fingers pinch-zoom and turn.
import { B, BOTTOM } from '../world/layout.js';
import { clamp } from '../gpu/math.js';

export function attachInput(app) {
  const cv = app.scene.canvas;
  const pointers = new Map();
  let mode = null, last = null, held = null, tipFace = null, tipStart = null, pinch = null, downAt = null;

  const rayAt = e => app.scene.ray(e.clientX, e.clientY);

  // Where does a ray first meet the block? Returns { kind: 'side'|'water'|'land', point, face }.
  function hitBlock(ray) {
    if (!ray) return null;
    const o = ray.origin, d = ray.dir;
    const top = 0.85;
    let t0 = -Infinity, t1 = Infinity, face = null;
    const axes = [[0, -B, B], [1, BOTTOM, top], [2, -B, B]];
    for (const [i, lo, hi] of axes) {
      if (Math.abs(d[i]) < 1e-9) { if (o[i] < lo || o[i] > hi) return null; continue; }
      let a = (lo - o[i]) / d[i], b = (hi - o[i]) / d[i];
      let fa = i === 0 ? [-1, 0] : i === 2 ? [0, -1] : null, fb = i === 0 ? [1, 0] : i === 2 ? [0, 1] : null;
      if (a > b) { [a, b] = [b, a]; [fa, fb] = [fb, fa]; }
      if (a > t0) { t0 = a; face = fa; }
      if (b < t1) t1 = b;
    }
    if (t0 > t1 || t1 < 0) return null;
    const P = [o[0] + d[0] * t0, o[1] + d[1] * t0, o[2] + d[2] * t0];
    const sea = app.scene.sea;
    // entering through a cut face, below the surface line: that's the side (tip it)
    if (face && P[1] < sea + 0.05) return { kind: 'side', point: P, face };
    // otherwise find the water surface along the ray
    if (d[1] < 0) {
      const t = (sea - o[1]) / d[1];
      const W = [o[0] + d[0] * t, sea, o[2] + d[2] * t];
      if (Math.abs(W[0]) < B && Math.abs(W[2]) < B && app.scene.sim.isWater(W[0], W[2])) {
        // is land or a building in front? (crude: land surface higher than the ray at entry)
        return { kind: 'water', point: W };
      }
    }
    return { kind: 'land', point: P };
  }

  function setCursor(e) {
    if (mode) return;
    const ray = rayAt(e);
    if (app.lifebuoys && app.lifebuoys.pick(ray)) { cv.className = 'pick'; return; }
    const h = hitBlock(ray);
    cv.className = h ? (h.kind === 'water' ? 'wave' : h.kind === 'side' ? 'tip' : '') : '';
  }

  cv.addEventListener('contextmenu', e => e.preventDefault());
  // iPad Safari: stop the page itself zooming on a pinch (the pinch zooms the harbour instead)
  for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, e => e.preventDefault(), { passive: false });

  cv.addEventListener('pointerdown', e => {
    cv.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    downAt = { x: e.clientX, y: e.clientY, t: performance.now() };
    if (pointers.size === 2) {
      // second finger: switch to pinch / two-finger orbit
      if (held) { app.lifebuoys.release(held); held = null; }
      if (mode === 'tip') app.scene.releaseTilt();
      const [a, b] = [...pointers.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
      mode = 'pinch';
      return;
    }
    last = { x: e.clientX, y: e.clientY };
    if (e.button === 2 || e.button === 1) { mode = 'orbit'; cv.className = 'grab'; return; }
    const ray = rayAt(e);
    // the bonds game: tap an empty crate place
    if (app.stage && app.stage.tapAt(e.clientX, e.clientY)) { mode = 'tap'; return; }
    const lb = app.lifebuoys && app.lifebuoys.pick(ray);
    if (lb) { held = lb; app.lifebuoys.hold(lb); mode = 'carry'; cv.className = 'grab'; return; }
    const h = hitBlock(ray);
    if (h && h.kind === 'side') { mode = 'tip'; tipFace = h.face; tipStart = { x: e.clientX, y: e.clientY }; return; }
    if (h && h.kind === 'water') { mode = 'wave'; app.inputMode = mode; lastWave = null; wave(h.point, 0.8); return; }
    mode = 'orbit'; cv.className = 'grab';
    app.inputMode = h ? 'orbit-' + h.kind : 'orbit-none';
  });

  let lastWave = null;
  function wave(p, strength) {
    const s = app.scene;
    // fill the gap since the last point so a fast drag leaves a continuous furrow
    const steps = lastWave ? Math.min(6, Math.ceil(Math.hypot(p[0] - lastWave[0], p[2] - lastWave[2]) / 0.05)) : 1;
    for (let k = 1; k <= steps; k++) {
      const t = k / steps;
      const x = lastWave ? lastWave[0] + (p[0] - lastWave[0]) * t : p[0], z = lastWave ? lastWave[2] + (p[2] - lastWave[2]) * t : p[2];
      s.sim.disturb(x, z, 0.1, (0.014 * strength) / steps);
    }
    lastWave = p;
    if (strength > 0.5) s.sim.addFoam(p[0], p[2], 0.05, 0.12 * strength);
    if (app.life) app.life.scatter(p[0], p[2], 0.35, strength);
    app.activity = Math.min(1.5, app.activity + 0.05 * strength);
  }

  cv.addEventListener('pointermove', e => {
    if (!pointers.has(e.pointerId)) { setCursor(e); return; }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (mode === 'pinch' && pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y), cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      if (pinch.d > 0) app.scene.camera.zoom(pinch.d / Math.max(d, 1));
      app.userCamAt = performance.now();
      app.scene.camera.orbit(-(cx - pinch.cx) * 0.006, (cy - pinch.cy) * 0.004);
      pinch = { d, cx, cy };
      return;
    }
    const dx = e.clientX - last.x, dy = e.clientY - last.y;
    last = { x: e.clientX, y: e.clientY };
    if (mode === 'orbit') { app.scene.camera.orbit(-dx * 0.006, dy * 0.004); app.userCamAt = performance.now(); }
    else if (mode === 'wave') {
      const h = hitBlock(rayAt(e));
      if (h && h.kind === 'water') wave(h.point, clamp(Math.hypot(dx, dy) / 10, 0.35, 1.6));
      else lastWave = null;
    } else if (mode === 'tip') {
      const amt = clamp((e.clientY - tipStart.y) / 260, -1, 1) * 0.16;
      app.scene.holdTilt(amt * tipFace[1], -amt * tipFace[0]);
    } else if (mode === 'carry' && held) {
      const ray = rayAt(e);
      if (ray && ray.dir[1] < 0) {
        const y = app.scene.sea + 0.2;
        const t = (y - ray.origin[1]) / ray.dir[1];
        app.lifebuoys.carry(held, [ray.origin[0] + ray.dir[0] * t, y, ray.origin[2] + ray.dir[2] * t]);
      }
    }
  });

  const end = e => {
    pointers.delete(e.pointerId);
    if (mode === 'pinch') { if (pointers.size === 0) mode = null; return; }
    if (mode === 'tip') app.scene.releaseTilt();
    if (mode === 'carry' && held) { app.lifebuoys.release(held); held = null; }
    mode = null; cv.className = '';
  };
  cv.addEventListener('pointerup', end);
  cv.addEventListener('pointercancel', end);

  cv.addEventListener('wheel', e => { e.preventDefault(); app.scene.camera.zoom(Math.exp(e.deltaY * 0.0012)); app.userCamAt = performance.now(); }, { passive: false });

  window.addEventListener('keydown', e => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    if (e.code === 'Space') { e.preventDefault(); app.horn(); }
  });
}
