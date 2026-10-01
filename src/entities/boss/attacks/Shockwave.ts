import * as THREE from 'three';

import { hitPlayer } from '../../../combat/DamageSystem.ts';
import { Entity, type EntityContext } from '../../Entity.ts';

export interface ShockwaveOptions {
  maxRadius: number;
  speed: number;
  damage: number;
  knockback: number;
  color?: number;
  onPass?: (jumped: boolean) => void;
}

/** Expanding ground ring. Jumping over the crest avoids the hit. */
export class Shockwave extends Entity {
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
      this.options.onPass?.(!grounded);
      if (grounded) hitPlayer(player, this.options.damage, this.position, this.options.knockback);
    }
  }

  override onRemoved(): void {
    this.ring.geometry.dispose();
    this.ring.material.dispose();
  }
}
