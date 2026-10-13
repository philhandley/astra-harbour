// Default poses for every moving object, so the harbour looks right before any system moves things.
import { quat } from '../gpu/math.js';
import { OBJ } from './env.js';
import { BERTH, BOAT_MOOR, YACHT_MOOR, MOORING_BUOYS, CHANNEL_BUOY, LIGHTHOUSE, CRANE, QUAY_TOP, RAIL_WATER_Z, SHIP } from './layout.js';

// Tow line ends (local frames): the tug's tow hook and the ship's bow bollard. Vessel builders put a hook / bollard there.
export const TUG_HOOK_LOCAL = [0.135, 0.07, 0];   // bow staple: the tug pulls and pushes bow-first
export const SHIP_BOW_BOLLARD_LOCAL = [0.86, 0.105, 0];
export const SHIP_MAST_TOP_LOCAL = [0.80, 0.30, 0];

export const TUG_HOME = { x: 0.45, z: -0.61, yaw: Math.PI };       // tied up at the east end of the terminal quay, bow toward -x
export const RADAR_LOCAL = [-0.80, 0.39, 0];    // ship-local position of the radar pivot (on the mast above the bridge)
export const PROP_LOCAL = [-0.935, -0.045, 0];  // ship-local propeller hub
export const TUG_PROP_LOCAL = [-0.15, -0.045, 0];

export function placeDefaults(scene) {
  const S = (id, p, yaw = 0) => scene.setObject(id, p, quat.fromYPR(yaw));
  const sea = scene.sea;
  S(OBJ.SHIP, [BERTH.x, sea, BERTH.z], BERTH.yaw);
  S(OBJ.TUG, [TUG_HOME.x, sea, TUG_HOME.z], TUG_HOME.yaw);
  S(OBJ.YACHT_1, [YACHT_MOOR[0].x + 0.12, sea, YACHT_MOOR[0].z + 0.04], 0.3);
  S(OBJ.YACHT_2, [YACHT_MOOR[1].x + 0.12, sea, YACHT_MOOR[1].z - 0.02], -0.2);
  S(OBJ.BOAT_A, [BOAT_MOOR[0].x, sea, BOAT_MOOR[0].z], BOAT_MOOR[0].yaw);
  S(OBJ.BOAT_B, [BOAT_MOOR[1].x, sea, BOAT_MOOR[1].z], BOAT_MOOR[1].yaw);
  S(OBJ.CHANNEL_BUOY, [CHANNEL_BUOY[0], sea, CHANNEL_BUOY[1]]);
  S(OBJ.MOOR_1, [MOORING_BUOYS[0][0], sea, MOORING_BUOYS[0][1]]);
  S(OBJ.MOOR_2, [MOORING_BUOYS[1][0], sea, MOORING_BUOYS[1][1]]);
  S(OBJ.MOOR_3, [MOORING_BUOYS[2][0], sea, MOORING_BUOYS[2][1]]);
  S(OBJ.LAMP, [LIGHTHOUSE.x, LIGHTHOUSE.towerTop + 0.055, LIGHTHOUSE.z]);
  // cranes: gantry at its start x, boom down, trolley parked, spreader hanging below the trolley
  const cranes = [[OBJ.CRANE_A, OBJ.BOOM_A, OBJ.TROLLEY_A, OBJ.SPREADER_A, CRANE.startX[0]], [OBJ.CRANE_B, OBJ.BOOM_B, OBJ.TROLLEY_B, OBJ.SPREADER_B, CRANE.startX[1]]];
  for (const [g, b, t, sp, x] of cranes) {
    S(g, [x, QUAY_TOP, RAIL_WATER_Z]);
    S(b, [x, QUAY_TOP + CRANE.hingeY, RAIL_WATER_Z]);
    S(t, [x, QUAY_TOP + CRANE.trolleyY, RAIL_WATER_Z + CRANE.parkZ]);
    S(sp, [x, QUAY_TOP + CRANE.trolleyY - 0.22, RAIL_WATER_Z + CRANE.parkZ]);
  }
  // children of the ship
  const ship = scene.getObject(OBJ.SHIP);
  const child = (id, local) => {
    const p = quat.rotate(ship.q, local);
    scene.setObject(id, [ship.pos[0] + p[0], ship.pos[1] + p[1], ship.pos[2] + p[2]], ship.q);
  };
  child(OBJ.RADAR, RADAR_LOCAL);
  child(OBJ.PROP, PROP_LOCAL);
  const tug = scene.getObject(OBJ.TUG);
  const tp = quat.rotate(tug.q, TUG_PROP_LOCAL);
  scene.setObject(OBJ.TUG_PROP, [tug.pos[0] + tp[0], tug.pos[1] + tp[1], tug.pos[2] + tp[2]], tug.q);
  scene.setObject(OBJ.TOWLINE, tug.pos, tug.q);
}

export { SHIP };
