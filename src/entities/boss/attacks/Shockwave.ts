import * as THREE from 'three';

import { hitPlayer } from '../../../combat/DamageSystem.ts';
import { Entity, type EntityContext } from '../../Entity.ts';
import { coverBetween } from './cover.ts';

export type WaveOutcome = 'pending' | 'jumped' | 'blocked' | 'hit';

export interface ShockwaveOptions {
  maxRadius: number;
  speed: number;
  damage: number;
  knockback: number;
  color?: number;
  onPass?: (avoided: boolean, outcome: WaveOutcome) => void;
}

/** Expanding ground ring. Jumping over the crest or a block in its path avoids the hit. */
export class Shockwave extends Entity {
  outcome: WaveOutcome = 'pending';
  private radius = 1;
  private hitPlayerAlready = false;

  private readonly ring: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;

  constructor(private readonly options: ShockwaveOptions) {
    super(1, 0.2, 'boss');

    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.72, 1, 64),
      new THREE.MeshBasicMaterial({
        color: options.color ?? 0xff7a3c,
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.08;
    this.ring.renderOrder = 2;
    this.object3D.add(this.ring);
  }

  override update(context: EntityContext): void {
    this.radius += this.options.speed * context.dt;

    const progress = this.radius / this.options.maxRadius;
    this.ring.scale.setScalar(this.radius);
    this.ring.material.opacity = 0.85 * (1 - progress);

    if (progress >= 1) {
      context.entities.remove(this);
      return;
    }

    if (this.hitPlayerAlready) return;

    const player = context.player;
    const distance = Math.hypot(
      player.position.x - this.position.x,
      player.position.z - this.position.z,
    );
    const grounded = player.position.y < this.position.y + 1.2 && player.body.onGround;

    if (Math.abs(distance - this.radius) < 1.3) {
      this.hitPlayerAlready = true;
      this.outcome = !grounded ? 'jumped' : this.shelters(context.world, player.position) ? 'blocked' : 'hit';
      this.options.onPass?.(this.outcome !== 'hit', this.outcome);
      if (this.outcome === 'hit') hitPlayer(player, this.options.damage, this.position, this.options.knockback);
    }
  }

  /** A solid block at foot level just in front of the player breaks the ring. */
  shelters(world: { getBlock(x: number, y: number, z: number): number }, player: { x: number; y: number; z: number }): boolean {
    return coverBetween(world, this.position, player);
  }

  approaching(player: { x: number; y: number; z: number }): boolean {
    if (this.removed || this.hitPlayerAlready || Math.abs(player.y - this.position.y) > 3) return false;
    const distance = Math.hypot(player.x - this.position.x, player.z - this.position.z);
    const remaining = distance - this.radius - 1.3;
    return distance < this.options.maxRadius && remaining >= -0.2 && remaining / this.options.speed <= 0.65;
  }

  override onRemoved(): void {
    this.ring.geometry.dispose();
    this.ring.material.dispose();
  }
}
