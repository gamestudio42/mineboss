import type { Inventory } from '../../../player/Inventory.ts';
import { isSolid } from '../../../world/blocks.ts';

/** Only blocks this close to the player count, so terrain near the boss never shelters by accident. */
export const COVER_REACH = 3;
const STEP = 0.25;

interface BlockSource {
  getBlock(x: number, y: number, z: number): number;
}

interface Point {
  x: number;
  y: number;
  z: number;
}

/**
 * True when a solid block sits on the line from `from` to `target`,
 * `height` blocks above the target's feet, within COVER_REACH of the target.
 */
export function coverBetween(world: BlockSource, from: Point, target: Point, height = 0): boolean {
  const dx = target.x - from.x;
  const dz = target.z - from.z;
  const length = Math.hypot(dx, dz);
  if (length < STEP) return false;
  const y = Math.floor(target.y + 0.05) + height;
  const ownX = Math.floor(target.x);
  const ownZ = Math.floor(target.z);
  const start = Math.max(0, length - COVER_REACH);
  for (let along = start; along < length; along += STEP) {
    const x = Math.floor(from.x + (dx * along) / length);
    const z = Math.floor(from.z + (dz * along) / length);
    if (x === ownX && z === ownZ) continue;
    if (isSolid(world.getBlock(x, y, z))) return true;
  }
  return false;
}

/** A solid block ready in the hotbar, so suggesting a wall is not a dead end. */
export function holdsCoverBlock(inventory: Pick<Inventory, 'slots'>): boolean {
  return inventory.slots.some((slot) => slot.block !== null && slot.count > 0 && isSolid(slot.block));
}
