import { createNoise2D, createNoise3D, type NoiseFunction2D, type NoiseFunction3D } from 'simplex-noise';

import { hash2, mulberry32 } from '../../core/math.ts';
import { ARENA, chunkTouchesArena, distanceToArenaCenter } from '../arena.ts';
import { Block } from '../blocks.ts';
import { CHUNK_SIZE, Chunk, WORLD_HEIGHT } from '../Chunk.ts';

const SEA_LEVEL = 60;
const LAVA_LEVEL = 8;
const DIRT_DEPTH = 4;

/** Procedural overworld: rolling hills, spaghetti caves, ore veins and the boss arena. */
export class TerrainGenerator {
  private readonly height2D: NoiseFunction2D;
  private readonly detail2D: NoiseFunction2D;
  private readonly caveA: NoiseFunction3D;
  private readonly caveB: NoiseFunction3D;
  private readonly cavern: NoiseFunction3D;
  private readonly ore: NoiseFunction3D;

  constructor(readonly seed: number) {
    const rng = mulberry32(seed);
    this.height2D = createNoise2D(rng);
    this.detail2D = createNoise2D(rng);
    this.caveA = createNoise3D(rng);
    this.caveB = createNoise3D(rng);
    this.cavern = createNoise3D(rng);
    this.ore = createNoise3D(rng);
  }

  generate(chunk: Chunk): void {
    const baseX = chunk.cx * CHUNK_SIZE;
    const baseZ = chunk.cz * CHUNK_SIZE;

    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        this.buildColumn(chunk, x, z, baseX + x, baseZ + z);
      }
    }

    this.plantTrees(chunk, baseX, baseZ);
    if (chunkTouchesArena(chunk.cx, chunk.cz)) this.carveArena(chunk, baseX, baseZ);

    chunk.generated = true;
  }

  /** Surface height of a column; deterministic so structures can query neighbours. */
  surfaceHeight(wx: number, wz: number): number {
    const continent = this.fbm(this.height2D, wx * 0.0032, wz * 0.0032, 4);
    const hills = this.fbm(this.detail2D, wx * 0.014, wz * 0.014, 3);
    const ridges = Math.abs(this.height2D(wx * 0.006, wz * 0.006));
    return Math.round(64 + continent * 16 + hills * 5 + ridges * 7);
  }

  private buildColumn(chunk: Chunk, x: number, z: number, wx: number, wz: number): void {
    const height = Math.min(this.surfaceHeight(wx, wz), WORLD_HEIGHT - 12);
    const surface = height >= SEA_LEVEL ? Block.Grass : Block.Sand;
    const filler = height >= SEA_LEVEL ? Block.Dirt : Block.Sand;

    for (let y = 0; y <= height; y++) {
      if (y === 0 || hash2(wx * 31 + y, wz * 17 + y, this.seed) < (3 - y) / 3.4) {
        chunk.set(x, y, z, Block.Bedrock);
        continue;
      }

      let id: Block;
      if (y === height) id = surface;
      else if (y > height - DIRT_DEPTH) id = filler;
      else id = Block.Stone;

      if (this.isCave(wx, y, wz, height)) {
        chunk.set(x, y, z, y <= LAVA_LEVEL ? Block.Lava : Block.Air);
        continue;
      }

      if (id === Block.Stone) id = this.oreAt(wx, y, wz);
      chunk.set(x, y, z, id);
    }
  }

  private isCave(wx: number, wy: number, wz: number, height: number): boolean {
    if (wy < 4 || wy > height - 2) return false;

    // Two noise fields near zero at the same time carve tunnel-like tubes.
    const a = this.caveA(wx * 0.028, wy * 0.05, wz * 0.028);
    const b = this.caveB(wx * 0.028, wy * 0.05, wz * 0.028);
    if (a * a + b * b < 0.022) return true;

    // Wide chambers, restricted to the deep layers.
    return wy < 34 && this.cavern(wx * 0.021, wy * 0.034, wz * 0.021) > 0.62;
  }

  private oreAt(wx: number, wy: number, wz: number): Block {
    if (wy < 26 && this.ore(wx * 0.1 + 131, wy * 0.1, wz * 0.1) > 0.9) return Block.CrystalOre;
    if (wy < 30 && this.ore(wx * 0.09 + 71, wy * 0.09, wz * 0.09) > 0.88) return Block.GoldOre;
    if (wy < 54 && this.ore(wx * 0.08 + 31, wy * 0.08, wz * 0.08) > 0.84) return Block.IronOre;
    if (wy < 74 && this.ore(wx * 0.07, wy * 0.07, wz * 0.07) > 0.8) return Block.CoalOre;
    if (wy < 16 && this.ore(wx * 0.06 + 211, wy * 0.06, wz * 0.06) > 0.86) return Block.Gravel;
    return Block.Stone;
  }

  /**
   * Trees are seeded from a two-block margin around the chunk so canopies that
   * straddle a border are still written into this chunk.
   */
  private plantTrees(chunk: Chunk, baseX: number, baseZ: number): void {
    for (let z = -2; z < CHUNK_SIZE + 2; z++) {
      for (let x = -2; x < CHUNK_SIZE + 2; x++) {
        const wx = baseX + x;
        const wz = baseZ + z;

        const roll = hash2(wx, wz, this.seed ^ 0x7a11);
        if (roll < 0.988) continue;
        if (distanceToArenaCenter(wx, wz) < ARENA.radius + ARENA.wall) continue;

        const ground = this.surfaceHeight(wx, wz);
        if (ground < SEA_LEVEL + 1 || ground > WORLD_HEIGHT - 20) continue;
        if (this.isCave(wx, ground, wz, ground)) continue;

        this.buildTree(chunk, baseX, baseZ, wx, wz, ground, roll);
      }
    }
  }

  private buildTree(
    chunk: Chunk,
    baseX: number,
    baseZ: number,
    wx: number,
    wz: number,
    ground: number,
    roll: number,
  ): void {
    const trunk = 4 + Math.floor(roll * 1000) % 3;
    const top = ground + trunk;

    for (let dy = 1; dy <= trunk; dy++) {
      this.setWorld(chunk, baseX, baseZ, wx, ground + dy, wz, Block.Log);
    }

    for (let dy = -2; dy <= 1; dy++) {
      const radius = dy >= 1 ? 1 : 2;
      for (let dz = -radius; dz <= radius; dz++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (dx === 0 && dz === 0 && dy <= 0) continue;
          if (Math.abs(dx) === radius && Math.abs(dz) === radius && radius > 1) continue;
          this.setWorld(chunk, baseX, baseZ, wx + dx, top + dy, wz + dz, Block.Leaves);
        }
      }
    }
  }

  /** Writes a world-space block only when it falls inside the chunk being generated. */
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
    if (id === Block.Leaves && chunk.get(x, wy, z) !== Block.Air) return;
    chunk.set(x, wy, z, id);
  }

  /**
   * Hollows the boss arena out of the stone and rebuilds it as a shell of dark
   * brick with a runic altar at the centre. Runs last so caves cannot breach it.
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
          } else if (inside || dist <= outer) {
            chunk.set(x, y, z, Block.DarkBrick);
          }
        }

        if (!inside) continue;

        // Lava pools and glowing markers break up the empty floor.
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
          chunk.set(x, ceilingY, z, Block.Glowstone);
        }

        if (dist < 8 && Math.abs(dist - 6.5) < 0.6 && Math.abs(Math.cos(angle * 4)) > 0.99) {
          chunk.set(x, ceilingY, z, Block.Glowstone);
        }

        this.buildAltar(chunk, x, z, wx, wz);
      }
    }
  }

  private buildAltar(chunk: Chunk, x: number, z: number, wx: number, wz: number): void {
    const dx = Math.abs(wx - ARENA.centerX);
    const dz = Math.abs(wz - ARENA.centerZ);
    if (dx > 2 || dz > 2) return;

    chunk.set(x, ARENA.floorY + 1, z, Block.Obsidian);
    if (dx <= 1 && dz <= 1) chunk.set(x, ARENA.floorY + 2, z, Block.RunicStone);
    if (dx === 0 && dz === 0) chunk.set(x, ARENA.floorY + 3, z, Block.CrystalOre);
  }

  private fbm(noise: NoiseFunction2D, x: number, y: number, octaves: number): number {
    let amplitude = 1;
    let frequency = 1;
    let sum = 0;
    let norm = 0;

    for (let i = 0; i < octaves; i++) {
      sum += noise(x * frequency, y * frequency) * amplitude;
      norm += amplitude;
      amplitude *= 0.5;
      frequency *= 2;
    }

    return sum / norm;
  }
}
