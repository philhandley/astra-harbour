// Harbour wildlife: fish schools, moon jellyfish, herring gulls and bubbles caught in the jelly, all GPU instances.
//
//   const life = await attach(scene, ctx);
//   life.update(dt); life.scatter(x, z, radius, strength); life.feed(x, z); life.horn(); life.splash(x, z, strength);
//
// ctx (all optional):
//   perches() -> [{ obj, local: [x, y, z] }] or [x, y, z] world points: where gulls may stand (obj frames move with them).
//               Without it: the builders' points (scene.points.*.perches), else a built-in list.
//   hulls()   -> [{ x, z, yaw, halfL, halfB, draft, speed, id? }]: fish swim under but never through them; fast ones scare
//               fish; jellies keep clear. Moored boats, yachts and buoys not in the list are added from their object poses.
//   pellets() -> [{ x, y, z, age, life, landed }]: when given, fish chase these (landed ones) and eat them (sets p.age = p.life)
//               instead of the built-in invisible morsels that feed() scatters.
// Dev viewer debug params (ctx is then the page's URLSearchParams):
//   ?feed=1 feed at the pier end at t = 1.5 s   ?horn=1 horn at t = 2 s   ?scatter=1 (or =x,z) a finger stroke at t = 1.5 s
//   ?follow=N keep the camera on gull N   ?gulldbg=1 log the gulls' dive decisions   ?lifebench=1 time 600 updates at load
//   ?lifeshow=fish|gull|jelly  a still line-up near the front face (cam=0,0.2,0.75,0,0,2.3)   ?lifelog=1  counts and cost
import { makeRand } from '../gpu/math.js';
import { MeshBuilder, MAT } from '../gpu/mesh.js';
import { inPier } from '../world/layout.js';
import { Habitat, InstanceWriter, quatYPR } from './habitat.js';
import { Fish, fishTemplates } from './fish.js';
import { Gulls, gullTemplate } from './gulls.js';
import { Jellies, jellyTemplate } from './jellies.js';
import { Bubbles, bubbleTemplate } from './bubbles.js';

export async function attach(scene, ctx = null) {
  const q = typeof URLSearchParams !== 'undefined' && ctx instanceof URLSearchParams ? ctx : null;
  const api = q ? null : ctx;
  const rand = makeRand(2024);

  // templates
  const tpls = [...fishTemplates(), gullTemplate(), jellyTemplate(makeRand(77)), bubbleTemplate(), pelletTemplate()];
  scene.addTemplates(tpls.map(t => ({ name: t.name, mesh: t.mesh })));

  const hab = new Habitat(scene, api);
  const fish = new Fish(scene, hab, makeRand(11));
  const jellies = new Jellies(scene, hab, makeRand(12), 7);
  const bubbles = new Bubbles(scene, hab, makeRand(13));
  const gulls = new Gulls(scene, hab, api, makeRand(14), { onSplash: (x, z) => fish.scare(x, z, 0.16, 0.7) });
  if (q && q.get('gulldbg')) gulls.debug = true;
  const pelletFn = api && typeof api.pellets === 'function' ? () => api.pellets() : null;
  // the built-in morsels are drawn only in the dev viewer (the game draws its own pellets as sprites)
  const morselWriter = new InstanceWriter(scene, 'life-pellet', 24, false);
  const drawMorsels = !!q;
  let morsels = [];
  const obstacles = [];
  let time = 0, hullT = 0, foodSrc = null;
  const bites = new WeakMap();

  const stats = { n: 0, ms: 0, t: 0 };
  const pageQ = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
  const log = (q && q.get('lifelog')) || (pageQ && pageQ.get('lifelog'));
  if (log) console.log('LIFE templates', tpls.map(t => `${t.name} ${t.tris}`).join(', '), '| fish', fish.fish.length, 'gulls', gulls.gulls.length, 'jellies', jellies.list.length, 'bubbles', bubbles.list.length);

  const show = q && q.get('lifeshow');
  const follow = q && q.get('follow') !== null ? Number(q.get('follow')) : -1;
  const events = [];
  if (q && q.get('feed')) events.push([1.5, () => life.feed(1.0, -0.2)]);
  if (q && q.get('horn')) events.push([2.0, () => life.horn()]);
  if (q && q.get('scatter')) {
    const [sx, sz] = q.get('scatter').includes(',') ? q.get('scatter').split(',').map(Number) : [-0.4, 1.0];
    for (let k = 0; k < 6; k++) events.push([1.5 + k * 0.08, () => life.scatter(sx - 0.2 + k * 0.08, sz, 0.12, 1)]);
  }

  // A water point near (x, z) for food: out from under the pier deck, in open water.
  function openWater(x, z) {
    if (hab.open(x, z, 0.04) && !inPier(x, z, 0.05)) return [x, z];
    let best = null, bd = 1e9;
    for (let r = 0.04; r <= 0.4 && !best; r += 0.03) for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      if (!hab.open(px, pz, 0.05) || inPier(px, pz, 0.05)) continue;
      const d = Math.hypot(px - x, pz - z) - Math.max(0, pz - z) * 0.01;
      if (d < bd) { bd = d; best = [px, pz]; }
    }
    return best || [x, z];
  }

  const life = {
    update(dt) {
      const t0 = performance.now();
      dt = Math.min(dt, 0.05);
      time += dt;
      while (events.length && events[0][0] <= time) events.shift()[1]();
      if (show) { showcase(show, time); return; }
      hullT -= dt;
      if (hullT <= 0) { hab.refreshHulls(); hullT = 0.1; }
      // food: the game's pellets when it shares them, else our own sinking morsels
      if (pelletFn) {
        let list = null;
        try { list = pelletFn(); } catch (e) { list = null; }
        fish.food = (list || []).filter(p => p.landed !== false && p.age < p.life).map(p => {
          const w = { x: p.x, y: p.y, z: p.z, alive: true, bites: bites.has(p) ? bites.get(p) : 3, onEat: () => { p.age = p.life; } };
          return w;
        });
        foodSrc = list;
      } else {
        for (const m of morsels) {
          m.t += dt;
          if (m.t > 0.4) m.y = Math.max(m.y - 0.012 * dt, hab.floorAt(m.x, m.z) + 0.01);
          const [u, w] = scene.sim.velAt(m.x, m.z);
          m.x += u * 0.3 * dt; m.z += w * 0.3 * dt;
          if (m.t > m.life) m.alive = false;
        }
        morsels = morsels.filter(m => m.alive || (drawMorsels && m.fade > 0));
        fish.food = morsels;
      }
      fish.jellies = jellies.obstacles(obstacles);
      fish.update(dt);
      // remember how many bites each of the game's pellets has left
      if (pelletFn && foodSrc) { let k = 0; for (const p of foodSrc) if (p.landed !== false && p.age < p.life) { const w = fish.food[k++]; if (w) bites.set(p, w.bites); } }
      jellies.update(dt);
      bubbles.update(dt);
      gulls.update(dt);
      packMorsels(dt);
      if (follow >= 0 && gulls.gulls[follow]) {
        // dev: keep the camera on one gull
        const c = scene.camera, p = gulls.gulls[follow].pos;
        c.go({ yaw: c.goal.yaw, pitch: c.goal.pitch, dist: c.goal.dist, target: [p[0], p[1], p[2]] }, true);
      }
      if (log) {
        stats.n++; stats.ms += performance.now() - t0; stats.t += dt;
        checkRules();
        if (stats.t > 2) {
          const modes = {};
          for (const g of gulls.gulls) modes[g.mode] = (modes[g.mode] || 0) + 1;
          console.log('LIFE update', (stats.ms / stats.n).toFixed(3), 'ms', JSON.stringify(modes), 'feeding', fish.fish.filter(f => f.feeding > fish.time).length, 'food', fish.food.filter(f => f.alive).length, 'scared', fish.fish.filter(f => f.fright > 0.2).length,
            'schools', fish.schools.map(s => `${s.kind[0]}(${s.cx.toFixed(2)},${s.cz.toFixed(2)})`).join(' '),
            'gulls', gulls.gulls.map(g => `${g.mode[0]}(${g.pos.map(v => v.toFixed(2)).join(',')})`).join(' '));
          console.log('LIFE rules', JSON.stringify(bad));
          stats.n = 0; stats.ms = 0; stats.t = 0;
        }
      }
    },
    scatter(x, z, radius = 0.15, strength = 1) {
      fish.scare(x, z, radius * 1.5 + 0.05, strength, 0.35);
      jellies.push(x, z, radius * 1.5 + 0.05, strength);
    },
    splash(x, z, strength = 1) {
      fish.scare(x, z, 0.12 + 0.25 * strength, strength, 0.5);
      jellies.push(x, z, 0.1 + 0.2 * strength, strength * 0.6);
      gulls.splash(x, z, strength);
    },
    feed(x, z) {
      const [fx, fz] = openWater(x, z);
      if (!pelletFn) {
        const r = rand;
        for (let k = 0; k < 16; k++) {
          const a = r.range(0, Math.PI * 2), d = Math.sqrt(r()) * 0.05;
          const px = fx + Math.cos(a) * d, pz = fz + Math.sin(a) * d;
          morsels.push({ x: px, y: hab.surfaceAt(px, pz) - 0.004, z: pz, alive: true, bites: 8, t: -k * 0.04, life: 7 + r.range(-1, 1), fade: 1 });
        }
      }
      fish.startFeeding(fx, fz, fish.time + 7.5);
      gulls.feed(fx, fz);
    },
    horn() { gulls.horn(); },
    // for tests and the dev viewer
    get fish() { return fish; }, get gulls() { return gulls; }, get jellies() { return jellies; }, get bubbles() { return bubbles; }, hab,
  };

  // dev checks (with ?lifelog): fish where they must never be, jellies near hulls, gulls below the safe height
  const bad = { fishHull: 0, fishLand: 0, fishRock: 0, fishOut: 0, fishAir: 0, jellyHull: 0, gullLow: 0, worstGull: 0 };
  function checkRules() {
    const sea = scene.sea, tmp = [0, 0];
    for (const f of fish.fish) {
      if (f.z < -0.70) bad.fishLand++;
      if (Math.abs(f.x) > 2.55 || Math.abs(f.z) > 2.55) bad.fishOut++;
      if (f.y < hab.floorAt(f.x, f.z) + 0.005) bad.fishRock++;
      if (f.y > hab.surfaceAt(f.x, f.z) - 0.01) bad.fishAir++;
      for (const h of hab.hulls) if (hab.hullAway(h, f.x, f.z, tmp) <= 0 && f.y > sea - h.draft - 0.005) bad.fishHull++;
    }
    for (const j of jellies.list) for (const h of hab.hulls) if (hab.hullAway(h, j.x, j.z, tmp) <= 0.02 && j.y > sea - h.draft - 0.05) bad.jellyHull++;
    for (const g of gulls.gulls) {
      if (!['circle', 'transit', 'orbit', 'toFood'].includes(g.mode)) continue;
      const under = hab.safeTop(g.pos[0], g.pos[2]) - g.pos[1];
      if (under > 0.03) {
        bad.gullLow++;
        if (under > bad.worstGull) { bad.worstGull = +under.toFixed(3); bad.where = `${g.id} ${g.mode} ${g.pos.map(v => v.toFixed(2)).join(',')} vy ${g.vy.toFixed(2)}`; }
      }
    }
  }

  function packMorsels(dt) {
    morselWriter.begin();
    if (drawMorsels) {
      const qq = [0, 0, 0, 1];
      for (const m of morsels) {
        m.fade = m.alive ? Math.min(1, (m.fade || 0) + dt * 4) : Math.max(0, (m.fade || 0) - dt * 6);
        if (m.t < 0) continue;
        morselWriter.put(m.x, m.y, m.z, 0.0035 * m.fade, qq, [138, 92, 50, 255], 0, 0, 0, 0);
      }
    }
    morselWriter.end();
  }

  // ---- a still line-up for close-up checks --------------------------------------------------------------------------
  function showcase(what, t) {
    const qq = [0, 0, 0, 1];
    const X = 0, Z = 2.3, sea = scene.sea;
    for (const k in fish.writers) fish.writers[k].begin();
    gulls.writer.begin(); jellies.writer.begin(); bubbles.writer.begin();
    if (what === 'fish' || what === 'all') {
      const kinds = ['mackerel', 'herring', 'wrasse'];
      kinds.forEach((k, i) => {
        const f = fish.fish.find(ff => ff.kind === k);
        const s = f.sp.len * 1.0;
        quatYPR(0.0, 0, 0, qq);
        fish.writers[k].put(X - 0.08 + i * 0.075, sea - 0.03, Z + 0.06, s, qq, f.tint, 0, 1, t * 14 + i, 0);
        quatYPR(-0.9 + i * 0.6, 0.15, 0, qq);
        fish.writers[k].put(X - 0.07 + i * 0.07, sea - 0.065, Z - 0.02, s, qq, f.tint, 0, 1, t * 10 + i * 2, 0.4 * Math.sin(t));
      });
    }
    if (what === 'gull' || what === 'all') {
      const g = gulls.gulls[0];
      const y = sea + 0.11;
      const poses = [
        [X - 0.17, 0.0, 0.0, Math.PI / 2 + 0.0, 2 * 0 + 0.999],      // wings up
        [X - 0.06, 0.0, 0.0, -Math.PI / 2, 0.999],                   // wings down
        [X + 0.05, 0.0, -0.4, t * 3.3 * Math.PI * 2, 16.6],          // flapping, banked, legs down
      ];
      for (const [x, yaw, bank, ph, ay] of poses) { quatYPR(yaw + 0.25, 0.05, bank, qq); gulls.writer.put(x, y, Z, g.scale, qq, g.tint, 0, 2, ph, ay); }
      quatYPR(0.6, 0.1, 0, qq);
      gulls.writer.put(X + 0.15, y - 0.03, Z, g.scale, qq, g.tint, 0, 2, 0.6 * Math.sin(t * 1.3), -1);
      quatYPR(-0.4, 0.1, 0, qq);
      gulls.writer.put(X + 0.15, y + 0.05, Z - 0.1, g.scale, qq, g.tint, 0, 2, 0, -(0.5 + 0.5 * Math.sin(t * 2)));
    }
    if (what === 'jelly' || what === 'all') {
      jellies.writer.put(X - 0.07, sea - 0.08, Z + 0.1, 0.034, qq, [255, 255, 255, 255], 0, 3, t * 4.0, 0);
      jellies.writer.put(X + 0.07, sea - 0.07, Z + 0.1, 0.032, [0.12, 0, 0.08, 0.989], [255, 255, 255, 255], 0, 3, t * 4.0 + 2, 1.5);
      for (let i = 0; i < 6; i++) bubbles.writer.put(X - 0.02 + i * 0.012, sea - 0.05 + 0.01 * Math.sin(i), Z + 0.15, 0.003 + 0.0006 * i, [0, 0, 0, 1], [232, 246, 250, 255], 0, 4, t * 3 + i, 0);
    }
    for (const k in fish.writers) fish.writers[k].end();
    gulls.writer.end(); jellies.writer.end(); bubbles.writer.end();
  }

  if (q && q.get('lifebench')) {
    // cost of one update, averaged over simulated frames (no rendering)
    for (let k = 0; k < 60; k++) life.update(1 / 60);
    const n = 600, t0 = performance.now();
    for (let k = 0; k < n; k++) life.update(1 / 60);
    const total = (performance.now() - t0) / n;
    const parts = {};
    for (const [name, sys] of [['fish', fish], ['jellies', jellies], ['bubbles', bubbles], ['gulls', gulls]]) {
      const t1 = performance.now();
      for (let k = 0; k < 200; k++) sys.update(1 / 60);
      parts[name] = ((performance.now() - t1) / 200).toFixed(3);
    }
    console.log('LIFE bench', total.toFixed(3), 'ms per update', JSON.stringify(parts));
  }

  return life;
}

function pelletTemplate() {
  const mb = new MeshBuilder();
  mb.set({ color: 0xffffff, mat: MAT.PAINT, param: 0 });
  const P = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  for (const [a, b, c] of [[0, 2, 4], [4, 2, 1], [1, 2, 5], [5, 2, 0], [0, 4, 3], [4, 1, 3], [1, 5, 3], [5, 0, 3]]) mb.poly([P[a], P[b], P[c]]);
  return { name: 'life-pellet', mesh: mb.finish(), tris: mb.triangles };
}
