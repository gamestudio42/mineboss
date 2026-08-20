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
| `Space` | Jump |
| `Shift` | Sprint |
| Left click | Mine a block, or attack when aiming at an enemy |
| Right click | Place the selected block, or activate the altar |
| `1`–`9`, mouse wheel | Select a hotbar slot |
| `F` | Toggle fly mode (debug) |
| `Ctrl` | Descend while flying |
| `F3` | Frame timing and streaming counters |
| `Esc` | Pause |

## Finding the fight

The altar sits at world origin, roughly 45 blocks below the surface, inside a
sealed arena of dark brick. A hint on the HUD points the way. Dig down, bring
blocks to pillar back up, and right click the runic stone to start the fight.

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
  audio/     Synthesised sound effects
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
  from one step higher, which is what lets you walk up single blocks.

## Not included

Multiplayer, crafting, saving to disk, and biome variety are all out of scope
for this build. The entity system and chunk streaming were written with room for
them.
