import type * as THREE from 'three';

import { rayBox } from '../physics/intersect.ts';
import type { Entity, EntityContext, Team } from './Entity.ts';

export interface EntityHit {
  entity: Entity;
  distance: number;
}

/** Owns the live entity list and their scene objects. */
export class EntityManager {
  readonly entities: Entity[] = [];

  constructor(private readonly scene: THREE.Scene) {}

  add<T extends Entity>(entity: T): T {
    this.entities.push(entity);
    this.scene.add(entity.object3D);
    entity.syncTransform();
    return entity;
  }

  remove(entity: Entity): void {
    entity.removed = true;
  }

  update(context: EntityContext): void {
    for (const entity of this.entities) {
      if (!entity.removed) entity.update(context);
    }

    for (let i = this.entities.length - 1; i >= 0; i--) {
      const entity = this.entities[i];
      if (!entity.removed) {
        entity.syncTransform();
        continue;
      }

      entity.onRemoved();
      this.scene.remove(entity.object3D);
      this.entities.splice(i, 1);
    }
  }

  /** Closest entity of the given team along a ray. */
  raycast(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    maxDistance: number,
    team?: Team,
  ): EntityHit | null {
    let best: EntityHit | null = null;

    for (const entity of this.entities) {
      if (entity.removed || entity.health === null) continue;
      if (team !== undefined && entity.team !== team) continue;

      const distance = rayBox(origin, direction, entity.getBox(), maxDistance);
      if (distance === null) continue;
      if (!best || distance < best.distance) best = { entity, distance };
    }

    return best;
  }

  countOfTeam(team: Team): number {
    let count = 0;
    for (const entity of this.entities) {
      if (!entity.removed && entity.team === team) count += 1;
    }
    return count;
  }

  /** Drops entities flagged for removal without waiting for the next update. */
  flushRemoved(): void {
    for (let i = this.entities.length - 1; i >= 0; i--) {
      const entity = this.entities[i];
      if (!entity.removed) continue;

      entity.onRemoved();
      this.scene.remove(entity.object3D);
      this.entities.splice(i, 1);
    }
  }

  clear(): void {
    for (const entity of this.entities) {
      entity.onRemoved();
      this.scene.remove(entity.object3D);
    }
    this.entities.length = 0;
  }
}
