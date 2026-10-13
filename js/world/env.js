// Flavours (water colour + strata), the key light and the object id table.
import { STRATA_PALETTES } from './terrain.js';

const hex3 = h => { const n = parseInt(h.slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };

// A: absorption per unit (rgb) + scatter strength; B: body colour + foam; C: shaft tint + clarity
export const FLAVOURS = {
  seaglass: { name: 'Sea glass', swatch: '#5fd6c3', A: [5.2, 1.05, 1.35, 1.0], body: '#26c2b6', shaft: '#c9fff4', clarity: 0.55 },
  blueberry: { name: 'Blueberry', swatch: '#3d6fd8', A: [5.6, 2.4, 0.75, 1.0], body: '#1a5bd0', shaft: '#bcd8ff', clarity: 0.55 },
  lime: { name: 'Lime', swatch: '#a6d84a', A: [3.2, 0.8, 4.6, 1.0], body: '#7fca38', shaft: '#f0ffc4', clarity: 0.55 },
};

export function flavourUniforms(id) {
  const f = FLAVOURS[id] || FLAVOURS.seaglass;
  return {
    A: f.A,
    B: [...hex3(f.body), 1.0],
    C: [...hex3(f.shaft), f.clarity],
    strata: (STRATA_PALETTES[id] || STRATA_PALETTES.seaglass).map(c => hex3(c).map(x => Math.pow(x, 1.0))),
  };
}

export const LIGHT = [-0.5, 0.9, 0.42];

// Object ids: every moving rig's vertices carry one of these; transforms live in the frame uniform buffer.
export const OBJ = {
  WORLD: 0,
  SHIP: 1, TUG: 2,
  CRANE_A: 3, BOOM_A: 4, TROLLEY_A: 5, SPREADER_A: 6,
  CRANE_B: 7, BOOM_B: 8, TROLLEY_B: 9, SPREADER_B: 10,
  YACHT_1: 11, YACHT_2: 12,
  BOAT_A: 13, BOAT_B: 14,
  CHANNEL_BUOY: 15, MOOR_1: 16, MOOR_2: 17, MOOR_3: 18,
  LAMP: 19, RADAR: 20, TOWLINE: 21, PROP: 22, TUG_PROP: 23,
  COUNT: 32,
};
