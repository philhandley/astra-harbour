# Jelly Harbour

*Material Studies.* A little container harbour set in a wobbly block of jelly sea, drawn with WebGPU, that is also a maths game for a six-year-old.

- **Crane Tables** (2s, 5s, 10s): the gantry cranes load rows of containers onto the feeder ship. Load (tap to load rows while the count goes 5, 10, 15), Count (how many boxes on the deck?), Quick (facts, missing numbers, sharing into rows). A finished round earns a patch and the ship sails a lap of the harbour.
- **Fish Bonds** (make 10, make 20): each fishing boat's deck is a ten frame; two boats make twenty. Fill (add crates until full), More (how many more? how many left?), Quick (number sentences). A finished round earns a patch and the boats parade past the lighthouse.
- **The harbour** runs on its own between games: the cranes swap boxes, the tug casts the ship off and pushes her back onto the fenders, gulls perch and circle, fish school under the hulls. Drag the water to make waves, drag the block's side to tip the jelly, throw a lifebuoy, feed the fish, sound the horn (Space).

No build step and no libraries: plain HTML, CSS and ES modules. See `CLAUDE.md` for the working rules and `ENGINE.md` for the engine contract. If WebGPU is missing, a flat 2D harbour runs both games.
