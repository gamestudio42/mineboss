import * as THREE from 'three';

import { Health } from '../combat/Health.ts';
import { Entity, type EntityContext } from './Entity.ts';
import { steerAround, walkToward } from './boss/steer.ts';

const SPEED = 3.8;
const STEP_HEIGHT = 1.1;
/** Trots up to this distance and then sits by the player. */
export const PET_FOLLOW_DISTANCE = 2.6;
/** Farther than this (a teleport, a long flight) it simply catches up. */
export const PET_CATCH_UP_DISTANCE = 18;
/** Stays this close to the middle of its pen while waiting. */
export const PET_HOME_RADIUS = 1.2;
/** A pet walking home that cannot get there in this many seconds pops back. */
export const PET_STRAY_SECONDS = 8;

export interface PetHome {
  x: number;
  y: number;
  z: number;
}

/**
 * The companion that moves into the first recognised pen. It shares the
 * summons' walk and sidestep, sits on the neutral team and cannot be hurt.
 */
export class Pet extends Entity {
  following = false;
  readonly home: PetHome;

  private wander = { x: 0, z: 0 };
  private wanderTimer = 0;
  /** Back home: it neither climbs nor hops, so a one-block fence keeps it in. */
  private settled = true;
  private strayTime = 0;
  private readonly body3D = new THREE.Group();
  private readonly legs: THREE.Mesh[] = [];

  constructor(home: PetHome) {
    super(0.7, 0.8, 'neutral', STEP_HEIGHT);
    this.home = { ...home };
    this.position.set(home.x, home.y, home.z);
    this.wander = { x: home.x, z: home.z };
    this.clearedOnDeath = false;
    // Only the right-click aim needs a health bar; nothing in the game damages neutrals.
    this.health = new Health(1, 0);
    this.health.immune = true;
    this.buildModel();
  }

  override update(context: EntityContext): void {
    const { dt, world, player } = context;
    if (!world.getChunk(Math.floor(this.position.x) >> 4, Math.floor(this.position.z) >> 4)) return;

    const target = this.following ? player.position : this.home;
    const dx = target.x - this.position.x;
    const dz = target.z - this.position.z;
    const distance = Math.hypot(dx, dz);
    if (this.following) this.settled = false;
    else if (distance <= PET_HOME_RADIUS) this.settled = true;
    const returning = !this.following && !this.settled;
    this.strayTime = returning ? this.strayTime + dt : 0;

    if (this.position.y < 0 || distance > PET_CATCH_UP_DISTANCE || this.strayTime > PET_STRAY_SECONDS) {
      if (!this.following || player.body.onGround) this.teleport(target);
      return;
    }

    let goalX = target.x;
    let goalZ = target.z;
    const stop = this.following ? PET_FOLLOW_DISTANCE : 0.3;
    if (this.settled) {
      this.wanderTimer -= dt;
      if (this.wanderTimer <= 0) {
        this.wanderTimer = 2 + Math.random() * 2.5;
        const angle = Math.random() * Math.PI * 2;
        const reach = Math.random() * PET_HOME_RADIUS;
        this.wander = { x: this.home.x + Math.cos(angle) * reach, z: this.home.z + Math.sin(angle) * reach };
      }
      goalX = this.wander.x;
      goalZ = this.wander.z;
    }

    const gx = goalX - this.position.x;
    const gz = goalZ - this.position.z;
    const gap = Math.hypot(gx, gz);
    let wishX = 0;
    let wishZ = 0;
    if (gap > stop) {
      const steered = steerAround(this.position, gx / gap, gz / gap, (x, y, z) => world.getBlock(x, y, z));
      wishX = steered.x;
      wishZ = steered.z;
    }
    this.body.stepHeight = this.settled ? 0 : STEP_HEIGHT;
    walkToward(this, world, wishX, wishZ, this.settled ? SPEED * 0.45 : SPEED, dt, this.settled ? 'never' : 'moving');

    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    if (speed > 0.2) this.body3D.rotation.y = Math.atan2(this.velocity.x, this.velocity.z);
    else if (this.following && distance > 0.4) this.body3D.rotation.y = Math.atan2(dx, dz);
    const swing = speed > 0.2 ? Math.sin(context.elapsed * 14) * 0.5 : 0;
    this.legs.forEach((leg, i) => { leg.rotation.x = i % 3 === 0 ? swing : -swing; });
  }

  private teleport(target: { x: number; y: number; z: number }): void {
    this.position.set(target.x, target.y + 0.1, target.z);
    this.velocity.set(0, 0, 0);
    this.settled = !this.following;
    this.strayTime = 0;
  }

  private buildModel(): void {
    const pink = new THREE.MeshLambertMaterial({ color: 0xf4a6b8, flatShading: true });
    const snout = new THREE.MeshLambertMaterial({ color: 0xe07f99, flatShading: true });
    const dark = new THREE.MeshBasicMaterial({ color: 0x2b1d24 });

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.46, 0.86), pink);
    torso.position.y = 0.5;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.42, 0.4), pink);
    head.position.set(0, 0.66, 0.55);
    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.16, 0.08), snout);
    nose.position.set(0, 0.6, 0.78);
    const eyes = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.07, 0.04), dark);
    eyes.position.set(0, 0.76, 0.76);
    const ears = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.12), snout);
    ears.position.set(0, 0.9, 0.5);
    this.body3D.add(torso, head, nose, eyes, ears);

    for (const [x, z] of [[-0.19, 0.28], [0.19, 0.28], [-0.19, -0.28], [0.19, -0.28]]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.3, 0.16), pink);
      leg.geometry.translate(0, -0.15, 0);
      leg.position.set(x, 0.3, z);
      this.legs.push(leg);
      this.body3D.add(leg);
    }
    this.object3D.add(this.body3D);
  }
}
