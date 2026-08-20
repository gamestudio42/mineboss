import { Block, OPAQUE } from './blocks.ts';

export const CHUNK_SIZE = 16;
export const WORLD_HEIGHT = 128;
export const SECTION_HEIGHT = 16;
export const SECTION_COUNT = WORLD_HEIGHT / SECTION_HEIGHT;

const AREA = CHUNK_SIZE * CHUNK_SIZE;

export function chunkKey(cx: number, cz: number): string {
  return `${cx},${cz}`;
}

export function sectionKey(cx: number, cz: number, sy: number): string {
  return `${cx},${cz},${sy}`;
}

/**
 * A 16 x 128 x 16 column of blocks stored as one byte per voxel.
 *
 * The column is split into sections of 16 so that editing a block only forces
 * a remesh of the 16^3 neighbourhood instead of the whole column.
 */
export class Chunk {
  readonly voxels = new Uint8Array(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE);
  /** Highest non-air block per column, used for spawning and structure checks. */
  readonly heightMap = new Uint8Array(AREA);
  /** Number of opaque blocks per section; zero means the section needs no mesh. */
  readonly sectionFill = new Int32Array(SECTION_COUNT);

  generated = false;

  constructor(
    readonly cx: number,
    readonly cz: number,
  ) {}

  static index(x: number, y: number, z: number): number {
    return (y * CHUNK_SIZE + z) * CHUNK_SIZE + x;
  }

  get(x: number, y: number, z: number): number {
    if (y < 0 || y >= WORLD_HEIGHT) return Block.Air;
    return this.voxels[Chunk.index(x, y, z)];
  }

  set(x: number, y: number, z: number, id: number): boolean {
    if (y < 0 || y >= WORLD_HEIGHT) return false;

    const index = Chunk.index(x, y, z);
    const previous = this.voxels[index];
    if (previous === id) return false;

    this.voxels[index] = id;

    const section = y >> 4;
    this.sectionFill[section] += (OPAQUE[id] ?? 0) - (OPAQUE[previous] ?? 0);

    const column = z * CHUNK_SIZE + x;
    if (id !== Block.Air) {
      if (y > this.heightMap[column]) this.heightMap[column] = y;
    } else if (y === this.heightMap[column]) {
      let top = y - 1;
      while (top > 0 && this.voxels[Chunk.index(x, top, z)] === Block.Air) top--;
      this.heightMap[column] = top;
    }

    return true;
  }

  /** Highest non-air block in a column, or 0 when the column is empty. */
  heightAt(x: number, z: number): number {
    return this.heightMap[z * CHUNK_SIZE + x];
  }

  isSectionEmpty(sy: number): boolean {
    return this.sectionFill[sy] === 0;
  }
}
