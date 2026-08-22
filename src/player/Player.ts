import * as THREE from 'three';

import { Health } from '../combat/Health.ts';
import { VoxelBody } from '../physics/VoxelBody.ts';
import { HAMMER, HammerTier, PLATE_REDUCTION } from './Hammer.ts';
import { Inventory } from './Inventory.ts';

export const PLAYER_WIDTH = 0.6;
export const PLAYER_HEIGHT = 1.8;
export const PLAYER_EYE_HEIGHT = 1.62;
export const PLAYER_REACH = 5.5;
export const SWING_DURATION = 0.24;

/** Player state: body, orientation, hit points and carried blocks. */
export class Player {
  readonly body = new VoxelBody(PLAYER_WIDTH, PLAYER_HEIGHT, 1.05);
  readonly health = new Health(20, 0.5);
  readonly inventory = new Inventory();
  readonly spawn = new THREE.Vector3();

  yaw = 0;
  pitch = 0;
  flying = false;
  sprinting = false;
  swimming = false;
  /** Seconds left of the swing animation, drives the held-item bob. */
  swing = 0;
  hammerTier = HammerTier.Wood;
  /** True after smithing iron plates; cuts boss and minion hits. */
  plated = false;

  get mineSpeed(): number {
    return HAMMER[this.hammerTier].mineSpeed;
  }

  get meleeDamage(): number {
    return HAMMER[this.hammerTier].damage;
  }

  get armor(): number {
    return this.plated ? PLATE_REDUCTION : 0;
  }

  get position(): THREE.Vector3 {
    return this.body.position;
  }

  get velocity(): THREE.Vector3 {
    return this.body.velocity;
  }

  get dead(): boolean {
    return this.health.dead;
  }

  getEyePosition(target: THREE.Vector3): THREE.Vector3 {
    return target.set(this.position.x, this.position.y + PLAYER_EYE_HEIGHT, this.position.z);
  }

  /** Unit vector the camera is looking along. */
  getForward(target: THREE.Vector3): THREE.Vector3 {
    const cosPitch = Math.cos(this.pitch);
    return target
      .set(-Math.sin(this.yaw) * cosPitch, Math.sin(this.pitch), -Math.cos(this.yaw) * cosPitch)
      .normalize();
  }

  /** Starts a swing unless one is already playing, so held clicks loop cleanly. */
  startSwing(): void {
    if (this.swing <= 0) this.swing = SWING_DURATION;
  }

  setSpawn(x: number, y: number, z: number): void {
    this.spawn.set(x, y, z);
  }

  respawn(): void {
    this.position.copy(this.spawn);
    this.velocity.set(0, 0, 0);
    this.body.fallPeak = this.spawn.y;
    this.body.onGround = false;
    this.health.reset();
    this.flying = false;
    this.swimming = false;
    this.pitch = 0;
  }
}
