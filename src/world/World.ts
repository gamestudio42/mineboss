import { Block } from './blocks.ts';
import {
  CHUNK_SIZE,
  Chunk,
  SECTION_COUNT,
  SECTION_HEIGHT,
  WORLD_HEIGHT,
  chunkKey,
} from './Chunk.ts';
import type { TerrainGenerator } from './terrain/generator.ts';

/** Section coordinates queued for a remesh, drained by the chunk manager. */
export interface DirtySection {
  cx: number;
  cz: number;
  sy: number;
}

/** Sparse voxel world made of generated chunk columns. */
export class World {
  readonly chunks = new Map<string, Chunk>();
  private readonly dirty = new Map<string, DirtySection>();

  constructor(readonly generator: TerrainGenerator) {}

  getChunk(cx: number, cz: number): Chunk | undefined {
    return this.chunks.get(chunkKey(cx, cz));
  }

  /** Returns the chunk, generating it synchronously the first time it is needed. */
  ensureChunk(cx: number, cz: number): Chunk {
    const key = chunkKey(cx, cz);
    let chunk = this.chunks.get(key);
    if (!chunk) {
      chunk = new Chunk(cx, cz);
      this.generator.generate(chunk);
      this.chunks.set(key, chunk);
    }
    return chunk;
  }

  unloadChunk(cx: number, cz: number): void {
    this.chunks.delete(chunkKey(cx, cz));
  }

  /** Drops every column so the next ensure regenerates virgin terrain. */
  clear(): void {
    this.chunks.clear();
    this.dirty.clear();
  }

  /** Bedrock below the world, air above it, air inside ungenerated chunks. */
  getBlock(wx: number, wy: number, wz: number): number {
    if (wy < 0) return Block.Bedrock;
    if (wy >= WORLD_HEIGHT) return Block.Air;

    const cx = wx >> 4;
    const cz = wz >> 4;
    const chunk = this.chunks.get(chunkKey(cx, cz));
    if (!chunk) return Block.Air;

    return chunk.get(wx - cx * CHUNK_SIZE, wy, wz - cz * CHUNK_SIZE);
  }

  setBlock(wx: number, wy: number, wz: number, id: number): boolean {
    if (wy < 0 || wy >= WORLD_HEIGHT) return false;

    const cx = wx >> 4;
    const cz = wz >> 4;
    const chunk = this.chunks.get(chunkKey(cx, cz));
    if (!chunk) return false;

    const x = wx - cx * CHUNK_SIZE;
    const z = wz - cz * CHUNK_SIZE;
    if (!chunk.set(x, wy, z, id)) return false;

    this.markDirtyAround(cx, cz, x, wy, z);
    return true;
  }

  /** Highest non-air block of a column, or -1 when the chunk is not loaded. */
  surfaceY(wx: number, wz: number): number {
    const cx = wx >> 4;
    const cz = wz >> 4;
    const chunk = this.chunks.get(chunkKey(cx, cz));
    if (!chunk) return -1;
    return chunk.heightAt(wx - cx * CHUNK_SIZE, wz - cz * CHUNK_SIZE);
  }

  takeDirtySections(): DirtySection[] {
    if (this.dirty.size === 0) return [];
    const sections = [...this.dirty.values()];
    this.dirty.clear();
    return sections;
  }

  markDirty(cx: number, cz: number, sy: number): void {
    if (sy < 0 || sy >= SECTION_COUNT) return;
    if (!this.chunks.has(chunkKey(cx, cz))) return;
    this.dirty.set(`${cx},${cz},${sy}`, { cx, cz, sy });
  }

  /** An edit can expose faces in the neighbouring section and chunk. */
  private markDirtyAround(cx: number, cz: number, x: number, y: number, z: number): void {
    const sy = y >> 4;
    this.markDirty(cx, cz, sy);

    if (y % SECTION_HEIGHT === 0) this.markDirty(cx, cz, sy - 1);
    if ((y + 1) % SECTION_HEIGHT === 0) this.markDirty(cx, cz, sy + 1);
    if (x === 0) this.markDirty(cx - 1, cz, sy);
    if (x === CHUNK_SIZE - 1) this.markDirty(cx + 1, cz, sy);
    if (z === 0) this.markDirty(cx, cz - 1, sy);
    if (z === CHUNK_SIZE - 1) this.markDirty(cx, cz + 1, sy);
  }
}
