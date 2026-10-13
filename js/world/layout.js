// The harbour's shared layout: every builder and every system reads its coordinates from here.
// World units: the jelly block is 5.2 x 5.2. +x is right (fish quay side), -x left (container terminal),
// -z is the back (quay wall, town on the hill), +z the front (open basin). y is up; mean sea level is y = 0.

export const B = 2.6;                 // block half size: x and z run from -B to +B
export const BOTTOM = -0.95;          // underside of the block
export const SEA = 0;                 // mean sea level; the Tide slider moves it by up to +-TIDE
export const TIDE = 0.06;

// Land along the back
export const QUAY_Z = -0.70;          // water-side face of the quay wall, along the whole back
export const QUAY_TOP = 0.20;         // quay deck level (terminal yard, promenade)
export const LAND_Z = -1.70;          // the flat quay land ends here; the town hill climbs behind
export const SPLIT_X = 0.75;          // terminal for x < SPLIT_X, fishing quay for x > SPLIT_X

// Seabed
export const FLOOR = { basin: -0.42, berth: -0.36, fish: -0.27 };

// Town hill: three terraces of houses, back edge at z = -B
export const TOWN_ROWS = [
  { z: -1.86, y: 0.30 },
  { z: -2.12, y: 0.47 },
  { z: -2.38, y: 0.64 },
];
export const HILL_BACK_Y = 0.72;
export const CHURCH = { x: 0.45, z: -2.36 };

// Container terminal (left)
export const TERMINAL = { x0: -B, x1: SPLIT_X, z0: LAND_Z, z1: QUAY_Z };
export const RAIL_WATER_Z = -0.80;    // crane rails
export const RAIL_LAND_Z = -1.12;
export const RAIL_X = [-2.45, 0.6];   // the rails run between these x values
export const STAGING_Z = -1.27;       // centre line of the groups waiting under the cranes' backreach
export const YARD = { x0: -2.02, x1: 0.62, z0: -1.66, z1: -1.40 }; // stacked yard blocks
export const OFFICE = { x0: -2.52, x1: -2.12, z0: -1.62, z1: -1.30 };
export const LIGHT_TOWERS = [[-2.30, -0.95], [-0.15, -1.36], [0.66, -0.92]];

// Containers (a 20 ft box). Long axis along x in the yard and on the ship.
export const BOX = { L: 0.125, W: 0.050, H: 0.054, pitchX: 0.135, pitchZ: 0.054 };

// Feeder ship. Local frame: +x bow, +y up (y = 0 at the waterline), +z starboard. Port side to the quay.
export const SHIP = {
  length: 1.92, beam: 0.31, draft: 0.085, deckY: 0.075, hatchY: 0.082,
  bays: 10, bay0X: -0.6325,          // local x of bay 0's centre (bay i at bay0X + i * BOX.pitchX)
  sternX: -0.96, bowX: 0.96,
  accomX: [-0.93, -0.72],            // accommodation block span along x
};
export const BERTH = { x: -0.95, z: QUAY_Z + 0.03 + SHIP.beam / 2, yaw: 0 }; // ship centre at the berth, bow toward +x

// Crane rig (two ship-to-shore cranes on the rails). Gantry local origin: (craneX, QUAY_TOP, RAIL_WATER_Z), axes = world axes.
export const CRANE = {
  legSpanX: 0.24,        // footprint along the rails; cranes never get closer than legSpanX + 0.06
  minGap: 0.30,
  gauge: RAIL_WATER_Z - RAIL_LAND_Z, // 0.32
  hingeY: 0.56,          // boom hinge height above the quay (local y)
  girderY: 0.56,         // the girder (boom + backreach) underside, local y
  boomLen: 0.74,         // hinge to tip, toward +z (water)
  backreach: 0.60,       // hinge toward -z (land), to local z = -0.60
  apexY: 0.86,           // top of the A-frame
  trolleyY: 0.545,       // trolley wheels run just under the girder (local y)
  zMin: -0.50,           // trolley travel, local z (backreach end)
  zMax: 0.70,            // trolley travel, local z (boom tip)
  parkZ: -0.42,          // trolley park position when the boom goes up
  startX: [-1.45, -0.55],
};

// Fishing quay (right)
export const FISHQUAY = { x0: SPLIT_X, x1: B, z0: LAND_Z, z1: QUAY_Z };
export const PROMENADE_Z = [-1.00, QUAY_Z];
export const SHED = { x0: 1.05, x1: 1.75, z0: -1.56, z1: -1.08 };
export const LAMPS = [[0.92, -0.76], [1.50, -0.76], [2.05, -0.76], [1.20, -1.62], [2.20, -1.62]];
// L-shaped timber pier: a root running out from the quay, then an arm running west (-x), parallel to the quay.
export const PIER = {
  w: 0.16, deckY: 0.13,
  root: { x: 2.30, z0: QUAY_Z, z1: -0.22 },          // centre line x; from the quay out to the corner
  arm: { z: -0.22, x0: 0.95, x1: 2.38 },             // centre line z; from its west end to past the corner
};

// Fishing boats (bonds game) moored side-on along the south side of the pier arm, bow toward +x.
// Each deck carries a ten frame: 5 crate slots along the boat in two rows. Boat A (left) then boat B (right) make 20.
export const FISHBOAT = { length: 0.52, beam: 0.17, deckY: 0.045, crate: 0.050, crateH: 0.030, pitch: 0.058, slotsX0: -0.07 };
export const BOAT_MOOR = [
  { x: 1.32, z: PIER.arm.z + PIER.w / 2 + 0.02 + FISHBOAT.beam / 2, yaw: 0 },
  { x: 1.94, z: PIER.arm.z + PIER.w / 2 + 0.02 + FISHBOAT.beam / 2, yaw: 0 },
];
// Boat-local slot centres in counting order: far row (port, -z) left to right, then near row (starboard, +z).
export function boatSlots() {
  const out = [];
  for (const row of [-1, 1]) for (let i = 0; i < 5; i++) {
    out.push([FISHBOAT.slotsX0 + i * FISHBOAT.pitch, FISHBOAT.deckY, row * FISHBOAT.pitch / 2]);
  }
  return out;
}

// Breakwater: runs along z = BW.z from the right edge to its head at x = BW.headX.
export const BW = { z: 0.85, headX: 1.15, crestY: 0.16, wallTop: 0.26, crestHalf: 0.11, toeHalf: 0.40 };
export const LIGHTHOUSE = { x: BW.headX, z: BW.z, baseR: 0.10, towerTop: 0.62, lanternTop: 0.74 };

// Open basin floats
export const YACHT_MOOR = [{ x: -1.05, z: 1.30 }, { x: -2.10, z: 2.12 }];
export const MOORING_BUOYS = [[-1.05, 1.30], [-2.10, 2.12], [-0.35, 2.30]];
export const CHANNEL_BUOY = [0.78, 1.55];

// Seabed details that builders may place
export const SEABED_SPOTS = { anchor: [-1.6, 0.6], tyre: [0.1, 0.35] };

// ---- shape functions -----------------------------------------------------------------------

function sstep(a, b, x) { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }

// Ground height of the land (quay deck and hill). Only meaningful for z < QUAY_Z.
export function landHeight(x, z) {
  if (z >= LAND_Z) return QUAY_TOP;
  // terraces with grassy banks between them
  const rows = TOWN_ROWS;
  let y = QUAY_TOP + (rows[0].y - QUAY_TOP) * sstep(LAND_Z, rows[0].z + 0.08, z);
  y += (rows[1].y - rows[0].y) * sstep(rows[0].z - 0.07, rows[1].z + 0.08, z);
  y += (rows[2].y - rows[1].y) * sstep(rows[1].z - 0.07, rows[2].z + 0.08, z);
  y += (HILL_BACK_Y - rows[2].y) * sstep(rows[2].z - 0.10, -B, z);
  // a gentle swell across x so the hill is not a ruler
  y += 0.012 * Math.sin(x * 2.1 + 0.6) * sstep(LAND_Z, LAND_Z - 0.3, z);
  return y;
}

// True where a point lies inside the breakwater's rubble footprint (at the seabed).
export function inBreakwater(x, z, pad = 0) {
  const r = BW.toeHalf + pad;
  if (x >= BW.headX) return Math.abs(z - BW.z) <= r;
  return Math.hypot(x - BW.headX, z - BW.z) <= r;
}

// Height of the breakwater rubble mound at (x, z), or -Infinity outside it.
export function breakwaterHeight(x, z) {
  const d = x >= BW.headX ? Math.abs(z - BW.z) : Math.hypot(x - BW.headX, z - BW.z);
  if (d > BW.toeHalf) return -Infinity;
  if (d <= BW.crestHalf) return BW.crestY;
  const t = (d - BW.crestHalf) / (BW.toeHalf - BW.crestHalf);
  return BW.crestY + (floorBase(x, z) - BW.crestY) * Math.pow(t, 0.85);
}

// Seabed height without the breakwater (smooth basin shape plus sand drifts).
export function floorBase(x, z) {
  let y = FLOOR.basin;
  // dredged berth along the quay
  y += (FLOOR.berth - FLOOR.basin) * (1 - sstep(QUAY_Z + 0.55, QUAY_Z + 0.95, z));
  // shallower fishing harbour behind the breakwater
  const fish = sstep(SPLIT_X + 0.05, SPLIT_X + 0.45, x) * (1 - sstep(BW.z - 0.2, BW.z + 0.1, z));
  y += (FLOOR.fish - y) * fish;
  // sand drifts and silt ripples
  y += 0.018 * Math.sin(x * 3.1 + z * 1.7) * Math.sin(z * 2.3 - x * 0.7);
  y += 0.008 * Math.sin(x * 9.0 + z * 4.0);
  return y;
}

// Seabed height including the breakwater mound.
export function floorHeight(x, z) {
  const b = floorBase(x, z);
  const m = breakwaterHeight(x, z);
  return m > b ? m : b;
}

// What is under a point in plan: 'land', 'breakwater', 'pier' or 'water'.
export function surfaceKind(x, z) {
  if (z < QUAY_Z) return 'land';
  if (breakwaterHeight(x, z) > SEA - 0.01) return 'breakwater';
  if (inPier(x, z)) return 'pier';
  return 'water';
}

export function inPier(x, z, pad = 0) {
  const h = PIER.w / 2 + pad;
  if (Math.abs(x - PIER.root.x) <= h && z >= PIER.root.z0 && z <= PIER.root.z1 + h) return true;
  if (Math.abs(z - PIER.arm.z) <= h && x >= PIER.arm.x0 - pad && x <= PIER.arm.x1 + pad) return true;
  return false;
}

// Ship deck slots (ship-local). Group sizes 2, 5 and 10; a ten is 5 across in two tiers, like a ten frame.
export function shipSlots(groupSize) {
  const out = [];
  if (groupSize === 2) { for (const k of [-0.5, 0.5]) out.push({ z: k * BOX.pitchZ, tier: 0 }); }
  else if (groupSize === 5) { for (let k = -2; k <= 2; k++) out.push({ z: k * BOX.pitchZ, tier: 0 }); }
  else if (groupSize === 10) { for (const t of [0, 1]) for (let k = -2; k <= 2; k++) out.push({ z: k * BOX.pitchZ, tier: t }); }
  else { for (let k = 0; k < groupSize; k++) out.push({ z: (k - (groupSize - 1) / 2) * BOX.pitchZ, tier: 0 }); }
  return out;
}
export const bayX = i => SHIP.bay0X + i * BOX.pitchX;
