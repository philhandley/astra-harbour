// The ground of the jelly block: seabed, quay deck, town hill, quay wall and the strata on the four cut faces.
// Also builds the terrain grid the water simulation and shaders read, and the water mesh (surface + cut faces).
import { MAT } from '../gpu/mesh.js';
import { B, BOTTOM, SEA, QUAY_Z, QUAY_TOP, LAND_Z, SPLIT_X, landHeight, floorHeight, inBreakwater, breakwaterHeight } from './layout.js';

// Strata bands (bottom to top). Bands 0-4 fixed; 5 sand under the sea; 6 fill; 7 topsoil under the grass.
const BANDS = [[-0.95, -0.885], [-0.885, -0.80], [-0.80, -0.715], [-0.715, -0.63], [-0.63, -0.545]];
const FIXED_TOP = -0.545;

export const STRATA_PALETTES = {
  seaglass: ['#c4936a', '#eec594', '#f8ecd9', '#f4c1bc', '#fcf4e6', '#f0dfbd', '#f5ead6', '#86a85c'],
  blueberry: ['#9f83b0', '#dbc3e3', '#f6eef4', '#bfd0f4', '#f8f4f8', '#ebdcc2', '#f1e9ec', '#86a85c'],
  lime: ['#bba36a', '#e6d79c', '#f7f2d7', '#d8eba6', '#faf6e6', '#eedfbc', '#f3ecd8', '#86a85c'],
};

export function surfaceAt(x, z) {
  return z < QUAY_Z ? landHeight(x, z) : floorHeight(x, z);
}

export function buildTerrain(mb) {
  mb.push();
  mb.obj = 0;
  seabed(mb);
  land(mb);
  quayWall(mb);
  cutFaces(mb);
  // underside
  mb.set({ mat: MAT.STRATA, param: 0, color: 0xffffff });
  mb.quad([-B, BOTTOM, -B], [B, BOTTOM, -B], [B, BOTTOM, B], [-B, BOTTOM, B]);
  mb.pop();
}

function heightGrid(mb, x0, x1, z0, z1, nx, nz, hfn, matFn) {
  const base = mb.nv;
  const dx = (x1 - x0) / nx, dz = (z1 - z0) / nz;
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
    const x = x0 + i * dx, z = z0 + j * dz;
    const y = hfn(x, z);
    const hx = (hfn(x + 0.01, z) - hfn(x - 0.01, z)) / 0.02;
    const hz = (hfn(x, z + 0.01) - hfn(x, z - 0.01)) / 0.02;
    const n = [-hx, 1, -hz], l = Math.hypot(n[0], n[1], n[2]);
    const m = matFn(x, z, y);
    mb.vert([x, y, z], [n[0] / l, n[1] / l, n[2] / l], m);
  }
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const a = base + j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
    mb.tri(a, c, b); mb.tri(b, c, d);
  }
}

function seabed(mb) {
  const nx = 130, nz = Math.round(130 * (B - QUAY_Z) / (2 * B));
  heightGrid(mb, -B, B, QUAY_Z, B, nx, nz, floorHeight, (x, z, y) => {
    if (inBreakwater(x, z) && breakwaterHeight(x, z) > -0.9) {
      return { mat: MAT.ROCK, color: 0x8f8a80 };
    }
    return { mat: MAT.SAND, color: 0xdccfb2 };
  });
}

function land(mb) {
  // town hill (grass)
  heightGrid(mb, -B, B, -B, LAND_Z, 104, 20, landHeight, (x, z, y) => ({ mat: MAT.GRASS, color: 0x9cc46a }));
  // flat quay deck under the yard and promenade (builders lay asphalt and cobbles on top)
  mb.set({ mat: MAT.CONCRETE, color: 0xd8d3c8, param: 0 });
  mb.quad([-B, QUAY_TOP - 0.004, QUAY_Z], [B, QUAY_TOP - 0.004, QUAY_Z], [B, QUAY_TOP - 0.004, LAND_Z], [-B, QUAY_TOP - 0.004, LAND_Z]);
}

function quayWall(mb) {
  // vertical face from the seabed to the deck; concrete for the terminal, stone for the fishing quay
  const seg = 80;
  for (let k = 0; k < seg; k++) {
    const x0 = -B + (2 * B * k) / seg, x1 = -B + (2 * B * (k + 1)) / seg;
    const f0 = floorHeight(x0, QUAY_Z + 0.001) - 0.02, f1 = floorHeight(x1, QUAY_Z + 0.001) - 0.02;
    const stone = (x0 + x1) / 2 > SPLIT_X;
    mb.set({ mat: stone ? MAT.MASONRY : MAT.CONCRETE, color: stone ? 0xc9bfae : 0xcfcac0 });
    mb.quad([x0, f0, QUAY_Z], [x1, f1, QUAY_Z], [x1, QUAY_TOP, QUAY_Z], [x0, QUAY_TOP, QUAY_Z]);
  }
  // coping along the top edge
  mb.set({ mat: MAT.CONCRETE, color: 0xe4e0d8 });
  mb.boxMM(-B, QUAY_TOP - 0.025, QUAY_Z - 0.03, SPLIT_X, QUAY_TOP + 0.006, QUAY_Z + 0.008);
  mb.set({ mat: MAT.MASONRY, color: 0xd6ccbb });
  mb.boxMM(SPLIT_X, QUAY_TOP - 0.025, QUAY_Z - 0.03, B, QUAY_TOP + 0.008, QUAY_Z + 0.01);
}

// Strata on the four cut faces, following the surface profile along each edge.
function cutFaces(mb) {
  const edges = [
    { name: 'front', pt: t => [-B + 2 * B * t, B], n: [0, 0, 1] },
    { name: 'back', pt: t => [B - 2 * B * t, -B], n: [0, 0, -1] },
    { name: 'left', pt: t => [-B, -B + 2 * B * t], n: [-1, 0, 0] },
    { name: 'right', pt: t => [B, B - 2 * B * t], n: [1, 0, 0] },
  ];
  const seg = 160;
  for (const e of edges) {
    for (let k = 0; k < seg; k++) {
      const [xa, za] = e.pt(k / seg), [xb, zb] = e.pt((k + 1) / seg);
      const sa = surfaceAt(xa, za), sb = surfaceAt(xb, zb);
      const water = (za + zb) / 2 >= QUAY_Z;
      const quay = !water && (za + zb) / 2 >= LAND_Z;
      const tt = water || quay ? 0.05 : 0.03;
      const layers = [];
      for (let b = 0; b < BANDS.length; b++) {
        layers.push({ lo: [BANDS[b][0], BANDS[b][0]], hi: [Math.min(BANDS[b][1], sa - tt), Math.min(BANDS[b][1], sb - tt)], band: b });
      }
      layers.push({ lo: [FIXED_TOP, FIXED_TOP], hi: [sa - tt, sb - tt], band: 6 });
      layers.push({ lo: [Math.max(sa - tt, BOTTOM), Math.max(sb - tt, BOTTOM)], hi: [sa, sb], band: water ? 5 : quay ? -1 : 7 });
      for (const L of layers) {
        const lo0 = L.lo[0], lo1 = L.lo[1];
        if (L.hi[0] <= lo0 + 1e-4 && L.hi[1] <= lo1 + 1e-4) continue;
        const hiA = Math.max(L.hi[0], lo0), hiB = Math.max(L.hi[1], lo1);
        if (L.band === -1) mb.set({ mat: MAT.CONCRETE, color: 0xcfcac0, param: 0 });
        else mb.set({ mat: MAT.STRATA, color: 0xffffff, param: L.band / 8 });
        mb.quad([xa, lo0, za], [xb, lo1, zb], [xb, hiB, zb], [xa, hiA, za]);
      }
    }
  }
}

// ---- grids for the simulation and the shaders ----------------------------------------------------------------
// r: seabed (or land) height; g: solid for the simulation; b: distance to the nearest shore (for the foam lace);
// a: dry mask for drawing (solid eroded by one cell, so the surface tucks under walls without gaps).
export function buildTerrainGrid(N) {
  const cell = (2 * B) / N;
  const data = new Float32Array(N * N * 4);
  const solid = new Uint8Array(N * N);
  const floor = new Float32Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = -B + (i + 0.5) * cell, z = -B + (j + 0.5) * cell;
    const k = j * N + i;
    if (z < QUAY_Z) { solid[k] = 1; floor[k] = landHeight(x, z); }
    else {
      floor[k] = floorHeight(x, z);
      solid[k] = floor[k] > SEA - 0.005 ? 1 : 0;
    }
  }
  // distance to shore (brute force over a small window)
  const R = Math.ceil(0.3 / cell);
  const dist = new Float32Array(N * N).fill(0.3);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const k = j * N + i;
    if (solid[k]) { dist[k] = 0; continue; }
    let best = 0.3;
    for (let dj = -R; dj <= R; dj++) {
      const jj = j + dj; if (jj < 0 || jj >= N) continue;
      for (let di = -R; di <= R; di++) {
        const ii = i + di; if (ii < 0 || ii >= N) continue;
        if (solid[jj * N + ii]) { const d = Math.hypot(di, dj) * cell - cell * 0.5; if (d < best) best = d; }
      }
    }
    dist[k] = Math.max(best, 0);
  }
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const k = j * N + i;
    let dry = solid[k];
    if (dry) for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ii = i + di, jj = j + dj;
      if (ii >= 0 && ii < N && jj >= 0 && jj < N && !solid[jj * N + ii]) dry = 0;
    }
    data[k * 4] = floor[k];
    data[k * 4 + 1] = solid[k];
    data[k * 4 + 2] = dist[k];
    data[k * 4 + 3] = dry;
  }
  return { data, solid, floor, cell, N };
}

// Water mesh: surface grid over the whole block plus the cut faces on the three open sides.
export function buildWaterMesh(M = 129) {
  const verts = [], idx = [];
  const step = (2 * B) / (M - 1);
  for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) verts.push(-B + i * step, -B + j * step, 0, 0);
  for (let j = 0; j < M - 1; j++) for (let i = 0; i < M - 1; i++) {
    const a = j * M + i, b = a + 1, c = a + M, d = c + 1;
    // front-facing seen from above: (a, c, b) and (b, c, d)
    idx.push(a, c, b, b, c, d);
  }
  const side = (pts, sideId, flip) => {
    const base = verts.length / 4;
    for (const [x, z] of pts) { verts.push(x, z, 1, sideId); verts.push(x, z, 2, sideId); }
    for (let k = 0; k < pts.length - 1; k++) {
      const b0 = base + k * 2, t0 = b0 + 1, b1 = b0 + 2, t1 = b0 + 3;
      if (!flip) idx.push(b0, b1, t0, b1, t1, t0);
      else idx.push(b0, t0, b1, b1, t0, t1);
    }
  };
  const zs = [];
  for (let z = QUAY_Z; z <= B + 1e-6; z += step) zs.push(z);
  if (zs[zs.length - 1] < B) zs.push(B);
  const xs = [];
  for (let i = 0; i < M; i++) xs.push(-B + i * step);
  side(xs.map(x => [x, B]), 3, false);          // front, normal +z
  side(zs.map(z => [-B, z]), 0, false);         // left, normal -x
  side(zs.map(z => [B, z]), 1, true);           // right, normal +x
  return { vertices: new Float32Array(verts), indices: new Uint32Array(idx) };
}
