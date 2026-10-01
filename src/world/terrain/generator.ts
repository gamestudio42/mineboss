import { AdventureGenerator } from './adventure.ts';
import type { GameMode } from '../../core/GameMode.ts';
import {
  ARENA,
  ARENA_STAND_Y,
  ENTRANCE,
  CACHE,
  RUIN,
  RUIN_COURTYARD,
  RUIN_STATUE,
  chunkTouchesArena,
  chunkTouchesCache,
  chunkTouchesEntrance,
  chunkTouchesRuin,
  distanceToArenaCenter,
} from '../arena.ts';
import { Block } from '../blocks.ts';
import { CHUNK_SIZE, Chunk, WORLD_HEIGHT } from '../Chunk.ts';
import { ISLAND_Y, ONE_BLOCK_X, ONE_BLOCK_Z, startingOneBlock } from '../oneblock/phases.ts';

export const SEA_LEVEL = 60;

/** Void columns plus gated OneBlock structures. */
export class TerrainGenerator {
  ruinUnlocked = false;
  shrineUnlocked = false;
  cacheUnlocked = false;

  private readonly adventure: AdventureGenerator | null;

  constructor(readonly seed: number, readonly mode: GameMode = 'adventure') {
    this.adventure = mode === 'adventure' ? new AdventureGenerator(seed) : null;
    if (this.adventure) this.applyUnlocks({ ruin: true, shrine: true, cache: true });
  }

  generate(chunk: Chunk): void {
    if (this.adventure) { this.adventure.generate(chunk); return; }
    const baseX = chunk.cx * CHUNK_SIZE;
    const baseZ = chunk.cz * CHUNK_SIZE;

    this.placeOneBlock(chunk, baseX, baseZ);
    if (this.shrineUnlocked && chunkTouchesArena(chunk.cx, chunk.cz)) {
      this.carveArena(chunk, baseX, baseZ);
    }
    if (this.shrineUnlocked && (chunkTouchesArena(chunk.cx, chunk.cz) || chunkTouchesEntrance(chunk.cx, chunk.cz))) {
      this.carveEntrance(chunk, baseX, baseZ);
    }
    if (this.cacheUnlocked && chunkTouchesCache(chunk.cx, chunk.cz)) this.buildCache(chunk, baseX, baseZ);
    if (this.ruinUnlocked && chunkTouchesRuin(chunk.cx, chunk.cz)) this.buildRuin(chunk, baseX, baseZ);

    chunk.generated = true;
  }

  /** Island height; structures sit on this plane in the void. */
  surfaceHeight(_wx: number, _wz: number): number {
    return this.adventure?.surfaceHeight(_wx, _wz) ?? ISLAND_Y;
  }

  applyUnlocks(flags: { ruin: boolean; shrine: boolean; cache: boolean }): void {
    this.ruinUnlocked = flags.ruin;
    this.shrineUnlocked = flags.shrine;
    this.cacheUnlocked = flags.cache;
  }

  private placeOneBlock(chunk: Chunk, baseX: number, baseZ: number): void {
    this.paint(chunk, baseX, baseZ, ONE_BLOCK_X, ISLAND_Y - 1, ONE_BLOCK_Z, Block.Bedrock);
    this.paint(chunk, baseX, baseZ, ONE_BLOCK_X, ISLAND_Y, ONE_BLOCK_Z, startingOneBlock());
  }

  /**
   * Hollows a floating arena shell. The outer envelope is bedrock so the
   * roof cannot be mined as a shortcut from the One Block above.
   */
  private carveArena(chunk: Chunk, baseX: number, baseZ: number): void {
    const { radius, wall, floorY, ceilingY } = ARENA;
    const outer = radius + wall;

    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const wx = baseX + x;
        const wz = baseZ + z;
        const dist = distanceToArenaCenter(wx, wz);
        if (dist > outer) continue;

        const inside = dist < radius;

        for (let y = floorY - wall; y <= ceilingY + wall; y++) {
          if (inside && y > floorY && y < ceilingY) {
            chunk.set(x, y, z, Block.Air);
          } else if (inside && y === floorY) {
            chunk.set(x, y, z, Block.DarkBrick);
          } else if (inside || dist <= outer) {
            chunk.set(x, y, z, Block.Bedrock);
          }
        }

        if (!inside) continue;

        const angle = Math.atan2(wz - ARENA.centerZ, wx - ARENA.centerX);
        for (let i = 0; i < 4; i++) {
          const poolAngle = (Math.PI / 4) * (1 + 2 * i);
          const px = ARENA.centerX + Math.cos(poolAngle) * 15;
          const pz = ARENA.centerZ + Math.sin(poolAngle) * 15;
          if (Math.hypot(wx - px, wz - pz) <= 2.6) chunk.set(x, floorY, z, Block.Lava);
        }

        const ring = Math.abs(dist - (radius - 2)) < 0.6;
        if (ring && Math.abs(Math.sin(angle * 6)) > 0.985) {
          chunk.set(x, floorY, z, Block.Glowstone);
        }

        this.buildAltar(chunk, x, z, wx, wz);
      }
    }
  }

  private carveEntrance(chunk: Chunk, baseX: number, baseZ: number): void {
    const top = Math.min(this.surfaceHeight(ENTRANCE.x, ENTRANCE.z), WORLD_HEIGHT - 10);
    const shaft = ENTRANCE.shaft;
    const wall = shaft + 1;
    const pad = wall + 1;

    for (let dz = -pad; dz <= pad; dz++) {
      for (let dx = -pad; dx <= pad; dx++) {
        this.buildEntranceColumn(chunk, baseX, baseZ, dx, dz, top, shaft, wall);
      }
    }

    this.carveDoorway(chunk, baseX, baseZ);
    this.buildShrineMarkers(chunk, baseX, baseZ, top, pad);
  }

  private buildEntranceColumn(
    chunk: Chunk,
    baseX: number,
    baseZ: number,
    dx: number,
    dz: number,
    top: number,
    shaft: number,
    wall: number,
  ): void {
    const wx = ENTRANCE.x + dx;
    const wz = ENTRANCE.z + dz;
    const ring = Math.max(Math.abs(dx), Math.abs(dz));
    const ground = Math.min(this.surfaceHeight(wx, wz), top);

    for (let y = top + 1; y <= top + 8 && y < WORLD_HEIGHT; y++) {
      this.paint(chunk, baseX, baseZ, wx, y, wz, Block.Air);
    }

    if (ring > wall) {
      this.paint(chunk, baseX, baseZ, wx, top, wz, Block.Obsidian);
      return;
    }

    for (let y = Math.min(ground, top) - 2; y < top; y++) {
      if (y < 1) continue;
      if (ring >= shaft) this.paint(chunk, baseX, baseZ, wx, y, wz, Block.Bedrock);
    }

    for (let y = ARENA.floorY; y <= top; y++) {
      let id = Block.Air;

      if (ring === wall) {
        const doorway =
          dz === wall && Math.abs(dx) <= 1 && y >= ARENA_STAND_Y && y < ARENA_STAND_Y + 3;
        if (doorway) id = Block.Air;
        else if (y === top) id = Block.Obsidian;
        else id = Block.Bedrock;
      } else if (y === ARENA.floorY) {
        id = Block.DarkBrick;
      } else if (y === top) {
        id = ring >= shaft ? Block.Obsidian : Block.Air;
      } else if (y > ARENA.floorY && y < ARENA_STAND_Y) {
        id = Block.Bedrock;
      } else if (y > ARENA_STAND_Y && y < top && this.isStairStep(dx, dz, shaft, top - y)) {
        id = Block.Obsidian;
      }

      this.paint(chunk, baseX, baseZ, wx, y, wz, id);
    }
  }

  private isStairStep(dx: number, dz: number, shaft: number, stepsFromTop: number): boolean {
    if (Math.max(Math.abs(dx), Math.abs(dz)) !== shaft) return false;
    const quad = ((stepsFromTop % 4) + 4) % 4;
    if (quad === 0) return dz === shaft;
    if (quad === 1) return dx === shaft;
    if (quad === 2) return dz === -shaft;
    return dx === -shaft;
  }

  private carveDoorway(chunk: Chunk, baseX: number, baseZ: number): void {
    const innerZ = ARENA.centerZ - (ARENA.radius - 3);
    const startZ = ENTRANCE.z + ENTRANCE.shaft + 1;

    for (let z = startZ; z <= innerZ; z++) {
      for (let x = ENTRANCE.x - 1; x <= ENTRANCE.x + 1; x++) {
        this.paint(chunk, baseX, baseZ, x, ARENA.floorY, z, Block.Obsidian);
        for (let y = ARENA_STAND_Y; y < ARENA_STAND_Y + 3; y++) {
          this.paint(chunk, baseX, baseZ, x, y, z, Block.Air);
        }
      }

      this.paint(chunk, baseX, baseZ, ENTRANCE.x - 2, ARENA_STAND_Y, z, Block.Glowstone);
      this.paint(chunk, baseX, baseZ, ENTRANCE.x + 2, ARENA_STAND_Y, z, Block.Glowstone);
    }
  }

  private buildShrineMarkers(
    chunk: Chunk,
    baseX: number,
    baseZ: number,
    top: number,
    pad: number,
  ): void {
    for (const side of [-1, 1]) {
      for (const other of [-1, 1]) {
        const wx = ENTRANCE.x + side * pad;
        const wz = ENTRANCE.z + other * pad;
        for (let dy = 1; dy <= 6; dy++) {
          const id = dy === 6 || dy === 3 ? Block.Glowstone : Block.Obsidian;
          this.paint(chunk, baseX, baseZ, wx, top + dy, wz, id);
        }
        this.paint(chunk, baseX, baseZ, wx, top + 7, wz, Block.RunicStone);
      }
    }
  }

  private paint(
    chunk: Chunk,
    baseX: number,
    baseZ: number,
    wx: number,
    wy: number,
    wz: number,
    id: Block,
  ): void {
    const x = wx - baseX;
    const z = wz - baseZ;
    if (x < 0 || x >= CHUNK_SIZE || z < 0 || z >= CHUNK_SIZE) return;
    if (wy < 0 || wy >= WORLD_HEIGHT) return;
    chunk.set(x, wy, z, id);
  }

  private buildAltar(chunk: Chunk, x: number, z: number, wx: number, wz: number): void {
    const dx = Math.abs(wx - ARENA.centerX);
    const dz = Math.abs(wz - ARENA.centerZ);
    if (dx > 2 || dz > 2) return;

    chunk.set(x, ARENA.floorY + 1, z, Block.Obsidian);
    if (dx <= 1 && dz <= 1) chunk.set(x, ARENA.floorY + 2, z, Block.RunicStone);
    if (dx === 0 && dz === 0) chunk.set(x, ARENA.floorY + 3, z, Block.CrystalOre);
  }

  private buildRuin(chunk: Chunk, baseX: number, baseZ: number): void {
    const floor = Math.max(this.surfaceHeight(RUIN.x, RUIN.z), SEA_LEVEL);
    this.carveRuinCourtyard(chunk, baseX, baseZ, floor);
    this.buildRuinPosts(chunk, baseX, baseZ, floor);
    this.buildRuinStatue(chunk, baseX, baseZ, floor);
    this.buildRuinHut(chunk, baseX, baseZ, floor);
  }

  private carveRuinCourtyard(chunk: Chunk, baseX: number, baseZ: number, floor: number): void {
    const { centerX, centerZ, radius } = RUIN_COURTYARD;
    for (let wz = centerZ - radius; wz <= centerZ + radius; wz++) {
      for (let wx = centerX - radius; wx <= centerX + radius; wx++) {
        const dist = Math.hypot(wx - centerX, wz - centerZ);
        if (dist > radius) continue;

        const natural = this.surfaceHeight(wx, wz);
        const fillFrom = Math.min(natural, floor) - 2;
        const clearTo = Math.max(natural, floor) + 10;
        const cobbleRing = Math.abs(dist - (radius - 1)) < 0.7;
        const cobblePath = (wx + wz) % 5 === 0;

        for (let y = fillFrom; y <= clearTo; y++) {
          if (y < floor) {
            this.setWorld(chunk, baseX, baseZ, wx, y, wz, y < floor - 1 ? Block.Stone : Block.Dirt);
          } else if (y === floor) {
            this.setWorld(
              chunk,
              baseX,
              baseZ,
              wx,
              y,
              wz,
              cobbleRing || cobblePath ? Block.Cobblestone : Block.Grass,
            );
          } else {
            this.setWorld(chunk, baseX, baseZ, wx, y, wz, Block.Air);
          }
        }
      }
    }
  }

  private buildRuinPosts(chunk: Chunk, baseX: number, baseZ: number, floor: number): void {
    const { centerX, centerZ, radius } = RUIN_COURTYARD;
    for (let i = 0; i < 8; i++) {
      const angle = (Math.PI * 2 * i) / 8;
      const wx = Math.round(centerX + Math.cos(angle) * (radius - 1));
      const wz = Math.round(centerZ + Math.sin(angle) * (radius - 1));
      if (Math.hypot(wx - RUIN.x, wz - RUIN.z) < 5) continue;

      this.setWorld(chunk, baseX, baseZ, wx, floor + 1, wz, Block.Cobblestone);
      this.setWorld(chunk, baseX, baseZ, wx, floor + 2, wz, Block.Cobblestone);
      if (i % 2 === 0) this.setWorld(chunk, baseX, baseZ, wx, floor + 3, wz, Block.Glowstone);
    }
  }

  private buildRuinStatue(chunk: Chunk, baseX: number, baseZ: number, floor: number): void {
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const wx = RUIN_STATUE.x + dx;
        const wz = RUIN_STATUE.z + dz;
        this.setWorld(chunk, baseX, baseZ, wx, floor + 1, wz, Block.Cobblestone);

        const centre = dx === 0 && dz === 0;
        const arm = Math.abs(dx) + Math.abs(dz) === 1;
        if (centre) {
          this.setWorld(chunk, baseX, baseZ, wx, floor + 2, wz, Block.RunicStone);
          this.setWorld(chunk, baseX, baseZ, wx, floor + 3, wz, Block.Cobblestone);
          this.setWorld(chunk, baseX, baseZ, wx, floor + 4, wz, Block.RunicStone);
          this.setWorld(chunk, baseX, baseZ, wx, floor + 5, wz, Block.Glowstone);
        } else if (arm) {
          this.setWorld(chunk, baseX, baseZ, wx, floor + 2, wz, Block.Cobblestone);
        }
      }
    }
  }

  private buildRuinHut(chunk: Chunk, baseX: number, baseZ: number, floor: number): void {
    for (let dz = -2; dz <= 2; dz++) {
      for (let dx = -2; dx <= 2; dx++) {
        const wx = RUIN.x + dx;
        const wz = RUIN.z + dz;
        const ring = Math.max(Math.abs(dx), Math.abs(dz));
        this.setWorld(chunk, baseX, baseZ, wx, floor, wz, ring === 0 ? Block.Planks : Block.Cobblestone);

        const doorway = dx === 2 && Math.abs(dz) <= 1;
        if (ring === 2 && !doorway) {
          this.setWorld(chunk, baseX, baseZ, wx, floor + 1, wz, Block.Cobblestone);
          if ((dx + dz) % 2 !== 0) {
            this.setWorld(chunk, baseX, baseZ, wx, floor + 2, wz, Block.Cobblestone);
          }
        }
      }
    }

    this.setWorld(chunk, baseX, baseZ, RUIN.x, floor + 1, RUIN.z, Block.Bed);
    this.setWorld(chunk, baseX, baseZ, RUIN.x - 1, floor + 1, RUIN.z, Block.IronOre);
    this.setWorld(chunk, baseX, baseZ, RUIN.x, floor + 1, RUIN.z - 1, Block.CoalOre);
    this.setWorld(chunk, baseX, baseZ, RUIN.x + 1, floor + 1, RUIN.z, Block.Mushroom);
    this.setWorld(chunk, baseX, baseZ, RUIN.x, floor + 2, RUIN.z + 1, Block.Torch);
  }

  private buildCache(chunk: Chunk, baseX: number, baseZ: number): void {
    const ground = this.surfaceHeight(CACHE.x, CACHE.z);
    for (let dz = -2; dz <= 2; dz++) {
      for (let dx = -2; dx <= 2; dx++) {
        const wx = CACHE.x + dx;
        const wz = CACHE.z + dz;
        const ring = Math.max(Math.abs(dx), Math.abs(dz));
        this.setWorld(chunk, baseX, baseZ, wx, ground, wz, Block.Obsidian);
        if (ring === 2) this.setWorld(chunk, baseX, baseZ, wx, ground + 1, wz, Block.Cobblestone);
        if (ring === 0) {
          this.setWorld(chunk, baseX, baseZ, wx, ground + 1, wz, Block.Glowstone);
          this.setWorld(chunk, baseX, baseZ, wx, ground + 2, wz, Block.CrystalOre);
        }
        if (ring === 1 && (dx + dz) % 2 === 0) {
          this.setWorld(chunk, baseX, baseZ, wx, ground + 1, wz, Block.Mushroom);
        }
      }
    }
  }

  private setWorld(
    chunk: Chunk,
    baseX: number,
    baseZ: number,
    wx: number,
    wy: number,
    wz: number,
    id: Block,
  ): void {
    const x = wx - baseX;
    const z = wz - baseZ;
    if (x < 0 || x >= CHUNK_SIZE || z < 0 || z >= CHUNK_SIZE) return;
    if (wy < 0 || wy >= WORLD_HEIGHT) return;
    chunk.set(x, wy, z, id);
  }
}
