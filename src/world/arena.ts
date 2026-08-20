import { CHUNK_SIZE } from './Chunk.ts';

/** Geometry of the underground boss arena, shared by the generator and the boss. */
export const ARENA = {
  centerX: 0,
  centerZ: 0,
  /** Radius of the open floor, in blocks. */
  radius: 22,
  /** Thickness of the surrounding shell. */
  wall: 3,
  /** Topmost solid floor layer; entities stand on `floorY + 1`. */
  floorY: 20,
  /** First solid layer of the ceiling. */
  ceilingY: 38,
} as const;

export const ARENA_STAND_Y = ARENA.floorY + 1;

/** Runic block the player activates to wake the boss. */
export const ALTAR = {
  x: ARENA.centerX,
  y: ARENA.floorY + 2,
  z: ARENA.centerZ,
} as const;

export function distanceToArenaCenter(x: number, z: number): number {
  return Math.hypot(x - ARENA.centerX, z - ARENA.centerZ);
}

export function isInsideArena(x: number, y: number, z: number): boolean {
  return (
    y > ARENA.floorY &&
    y < ARENA.ceilingY + 2 &&
    distanceToArenaCenter(x, z) < ARENA.radius - 0.5
  );
}

export function chunkTouchesArena(cx: number, cz: number): boolean {
  const reach = ARENA.radius + ARENA.wall + 2;
  const minX = cx * CHUNK_SIZE;
  const minZ = cz * CHUNK_SIZE;
  const closestX = Math.max(minX, Math.min(ARENA.centerX, minX + CHUNK_SIZE - 1));
  const closestZ = Math.max(minZ, Math.min(ARENA.centerZ, minZ + CHUNK_SIZE - 1));
  return distanceToArenaCenter(closestX, closestZ) <= reach;
}
