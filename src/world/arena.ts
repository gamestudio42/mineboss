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

/**
 * North-side stairwell: just outside the shell so the drop lands beside the
 * altar instead of on top of it. Negative Z is north in world space.
 */
export const ENTRANCE = {
  x: ARENA.centerX,
  z: ARENA.centerZ - (ARENA.radius + 4),
  /** Chebyshev radius of the walkable shaft (5 x 5). */
  shaft: 2,
} as const;

/**
 * Surface cache east of spawn: a small glowstone cairn the compass points to
 * after the Warden falls, so victory still has a place to walk.
 */
export const CACHE = {
  x: 72,
  z: 48,
} as const;

/**
 * Surface camp west of spawn: a ruined cobble hut with a starter cache, so
 * walking the other way from the shrine still finds something.
 */
export const RUIN = {
  x: -52,
  z: 28,
} as const;

/** Flattened ring west of the hut where the Ruin Sentinel is fought. */
export const RUIN_COURTYARD = {
  centerX: RUIN.x - 10,
  centerZ: RUIN.z,
  radius: 14,
} as const;

/** Cracked statue the player right-clicks to wake the Sentinel. */
export const RUIN_STATUE = {
  x: RUIN_COURTYARD.centerX,
  z: RUIN_COURTYARD.centerZ,
} as const;

/** Safe respawn just inside the doorway, on the arena floor. */
export const ENTRANCE_SPAWN = {
  x: ENTRANCE.x + 0.5,
  y: ARENA_STAND_Y,
  z: ARENA.centerZ - (ARENA.radius - 4) + 0.5,
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

/** True when this column overlaps the shrine, shaft or doorway corridor. */
export function chunkTouchesEntrance(cx: number, cz: number): boolean {
  const minX = cx * CHUNK_SIZE;
  const maxX = minX + CHUNK_SIZE - 1;
  const minZ = cz * CHUNK_SIZE;
  const maxZ = minZ + CHUNK_SIZE - 1;

  const pad = ENTRANCE.shaft + 6;
  const boxMinX = ENTRANCE.x - pad;
  const boxMaxX = ENTRANCE.x + pad;
  const boxMinZ = ENTRANCE.z - pad;
  const boxMaxZ = ARENA.centerZ - (ARENA.radius - 5);

  return minX <= boxMaxX && maxX >= boxMinX && minZ <= boxMaxZ && maxZ >= boxMinZ;
}

export function distanceToRuinCourtyard(x: number, z: number): number {
  return Math.hypot(x - RUIN_COURTYARD.centerX, z - RUIN_COURTYARD.centerZ);
}

export function isInsideRuinCourtyard(x: number, z: number): boolean {
  return distanceToRuinCourtyard(x, z) < RUIN_COURTYARD.radius - 0.5;
}

/** True when this column belongs to the cracked statue. */
export function isRuinStatueColumn(x: number, z: number): boolean {
  return Math.abs(x - RUIN_STATUE.x) <= 1 && Math.abs(z - RUIN_STATUE.z) <= 1;
}

export function chunkTouchesRuin(cx: number, cz: number): boolean {
  const reach = RUIN_COURTYARD.radius + 3;
  const minX = cx * CHUNK_SIZE;
  const minZ = cz * CHUNK_SIZE;
  const closestX = Math.max(minX, Math.min(RUIN_COURTYARD.centerX, minX + CHUNK_SIZE - 1));
  const closestZ = Math.max(minZ, Math.min(RUIN_COURTYARD.centerZ, minZ + CHUNK_SIZE - 1));
  return distanceToRuinCourtyard(closestX, closestZ) <= reach;
}

/** South island where the Beacon Keeper is fought. Positive Z is south. */
export const GROVE = {
  x: 20,
  z: 88,
  radius: 12,
} as const;

export function distanceToGrove(x: number, z: number): number {
  return Math.hypot(x - GROVE.x, z - GROVE.z);
}

export function isInsideGrove(x: number, z: number): boolean {
  return distanceToGrove(x, z) < GROVE.radius - 0.5;
}

export function isGroveBeaconColumn(x: number, z: number): boolean {
  return x === GROVE.x && z === GROVE.z;
}

export function chunkTouchesGrove(cx: number, cz: number): boolean {
  const reach = GROVE.radius + 2;
  const minX = cx * CHUNK_SIZE;
  const minZ = cz * CHUNK_SIZE;
  const closestX = Math.max(minX, Math.min(GROVE.x, minX + CHUNK_SIZE - 1));
  const closestZ = Math.max(minZ, Math.min(GROVE.z, minZ + CHUNK_SIZE - 1));
  return distanceToGrove(closestX, closestZ) <= reach;
}

export function chunkTouchesCache(cx: number, cz: number): boolean {
  const minX = cx * CHUNK_SIZE;
  const maxX = minX + CHUNK_SIZE - 1;
  const minZ = cz * CHUNK_SIZE;
  const maxZ = minZ + CHUNK_SIZE - 1;
  return minX <= CACHE.x + 4 && maxX >= CACHE.x - 4 && minZ <= CACHE.z + 4 && maxZ >= CACHE.z - 4;
}
