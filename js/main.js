// Jelly Harbour: boot, the main loop, and the glue between the harbour, the games and the panel.
import { Scene } from './world/scene.js';
import { placeDefaults } from './world/rig.js';
import { OBJ } from './world/env.js';
import { Cargo, Crates } from './sim/cargo.js';
import { CraneYard } from './sim/cranes.js';
import { Harbour } from './sim/ships.js';
import { makeAutoWork } from './sim/autowork.js';
import { Particles } from './sim/particles.js';
import { Lifebuoys } from './sim/lifebuoys.js';
import { Stage3D } from './stage3d.js';
import { Panel, AbortError } from './ui/panel.js';
import { attachInput } from './ui/input.js';
import { Tables } from './game/tables.js';
import { Bonds } from './game/bonds.js';
import { P, setting, addTally, suggestLevel } from './game/progress.js';
import { setVoice } from './game/voice.js';
import * as audio from './audio.js';
import { quat } from './gpu/math.js';

const q = new URLSearchParams(location.search);
if (q.get('shot')) import('../dev/shotkit.js');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

const app = {
  mode: 'home', paused: false, activity: 0, firmness: 1, damping: 0.35, tide: 0,
  game: null, gameKind: null,
};
window.__app = app;

async function boot() {
  audio.initAudio();
  audio.setSound(setting('sound'));
  const canvas = document.getElementById('stage');
  if (q.has('flat')) { showFallback('(Testing the flat harbour.)'); return; }
  let scene;
  try {
    const low = q.get('q') === 'low' || (navigator.hardwareConcurrency || 8) <= 4;
    scene = await Scene.create(canvas, { reducedMotion: reduced, causticGrid: low ? 130 : 200, simN: low ? 96 : 128, onLost: () => showFallback('The graphics card stopped answering.') });
    if (low) scene.renderScale = 0.8;
  } catch (err) {
    console.warn('WebGPU unavailable:', String(err));
    showFallback(String(err).includes('no-webgpu') ? 'This browser has no WebGPU.' : 'The graphics card could not start WebGPU.');
    return;
  }
  app.scene = scene;
  scene.setFlavour(setting('flavour') || 'seaglass');
  app.setFirmness(1);
  placeDefaults(scene);

  app.cargo = new Cargo(scene);
  app.crates = new Crates(scene);
  app.cranes = new CraneYard(scene, app.cargo);
  app.harbour = new Harbour(scene, app.cranes);
  app.autowork = makeAutoWork(app.cargo, app.cranes);
  app.particles = new Particles(scene);
  app.lifebuoys = new Lifebuoys(scene, app.harbour, app.particles, { onSplash: (x, z, s) => { audio.splash(s * 0.6); if (app.life) app.life.splash(x, z, s); } });
  app.stage = new Stage3D(app);
  app.ui = new Panel(app);

  // sounds and tallies from the cranes and the ship
  app.cranes.onLatch = () => audio.latch();
  app.cranes.onLand = (c, g) => { audio.clunk(g.size === 10 ? 1.2 : 0.9); if (app.mode !== 'tables') addTally('boxes', g.size); app.activity = Math.min(1.5, app.activity + 0.25); };
  app.harbour.on('workStart', () => { if (app.mode !== 'tables') app.autowork.run(app.harbour); });
  app.harbour.on('horn', () => { app.horn(true); addTally('voyages'); });

  // wildlife, if it has been built
  try {
    const life = await import('./life/life.js');
    app.life = await life.attach(scene, { perches: () => perches(), hulls: () => app.harbour.hulls() });
  } catch (err) { console.warn('life not loaded', String(err)); }

  // the first pellet to land calls the fish (once per handful)
  let lastFeed = 0;
  app.particles.onLand = p => {
    if (!app.life || p.tag !== 'pellet' || performance.now() - lastFeed < 1500) return;
    lastFeed = performance.now();
    app.life.feed(p.x, p.z);
  };

  attachInput(app);
  app.ui.home();
  app.harbour.start();
  // debug params for screenshots: ?tilt=ax,az holds the block tipped; ?splash=1 drops a few waves; ?view=ship|pier|sea
  if (q.get('tilt')) { const [ax, az] = q.get('tilt').split(',').map(Number); scene.holdTilt(ax, az); }
  if (q.get('splash')) { for (const [x, z, a] of [[-0.6, 1.2, 0.05], [0.4, 1.9, -0.04], [-1.8, 0.5, 0.04]]) scene.sim.disturb(x, z, 0.22, a); }
  if (q.get('view')) scene.camera.go(q.get('view'), true);
  if (q.has('debugvoyage')) { app.harbour.on('workStart', () => setTimeout(() => app.harbour.finishWork(), 500)); }

  scene.resize();
  addEventListener('resize', () => { scene.resize(); layoutShift(); });
  layoutShift();
  if (q.get('game')) app.startGame(q.get('game'), q.get('key'), Number(q.get('level') || 0) || undefined);
  requestAnimationFrame(loop);
  document.addEventListener('visibilitychange', () => { last = performance.now(); });
  console.log('HARBOUR ready', JSON.stringify(scene.buildStats));
  if (q.get('shot')) {
    const frames = Number(q.get('frames') || 90);
    let n = 0;
    const times = [];
    const tick = (t) => { times.push(t); if (++n >= frames) {
      const d = times.slice(-121).map((v, i, a) => (i ? v - a[i - 1] : 0)).slice(1).sort((a, b) => a - b);
      const t0 = performance.now(); for (let i = 0; i < 30; i++) scene.sim.step(1 / 60);
      console.log('HARBOUR perf: median frame', d[d.length >> 1].toFixed(1), 'ms, p90', d[Math.floor(d.length * 0.9)].toFixed(1), 'ms, sim step', ((performance.now() - t0) / 30).toFixed(2), 'ms, canvas', scene.canvas.width + 'x' + scene.canvas.height, 'scale', (scene.renderScale || 1).toFixed(2));
      console.log('HARBOUR frames', n, scene.r.errors.length ? 'GPU errors: ' + scene.r.errors.slice(0, 3).join(' | ') : 'no gpu errors'); import('../dev/shotkit.js').then(m => setTimeout(m.shotReady, 60)); } else requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }
}

// Gull perches from every builder that exported some, plus the moving ones (vessels and cranes).
function perches() {
  const out = [];
  const pts = app.scene.points || {};
  for (const name of ['town', 'terminal', 'fishquay', 'breakwater']) {
    const p = pts[name];
    if (!p) continue;
    for (const v of [...(p.perches || []), ...(p.gallery || [])]) out.push(Array.isArray(v) ? { obj: 0, local: v } : v);
  }
  if (pts.cranes) for (const v of pts.cranes.perches || []) out.push(v);
  const vs = pts.vessels;
  if (vs) {
    if (vs.ship && vs.ship.mastTop) out.push({ obj: OBJ.SHIP, local: vs.ship.mastTop });
    if (vs.tug && vs.tug.mastTop) out.push({ obj: OBJ.TUG, local: vs.tug.mastTop });
    if (vs.yacht && vs.yacht.mastTop) { out.push({ obj: OBJ.YACHT_1, local: vs.yacht.mastTop }); out.push({ obj: OBJ.YACHT_2, local: vs.yacht.mastTop }); }
    if (vs.boat && vs.boat.mastTop) { out.push({ obj: OBJ.BOAT_A, local: vs.boat.mastTop }); out.push({ obj: OBJ.BOAT_B, local: vs.boat.mastTop }); }
  }
  return out;
}

// Keep the harbour centred in the space left of the panel.
function layoutShift() {
  const w = innerWidth, h = innerHeight;
  const sheet = w <= 760 || (h > w && w <= 1000);
  const panelW = sheet ? 0 : 344 + 32;
  app.scene.camera.shiftX = panelW / w;
  app.scene.camera.shiftY = sheet ? -0.42 : 0;
  // a tall canvas has a narrow horizontal view: step back so the block's width still fits
  app.scene.camera.distScale = sheet ? Math.min(2.4, Math.max(1, 1.1 / (w / h))) : 1;
}

// ---- the loop ---------------------------------------------------------------------------------------------------
let last = performance.now(), uiTick = 0, smokeT = 0;
const perf = { n: 0, sum: 0, steps: 0, skip: 60 };
// If frames run slow (a tablet's GPU), draw at a lower resolution: up to three steps down.
function adaptQuality(frameS) {
  if (q.get('q') === 'high' || perf.steps >= 3) return;
  if (perf.skip > 0) { perf.skip--; return; }
  perf.n++; perf.sum += frameS;
  if (perf.n < 90) return;
  const avg = perf.sum / perf.n;
  perf.n = 0; perf.sum = 0;
  if (avg > 0.026) {
    perf.steps++; perf.skip = 30;
    app.scene.renderScale = (app.scene.renderScale || 1) * 0.8;
    app.scene.resize();
    console.log('HARBOUR quality step', perf.steps, 'avg frame', (avg * 1000).toFixed(1), 'ms, scale', app.scene.renderScale.toFixed(2));
  }
}
function loop(now) {
  requestAnimationFrame(loop);
  if (document.hidden) { last = now; perf.skip = 30; return; }
  const raw = (now - last) / 1000;
  const real = Math.min(0.05, raw);
  last = now;
  adaptQuality(raw);
  const dt = app.paused ? 0 : real;
  const s = app.scene;
  app.cranes.update(dt);
  app.harbour.update(dt);
  app.cargo.update(dt);
  app.crates.update(dt);
  app.particles.update(dt);
  app.lifebuoys.update(dt);
  if (app.life) app.life.update(dt);
  // tug funnel smoke, more when working
  smokeT += dt * (0.8 + Math.abs(app.harbour.tug.prop) * 5);
  if (smokeT > 1 && funnel('tug')) { smokeT = 0; const f = funnel('tug'); app.particles.smoke(f[0], f[1], f[2]); }
  if (app.paused) { s.camera.update(real); s.time += 0; }
  else s.step(dt);
  s.render();
  app.stage.update();
  app.activity = Math.max(0, app.activity - real * 0.25) + (app.cranes.a.busy || app.cranes.b.busy ? real * 0.3 : 0) + app.harbour.ship.speed * real * 2;
  app.activity = Math.min(1.2, app.activity);
  if (++uiTick % 10 === 0) app.ui.refreshHarbour();
}

// World position of a funnel top from the vessels' exported points.
function funnel(which) {
  const vs = app.scene.points && app.scene.points.vessels;
  const local = vs && vs[which] && vs[which].funnelTop;
  if (!local) return null;
  const o = app.scene.getObject(which === 'tug' ? OBJ.TUG : OBJ.SHIP);
  const r = quat.rotate(o.q, local);
  return [o.pos[0] + r[0], o.pos[1] + r[1], o.pos[2] + r[2]];
}

// ---- actions from the panel ------------------------------------------------------------------------------------
app.horn = (fromShip = false) => {
  audio.horn();
  const f = funnel('ship');
  if (f) app.particles.steam(f[0], f[1], f[2]);
  if (app.life) { app.life.horn(); setTimeout(() => audio.gullCall(), 500); }
  if (!fromShip) app.activity = Math.min(1.2, app.activity + 0.3);
};
app.feed = () => {
  const pe = app.scene.points && app.scene.points.fishquay && app.scene.points.fishquay.pierEnds;
  const p = pe && pe[0] ? pe[0] : [1.0, 0.14, -0.22];
  app.particles.pellets(p[0] - 0.02, p[1] + 0.03, p[2] + 0.04, 30);
  addTally('fed');
  app.activity = Math.min(1.2, app.activity + 0.3);
};
app.castOffOrCallIn = () => {
  const h = app.harbour;
  if (h.phase === 'atSea' || h.phase === 'comingIn') { h.callIn(); return; }
  if (h.atBerth) { if (app.autowork.running) app.autowork.castOffNow(); else h.finishWork(); }
};
app.setFlavour = id => { app.scene.setFlavour(id); setting('flavour', id); };
// surface tension stays below the solver's stable limit (about 0.0028 at 120 substeps a second)
app.setFirmness = v => { app.firmness = v; app.scene.firmness = v; app.scene.sim.sigma = 0.0005 + 0.0014 * v; };
app.setDamping = v => { app.damping = v; app.scene.sim.damping = v; };
app.setTide = v => { app.tide = v; app.scene.tide = v; app.scene.sim.setSea(app.scene.sea); };
app.togglePause = () => { app.paused = !app.paused; };
app.toggleSound = () => { const on = !setting('sound'); setting('sound', on); audio.setSound(on); setVoice(on); return on; };
app.resetView = () => app.scene.camera.go(app.mode === 'tables' ? 'ship' : app.mode === 'bonds' ? 'pier' : 'home');
app.resetWorld = () => {
  app.scene.sim.reset();
  app.scene.jel.vax = app.scene.jel.vaz = 0;
  app.setFirmness(1); app.setDamping(0.35); app.setTide(0);
  app.ui.home();
};

// ---- games ------------------------------------------------------------------------------------------------------
const TABLE_KEYS = [{ id: '2', label: '×2' }, { id: '5', label: '×5' }, { id: '10', label: '×10' }, { id: 'mix', label: 'Mix' }];
const BOND_KEYS = [{ id: '10', label: 'Make 10' }, { id: '20', label: 'Make 20' }];

app.startGame = async (kind, key, level) => {
  if (app.game) { app.ui.abort(); app.game.alive = false; }
  const last = P().last[kind] || {};
  key = key || last.key || (kind === 'tables' ? '2' : '10');
  level = level || suggestLevel(kind, key);
  app.mode = kind;
  document.body.classList.add('in-game');
  if (kind === 'bonds') app.harbour.holds.add('bonds'); else app.harbour.holds.delete('bonds');
  const token = { alive: true };
  app.game = token;
  app.stage.clearLabels();
  app.ui.game({
    game: kind, title: kind === 'tables' ? 'Crane Tables' : 'Fish Bonds',
    keys: kind === 'tables' ? TABLE_KEYS : BOND_KEYS, key, level,
    onKey: k => app.startGame(kind, k, suggestLevel(kind, k)),
    onLevel: l => app.startGame(kind, key, l),
    onBack: () => app.goHome(),
  });
  // The game talks to the panel and the stage through guards: once this game is abandoned (Back, or another
  // game started), any late step throws AbortError instead of touching the new game's card or the harbour.
  const guard = obj => new Proxy(obj, { get(t, k) {
    const v = t[k];
    if (typeof v !== 'function') return v;
    return (...a) => { if (!token.alive) throw new AbortError(); return v.apply(t, a); };
  } });
  const view = Object.create(app);
  view.ui = guard(app.ui); view.stage = guard(app.stage);
  const G = kind === 'tables' ? new Tables(view) : new Bonds(view);
  try {
    for (;;) {
      const next = await G.run(key, level);
      if (!token.alive) return;
      if (next === 'home') { app.goHome(); return; }
      // play again: re-open the same game view (the patch card replaced the question card)
      app.ui.game({
        game: kind, title: kind === 'tables' ? 'Crane Tables' : 'Fish Bonds',
        keys: kind === 'tables' ? TABLE_KEYS : BOND_KEYS, key, level: suggestLevel(kind, key) > level ? suggestLevel(kind, key) : level,
        onKey: k => app.startGame(kind, k, suggestLevel(kind, k)),
        onLevel: l => app.startGame(kind, key, l),
        onBack: () => app.goHome(),
      });
      level = suggestLevel(kind, key) > level ? suggestLevel(kind, key) : level;
    }
  } catch (err) {
    if (!(err instanceof AbortError)) console.error(err);
  }
};

app.goHome = () => {
  if (app.game) { app.game.alive = false; app.game = null; }
  app.ui.abort();
  app.stage.clearLabels();
  app.stage.onSlotTap = null;
  app.mode = 'home';
  document.body.classList.remove('in-game');
  app.ui.home();
  if (app.flat) return;
  app.harbour.holds.delete('bonds');
  app.cranes.speed = 1;
  app.scene.camera.go('home');
  // hand the cargo back to the automatic day if the ship is waiting at the berth
  if (app.harbour.atBerth && !app.harbour.workDone) app.autowork.run(app.harbour);
};

function showFallback(why) {
  document.getElementById('pill').classList.add('lite');
  document.querySelector('#pill span').textContent = '2D · Lite';
  const f = document.getElementById('fallback');
  f.hidden = false;
  document.getElementById('fallbackWhy').textContent = `${why} Here is the flat harbour instead: the maths games work just the same.`;
  document.getElementById('fallbackGo').addEventListener('click', async () => {
    f.hidden = true;
    const m = await import('./stage2d.js');
    m.startFlat(app);
  }, { once: true });
}

boot();

// Offline support: the service worker precaches the whole app (not on the 8600 dev server, so edits show at once).
if ('serviceWorker' in navigator && location.port !== '8600' && !q.has('nosw')) {
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(err => console.warn('service worker', String(err))));
}
