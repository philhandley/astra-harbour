# Jelly Harbour engine contract

Read this before writing any model or system. The app is plain ES modules with no build step, rendered with raw WebGPU/WGSL.

## Coordinates and scale
- `js/world/layout.js` is the single source of every position. Import from it; never hard-code a coordinate it already has.
- World units: the jelly block is 5.2 x 5.2 (`B = 2.6`). +x right (fishing quay side), -x left (container terminal), -z back (quay wall, town on the hill), +z front (open basin). y up. Mean sea level y = 0 (`SEA`). The block's underside is y = -0.95.
- Scale: about 1 unit = 48 m. A 20 ft container is 0.125 x 0.050 x 0.054. A house is about 0.14-0.20 wide; a storey about 0.06; a door about 0.035 x 0.022; a window about 0.022 x 0.028; a bollard about 0.018 tall; a lamp post about 0.11.
- Ground: quay deck at `QUAY_TOP = 0.20` for `LAND_Z (-1.70) <= z < QUAY_Z (-0.70)`; the town hill (`landHeight(x, z)`) behind `LAND_Z`; seabed `floorHeight(x, z)` in front of `QUAY_Z`. The terrain (seabed, hill grass, a plain concrete deck at y = 0.196, the quay wall face and coping, the soil strata) is already built by `js/world/terrain.js`. Builders add everything that stands on it.

## MeshBuilder (`js/gpu/mesh.js`)
Every static model is written into one shared `MeshBuilder` passed to your `build(mb, ctx)`:
- State: `mb.color` (hex number, sRGB), `mb.mat` (a `MAT` value), `mb.obj` (object id, 0 = static world), `mb.param` (0..1, material-specific). Set several with `mb.set({ ... })`. Most primitives also take an options object `o` that overrides `color`, `mat`, `param`, `obj` for that call only.
- Transform stack: `mb.push()`, `mb.pop()` (also restores colour/mat/obj/param), `mb.translate(x,y,z)`, `mb.rotateY(a)`, `rotateX`, `rotateZ`, `scale(x,y,z)`.
- Primitives (local space):
  - `boxMM(x0,y0,z0,x1,y1,z1, o)`; `box(cx, y0, cz, sx, sy, sz, o)` (base-centred). `o.skip: ['bottom','nz',...]` drops hidden faces. Always skip faces nobody can see (bottoms on the ground, faces against walls).
  - `cylinder(x, y0, z, r, h, { seg, r2, caps, bottom })` along +y (frustum when `r2` given).
  - `lathe(x, z, [[r, y], ...], { seg })` profile revolved about the local y axis.
  - `sphere(x, y, z, r, { seg, rings, sx, sy })`.
  - `beam(a, b, w, h, o)` a box-section strut from point a to point b (bracing, rails, booms).
  - `tube(points, r, { seg })` round tube along a polyline (handrails, ropes, chains).
  - `prism(ptsXZ, y0, y1, o)` extruded polygon, points counter-clockwise from above.
  - `gable(cx, y0, cz, w, d, h, { overhang, thick, wallColor, wallMat })` gabled roof, ridge along local x, with the two gable-end wall triangles.
  - `loft(rings, { caps, flip })` skin through rings of points (hulls).
  - `poly(pts)`, `quad(a,b,c,d)` flat convex polygons (counter-clockwise seen from the front); `polyFan(pts)` for concave ones.
  - `cable(aLocal, objA, bLocal, objB, r)` a thin line whose ends live in two different object frames, so it stretches when they move (crane falls, stays, tow line).
- Colours are sRGB hex numbers like `0xd9482b`. Lighting, shadows, caustics, tone mapping and the jelly wobble are all done in the shaders: do not bake shading into colours, apart from gentle per-piece variety.
- Use `makeRand(seed)` from `js/gpu/math.js` for any randomness so the harbour is the same every load.

## Materials (`MAT`)
The fragment shader draws a procedural pattern per material from the vertex's local position, so faces need no UVs.

| MAT | use | notes |
|---|---|---|
| PAINT | default matte paint | |
| GLASS | windows, lantern glass | colour = tint, e.g. 0x34495a; reflects the studio |
| STEEL | gloss paint on steel: cranes, hull topsides, lamp posts | strong highlight |
| TILES | clay roof tiles | courses run up the slope automatically |
| SLATE | slate roofs | blue-grey courses |
| TIMBER | planks with grain | `param` < 0.5: planks run along x, > 0.5: along z |
| CORRUGATED | corrugated sheet walls and roofs | ribs are drawn (normal-perturbed) |
| MASONRY | dressed stone blocks with mortar | |
| BRICK | painted board cladding for houses (horizontal boards) | |
| RUBBER | fenders, tyres | |
| ROCK | rubble, boulders, stones | flat facets look best |
| LAMP | glowing lamp glass | `param` = glow strength (0..1) |
| WEED | swaying weed | `param` = sway weight: 0 at the root, 1 at the tip |
| LEAF | tree foliage | `param` = sway (small) |
| HULL | ship and boat hulls | antifouling red below local y = -0.012, black boot-top to y = 0.004, vertex colour above. Local y = 0 is the waterline |
| GRASS, ASPHALT, SAND, CONCRETE, COBBLES | ground finishes | patterns from world position |
| MUSSEL | blue-black mussel crust | |
| CANVAS | furled sails, tarpaulins | |

## Object ids (`OBJ` in `js/world/env.js`)
Static world geometry uses obj 0. Moving rigs are built in their own local frame with `mb.obj = OBJ.X`; their transforms (position + quaternion) are set every frame by the systems. Local frames for vessels: +x bow, +y up, y = 0 at the waterline, +z starboard. Yaw rotates about +y; heading is (cos yaw, -sin yaw) in world xz.

SHIP 1, TUG 2, CRANE_A 3, BOOM_A 4, TROLLEY_A 5, SPREADER_A 6, CRANE_B 7, BOOM_B 8, TROLLEY_B 9, SPREADER_B 10, YACHT_1 11, YACHT_2 12, BOAT_A 13, BOAT_B 14, CHANNEL_BUOY 15, MOOR_1..3 16-18, LAMP 19 (lighthouse lamp, spins about +y), RADAR 20 (ship radar, spins), TOWLINE 21, PROP 22 (ship propeller, spins about +x), TUG_PROP 23.

Child pivots (in `js/world/rig.js`): RADAR at ship-local `RADAR_LOCAL`, PROP at `PROP_LOCAL`, TUG_PROP at `TUG_PROP_LOCAL`, tow hook at `TUG_HOOK_LOCAL`, bow bollard at `SHIP_BOW_BOLLARD_LOCAL`, foremast top at `SHIP_MAST_TOP_LOCAL`. Build a child part around its own local origin with its own obj id; build the support it sits on (mast, shaft) in the parent's frame.

## Builders (`js/world/geo/<name>.js`)
Each exports `build(mb, ctx)`. It must leave `mb`'s state as it found it (wrap in `mb.push()` / `mb.pop()`). It may also export `points` (named positions other systems need: perches, slots, hooks) and `templates()` (instanced meshes, see below).

| file | owns | budget (triangles) |
|---|---|---|
| terminal.js | container yard surface (asphalt, painted lines, concrete strips, crane rails), light towers, terminal office, quay-edge furniture along the whole quay wall (fenders, bollards, ladders, mussels and weed below the waterline, x from -B to B, leaving the pier root clear) | 30k |
| fishquay.js | stone fishing quay surface (flagstones, cobbled promenade), fish-market shed, lamp posts at `LAMPS`, the L-shaped timber pier (`PIER`) on mussel-covered piles with bracing, quay clutter (crate stacks, nets, benches, a little fish derrick) | 30k |
| town.js | hill town: three terraces of gabled houses, church with copper spire at `CHURCH`, round trees, paths and steps, garden walls | 50k |
| breakwater.js | rubble breakwater with concrete crown wall, lighthouse (static parts) and its spinning lamp (obj LAMP) | 30k |
| seabed.js | seabed props: weed tufts, stones, starfish, old anchor with chain (at `SEABED_SPOTS.anchor`), lost tyre (at `SEABED_SPOTS.tyre`), shells | 15k |
| vessels.js | feeder ship, tug, two yachts, two fishing boats, channel buoy, three mooring buoys (each in its own obj frame) | 40k |
| cranes.js | the two ship-to-shore gantry cranes (rig with booms, trolleys, spreaders, falls, stays) | 20k |

Containers, fish crates, lifebuoys, fish, gulls, jellyfish and bubbles are GPU instances, not part of the static mesh.

## Instanced templates
A builder may export `templates()` returning `[{ name, mesh }]` where `mesh` is `new MeshBuilder()...finish()`. A template's vertices are in its own local frame; vertex colour pure white (0xffffff) means "take the instance tint". `col.a` (= `param`) is the flex weight used by the animated kinds (fish tail, gull wing tip, jellyfish arms).
Systems push `{ template, data, count, shadow }` into `scene.instanceGroups`, where `data` is an ArrayBuffer of 48-byte instances: pos f32x3 (in the parent's frame), scale f32, quat f32x4, tint unorm8x4 (rgb + a: 1 = full tint), info uint8x4 (parent obj, kind, 0, 0), anim f32x2. Kinds: 0 rigid, 1 fish, 2 gull (anim.y = flap amount), 3 jellyfish, 4 bubble.

## Testing a builder
- Server: `python tools/serve.py 8600` (no-cache).
- `bash tools/shot.sh <name> "dev/view.html?b=<builder,...>&cam=<yaw>,<pitch>,<dist>,<tx>,<ty>,<tz>"` writes `tools/shots/<name>.png` (headless Chrome, real WebGPU) and prints console lines. `&view=home|ship|pier|sea` picks a preset camera. `&b=x` shows terrain only. Every moving object sits at its default pose (`js/world/rig.js`).
- Look at the screenshot with the Read tool. Check for console errors. Check the triangle count printed in `VIEW ready`.
- Yaw 0 looks from the front (+z) toward the back; positive yaw moves the camera toward +x.
