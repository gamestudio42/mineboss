import * as THREE from 'three';

import type { Sfx } from '../audio/Sfx.ts';
import type { Health } from '../combat/Health.ts';
import { bodyBox, createBox, type Box } from '../physics/intersect.ts';
import { VoxelBody } from '../physics/VoxelBody.ts';
import type { Player } from '../player/Player.ts';
import type { BlockAtlas } from '../render/atlas.ts';
import type { ParticleSystem } from '../render/Particles.ts';
import type { World } from '../world/World.ts';
import type { EntityManager } from './EntityManager.ts';

export interface EntityContext {
  dt: number;
  world: World;
  player: Player;
  particles: ParticleSystem;
  entities: EntityManager;
  atlas: BlockAtlas;
  sfx: Sfx;
  /** Seconds since the world was created, for animation phases. */
  elapsed: number;
}

export type Team = 'player' | 'boss' | 'neutral';

/** Anything that lives in the world and is not a voxel. */
export abstract class Entity {
  readonly object3D = new THREE.Group();
  readonly body: VoxelBody;
  readonly team: Team;

  health: Health | null = null;
  removed = false;
  /** Scales incoming damage; the boss raises it while staggered. */
  damageMultiplier = 1;

  private readonly box = createBox();

  constructor(width: number, height: number, team: Team, stepHeight = 0) {
    this.body = new VoxelBody(width, height, stepHeight);
    this.team = team;
  }

  get position(): THREE.Vector3 {
    return this.body.position;
  }

  get velocity(): THREE.Vector3 {
    return this.body.velocity;
  }

  getBox(): Box {
    return bodyBox(this.position, this.body.width, this.body.height, this.box);
  }

  /** Centre of mass, used for aiming and knockback directions. */
  getCenter(target: THREE.Vector3): THREE.Vector3 {
    return target.set(this.position.x, this.position.y + this.body.height / 2, this.position.z);
  }

  abstract update(context: EntityContext): void;

  /** Brief hit reaction; the Warden flashes its stone. */
  hitFlash(): void {}

  /** Called after `update` so subclasses do not have to sync transforms. */
  syncTransform(): void {
    this.object3D.position.copy(this.position);
  }

  onRemoved(): void {}
}
