// Free-play cargo work: both cranes unload the ship's rows into the staging lane, the lane is trucked away to the
// yard, fresh boxes arrive, and the cranes load them aboard. "Cast off" stops new lifts (the box in hand finishes).
import { YARD_LIVERIES } from './cargo.js';

// Returns { run(harbour), stop() }: run() works one cargo exchange and then tells the harbour to sail, unless stopped.
export function makeAutoWork(cargo, cranes) {
  const ctl = { stopped: false, running: false, castOff: false };
  ctl.stop = () => { ctl.stopped = true; };
  ctl.run = async harbour => {
    if (ctl.running) return;
    ctl.running = true; ctl.stopped = false; ctl.castOff = false;
    try {
      await work(harbour);
      await waitIdle(cranes);
      if (!ctl.stopped || ctl.castOff) harbour.finishWork();
    } finally { ctl.running = false; }
  };
  ctl.castOffNow = () => { ctl.castOff = true; ctl.stopped = true; };
  async function work(harbour) {
    const stop = () => ctl.stopped;
    const bays = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    // a ship that arrives empty gets a mixed load
    if (!cargo.groupsOn('ship').length) {
      for (const b of [0, 1, 2, 3, 5, 6, 7, 8]) cargo.makeGroup(5, null, { kind: 'ship', bay: b }, { pop: true });
      await sleep(0.6);
    }
    // clear the staging lane
    for (const g of cargo.groupsOn('staging')) cargo.removeGroup(g);
    await sleep(0.4);
    // unload
    const onShip = bays.filter(b => cargo.groupAt('ship', b));
    let done = 0;
    harbour.status = `Unloading 0 / ${onShip.length}`;
    await runBoth(cranes, onShip, async (crane, bay) => {
      const g = cargo.groupAt('ship', bay);
      if (!g) return;
      await cranes.move(g, { kind: 'staging', bay }, { crane });
      done++;
      harbour.status = `Unloading ${done} / ${onShip.length}`;
    }, stop);
    if (stop()) return;
    await sleep(0.8);
    for (const g of cargo.groupsOn('staging')) cargo.removeGroup(g);
    await sleep(0.7);
    // fresh boxes arrive and go aboard
    const load = bays.filter(() => Math.random() < 0.85).slice(0, 8);
    for (const b of load) {
      const g = cargo.makeGroup(5, null, { kind: 'staging', bay: b }, { pop: true });
      g.liveries = g.liveries.map(() => hex(YARD_LIVERIES[Math.floor(Math.random() * YARD_LIVERIES.length)]));
      await sleep(0.06);
    }
    done = 0;
    harbour.status = `Loading 0 / ${load.length}`;
    await runBoth(cranes, load, async (crane, bay) => {
      const g = cargo.groupAt('staging', bay);
      if (!g) return;
      await cranes.move(g, { kind: 'ship', bay }, { crane });
      done++;
      harbour.status = `Loading ${done} / ${load.length}`;
    }, stop);
  }
  return ctl;
}

// Crane A takes bays from the left, crane B from the right, so they work apart and meet in the middle.
async function runBoth(cranes, bays, job, stop) {
  const left = bays.slice(0, Math.ceil(bays.length / 2));
  const right = bays.slice(Math.ceil(bays.length / 2)).reverse();
  const worker = async (crane, list) => {
    for (const b of list) {
      if (stop()) return;
      await job(crane, b);
    }
  };
  await Promise.all([worker(cranes.a, left), worker(cranes.b, right)]);
}

function waitIdle(cranes) { return new Promise(res => { const t = () => (cranes.idle() ? res() : setTimeout(t, 100)); t(); }); }
export function sleep(s) { return new Promise(res => setTimeout(res, s * 1000)); }
function hex(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
