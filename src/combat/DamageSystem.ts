import * as THREE from 'three';

import type { Entity } from '../entities/Entity.ts';
import type { VoxelBody } from '../physics/VoxelBody.ts';
import type { Player } from '../player/Player.ts';
import type { ParticleSystem } from '../render/Particles.ts';
import { ARENA, isInsideArena } from '../world/arena.ts';
import { Block, TILE_SIDE, getBlockDef } from '../world/blocks.ts';
import type { World } from '../world/World.ts';
import type { BlockAtlas } from '../render/atlas.ts';

const push = new THREE.Vector3();
const center = new THREE.Vector3();

/** Blocks tougher than this survive explosions, which keeps the arena sealed. */
const DESTRUCTIBLE_HARDNESS = 1.2;

export function applyKnockback(
  body: VoxelBody,
  from: THREE.Vector3,
  strength: number,
  lift = 0.45,
): void {
  push.copy(body.position).sub(from);
  push.y = 0;
  if (push.lengthSq() < 1e-6) push.set(Math.random() - 0.5, 0, Math.random() - 0.5);
  push.normalize().multiplyScalar(strength);

  body.velocity.x += push.x;
  body.velocity.z += push.z;
  body.velocity.y = Math.max(body.velocity.y, strength * lift);
}

export function hitEntity(
  entity: Entity,
  amount: number,
  from: THREE.Vector3 | null,
  knockback: number,
  particles?: ParticleSystem,
): boolean {
  if (!entity.health || entity.health.dead) return false;
  if (!entity.health.damage(amount)) return false;

  if (from && knockback > 0) applyKnockback(entity.body, from, knockback);
  if (particles) {
    entity.getCenter(center);
    particles.burst(center, { count: 8, color: 0xff5544, speed: 3, spread: 0.5, life: 0.4 });
  }

  return true;
}

export function hitPlayer(
  player: Player,
  amount: number,
  from: THREE.Vector3 | null,
  knockback: number,
): boolean {
  const reduction = player.armor;
  if (!player.health.damage(amount * (1 - reduction))) return false;
  if (reduction > 0) player.onPlateAbsorb?.(amount * reduction);
  if (from && knockback > 0) applyKnockback(player.body, from, knockback);
  return true;
}

export interface BlastOptions {
  world: World;
  particles: ParticleSystem;
  atlas: BlockAtlas;
  center: THREE.Vector3;
  radius: number;
  /** Radius within which terrain is destroyed; defaults to no terrain damage. */
  terrainRadius?: number;
}

/** Spherical terrain destruction with debris particles. */
export function blastTerrain(options: BlastOptions): void {
  const radius = options.terrainRadius ?? 0;
  if (radius <= 0) return;

  const { world, center: origin } = options;
  const minX = Math.floor(origin.x - radius);
  const maxX = Math.ceil(origin.x + radius);
  const minY = Math.floor(origin.y - radius);
  const maxY = Math.ceil(origin.y + radius);
  const minZ = Math.floor(origin.z - radius);
  const maxZ = Math.ceil(origin.z + radius);

  const debris = new THREE.Vector3();
  let spawned = 0;

  for (let y = minY; y <= maxY; y++) {
    for (let z = minZ; z <= maxZ; z++) {
      for (let x = minX; x <= maxX; x++) {
        const distance = Math.hypot(x + 0.5 - origin.x, y + 0.5 - origin.y, z + 0.5 - origin.z);
        if (distance > radius) continue;

        const block = world.getBlock(x, y, z);
        if (block === Block.Air) continue;
        if (y <= ARENA.floorY) continue;
        if (block === Block.Glowstone && isInsideArena(x + 0.5, y + 0.5, z + 0.5)) continue;
        if (getBlockDef(block).hardness > DESTRUCTIBLE_HARDNESS) continue;

        world.setBlock(x, y, z, Block.Air);

        if (spawned < 14 && Math.random() < 0.25) {
          spawned += 1;
          debris.set(x + 0.5, y + 0.5, z + 0.5);
          options.particles.burst(debris, {
            count: 3,
            color: options.atlas.tileColors[TILE_SIDE[block]],
            speed: 5,
            life: 0.8,
          });
        }
      }
    }
  }
}

/** Damage that falls off linearly toward the edge of the blast. */
export function radialDamage(
  player: Player,
  origin: THREE.Vector3,
  radius: number,
  maxDamage: number,
  knockback: number,
): boolean {
  const distance = Math.hypot(
    player.position.x - origin.x,
    player.position.y + 0.9 - origin.y,
    player.position.z - origin.z,
  );
  if (distance > radius) return false;

  const falloff = 1 - distance / radius;
  return hitPlayer(player, maxDamage * (0.35 + 0.65 * falloff), origin, knockback * falloff);
}
