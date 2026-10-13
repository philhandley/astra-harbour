// Tiny coroutines for choreography. A routine is a generator that yields "waiters": functions (dt) => true when done.
// run(gen) returns a handle with .done and a promise; tick(dt) advances all routines.

export class Director {
  constructor() { this.list = []; }
  run(gen, name = '') {
    const h = { gen, wait: null, done: false, name, cancelled: false };
    h.promise = new Promise(res => { h.resolve = res; });
    this.list.push(h);
    return h;
  }
  cancel(h) { if (h && !h.done) { h.cancelled = true; h.done = true; h.resolve(false); } }
  cancelAll(prefix = '') { for (const h of this.list) if (!h.done && h.name.startsWith(prefix)) this.cancel(h); }
  // Each routine's current waiter gets this frame's dt. When it finishes, the routine runs on to its next waiter,
  // which is probed with dt = 0 so already-satisfied waits pass at once but nothing double-counts the frame.
  tick(dt) {
    for (const h of this.list) {
      if (h.done) continue;
      if (h.wait) {
        if (!h.wait(dt)) continue;
        h.wait = null;
      }
      let guard = 0;
      while (!h.done && guard++ < 64) {
        const r = h.gen.next();
        if (r.done) { h.done = true; h.resolve(true); break; }
        const w = typeof r.value === 'function' ? r.value : waitTime(r.value || 0);
        if (!w(0)) { h.wait = w; break; }
      }
    }
    if (this.list.length > 64) this.list = this.list.filter(h => !h.done);
  }
  get busy() { return this.list.some(h => !h.done); }
}

export function waitTime(s) { let t = 0; return dt => (t += dt) >= s; }
// Wait exactly one frame and report its dt: const dt = yield* frame();
export function* frame() { let d = 0; yield dt => { if (dt === 0) return false; d = dt; return true; }; return d; }
export function waitUntil(fn) { return () => !!fn(); }
// Tween a value over time: fn(k) is called with eased progress 0..1.
export function tween(dur, fn, ease = easeInOut) {
  let t = 0;
  return dt => { t += dt; const k = Math.min(1, t / Math.max(dur, 1e-4)); fn(ease(k), k); return k >= 1; };
}
export const easeInOut = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOut = t => 1 - Math.pow(1 - t, 3);
export const linear = t => t;
