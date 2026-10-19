import { getBlockDef, isSolid } from '../../world/blocks.ts';

export type BlockAt = (x: number, y: number, z: number) => number;

function isFloor(id: number): boolean {
  return isSolid(id) && getBlockDef(id).contactDamage === 0;
}

function isBlocked(id: number): boolean {
  return isSolid(id) || getBlockDef(id).contactDamage > 0;
}

function sample(getBlock: BlockAt, x: number, y: number, z: number): { open: boolean; voidAhead: boolean } {
  const feet = getBlock(x, y, z);
  const head = getBlock(x, y + 1, z);
  const stepHead = getBlock(x, y + 2, z);
  const floor = getBlock(x, y - 1, z);
  const deep = getBlock(x, y - 2, z);
  const voidAhead = !isFloor(floor) && !isFloor(deep);
  const canStep = isBlocked(feet) && !isBlocked(head) && !isBlocked(stepHead);
  const walkable = !isBlocked(feet) && !isBlocked(head);
  return { voidAhead, open: !voidAhead && (walkable || canStep) };
}

/**
 * Local sidestep around a tall wall or a void. One-block ledges stay the
 * body's job; this only turns the wish vector.
 */
export function steerAround(
  position: { x: number; y: number; z: number },
  wishX: number,
  wishZ: number,
  getBlock: BlockAt,
  flank = 1,
): { x: number; z: number } {
  const speed = Math.hypot(wishX, wishZ);
  if (speed < 0.01) return { x: wishX, z: wishZ };

  const nx = wishX / speed;
  const nz = wishZ / speed;
  const y = Math.floor(position.y);
  const ahead = sample(getBlock, Math.floor(position.x + nx), y, Math.floor(position.z + nz));
  if (ahead.open) return { x: wishX, z: wishZ };

  const side = flank >= 0 ? 1 : -1;
  const firstX = -nz * side;
  const firstZ = nx * side;
  const secondX = nz * side;
  const secondZ = -nx * side;
  const first = sample(getBlock, Math.floor(position.x + firstX), y, Math.floor(position.z + firstZ));
  const second = sample(getBlock, Math.floor(position.x + secondX), y, Math.floor(position.z + secondZ));

  if (first.open) return { x: firstX * speed, z: firstZ * speed };
  if (second.open) return { x: secondX * speed, z: secondZ * speed };
  if (ahead.voidAhead) return { x: -wishX, z: -wishZ };
  return { x: wishX, z: wishZ };
}
