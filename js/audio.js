// Synthesised sounds (Web Audio). Nothing plays until the first tap or key press.
let ctx = null, master = null, enabled = true;

// Create (or wake) the audio context; must be called from a tap or key press (or with autoplay allowed).
export function ensureAudio() { startAudio(); return ctx; }
let startAudio = () => {};

export function initAudio() {
  const start = startAudio = () => {
    if (!ctx) {
      try {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        master = ctx.createGain(); master.gain.value = 0.55; master.connect(ctx.destination);
      } catch (e) { ctx = null; }
    }
    if (ctx && ctx.state === 'suspended') ctx.resume();
  };
  window.addEventListener('pointerdown', start, { passive: true });
  window.addEventListener('keydown', start);
}

export function setSound(on) { enabled = on; if (master) master.gain.value = on ? 0.55 : 0; }
export function soundOn() { return enabled; }
const ready = () => ctx && enabled && ctx.state === 'running';

function env(g, t, a, d, peak = 1) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
}

// ---- the ship's horn ----------------------------------------------------------------------------------------
// Two brassy reeds a fifth apart (each a pair beating slightly against itself), a sub tone for body, a little
// breath noise, a nasal "honk" resonance, gentle saturation, a pitch that swells up as the air pressure builds and
// sags as it dies, and an echo off the harbour (a generated reverb tail plus a slap back from the town).
let hornWaveCache = null, echoBus = null;
function hornWave() {
  if (hornWaveCache) return hornWaveCache;
  const n = 32, real = new Float32Array(n), imag = new Float32Array(n);
  for (let k = 1; k < n; k++) imag[k] = (1 / Math.pow(k, 0.85)) * (k % 2 ? 1 : 0.7) * Math.exp(-k / 18);
  return (hornWaveCache = ctx.createPeriodicWave(real, imag));
}
function softClip(drive = 2.2) {
  const ws = ctx.createWaveShaper(), n = 1024, c = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(x * drive) / Math.tanh(drive); }
  ws.curve = c; ws.oversample = '2x';
  return ws;
}
function harbourEcho() {
  if (echoBus) return echoBus;
  const len = Math.floor(ctx.sampleRate * 1.6);
  const ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < len; i++) { const t = i / ctx.sampleRate; d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t / 1.6, 3) * Math.min(1, t / 0.015) * 0.6; }
  }
  const conv = ctx.createConvolver(); conv.buffer = ir;
  const wet = ctx.createGain(); wet.gain.value = 0.11;
  const slap = ctx.createDelay(1.0); slap.delayTime.value = 0.42;
  const slapLp = ctx.createBiquadFilter(); slapLp.type = 'lowpass'; slapLp.frequency.value = 700;
  const slapG = ctx.createGain(); slapG.gain.value = 0.07;
  const input = ctx.createGain();
  input.connect(conv); conv.connect(wet); wet.connect(master);
  input.connect(slap); slap.connect(slapLp); slapLp.connect(slapG); slapG.connect(master);
  return (echoBus = input);
}

// opts: f (lower reed pitch in Hz), len (seconds), level
export function horn(len = 1.4, opts = {}) {
  if (!ready()) return;
  const f = opts.f || 130.8, level = opts.level || 0.55;
  const t = ctx.currentTime, end = t + len;
  const hold = Math.max(t + 0.3, end - Math.min(0.45, len * 0.4));   // when the release begins
  // output envelope: a firm start with a slight overshoot, a steady blast, a breathy tail
  const out = ctx.createGain();
  out.gain.setValueAtTime(0.0001, t);
  out.gain.exponentialRampToValueAtTime(level * 1.12, t + 0.09);
  out.gain.exponentialRampToValueAtTime(level, t + 0.3);
  out.gain.setValueAtTime(level, hold);
  out.gain.exponentialRampToValueAtTime(0.0001, end);
  // tone shaping: saturation, the honk (a peak around 480 Hz), then a lowpass that opens as it swells
  const pre = ctx.createGain(); pre.gain.value = 0.34;
  const clip = softClip(2.0);
  const honk = ctx.createBiquadFilter(); honk.type = 'peaking'; honk.frequency.value = 480; honk.Q.value = 1.8; honk.gain.value = 8;
  const body = ctx.createBiquadFilter(); body.type = 'peaking'; body.frequency.value = 180; body.Q.value = 1.0; body.gain.value = 4;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.8;
  lp.frequency.setValueAtTime(500, t); lp.frequency.exponentialRampToValueAtTime(2000, t + 0.35); lp.frequency.setValueAtTime(2000, hold); lp.frequency.exponentialRampToValueAtTime(700, end);
  pre.connect(clip); clip.connect(body); body.connect(honk); honk.connect(lp); lp.connect(out);
  out.connect(master);
  out.connect(harbourEcho());
  // slow vibrato from the air column
  const lfo = ctx.createOscillator(); lfo.frequency.value = 4.6;
  const lfoG = ctx.createGain(); lfoG.gain.value = f * 0.003; lfo.connect(lfoG);
  const voices = [[1, 0, 0.5], [1, 7, 0.4], [1.4983, -4, 0.42], [1.4983, 5, 0.32]];
  for (const [mul, cents, g] of voices) {
    const o = ctx.createOscillator();
    o.setPeriodicWave(hornWave());
    const fr = f * mul;
    o.detune.value = cents;
    // the pitch swells up as the pressure builds, and sags a little as it dies away
    o.frequency.setValueAtTime(fr * 0.94, t);
    o.frequency.exponentialRampToValueAtTime(fr, t + 0.24);
    o.frequency.setValueAtTime(fr, hold);
    o.frequency.exponentialRampToValueAtTime(fr * 0.97, end);
    lfoG.connect(o.frequency);
    const vg = ctx.createGain(); vg.gain.value = g;
    o.connect(vg); vg.connect(pre);
    o.start(t); o.stop(end + 0.05);
  }
  // a sub tone an octave down for weight
  const sub = ctx.createOscillator(); sub.type = 'sine';
  sub.frequency.setValueAtTime(f * 0.47, t); sub.frequency.exponentialRampToValueAtTime(f / 2, t + 0.24);
  const subG = ctx.createGain(); subG.gain.value = 0.5;
  sub.connect(subG); subG.connect(out); sub.start(t); sub.stop(end + 0.05);
  // breath: filtered noise riding on the blast
  const nz = ctx.createBufferSource(); nz.buffer = noiseBuffer(); nz.loop = true;
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1100; bp.Q.value = 0.7;
  const ng = ctx.createGain(); ng.gain.value = 0.05;
  nz.connect(bp); bp.connect(ng); ng.connect(pre); nz.start(t); nz.stop(end + 0.05);
  lfo.start(t); lfo.stop(end + 0.05);
}

// The first version, kept so the two can be compared on dev/horns.html.
export function hornOld(len = 2.2) {
  if (!ready()) return;
  const t = ctx.currentTime;
  const out = ctx.createGain();
  out.gain.setValueAtTime(0.0001, t);
  out.gain.exponentialRampToValueAtTime(0.5, t + 0.18);
  out.gain.setValueAtTime(0.5, t + len - 0.35);
  out.gain.exponentialRampToValueAtTime(0.0001, t + len);
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(380, t); lp.frequency.linearRampToValueAtTime(820, t + 0.3); lp.Q.value = 1.4;
  lp.connect(out); out.connect(master);
  const lfo = ctx.createOscillator(); lfo.frequency.value = 5.2;
  const lfoG = ctx.createGain(); lfoG.gain.value = 0.8; lfo.connect(lfoG);
  for (const [fq, det] of [[98, -7], [98, 6], [146.8, -5], [146.8, 8]]) {
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = fq; o.detune.value = det;
    lfoG.connect(o.frequency);
    const g = ctx.createGain(); g.gain.value = 0.22;
    o.connect(g); g.connect(lp);
    o.start(t); o.stop(t + len + 0.05);
  }
  lfo.start(t); lfo.stop(t + len + 0.05);
}

export function toot() {
  if (!ready()) return;
  horn(0.45, { f: 174.6, level: 0.32 });
  setTimeout(() => horn(0.55, { f: 174.6, level: 0.32 }), 620);
}

function noiseBuffer() {
  if (noiseBuffer.b) return noiseBuffer.b;
  const b = ctx.createBuffer(1, ctx.sampleRate * 0.6, ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return (noiseBuffer.b = b);
}

export function clunk(heavy = 1) {
  if (!ready()) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator(); o.type = 'sine';
  o.frequency.setValueAtTime(120 * heavy + 40, t); o.frequency.exponentialRampToValueAtTime(48, t + 0.18);
  const g = ctx.createGain(); env(g, t, 0.005, 0.25, 0.5);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.3);
  const n = ctx.createBufferSource(); n.buffer = noiseBuffer();
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = 2;
  const ng = ctx.createGain(); env(ng, t, 0.002, 0.07, 0.12);
  n.connect(bp); bp.connect(ng); ng.connect(master); n.start(t); n.stop(t + 0.1);
}

export function latch() {
  if (!ready()) return;
  const t = ctx.currentTime;
  const n = ctx.createBufferSource(); n.buffer = noiseBuffer();
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 3200; bp.Q.value = 6;
  const g = ctx.createGain(); env(g, t, 0.001, 0.05, 0.25);
  n.connect(bp); bp.connect(g); g.connect(master); n.start(t); n.stop(t + 0.08);
}

// A counting note that climbs a pentatonic scale with each step.
const PENTA = [0, 2, 4, 7, 9];
export function countNote(i) {
  if (!ready()) return;
  const t = ctx.currentTime;
  const st = PENTA[i % 5] + 12 * Math.floor(i / 5);
  const f = 392 * Math.pow(2, st / 12);
  const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
  const g = ctx.createGain(); env(g, t, 0.006, 0.28, 0.32);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.32);
}

export function chime() {
  if (!ready()) return;
  const t = ctx.currentTime;
  [[523.25, 0], [659.25, 0.09], [783.99, 0.18], [1046.5, 0.3]].forEach(([f, d]) => {
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
    const g = ctx.createGain(); env(g, t + d, 0.01, 0.6, 0.22);
    o.connect(g); g.connect(master); o.start(t + d); o.stop(t + d + 0.7);
  });
}

export function hmm() {
  if (!ready()) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator(); o.type = 'sine';
  o.frequency.setValueAtTime(330, t); o.frequency.linearRampToValueAtTime(262, t + 0.3);
  const g = ctx.createGain(); env(g, t, 0.02, 0.35, 0.2);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.4);
}

export function splash(size = 1) {
  if (!ready()) return;
  const t = ctx.currentTime;
  const n = ctx.createBufferSource(); n.buffer = noiseBuffer();
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(2600, t); lp.frequency.exponentialRampToValueAtTime(300, t + 0.4);
  const g = ctx.createGain(); env(g, t, 0.01, 0.45, 0.35 * size);
  n.connect(lp); lp.connect(g); g.connect(master); n.start(t); n.stop(t + 0.5);
}

export function hop(i = 0) {
  if (!ready()) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator(); o.type = 'triangle';
  o.frequency.setValueAtTime(300 + i * 30, t); o.frequency.exponentialRampToValueAtTime(600 + i * 40, t + 0.08);
  const g = ctx.createGain(); env(g, t, 0.004, 0.12, 0.2);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.15);
}

export function gullCall() {
  if (!ready()) return;
  const t = ctx.currentTime;
  for (let k = 0; k < 2; k++) {
    const t0 = t + k * 0.22;
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(1400, t0); o.frequency.exponentialRampToValueAtTime(900, t0 + 0.16);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1600; bp.Q.value = 3;
    const g = ctx.createGain(); env(g, t0, 0.01, 0.16, 0.06);
    o.connect(bp); bp.connect(g); g.connect(master); o.start(t0); o.stop(t0 + 0.2);
  }
}
