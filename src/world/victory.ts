import { ARENA_STAND_Y, ENTRANCE, GROVE, RUIN, isStairStep, ruinPosts } from './arena.ts';
import { Block } from './blocks.ts';
import { WORLD_HEIGHT } from './Chunk.ts';
import { groveFloorY, grovePillars } from './grove.ts';

export type VictoryBoss = 'sentinel' | 'warden' | 'beacon';

export interface VictoryBlock {
  x: number;
  y: number;
  z: number;
  id: Block;
}

/** Matches the shared sea level without importing a generator. */
const SEA_LEVEL = 60;

/** What the child is told to look for after each win. */
export const VICTORY_SIGN_TEXT: Record<VictoryBoss, string> = {
  sentinel: 'As tochas da ruína acenderam.',
  warden: 'A escada do santuário agora brilha.',
  beacon: 'O farol acendeu de verdade.',
};

/**
 * The lasting mark each boss leaves on its own structure. Only cells the
 * generator owns are listed; callers must still yield to player edits.
 */
export function victoryBlocks(boss: VictoryBoss, heightAt: (x: number, z: number) => number): VictoryBlock[] {
  if (boss === 'sentinel') {
    const floor = Math.max(heightAt(RUIN.x, RUIN.z), SEA_LEVEL);
    return ruinPosts().map(({ x, z, index }) => ({ x, y: floor + (index % 2 === 0 ? 4 : 3), z, id: Block.Torch }));
  }

  if (boss === 'warden') {
    const top = Math.min(heightAt(ENTRANCE.x, ENTRANCE.z), WORLD_HEIGHT - 10);
    const { shaft } = ENTRANCE;
    const blocks: VictoryBlock[] = [];
    for (let y = top - 1; y > ARENA_STAND_Y; y--) {
      if ((top - y) % 4 !== 0) continue;
      for (let dz = -shaft; dz <= shaft; dz++) {
        for (let dx = -shaft; dx <= shaft; dx++) {
          if (isStairStep(dx, dz, shaft, top - y)) blocks.push({ x: ENTRANCE.x + dx, y, z: ENTRANCE.z + dz, id: Block.Glowstone });
        }
      }
    }
    return blocks;
  }

  const floor = groveFloorY(heightAt(GROVE.x, GROVE.z));
  return [
    { x: GROVE.x, y: floor + 5, z: GROVE.z, id: Block.Glowstone },
    { x: GROVE.x, y: floor + 6, z: GROVE.z, id: Block.Glowstone },
    { x: GROVE.x, y: floor + 7, z: GROVE.z, id: Block.Torch },
    ...grovePillars().map(({ x, z }) => ({ x, y: floor + 3, z, id: Block.Torch })),
  ];
}

/** Narrow view of `World` so the stamp stays testable without chunks or meshing. */
export interface StructureWorld {
  generator: { surfaceHeight(x: number, z: number): number };
  stampStructure(x: number, y: number, z: number, id: Block): boolean;
}

/** Lights the sign in the loaded world right after a win; player blocks always stay. */
export function applyVictorySign(world: StructureWorld, boss: VictoryBoss): number {
  let placed = 0;
  for (const block of victoryBlocks(boss, (x, z) => world.generator.surfaceHeight(x, z))) {
    if (world.stampStructure(block.x, block.y, block.z, block.id)) placed++;
  }
  return placed;
}
