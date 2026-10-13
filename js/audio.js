// Synthesised sounds (Web Audio). Nothing plays until the first tap or key press.
let ctx = null, master = null, enabled = true;

export function initAudio() {
  const start = () => {
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

// Ship's horn: two low reeds a fifth apart, each two detuned saws, low-passed, with a slow swell.
export function horn(len = 2.2) {
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
  for (const [f, det] of [[98, -7], [98, 6], [146.8, -5], [146.8, 8]]) {
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = det;
    lfoG.connect(o.frequency);
    const g = ctx.createGain(); g.gain.value = 0.22;
    o.connect(g); g.connect(lp);
    o.start(t); o.stop(t + len + 0.05);
  }
  lfo.start(t); lfo.stop(t + len + 0.05);
}

export function toot() {
  if (!ready()) return;
  const t = ctx.currentTime;
  for (const [f, d] of [[233, 0], [233, 0.32]]) {
    const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = f;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
    const g = ctx.createGain(); env(g, t + d, 0.03, 0.22, 0.18);
    o.connect(lp); lp.connect(g); g.connect(master); o.start(t + d); o.stop(t + d + 0.3);
  }
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
