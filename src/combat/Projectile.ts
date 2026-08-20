import * as THREE from 'three';

import { Entity, type EntityContext } from '../entities/Entity.ts';
import { isSolid } from '../world/blocks.ts';
import { blastTerrain, hitPlayer, radialDamage } from './DamageSystem.ts';

const GRAVITY = 20;
const SUBSTEP = 0.35;
const LIFETIME = 8;

export interface BoulderOptions {
  directDamage: number;
  blastDamage: number;
  blastRadius: number;
  terrainRadius: number;
}

/**
 * Arcing rock thrown by the boss. It sweeps in small steps so it cannot tunnel
 * through thin walls, and detonates on the first thing it touches.
 */
export class Boulder extends Entity {
  private life = LIFETIME;
  private readonly spin = new THREE.Vector3(
    Math.random() * 4 - 2,
    Math.random() * 4 - 2,
    Math.random() * 4 - 2,
  );

  constructor(private readonly options: BoulderOptions) {
    super(0.9, 0.9, 'boss');

    const mesh = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.55, 0),
      new THREE.MeshLambertMaterial({ color: 0x6a6560, flatShading: true }),
    );
    mesh.position.y = 0.45;
    this.object3D.add(mesh);
  }

  /** Aims a ballistic arc that reaches `target` after roughly `flightTime`. */
  launchAt(target: THREE.Vector3, flightTime: number): void {
    this.velocity.set(
      (target.x - this.position.x) / flightTime,
      (target.y - this.position.y) / flightTime + 0.5 * GRAVITY * flightTime,
      (target.z - this.position.z) / flightTime,
    );
  }

  override update(context: EntityContext): void {
    const { dt } = context;

    this.life -= dt;
    if (this.life <= 0) {
      this.detonate(context);
      return;
    }

    this.velocity.y -= GRAVITY * dt;

    const distance = this.velocity.length() * dt;
    const steps = Math.max(1, Math.ceil(distance / SUBSTEP));
    const step = dt / steps;

    for (let i = 0; i < steps; i++) {
      this.position.addScaledVector(this.velocity, step);

      if (this.hitsPlayer(context)) {
        hitPlayer(context.player, this.options.directDamage, this.position, 7);
        this.detonate(context);
        return;
      }

      if (isSolid(context.world.getBlock(
        Math.floor(this.position.x),
        Math.floor(this.position.y),
        Math.floor(this.position.z),
      ))) {
        this.detonate(context);
        return;
      }
    }

    this.object3D.rotation.x += this.spin.x * dt;
    this.object3D.rotation.y += this.spin.y * dt;
    this.object3D.rotation.z += this.spin.z * dt;
  }

  private hitsPlayer(context: EntityContext): boolean {
    const player = context.player.position;
    return (
      Math.abs(player.x - this.position.x) < 0.9 &&
      Math.abs(player.z - this.position.z) < 0.9 &&
      this.position.y > player.y - 0.5 &&
      this.position.y < player.y + 2.2
    );
  }

  private detonate(context: EntityContext): void {
    context.sfx.play('explode');
    context.particles.burst(this.position, {
      count: 26,
      color: 0x8a8078,
      speed: 7,
      spread: 0.8,
      life: 0.9,
    });

    blastTerrain({
      world: context.world,
      particles: context.particles,
      atlas: context.atlas,
      center: this.position,
      radius: this.options.blastRadius,
      terrainRadius: this.options.terrainRadius,
    });

    radialDamage(
      context.player,
      this.position,
      this.options.blastRadius,
      this.options.blastDamage,
      6,
    );

    context.entities.remove(this);
  }
}
