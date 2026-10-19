import * as THREE from 'three';

import { hitPlayer } from '../../combat/DamageSystem.ts';
import { Health } from '../../combat/Health.ts';
import { damp } from '../../core/math.ts';
import { Entity, type EntityContext } from '../Entity.ts';
import { steerAround } from './steer.ts';

let nextFlank: 1 | -1 = 1;

function takeFlank(): 1 | -1 {
  const flank = nextFlank;
  nextFlank = (nextFlank === 1 ? -1 : 1);
  return flank;
}

const SPEED = 3.4;
const GRAVITY = 26;
const ATTACK_RANGE = 2;
/** Stop closing in at this distance so the pack does not stand inside the player. */
const STOP_RANGE = 1.5;
const PERSONAL_SPACE = 1.25;
const SEPARATION_RANGE = 1.7;
const ATTACK_DAMAGE = 4;
const ATTACK_COOLDOWN = 1.1;
const LIFETIME = 45;

export interface MinionOptions {
  lifetime?: number;
  color?: number;
  headColor?: number;
  eyeColor?: number;
  health?: number;
  clearedOnDeath?: boolean;
  flank?: 1 | -1;
}

/** Small golem summoned by the boss: walks at the player and punches. */
export class Minion extends Entity {
  private cooldown = 0;
  private life: number;
  private readonly flank: 1 | -1;
  private readonly body3D: THREE.Group;

  constructor(x: number, y: number, z: number, options: MinionOptions = {}) {
    super(0.9, 1.7, 'boss', 1.1);
    this.position.set(x, y, z);
    this.life = options.lifetime ?? LIFETIME;
    this.clearedOnDeath = options.clearedOnDeath ?? true;
    this.flank = options.flank ?? takeFlank();
    this.health = new Health(options.health ?? 18, 0.2);

    const body = options.color ?? 0x4b4459;
    const headColor = options.headColor ?? (options.color !== undefined ? body - 0x111111 : 0x3a3446);
    const eyeColor = options.eyeColor ?? 0xff8a3c;

    this.body3D = new THREE.Group();
    const torso = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 1.1, 0.7),
      new THREE.MeshLambertMaterial({ color: body, flatShading: true }),
    );
    torso.position.y = 1.1;

    const head = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.5, 0.6),
      new THREE.MeshLambertMaterial({ color: headColor, flatShading: true }),
    );
    head.position.y = 1.9;

    const eye = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 0.1, 0.05),
      new THREE.MeshBasicMaterial({ color: eyeColor }),
    );
    eye.position.set(0, 1.92, 0.31);

    this.body3D.add(torso, head, eye);
    this.object3D.add(this.body3D);
  }

  override update(context: EntityContext): void {
    const { dt, world, player } = context;

    this.health?.update(dt);
    if (this.health?.dead) {
      this.die(context);
      return;
    }

    this.life -= dt;
    if (this.life <= 0) {
      this.die(context);
      return;
    }

    this.cooldown = Math.max(0, this.cooldown - dt);

    const dx = player.position.x - this.position.x;
    const dz = player.position.z - this.position.z;
    const distance = Math.hypot(dx, dz);

    let wishX = 0;
    let wishZ = 0;

    if (distance > STOP_RANGE) {
      const steered = steerAround(
        this.position,
        dx / distance,
        dz / distance,
        (x, y, z) => world.getBlock(x, y, z),
        this.flank,
      );
      wishX = steered.x;
      wishZ = steered.z;
    } else if (distance > 1e-3 && distance < PERSONAL_SPACE) {
      // Back off instead of pressing into the camera; melee still reaches.
      const strength = (PERSONAL_SPACE - distance) / PERSONAL_SPACE;
      wishX = -(dx / distance) * strength * 2;
      wishZ = -(dz / distance) * strength * 2;
    }

    const [pushX, pushZ] = this.separationFrom(context);
    wishX += pushX * 1.5;
    wishZ += pushZ * 1.5;

    const wish = Math.hypot(wishX, wishZ);
    const targetX = wish > 0.01 ? (wishX / wish) * SPEED : 0;
    const targetZ = wish > 0.01 ? (wishZ / wish) * SPEED : 0;

    this.velocity.x = damp(this.velocity.x, targetX, 8, dt);
    this.velocity.z = damp(this.velocity.z, targetZ, 8, dt);
    if (distance > 0.4) this.body3D.rotation.y = Math.atan2(dx, dz);

    this.velocity.y -= GRAVITY * dt;

    // Hop over the lip of a block when walking into a wall.
    if (this.body.onGround && Math.hypot(this.velocity.x, this.velocity.z) < SPEED * 0.35) {
      this.velocity.y = 7;
    }

    this.body.move(world, dt);

    const verticalGap = Math.abs(player.position.y - this.position.y);
    if (distance < ATTACK_RANGE && verticalGap < 2.4 && this.cooldown === 0) {
      this.cooldown = ATTACK_COOLDOWN;
      if (hitPlayer(player, ATTACK_DAMAGE, this.position, 5)) context.sfx.play('hurt');
    }

    this.body3D.position.y = Math.sin(context.elapsed * 9) * 0.05;
  }

  /** Crowd separation so summons spread around the player instead of stacking. */
  private separationFrom(context: EntityContext): [number, number] {
    let x = 0;
    let z = 0;

    for (const other of context.entities.entities) {
      if (other === this || other.removed || !(other instanceof Minion)) continue;

      const dx = this.position.x - other.position.x;
      const dz = this.position.z - other.position.z;
      const distance = Math.hypot(dx, dz);
      if (distance > SEPARATION_RANGE) continue;

      if (distance < 1e-3) {
        x += Math.random() - 0.5;
        z += Math.random() - 0.5;
        continue;
      }

      const strength = (SEPARATION_RANGE - distance) / SEPARATION_RANGE;
      x += (dx / distance) * strength;
      z += (dz / distance) * strength;
    }

    return [x, z];
  }

  private die(context: EntityContext): void {
    context.particles.burst(this.position, {
      count: 18,
      color: 0x6a5f7d,
      speed: 4,
      spread: 0.8,
      life: 0.7,
    });
    context.sfx.play('break');
    context.entities.remove(this);
  }
}
