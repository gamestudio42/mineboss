import { GROVE } from './arena.ts';
import { Block } from './blocks.ts';

/** Matches the shared sea level without importing a generator. */
const SEA_LEVEL = 60;

export function groveFloorY(surfaceHeight: number): number {
  return Math.max(surfaceHeight, SEA_LEVEL);
}

/** The four moss-and-glowstone pillars on the grove rim. */
export function grovePillars(): Array<{ x: number; z: number }> {
  const { x: centerX, z: centerZ, radius } = GROVE;
  return Array.from({ length: 4 }, (_, i) => {
    const angle = (Math.PI * 2 * i) / 4;
    return { x: Math.round(centerX + Math.cos(angle) * (radius - 1)), z: Math.round(centerZ + Math.sin(angle) * (radius - 1)) };
  });
}

/**
 * Moss ring and the glowstone beacon. The setter ignores coordinates outside
 * the chunk currently being generated.
 */
export function stampGrove(
  floor: number,
  heightAt: (x: number, z: number) => number,
  set: (x: number, y: number, z: number, id: Block) => void,
): void {
  const { x: centerX, z: centerZ, radius } = GROVE;

  for (let wz = centerZ - radius; wz <= centerZ + radius; wz++) {
    for (let wx = centerX - radius; wx <= centerX + radius; wx++) {
      const dist = Math.hypot(wx - centerX, wz - centerZ);
      if (dist > radius) continue;

      const natural = heightAt(wx, wz);
      const fillFrom = Math.min(natural, floor) - 2;
      const clearTo = Math.max(natural, floor) + 8;
      const rim = Math.abs(dist - (radius - 1)) < 0.7;

      for (let y = fillFrom; y <= clearTo; y++) {
        if (y < floor) set(wx, y, wz, y < floor - 1 ? Block.Stone : Block.Dirt);
        else if (y === floor) set(wx, y, wz, rim ? Block.Cobblestone : Block.Moss);
        else set(wx, y, wz, Block.Air);
      }
    }
  }

  for (const { x, z } of grovePillars()) {
    set(x, floor + 1, z, Block.Moss);
    set(x, floor + 2, z, Block.Glowstone);
  }

  set(centerX, floor + 1, centerZ, Block.Moss);
  set(centerX, floor + 2, centerZ, Block.Moss);
  set(centerX, floor + 3, centerZ, Block.Glowstone);
  set(centerX, floor + 4, centerZ, Block.Glowstone);
}
