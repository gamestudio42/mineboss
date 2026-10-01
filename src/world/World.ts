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

/** Sparse voxel world made of generated chunk columns. */
export class World {
  readonly chunks = new Map<string, Chunk>();
  /** World positions of placed torches, used to drive a small light pool. */
  readonly torches = new Map<string, { x: number; y: number; z: number }>();
  /** Player (and boss) edits, reapplied after a chunk regenerates or unloads. */
  readonly edits = new Map<string, number>();
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
      this.applyEditsToChunk(chunk);
    }
    return chunk;
  }

  unloadChunk(cx: number, cz: number): void {
    this.chunks.delete(chunkKey(cx, cz));
    const minX = cx * CHUNK_SIZE;
    const minZ = cz * CHUNK_SIZE;
    for (const [key, torch] of this.torches) {
      if (torch.x >= minX && torch.x < minX + CHUNK_SIZE && torch.z >= minZ && torch.z < minZ + CHUNK_SIZE) {
        this.torches.delete(key);
      }
    }
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
    const minX = chunk.cx * CHUNK_SIZE;
    const minZ = chunk.cz * CHUNK_SIZE;

    for (const [key, id] of this.edits) {
      const [wx, wy, wz] = key.split(',').map(Number);
      if (wx < minX || wx >= minX + CHUNK_SIZE || wz < minZ || wz >= minZ + CHUNK_SIZE) continue;
      const previous = chunk.get(wx - minX, wy, wz - minZ);
      if (!chunk.set(wx - minX, wy, wz - minZ, id)) continue;
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
