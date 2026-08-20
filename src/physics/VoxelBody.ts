import * as THREE from 'three';

import { isSolid } from '../world/blocks.ts';
import type { World } from '../world/World.ts';

const EPS = 1e-3;

/**
 * An axis-aligned box that slides against the voxel grid.
 *
 * `position` is the centre of the footprint at feet level. Movement is applied
 * one axis at a time so a blocked direction never cancels the others, and a
 * grounded body can climb ledges up to `stepHeight`.
 */
export class VoxelBody {
  readonly position = new THREE.Vector3();
  readonly velocity = new THREE.Vector3();

  onGround = false;
  /** Highest point reached since leaving the ground, for fall damage. */
  fallPeak = 0;

  constructor(
    readonly width: number,
    readonly height: number,
    readonly stepHeight = 0,
  ) {}

  get halfWidth(): number {
    return this.width / 2;
  }

  /** Integrates the current velocity for `dt` seconds, resolving collisions. */
  move(world: World, dt: number): void {
    const dx = this.velocity.x * dt;
    const dy = this.velocity.y * dt;
    const dz = this.velocity.z * dt;

    const startX = this.position.x;
    const startY = this.position.y;
    const startZ = this.position.z;

    this.moveAxis(world, 0, dx);
    this.moveAxis(world, 2, dz);

    const flatX = this.position.x;
    const flatZ = this.position.z;
    const blocked =
      Math.abs(flatX - (startX + dx)) > EPS || Math.abs(flatZ - (startZ + dz)) > EPS;

    if (blocked && this.onGround && this.stepHeight > 0) {
      this.tryStepUp(world, startX, startY, startZ, dx, dz, flatX, flatZ);
    }

    this.onGround = false;
    this.moveAxis(world, 1, dy);

    if (this.onGround) this.fallPeak = this.position.y;
    else this.fallPeak = Math.max(this.fallPeak, this.position.y);
  }

  /** Retries the blocked horizontal move from one step higher, e.g. a ledge. */
  private tryStepUp(
    world: World,
    startX: number,
    startY: number,
    startZ: number,
    dx: number,
    dz: number,
    flatX: number,
    flatZ: number,
  ): void {
    const flatGain = Math.hypot(flatX - startX, flatZ - startZ);

    this.position.set(startX, startY + this.stepHeight, startZ);
    if (this.intersectsWorld(world)) {
      this.position.set(flatX, startY, flatZ);
      return;
    }

    this.moveAxis(world, 0, dx);
    this.moveAxis(world, 2, dz);
    const steppedGain = Math.hypot(this.position.x - startX, this.position.z - startZ);

    if (steppedGain <= flatGain + EPS) {
      this.position.set(flatX, startY, flatZ);
      return;
    }

    this.moveAxis(world, 1, -this.stepHeight);
  }

  private moveAxis(world: World, axis: 0 | 1 | 2, delta: number): void {
    if (delta === 0) return;

    const position = this.position;
    if (axis === 0) position.x += delta;
    else if (axis === 1) position.y += delta;
    else position.z += delta;

    const half = this.halfWidth;
    const minX = Math.floor(position.x - half + EPS);
    const maxX = Math.floor(position.x + half - EPS);
    const minY = Math.floor(position.y + EPS);
    const maxY = Math.floor(position.y + this.height - EPS);
    const minZ = Math.floor(position.z - half + EPS);
    const maxZ = Math.floor(position.z + half - EPS);

    let hit = delta > 0 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
    let found = false;

    for (let y = minY; y <= maxY; y++) {
      for (let z = minZ; z <= maxZ; z++) {
        for (let x = minX; x <= maxX; x++) {
          if (!isSolid(world.getBlock(x, y, z))) continue;
          const coord = axis === 0 ? x : axis === 1 ? y : z;
          hit = delta > 0 ? Math.min(hit, coord) : Math.max(hit, coord);
          found = true;
        }
      }
    }

    if (!found) return;

    if (axis === 0) {
      position.x = delta > 0 ? hit - half - EPS : hit + 1 + half + EPS;
      this.velocity.x = 0;
    } else if (axis === 2) {
      position.z = delta > 0 ? hit - half - EPS : hit + 1 + half + EPS;
      this.velocity.z = 0;
    } else if (delta > 0) {
      position.y = hit - this.height - EPS;
      this.velocity.y = 0;
    } else {
      position.y = hit + 1;
      this.velocity.y = 0;
      this.onGround = true;
    }
  }

  intersectsWorld(world: World): boolean {
    const half = this.halfWidth;
    const minX = Math.floor(this.position.x - half + EPS);
    const maxX = Math.floor(this.position.x + half - EPS);
    const minY = Math.floor(this.position.y + EPS);
    const maxY = Math.floor(this.position.y + this.height - EPS);
    const minZ = Math.floor(this.position.z - half + EPS);
    const maxZ = Math.floor(this.position.z + half - EPS);

    for (let y = minY; y <= maxY; y++) {
      for (let z = minZ; z <= maxZ; z++) {
        for (let x = minX; x <= maxX; x++) {
          if (isSolid(world.getBlock(x, y, z))) return true;
        }
      }
    }

    return false;
  }

  /** Iterates every block the body currently overlaps. */
  forEachOverlappingBlock(world: World, visit: (id: number) => void): void {
    const half = this.halfWidth;
    const minX = Math.floor(this.position.x - half);
    const maxX = Math.floor(this.position.x + half);
    const minY = Math.floor(this.position.y);
    const maxY = Math.floor(this.position.y + this.height);
    const minZ = Math.floor(this.position.z - half);
    const maxZ = Math.floor(this.position.z + half);

    for (let y = minY; y <= maxY; y++) {
      for (let z = minZ; z <= maxZ; z++) {
        for (let x = minX; x <= maxX; x++) visit(world.getBlock(x, y, z));
      }
    }
  }

  /** Pushes the body straight up until it no longer overlaps solid blocks. */
  unstick(world: World, maxSteps = 64): void {
    for (let i = 0; i < maxSteps && this.intersectsWorld(world); i++) {
      this.position.y += 1;
    }
  }
}
