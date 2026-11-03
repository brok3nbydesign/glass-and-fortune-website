# The website's dice table and sound, for the in-game dice work

Written 3 Nov 2026 so another chat working on the game's 3D dice can match the look and feel of the die on glassandfortune.com. Everything below lives in the **website** project:

`C:\Users\dev29\OneDrive\Documents\github_hub\glass-and-fortune-website\src\components\dice\DiceScene.jsx`

It is React Three Fiber + Rapier, so it can't be dropped into the game as-is (the game's dice are plain Three.js in `runtime/dice-3d*.js`), but every value and both texture painters are plain Three.js / canvas code and carry over directly.

## 1. The mat: a card table, painted in code

**Nothing is downloaded.** The cloth and the wood are painted onto `<canvas>` elements when the scene starts and used as `THREE.CanvasTexture` (sRGB, anisotropy 4). That suits the game's rule that the dice fetch nothing.

**The cloth: navy crushed velvet**, the colour of the round table in Morrow's parlour (`paintVelvet`, line 69):
- 1024 × 640 canvas, base `#1c2446`.
- 260 soft radial blotches, radius 30–140 px, half light `rgba(120,140,200,0.07)` and half dark `rgba(5,8,20,0.12)`, which make the crushed-velvet patches.
- Per-pixel noise of ±9 (blue channel ×1.2) for the nap.
- **Stretched once over the whole cloth, not tiled**, because tiling showed a seam.
- Material: `MeshStandardMaterial`, roughness 0.95, metalness 0, colour multiplier `#a3acd6`, which lifts it so the glass has something to glow against.

**The rails: walnut with a brass inlay** (`paintWalnut` line 90, `Table` line 108):
- 1024 × 256 canvas, base `#3a2416`.
- 90 long wavy grain lines: 60 % dark `rgba(20,10,4,0.25–0.6)` and 40 % light `rgba(140,90,52,0.12–0.32)`, width 0.6–2.8 px, made from two sine waves so the grain drifts and pinches like quarter-sawn walnut.
- Rails: 0.55 wide, 0.42 tall, standing **exactly on the physics walls**, so every bounce visibly hits wood. Material: roughness 0.42, metalness 0.05, colour `#d8b490`.
- Brass inlay strip along the top inner edge of each rail: 0.045 wide, 0.012 thick, `#d6aa62`, metalness 1, roughness 0.3.
- Nothing beyond the rails: the mat floats on the page. The canvas is see-through (`alpha: true`, clear colour fully transparent), and the camera frames the whole mat with a margin so no edge is cut.
- Play area: 3.5 deep, width following the frame's shape (3.5 to 8.4). The die is about 0.76 across.

**Light** (`Atmosphere`, line 158). The light is half of why the mat reads as it does:
- Environment: Three.js `RoomEnvironment` through PMREM, intensity 0.9. This is what the glass reflects.
- Ambient `#ffdcb0` at 0.18.
- A warm lamp: spot light `#ffc98a`, intensity 520, at (−3, 8, 3), angle 0.7, penumbra 0.9, decay 2. It pools on the cloth.
- A cool rim light: directional `#9fb6ff`, 1.1, from behind at (3, 4, −6). It draws the glass edges.
- A candle glint: point light `#fff1d6`, 22, at (1.5, 5.5, 4.5), distance 14, decay 2. This puts the bright spark in the glass.
- Renderer: ACES Filmic tone mapping, exposure 1.3, transparent background.
- Shadows: no shadow maps. A soft dark radial blob under the die (larger and fainter as it rises), plus an additive garnet glow on the cloth beside it, which is the coloured light the glass throws.
- Camera: FOV 30, looking down at 52°.

**The glass** is the game's approved "v1 Dense" look in garnet, unchanged:
- colour `#bd4055`, transmission 0.9, thickness 1.8
- attenuation colour `#dd1737`, attenuation distance 1.4
- roughness 0.04, clearcoat 1, clearcoat roughness 0.03
- ior 1.5, envMapIntensity 3.3, specular 1

## 2. Making the game's five dice sound like this — one option

**The game already has this exact sound.** `runtime/dice-3d-sound.js` is the same file the website copied, and `runtime/dice-3d-table.js` already plays it through the game's own effects bus. It is simply switched off.

### Why the game's dice do not sound like this today

- `glass-and-fortune.html` attaches the 3D dice with `mod.attach({count: Math.max(5, dice.length)})` (in the bootstrap script near the end of the file).
- In `dice-3d-table.js`, `ensureAudio()` begins `if (!options.synthRoll) return null;`. No `synthRoll`, no synthesised voice.
- So `handle.handlesRollSound` stays `false`, and `Sfx.roll()` falls through to the three recordings `audio/sfx/dice/dice_roll_1..3.mp3`. Those takes are what you hear now.

### The change

Pass `synthRoll: true` in that one `attach` call:

```js
return mod.attach({count: Math.max(5, dice.length), synthRoll: true});
```

That is the whole switch. It is already wired end to end:

- `ensureAudio()` builds `createDiceAudio()` on **the game's own AudioContext and effects bus** (`window.GlassDiceAudioBus()`), so the sound settings, mute and master volume keep governing it. It never opens a second context.
- It sets `api.setImpactListener(ev => audio.impact(ev))`, so every die voices its own strikes, at the moments the renderer actually produces them — all five, independently, with a per-die detune (`spread`) so five dice are not one die five times.
- It sets `handle.handlesRollSound = true`, and `Sfx.roll()` then skips `dice_roll_*.mp3` on its own. The two must not play together: a fixed recording lands on its own timing, the synthesised voice lands on the strikes, and together they are two sets of dice falling at different moments.
- Loudness follows strike speed, so a hard bounce is louder than a nudge.

`attach({synthRoll: true, soundVolume: 0.6})` if it comes out hot; the default is 0.75 and the website uses 0.6.

### Two things to check after flipping it

1. **It can fail quietly to a safe state.** `ensureAudio()` runs once, at attach, and sets `audioTried = true` before it asks for the bus. If the game's audio is not up at that moment it never tries again, `handlesRollSound` stays `false`, and you get the old mp3 takes rather than silence. After the first roll, confirm `window.GlassDice3D.handlesRollSound === true`.
2. **It is a different sound, not a louder one.** The recordings are one event per roll; this is four to seven separate strikes per die as it settles. Judge it with five dice, not one.

I have not run the game to hear this — I only read the code, and I changed nothing in `C:\lumina_dice`.

## 3. The sound itself: what it is

The website's strike sound is **the game's own `runtime/dice-3d-sound.js`, copied unchanged** (`createDiceAudio`, one synthesised glass-on-felt strike per contact, no samples). What the website adds is **when** it fires, from the real physics instead of a scripted roll:

- A strike is any sudden change in the die's velocity of more than **1.4 units per frame** (gravity alone changes it by under 0.5).
- Strikes are at least **55 ms apart**.
- Strength is `min(1, (change − 1.2) / 10)`, passed as `impact({strength})`, so harder hits are louder.
- It's created with `createDiceAudio({muted, volume: 0.6})`. In the game it should use the game's own AudioContext and effects bus, as that file's header says.
- Physics: Rapier, gravity −26 (heavier than real, so a small die doesn't float), die collider a rounded cube 0.38 half-size with 0.12 rounding, restitution 0.3, friction 0.55, density 2.4. Table floor restitution 0.28 and friction 0.7; walls restitution 0.4 and friction 0.2.

A typical roll gives 4–7 strikes, which is what makes it sound like a real die settling rather than one clack.

## 4. Picking it up and carrying it (website only)

This part is the website's own and does not belong in the game, but the rules may be useful:

- The canvas is a fixed, see-through overlay across the whole window (`pointer-events: none` on every layer), so the die can be carried anywhere on the page. It is hit-tested by hand on window `pointerdown`.
- The camera is fitted to the hero's `.dice-frame` as if drawing inside it, then its field of view is widened to the window and the frustum shifted with `setViewOffset`, so the mat lands exactly on that frame and scrolls with it.
- A held die sits on a plane **parallel to the screen**, at the depth it had when grabbed. So it never jumps when picked up, stays exactly under the cursor, and keeps the same size wherever it is carried. (A fixed *distance* from the camera instead would swell it towards the corners.)
- "Over the mat" is judged **on screen**, not in the world: held high, the die is physically behind the back rail, but it plainly looks like it is above the mat, and letting go should obey the eye. The column runs from the cloth's front edge up to about one mat-height above it.
- Let go above the mat and it comes down on the cloth and rolls. Let go anywhere else and it falls past everything, out of sight; Morrow then offers to fetch it.
- Throw speed comes from the last 90 ms of hand movement, capped at 15. The die spins about the axis square to the throw, plus a little random wobble.
- Two small lights are carried with the die and fade in as it leaves the mat, so the glass keeps its depth away from the lamp over the table.
