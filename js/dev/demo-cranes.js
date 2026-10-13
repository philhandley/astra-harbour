// Dev system: loads rows onto the ship with the cranes. Used by dev/view.html?sys=dev/demo-cranes
import { Cargo } from '../sim/cargo.js';
import { CraneYard } from '../sim/cranes.js';
import { GROUP_COLOURS } from '../sim/cargo.js';
export async function attach(scene, q) {
  const cargo = new Cargo(scene);
  const cy = new CraneYard(scene, cargo);
  window.__cy = cy; window.__cargo = cargo;
  const size = Number(q.get('size') || 5);
  const n = Number(q.get('rows') || 4);
  cy.speed = Number(q.get('speed') || 1);
  for (let i = 0; i < 10; i++) cargo.makeGroup(size, GROUP_COLOURS[i], { kind: 'staging', bay: i });
  const pre = Number(q.get('preload') || 0);
  for (let i = 0; i < pre; i++) { const g = cargo.groupAt('staging', i); g.where = { kind: 'ship', bay: i }; }
  (async () => {
    for (let i = pre; i < pre + n; i++) {
      const g = cargo.groupAt('staging', i);
      await cy.move(g, { kind: 'ship', bay: i });
      console.log('DEMO landed bay', i, 'crane', cy.a.busy, cy.b.busy);
    }
    if (q.get('booms')) await cy.setBooms(true);
    console.log('DEMO done');
  })();
  return { update(dt) { cy.update(dt); cargo.update(dt); } };
}
