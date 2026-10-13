# Jelly Harbour: working rules

A sister app to Astra Finn, Astra Maths, Astra Bleeps, Astra Reads, Astra Architect and Astra Zeb. It teaches Finn (6, Year 2) the 2, 5 and 10 times tables with container cranes, and number bonds to 10 and 20 with fishing boats whose decks are ten frames. The look is "Material Studies": a harbour diorama inside a wobbly block of jelly sea on a paper backdrop, rendered with raw WebGPU/WGSL.

Read `ENGINE.md` first: it is the contract for every model builder and system (coordinates, MeshBuilder, materials, object ids, instancing, testing).

## Hard constraints of this machine
- No Node.js, no npm, no build step, no framework. Plain HTML, CSS and ES modules. No third-party JS at all (WebGPU is used directly).
- Python 3.12 with Pillow: `python tools/make_icons.py` draws the icons.
- Local server: `python tools/serve.py 8600` (no-cache; supports the screenshot hold used by tools/shot.sh). 8601 is the slow server for the offline test.

## Technical rules
- `js/world/layout.js` is the only place coordinates live. Builders in `js/world/geo/` write into one shared MeshBuilder; moving rigs carry an object id and get their transforms from `scene.setObject`.
- Containers, crates, lifebuoys, fish, gulls, jellyfish and bubbles are GPU instances (48-byte records, see ENGINE.md).
- Relative paths everywhere (GitHub Pages sub-path). localStorage only (`astraharbour.v1`). Cache prefix `astraharbour-`. Manifest id `/astra-harbour/`.
- Keep the simulation under about 2 ms a frame (it is about 0.8 ms). DPR is capped at 1.5; the loop pauses when the page is hidden.
- The water solver must keep a fixed 1/120 s substep (time accumulator). A substep that varies with frame-time jitter, or smoothing the heights without the velocities, makes the stiff short jelly waves grow until the sea explodes. Surface tension (Firmness) is capped below the stable limit; `dev/test-choreo.html?jitter=1` checks it.
- If WebGPU is missing, the flat 2D stage (`js/stage2d.js`) runs both games. `?flat` forces it for testing.

## Content rules
- Finn is six: short sentences, big tiles, read-aloud on every question card (speech synthesis, British voice where available).
- Times tables: rows of containers on the ship's ten bays (a row of 2, a row of 5, or a ten as 5 across in two tiers). Level 1 Load (tap to load rows while the count goes 5, 10, 15), level 2 Count (arrays), level 3 Quick (facts, missing numbers, sharing into rows). Each round ends with a patch and the ship's voyage.
- Bonds: blue crates already aboard, orange crates added (part-part-whole colours). Level 1 Fill, level 2 More (and take-aways), level 3 Quick pairs. Each round ends with a patch and the boats' parade.
- Times tables level 4 Line: an order ("35 boxes"), no counter and no labels; Finn loads rows, counts in his head and says when she is full. The ship sinks as she loads and her painted load line (gamemarks.js) sits on the water at exactly the order.
- Bonds Make 100: rows of ten on the ship (blue aboard, orange added), "60 + 40 = 100, just like 6 + 4 = 10". Uses the cranes, so the ship sails at the end instead of the boats' parade.
- Gulls on the Roof (bonds to 10 and 20): the game's own gulls on pegs along the fish shed's ridge (and its front eave for 20), red five and white five. Finn sounds the horn; gulls fly off from the right-hand end. Levels Left, Flew, Back. Wild gulls are kept off the shed while it runs.
- Never show or say an answer just before asking for it (Phil, 13 Oct 2026): e.g. the last row of a Load batch lands as "?".
- Wrong answers are never punished: the tile is greyed and "Let's count" shows the groups one by one. Never show a score; patches and the harbour log are the only rewards.
- Finn-only app; copy says "with the grown-up", never assumes Dad.

## Testing
- `bash tools/shot.sh <name> "<path?query>" [W,H] [max-seconds]`: headless Chrome with real WebGPU; the page calls `shotReady()` (dev/shotkit.js) when it is ready. The app does this with `?shot=` and `&frames=N`.
- `dev/view.html?b=<builders>&view=home|ship|pier|sea&cam=yaw,pitch,dist,tx,ty,tz&sys=<module>`: the scene on its own.
- `dev/test-choreo.html?loops=3&jitter=1`: runs the ship's day, the tug and the boats' parade in simulated time and checks every hull against the quay, edges, breakwater, pier, boats, yachts, buoys and each other, plus grounding, and that the water stays stable at 60 fps with jittered frame times. Must print PASS.
- `dev/test-input.html`: drives the canvas with pointer events (throw a lifebuoy, waves, tip, orbit, zoom, panel buttons). Must print PASS.
- `dev/test-flat.html`: the no-WebGPU flat harbour.
- `dev/test-e2e.html?game=tables&key=5&level=1&wrong=1`: plays a whole round of the real app by tapping its buttons. `bash tools/e2e_all.sh` runs every level. Run one at a time: two GPU-heavy headless browsers at once can stall.
- Offline: `python tools/slowserve.py 8601`, then `bash tools/swtest.sh` (headless Edge).
- Run `python tools/build_sw.py` after any change, before committing.

## Publish
Own repo `philhandley/astra-harbour` (needs Phil's say-so to create), GitHub Pages from main root, live at https://philhandley.github.io/astra-harbour/. To update: `python tools/build_sw.py`, commit, push.
