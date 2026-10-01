import type * as THREE from 'three';

import type { EntityManager } from '../EntityManager.ts';
import type { EntityContext } from '../Entity.ts';
import type { World } from '../../world/World.ts';
import { Block } from '../../world/blocks.ts';
import {
  RUIN,
  RUIN_STATUE,
  isInsideRuinCourtyard,
} from '../../world/arena.ts';
import { RuinSentinel, SENTINEL_NAME, ruinFloorY } from './RuinSentinel.ts';

export interface RuinCallbacks {
  onSummon: (name: string) => void;
  onPhase: (phase: number, label: string) => void;
  onDefeated: () => void;
  onShake: (intensity: number) => void;
  onStagger: () => void;
}

/** Owns the surface Sentinel: summoning, cleanup and statue rebuild. */
export class RuinEncounter {
  boss: RuinSentinel | null = null;
  defeated = false;

  constructor(
    private readonly entities: EntityManager,
    private readonly callbacks: RuinCallbacks,
  ) {}

  get active(): boolean {
    return this.boss !== null && !this.boss.removed;
  }

  canSummon(position: THREE.Vector3): boolean {
    if (this.active) return false;
    return isInsideRuinCourtyard(position.x, position.z);
  }

  summon(world: World): RuinSentinel {
    const floor = ruinFloorY(world.generator.surfaceHeight(RUIN.x, RUIN.z));
    const boss = new RuinSentinel(floor);
    boss.onPhaseChange = (phase, label) => this.callbacks.onPhase(phase, label);
    boss.onShake = (intensity) => this.callbacks.onShake(intensity);
    boss.onStagger = () => this.callbacks.onStagger();
    boss.onDefeated = () => {
      this.defeated = true;
      this.callbacks.onDefeated();
    };

    this.boss = this.entities.add(boss);
    this.callbacks.onSummon(SENTINEL_NAME);
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
    if (context.world.generator.ruinUnlocked) this.rebuildStatue(context.world);
  }

  /** Rebuilds the 3x3 cracked idol after a death mid-fight. */
  rebuildStatue(world: World): void {
    const floor = ruinFloorY(world.generator.surfaceHeight(RUIN.x, RUIN.z));

    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const x = RUIN_STATUE.x + dx;
        const z = RUIN_STATUE.z + dz;
        for (let y = floor + 1; y <= floor + 6; y++) {
          world.restoreStructure(x, y, z, Block.Air);
        }

        world.restoreStructure(x, floor + 1, z, Block.Cobblestone);

        const centre = dx === 0 && dz === 0;
        const arm = Math.abs(dx) + Math.abs(dz) === 1;
        if (centre) {
          world.restoreStructure(x, floor + 2, z, Block.RunicStone);
          world.restoreStructure(x, floor + 3, z, Block.Cobblestone);
          world.restoreStructure(x, floor + 4, z, Block.RunicStone);
          world.restoreStructure(x, floor + 5, z, Block.Glowstone);
        } else if (arm) {
          world.restoreStructure(x, floor + 2, z, Block.Cobblestone);
        }
      }
    }
  }

}
