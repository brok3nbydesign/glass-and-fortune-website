# The website die: physics, glass and testing

Written 5 Nov 2026, after the physics and visual overhaul of the hero's glass die. This explains what changed, why, and how to check it. The code is in `src/components/dice/`:

| File | What it is |
|---|---|
| `diePhysics.js` | The whole simulation: world, die, mat, the hand. Plain Rapier, no React, no drawing. |
| `DiceScene.jsx` | Draws it: the mat, the glass top and its reflection, the die, the pointer. |
| `glassImpactSound.js` | The strike sound (the game's own), now with a voice per surface. |
| `scripts/die-physics-test.mjs` | The physics test bench (`npm run test:physics`). |

## 1. What the old die got wrong

The old die looked good and the collision shape was already right — but most of what it did was decided by scripts, not physics.

| Found | Effect |
|---|---|
| Walls 12 units tall, invisible, standing on the 0.42 rails | The rails were scenery. Nothing could hop, ride or tip over them; the die bounced off air above the wood. |
| Held die was a *kinematic* body | It passed straight through the cloth and the rails while carried. It also spun slowly by itself while held. |
| On release over the mat, the die was **teleported** to a clamped spot | Let go near the rails or high up and it jumped before falling. |
| Throw spin had a random ±2 rad/s "wobble" added | The same throw landed differently for no reason. |
| A die resting cocked got **nudged** up to four times | The result was helped flat. |
| Linear damping 0.12, angular 0.35 | Air drag that strong slows a spinning die visibly in flight. |
| One physics step per frame, contacts at Rapier's default distance | A die striking at 9 u/s sank 0.08 (8% of its size) into the cloth for a step and popped back out — measured, see §3. |
| Lost when below y = −8, hidden at once | It vanished before it had visibly fallen. |
| Shadow and glow were fixed round blobs | They ignored the die's orientation: a die on its corner cast the same blob as one face down. |
| Sound from "velocity change > 1.4 per frame", one voice for everything | Frame-rate dependent; glass on cloth sounded like glass on wood. |

**What was already right:** the collider. The model (`glass_die.glb`, measured vertex by vertex) is a 2-unit cube with 0.24 spherical rounding. A Rapier `roundCuboid(0.38, 0.38, 0.38, 0.12)` at half scale is that exact shape — edges and corners agree to float error. The only parts of the mesh off that surface are the pip wells, 0.03 deep at display scale, which a convex body cannot touch a flat table with anyway. So no convex hull was needed: the round cuboid is exact, and its contact normals are smooth across the bevels, which a polygon hull's are not. **Edges and corners were always in the shape; what stopped them mattering was the scripting around it.**

## 2. What it does now

### Physics (`diePhysics.js`)

- **Rapier, used directly.** The `@react-three/rapier` wrapper was removed: the website and the test bench now run the same module, which is what makes the tests mean something. The 3D chunk got slightly smaller.
- **Fixed 120 Hz steps**, with the picture interpolated between the last two steps. The display's frame rate changes nothing about the motion (tested from 30 to 240 fps, below). Up to 0.25 s of catch-up per frame, so a struggling device runs in real time, not slow motion.
- **Speculative contacts at 0.2 die-widths** (`normalizedPredictionDistance`). Contacts are found before the surfaces touch and solved so the gap closes exactly. Worst penetration across all scenarios is now ~0.003 (resting slop), from 0.08.
- **Glass: density 2.5**, so mass and inertia come from the shape. Centre of mass at the centre: the pips are inlays, not drilled holes, so there is no real-dice bias to model.
- **No air drag to speak of** (0.02 / 0.05): energy goes into contacts, not the air. Friction and restitution are set as *pairs*: die on glass top 0.42 / 0.32, die on walnut 0.40 / 0.42.
- **The rails are solid wood, exactly their visible size.** No invisible walls anywhere. A die can strike a rail, ride up it, come to rest on top of it, balance there half on and half off, or tip over it. Past the rails' outer edges there is nothing; the mat floats on the page.
- **Rails raised from 0.42 to 0.80.** At 0.42 — below the die's own centre — a die rolling into a rail simply hops over it (test bench). 0.8, a little under the die's height, is the lowest that keeps ordinary throws on the mat. Same walnut, same brass inlay.
- **The hand is a spring, not a script.** The point you touched is pulled towards the pointer by a damped spring, your fingers take its weight and hold its orientation firmly. Held, it is still a dynamic body: it lags a touch, sways when swung, and it collides — you cannot push it through the glass or a rail. On release it keeps the velocity it really has, plus a little spin from rolling off the fingertips about the axis square to the throw. Nothing random is added to a throw.
- **Where it is carried:** over the mat, at a fixed height above the glass. Point higher up the screen than the back of the mat and it rises straight up (so you can hold it high and drop it); point below the front and it goes down in front of the mat. The touched point stays under the pointer (within ~1 px).
- **Throw speed is soft-limited** (tanh to 8.5 u/s): a harder flick is always a little stronger, but never absurd. Trade-off: very hard throws can still clear a rail. That is physics, and Morrow fetches it.
- **Roll button:** a croupier's throw from beside one rail, aimed to land on the cloth, with random landing spot, speed and spin (seedable). In 3000 seeded throws none left the table.
- **Cocked dice are allowed.** If it comes to rest leaning on a rail, nothing pushes it: no face is read, the status says it is cocked, and the visitor throws again. About 1% of Roll-button throws.
- **Falling off:** it falls for real until it has left the window (or 4 s), only then is it "lost" and Morrow offers to fetch it.

### Glass and light (`DiceScene.jsx`)

- **The approved "v1 Dense" garnet glass is unchanged**, plus a little `dispersion` (0.12). Transmission now renders at 0.6× resolution (0.4× on phones): the glass covers a few hundred pixels of a window-sized canvas, so the full-size pass was wasted.
- **The mat is velvet under a sheet of glass.** The cloth keeps its painted look; a clearcoat over it is the sheet (the lamp and room glint on it).
- **Planar reflection.** Each frame the die and the rails are drawn mirrored in the glass plane into a half-size target (a third on phones) and added in proportion to the glass's Fresnel reflectance. It follows the die exactly — position, rotation, pips — is strongest where the die touches the glass and fades with height, so it never reads as a second die hanging underneath. The mirrored die is an opaque stand-in (a 4%-bright reflection cannot show transmission, and a second transmission pass would double the most expensive thing on the page).
  *Alternatives considered:* environment-map only (cheap, but cannot show the die itself); screen-space reflection (needs a full post-process chain the site does not have, and fails at the screen edge); drei's `MeshReflectorMaterial` (similar technique, but would add the drei package for one component). The planar pass draws ~30 small meshes and costs well under a millisecond.
- **Contact shadow from the die's real shape.** The cloth shader evaluates the rounded cube's signed distance at every point: face down the shadow is a crisp square, on an edge a line, on a corner a dot, and it spreads and lightens as the die rises.
- **The lamp's light through the glass.** Each point of the cloth marches towards the lamp through the die's shape. Light that gets through is dimmed by the garnet dye for the length of glass it crossed — deep red through the faces, dark where the rounded edges bend it away. No shadow maps, no extra pass; the loop is skipped wherever the ray to the lamp cannot meet the die.
- The old shadow and glow blobs are gone; these replace them.

### Sound

- Strikes are measured each physics step: the change in velocity gravity and the hand did not cause. Loudness follows it, so a hard rail hit is loud and the last little rocks are ticks.
- **Glass on the glass top** rings brighter and longer with little body; **walnut** gives a warm knock with a short ring. Every strike varies a little in pitch and ring, so repeats do not sound identical.
- At most one strike per 40 ms (unless clearly harder) and 14 per second. Mute and the reduced-motion setting are respected as before.

## 3. Testing

`npm run test:physics` runs 158 seeded scenarios through the real module in Node, in about two seconds, plus a 600-throw fairness run:

| Group | Runs | What it checks |
|---|---|---|
| gentle-drop, high-drop | 20 | settles, no penetration, no energy gain, bounces fall away |
| edge-first, corner-first | 20 | lands on an edge/corner and *turns* off it |
| slow-roll | 10 | rolls rather than slides |
| roll-button, fetch | 34 | stays on the cloth, settles |
| hand-throw, spin-throw | 24 | the hand never pushes the die into anything |
| rail-drop | 10 | anything can happen; it must be physical |
| overhang | 14 | on a rail top, it tips off **if and only if** its centre is past the edge (statics), at both the outer and inner edges |
| edge-balance | 6 | balanced on an edge, leaning ±0.003 rad, it falls the way it leans |
| fall-off | 5 | dropped beyond the mat, it keeps falling |
| into-rail | 6 | rolled into a rail, it stops against it |
| unusual | 6 | pointer teleports, zero-length grab, die pushed into the glass and dragged into a rail, a 0.5 s frame hitch, jittery touch |
| frame rate | 1 | the same pointer movement at 30, 60, 90, 144, 240 fps throws within 1.2% |
| carry | 1 | the carry surface has no jumps |
| fairness | 600 | every face equally likely (χ² ≈ 2–6, limit 20.5), no Roll-button throw lost |

Every scenario measures, from Rapier's own contacts and the die's state: penetration, energy (nothing may gain more than the integrator's own bounded error), bounce heights (a bounce may only rise by spending spin), time to rest, jitter at rest, sliding without turning, and the outcome. `SEED=n` gives a different repeatable set; seeds 1, 2, 3, 7, 11 and 13 all pass. `VERBOSE=1` prints every run.

`npm test` (after `npm run build`) drives the real page in Chrome and now also checks: the touched point stays under the pointer while carried; a hard throw is speed-limited and, if it clears a rail, falls and is fetched; a die over the rail's outer edge tips off, one on top stays; a die balanced on an edge falls the way it leans and reads its face; cocked dice show no number.

**What was not verified here:** this environment has no GPU, so the browser checks run on software rendering at 4–6 fps (the original site measures the same there). That proves correctness, not smoothness. Look at it on a real phone and a real desktop.

## 4. Tools considered

- **Rapier** — already in the project, WASM, deterministic, continuous collision, exact rounded-box shapes. Kept; the React wrapper around it was dropped.
- **cannon-es / Ammo / Jolt** — no advantage here worth a migration: cannon-es has no rounded box, Ammo is far heavier, Jolt's web build is larger than Rapier for the same result.
- **drei** — not installed; the one piece that would help (`MeshReflectorMaterial`) is replaced by ~60 lines that do just what is needed.
- **Blender MCP** — not needed: the model is already exact, and its geometry was verified directly from the GLB.
