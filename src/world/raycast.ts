import type * as THREE from 'three';

import { Block } from './blocks.ts';
import type { World } from './World.ts';

export interface VoxelHit {
  /** Coordinates of the block that was hit. */
  x: number;
  y: number;
  z: number;
  /** Face normal pointing back toward the ray origin. */
  nx: number;
  ny: number;
  nz: number;
  block: number;
  distance: number;
}

/**
 * Amanatides & Woo grid traversal: walks the voxels a ray crosses in order and
 * stops at the first non-air block.
 */
export function raycastVoxels(
  world: World,
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  maxDistance: number,
): VoxelHit | null {
  let x = Math.floor(origin.x);
  let y = Math.floor(origin.y);
  let z = Math.floor(origin.z);

  const stepX = Math.sign(direction.x);
  const stepY = Math.sign(direction.y);
  const stepZ = Math.sign(direction.z);

  const deltaX = stepX === 0 ? Infinity : Math.abs(1 / direction.x);
  const deltaY = stepY === 0 ? Infinity : Math.abs(1 / direction.y);
  const deltaZ = stepZ === 0 ? Infinity : Math.abs(1 / direction.z);

  let maxX = boundary(origin.x, x, stepX, deltaX);
  let maxY = boundary(origin.y, y, stepY, deltaY);
  let maxZ = boundary(origin.z, z, stepZ, deltaZ);

  let nx = 0;
  let ny = 0;
  let nz = 0;
  let distance = 0;

  while (distance <= maxDistance) {
    const block = world.getBlock(x, y, z);
    if (block !== Block.Air) {
      return { x, y, z, nx, ny, nz, block, distance };
    }

    if (maxX < maxY && maxX < maxZ) {
      distance = maxX;
      maxX += deltaX;
      x += stepX;
      nx = -stepX;
      ny = 0;
      nz = 0;
    } else if (maxY < maxZ) {
      distance = maxY;
      maxY += deltaY;
      y += stepY;
      nx = 0;
      ny = -stepY;
      nz = 0;
    } else {
      distance = maxZ;
      maxZ += deltaZ;
      z += stepZ;
      nx = 0;
      ny = 0;
      nz = -stepZ;
    }
  }

  return null;
}

function boundary(origin: number, cell: number, step: number, delta: number): number {
  if (step === 0) return Infinity;
  const edge = step > 0 ? cell + 1 - origin : origin - cell;
  return edge * delta;
}
