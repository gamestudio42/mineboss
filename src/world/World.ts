import type { GameMode } from '../core/GameMode.ts';
import { Block } from './blocks.ts';
import {
  CHUNK_SIZE,
  Chunk,
  SECTION_COUNT,
  SECTION_HEIGHT,
  WORLD_HEIGHT,
  chunkKey,
} from './Chunk.ts';
import { TerrainGenerator } from './terrain/generator.ts';

/** Section coordinates queued for a remesh, drained by the chunk manager. */
export interface DirtySection {
  cx: number;
  cz: number;
  sy: number;
}

function editKey(x: number, y: number, z: number): string {
  return `${x},${y},${z}`;
}

/** Map keyed by `x,y,z` that also keeps a per-chunk bucket for cheap reloads. */
class ChunkIndexedMap<T> extends Map<string, T> {
  readonly byChunk = new Map<string, Map<string, T>>();

  override set(key: string, value: T): this {
    super.set(key, value);
    const bucketKey = chunkBucketKey(key);
    let bucket = this.byChunk.get(bucketKey);
    if (!bucket) {
      bucket = new Map();
      this.byChunk.set(bucketKey, bucket);
    }
    bucket.set(key, value);
    return this;
  }

  override delete(key: string): boolean {
    const removed = super.delete(key);
    const bucketKey = chunkBucketKey(key);
    const bucket = this.byChunk.get(bucketKey);
    if (bucket) {
      bucket.delete(key);
      if (bucket.size === 0) this.byChunk.delete(bucketKey);
    }
    return removed;
  }

  override clear(): void {
    super.clear();
    this.byChunk.clear();
  }
}

function chunkBucketKey(editKeyValue: string): string {
  const comma = editKeyValue.indexOf(',');
  const last = editKeyValue.lastIndexOf(',');
  const wx = Number(editKeyValue.slice(0, comma));
  const wz = Number(editKeyValue.slice(last + 1));
  return chunkKey(wx >> 4, wz >> 4);
}

/** Sparse voxel world made of generated chunk columns. */
export class World {
  readonly chunks = new Map<string, Chunk>();
  /** World positions of placed torches, used to drive a small light pool. */
  readonly torches = new ChunkIndexedMap<{ x: number; y: number; z: number }>();
  /** Player (and boss) edits, reapplied after a chunk regenerates or unloads. */
  readonly edits = new ChunkIndexedMap<number>();
  onEdit: (() => void) | null = null;
  private readonly dirty = new Map<string, DirtySection>();

  constructor(public generator: TerrainGenerator) {}

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
      for (const sign of this.generator.victorySignsIn(cx, cz)) {
        if (sign.id === Block.Torch) this.trackTorch(sign.x, sign.y, sign.z, Block.Air, Block.Torch);
      }
      this.applyEditsToChunk(chunk);
    }
    return chunk;
  }

  unloadChunk(cx: number, cz: number): void {
    this.chunks.delete(chunkKey(cx, cz));
    const torches = this.torches.byChunk.get(chunkKey(cx, cz));
    if (!torches) return;
    for (const key of [...torches.keys()]) this.torches.delete(key);
  }

  /** Drops every column so the next ensure regenerates virgin terrain. */
  clear(): void {
    this.chunks.clear();
    this.dirty.clear();
    this.torches.clear();
    this.edits.clear();
  }

  /** Swaps the noise seed and forgets every column and edit. */
  reseed(seed: number, mode: GameMode = this.generator.mode): void {
    this.generator = new TerrainGenerator(seed, mode);
    this.clear();
  }

  /** Air below and above the world, and inside ungenerated chunks. */
  getBlock(wx: number, wy: number, wz: number): number {
    if (wy < 0) return this.generator.mode === 'adventure' ? Block.Bedrock : Block.Air;
    if (wy >= WORLD_HEIGHT) return Block.Air;

    const cx = wx >> 4;
    const cz = wz >> 4;
    const chunk = this.chunks.get(chunkKey(cx, cz));
    if (!chunk) return Block.Air;

    return chunk.get(wx - cx * CHUNK_SIZE, wy, wz - cz * CHUNK_SIZE);
  }

  restoreStructure(wx: number, wy: number, wz: number, id: number): boolean {
    const edited = this.edits.get(editKey(wx, wy, wz));
    if (edited !== undefined && edited !== Block.Air) return false;
    const result = this.setBlock(wx, wy, wz, id);
    this.edits.delete(editKey(wx, wy, wz));
    return result;
  }

  /** Generator-owned block that yields to any player edit, placed or mined. */
  stampStructure(wx: number, wy: number, wz: number, id: number): boolean {
    if (this.edits.has(editKey(wx, wy, wz))) return false;
    return this.restoreStructure(wx, wy, wz, id);
  }

  setBlock(wx: number, wy: number, wz: number, id: number): boolean {
    if (wy < 0 || wy >= WORLD_HEIGHT) return false;

    const cx = wx >> 4;
    const cz = wz >> 4;
    const chunk = this.chunks.get(chunkKey(cx, cz));
    if (!chunk) return false;

    const x = wx - cx * CHUNK_SIZE;
    const z = wz - cz * CHUNK_SIZE;
    const previous = chunk.get(x, wy, z);
    if (!chunk.set(x, wy, z, id)) return false;

    this.trackTorch(wx, wy, wz, previous, id);
    this.edits.set(editKey(wx, wy, wz), id);
    this.markDirtyAround(cx, cz, x, wy, z);
    this.onEdit?.();
    return true;
  }

  /** Walks placed torches in nearby columns so the light pool can skip the rest. */
  forEachNearbyTorch(
    x: number,
    z: number,
    reach: number,
    visit: (torch: { x: number; y: number; z: number }) => void,
  ): void {
    const originCx = Math.floor(x / CHUNK_SIZE);
    const originCz = Math.floor(z / CHUNK_SIZE);
    const reachChunks = Math.ceil(reach / CHUNK_SIZE);
    for (let dz = -reachChunks; dz <= reachChunks; dz++) {
      for (let dx = -reachChunks; dx <= reachChunks; dx++) {
        const bucket = this.torches.byChunk.get(chunkKey(originCx + dx, originCz + dz));
        if (!bucket) continue;
        for (const torch of bucket.values()) visit(torch);
      }
    }
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

  exportEdits(): Array<{ x: number; y: number; z: number; id: number }> {
    const list: Array<{ x: number; y: number; z: number; id: number }> = [];
    for (const [key, id] of this.edits) {
      const [x, y, z] = key.split(',').map(Number);
      list.push({ x, y, z, id });
    }
    return list;
  }

  importEdits(list: Array<{ x: number; y: number; z: number; id: number }>): void {
    this.edits.clear();
    for (const edit of list) this.edits.set(editKey(edit.x, edit.y, edit.z), edit.id);
  }

  private applyEditsToChunk(chunk: Chunk): void {
    const bucket = this.edits.byChunk.get(chunkKey(chunk.cx, chunk.cz));
    if (!bucket) return;

    for (const [key, id] of bucket) {
      const [wx, wy, wz] = key.split(',').map(Number);
      const previous = chunk.get(wx - chunk.cx * CHUNK_SIZE, wy, wz - chunk.cz * CHUNK_SIZE);
      if (!chunk.set(wx - chunk.cx * CHUNK_SIZE, wy, wz - chunk.cz * CHUNK_SIZE, id)) continue;
      this.trackTorch(wx, wy, wz, previous, id);
    }
  }

  private trackTorch(wx: number, wy: number, wz: number, previous: number, next: number): void {
    const key = `${wx},${wy},${wz}`;
    if (previous === Block.Torch) this.torches.delete(key);
    if (next === Block.Torch) this.torches.set(key, { x: wx, y: wy, z: wz });
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
