# Mineboss

A voxel sandbox in the browser with a three-phase boss fight at its centre. Dig
through a procedurally generated world, find the obsidian altar buried deep
underground and wake **The Deep Warden**.

Built with TypeScript, three.js and Vite. No binary assets: the block textures
are painted procedurally onto a canvas at startup and every sound is
synthesised with the Web Audio API.

## Running

```bash
pnpm install
pnpm dev      # http://localhost:5173
```

```bash
pnpm build    # type check + production bundle in dist/
pnpm preview  # serve the production bundle
```

Requires Node 20+ and a WebGL2 capable browser.

## Controls

| Input | Action |
| --- | --- |
| `W` `A` `S` `D` | Move |
| `Space` | Jump; rise while swimming |
| `Shift` | Sprint; sink while swimming |
| Left click | Mine a block, or attack when aiming at an enemy |
| Right click | Place, eat, smith iron/gold into the hammer, craft torches from coal, or activate the altar |
| `1`–`9`, mouse wheel | Select a hotbar slot |
| `Esc` | Pause (volume, look sensitivity, continue save, new game) |

## Finding the fight

A runic shrine of obsidian and glowstone stands north of spawn. A compass on
the HUD points to it. Descend the spiral stairs — they open into the arena
through the north wall, so you never have to mine the shell or fall 40 blocks.

The first time you enter the chamber, your respawn moves to the doorway. Right
click the runic altar in the centre to wake **The Deep Warden**. If you die
during the fight the Warden sleeps again; walk back to the altar and activate
it once more. Your pack stays with you. Pause, death and victory all offer
**New game**, which regenerates the world and returns you to the surface spawn.

Mushrooms grow on cave floors and restore two hearts. Crystal ore restores
four. Select the stack and right click — it works while looking at air or the
Warden, so you can eat in the middle of the fight. You cannot eat at full
health, and food is never placed as a block.

Right click coal ore to bind four torches. Place them to light a tunnel — the
miner's lamp only follows you, so a trail of torches is what keeps a cave
readable when you turn around.

Right click three iron ore to bind an iron hammer — it breaks blocks much
faster. Three gold ore makes a gold hammer that hits the Warden far harder.
The hammer upgrade and your inventory stay through death. New game returns
you to the starting hammer and a fresh hotbar.

A short recap after victory lists the run time, deaths, hammer and blocks
mined. The best run is stored in the browser so later descents can beat it.
The hotbar shows the current hammer and a line for the selected slot. The
seed sits in the top-left of the HUD.

Pause writes a **Continue** save: seed, position, inventory, hammer, altar
state and a log of edited blocks. The title screen offers Continue when a
descent is waiting. New game rolls a new seed.

Valleys below sea level hold shallow water you can swim through. After the
Warden falls, the compass points east to a glowstone cairn.

Every heavy attack the Warden throws ends in a **stagger**: its back cores open
up, it takes double damage and it cannot retaliate. That window is where the
fight is won. Its shockwaves only hit grounded targets, so jumping over the
crest avoids them.

| Phase | Trigger | New behaviour |
| --- | --- | --- |
| I | Start | Ground slam with a shockwave, charging dash |
| II | 66% health | Thrown boulders that destroy terrain, summoned minions |
| III | 33% health | Erupting lava pillars, faster and angrier |

## How it works

```
src/
  core/      Game loop, renderer and scene setup, input with pointer lock
  world/     Chunk storage, terrain generation, meshing, voxel raycast
  physics/   Swept AABB collision against the voxel grid
  player/    Movement, mining and placing, melee combat, inventory
  combat/    Health, damage and knockback, projectiles
  entities/  Entity system and the boss encounter
  render/    Procedural texture atlas, particles, first person view model
  ui/        HUD, hotbar, boss bar, overlays
  audio/     Synthesised sound effects and looping cave / surface / boss beds
```

A few decisions worth knowing about:

- **Chunks** are 16 x 128 x 16 columns of `Uint8Array`, split into eight
  sections of 16. Editing a block only dirties the section it touches, so a
  remesh costs one 16<sup>3</sup> volume instead of a whole column.
- **Meshing runs in a worker pool.** The main thread copies a padded 18<sup>3</sup>
  volume into a recycled buffer, transfers it, and gets geometry buffers back.
  Faces touching an opaque neighbour are culled and every vertex carries baked
  ambient occlusion in its colour.
- **Emissive blocks** (lava, glowstone, crystal, runic stone) are emitted into a
  second geometry group drawn with an unlit material, so they stay bright in the
  dark. A point light follows the camera as a miner's lamp.
- **Terrain** comes from layered simplex noise: a 2D height field, two 3D fields
  intersected into tunnel caves, a third for deep chambers, and threshold bands
  for ore veins. The arena is carved last so caves can never breach it.
- **Collision** resolves one axis at a time and retries blocked horizontal moves
  from one step higher (just over a full block), which is what lets you walk
  the shrine stairs without jumping.

## Not included

Multiplayer, a crafting table, and biome variety are out of scope for this
build. Fly (`F`) and the frame overlay (`F3`) still exist for development;
they are not listed as player controls.
