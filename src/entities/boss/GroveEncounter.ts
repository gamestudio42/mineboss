import type * as THREE from 'three';

import type { EntityManager } from '../EntityManager.ts';
import type { EntityContext } from '../Entity.ts';
import type { World } from '../../world/World.ts';
import { Block } from '../../world/blocks.ts';
import { GROVE, isInsideGrove } from '../../world/arena.ts';
import { groveFloorY } from '../../world/grove.ts';
import { BeaconKeeper, BEACON_NAME } from './BeaconKeeper.ts';

export interface GroveCallbacks {
  onSummon: (name: string) => void;
  onPhase: (phase: number, label: string) => void;
  onDefeated: () => void;
  onShake: (intensity: number) => void;
  onStagger: () => void;
}

/** Owns the south-island Beacon Keeper: summoning, cleanup and pillar rebuild. */
export class GroveEncounter {
  boss: BeaconKeeper | null = null;
  defeated = false;

  constructor(
    private readonly entities: EntityManager,
    private readonly callbacks: GroveCallbacks,
  ) {}

  get active(): boolean {
    return this.boss !== null && !this.boss.removed;
  }

  canSummon(position: THREE.Vector3): boolean {
    if (this.active) return false;
    return isInsideGrove(position.x, position.z);
  }

  summon(world: World): BeaconKeeper {
    const floor = groveFloorY(world.generator.surfaceHeight(GROVE.x, GROVE.z));
    const boss = new BeaconKeeper(floor);
    boss.onPhaseChange = (phase, label) => this.callbacks.onPhase(phase, label);
    boss.onShake = (intensity) => this.callbacks.onShake(intensity);
    boss.onStagger = () => this.callbacks.onStagger();
    boss.onDefeated = () => {
      this.defeated = true;
      this.callbacks.onDefeated();
    };

    this.boss = this.entities.add(boss);
    this.callbacks.onSummon(BEACON_NAME);
    return boss;
  }

  update(): void {
    if (this.boss?.removed) this.boss = null;
  }

  beginNewRun(): void {
    this.defeated = false;
    this.boss = null;
  }

  reset(context: EntityContext): void {
    for (const entity of context.entities.entities) {
      if (entity.team === 'boss' && entity.clearedOnDeath) context.entities.remove(entity);
    }
    context.entities.flushRemoved();
    this.boss = null;
    if (context.world.generator.beaconUnlocked) this.rebuildBeacon(context.world);
  }

  /** Restores the moss-and-glowstone pillar after a death mid-fight. */
  rebuildBeacon(world: World): void {
    const floor = groveFloorY(world.generator.surfaceHeight(GROVE.x, GROVE.z));
    world.restoreStructure(GROVE.x, floor + 1, GROVE.z, Block.Moss);
    world.restoreStructure(GROVE.x, floor + 2, GROVE.z, Block.Moss);
    world.restoreStructure(GROVE.x, floor + 3, GROVE.z, Block.Glowstone);
    world.restoreStructure(GROVE.x, floor + 4, GROVE.z, Block.Glowstone);
  }
}
