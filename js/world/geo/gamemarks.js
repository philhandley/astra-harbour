// Marks the games use: the gull pegs on the fish shed roof (red five, white five, like a counting rack) and the
// load line painted on both sides of the feeder ship (a white line with a Plimsoll ring).
import { MAT, MeshBuilder } from '../../gpu/mesh.js';
import { OBJ } from '../env.js';
import { SHIP, gullPegs, PEG_H, LOAD_LINE_Y } from '../layout.js';

export function build(mb) {
  mb.push();
  // load line: a strip along each side amidships, and a ring with a bar through it at the middle
  mb.set({ obj: OBJ.SHIP, mat: MAT.PAINT, color: 0xf6f3ea });
  const zs = SHIP.beam / 2 + 0.0016;
  for (const s of [-1, 1]) {
    const z = s * zs;
    const strip = (x0, x1, y0, y1) => (s > 0
      ? mb.quad([x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z])
      : mb.quad([x1, y0, z], [x0, y0, z], [x0, y1, z], [x1, y1, z]));
    strip(-0.34, 0.34, LOAD_LINE_Y - 0.0035, LOAD_LINE_Y + 0.0035);
    // the Plimsoll ring
    const R = 0.026, r = 0.0195, seg = 24;
    for (let k = 0; k < seg; k++) {
      const a0 = (k / seg) * Math.PI * 2, a1 = ((k + 1) / seg) * Math.PI * 2;
      const P = (a, rr) => [Math.cos(a) * rr, LOAD_LINE_Y + Math.sin(a) * rr, z];
      const q = [P(a0, r), P(a1, r), P(a1, R), P(a0, R)];
      if (s > 0) mb.quad(q[0], q[1], q[2], q[3]); else mb.quad(q[3], q[2], q[1], q[0]);
    }
    strip(-0.036, 0.036, LOAD_LINE_Y - 0.003, LOAD_LINE_Y + 0.003);
  }
  mb.pop();
}

export const points = { pegs: gullPegs(20) };

// The gull pegs as an instanced template (white takes the tint: red or white), origin at the peg top.
export function templates() {
  const mb = new MeshBuilder();
  mb.set({ mat: MAT.PAINT, color: 0xffffff });
  // one solid peg (its top takes the tint) and a slightly wider band just under the top edge. No two faces share a
  // plane, so nothing z-fights (the old rim had its own lid level with the peg's top, which flickered).
  mb.cylinder(0, -PEG_H - 0.006, 0, 0.0068, PEG_H + 0.006, { seg: 12 });
  mb.set({ color: 0x8f8a80 });
  mb.cylinder(0, -0.0024, 0, 0.0077, 0.0016, { seg: 12, caps: false });
  return [{ name: 'peg', mesh: mb.finish() }];
}
