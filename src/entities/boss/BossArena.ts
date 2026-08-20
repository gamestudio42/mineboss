import type * as THREE from 'three';

import type { EntityManager } from '../EntityManager.ts';
import type { EntityContext } from '../Entity.ts';
import { ALTAR, ARENA, distanceToArenaCenter } from '../../world/arena.ts';
import { Boss, BOSS_NAME } from './Boss.ts';

export interface ArenaCallbacks {
  onSummon: (name: string) => void;
  onPhase: (phase: number, label: string) => void;
  onVictory: () => void;
  onShake: (intensity: number) => void;
}

/** Owns the encounter: summoning, phase notifications, cleanup and reset. */
export class BossArena {
  boss: Boss | null = null;
  defeated = false;

  constructor(
    private readonly entities: EntityManager,
    private readonly callbacks: ArenaCallbacks,
  ) {}

  get active(): boolean {
    return this.boss !== null && !this.boss.removed;
  }

  /** The altar only responds while the player is standing in the arena. */
  canSummon(position: THREE.Vector3): boolean {
    if (this.active || this.defeated) return false;
    return (
      distanceToArenaCenter(position.x, position.z) < ARENA.radius &&
      position.y > ARENA.floorY - 2 &&
      position.y < ARENA.ceilingY
    );
  }

  summon(): Boss {
    const boss = new Boss();
    boss.onPhaseChange = (phase, label) => this.callbacks.onPhase(phase, label);
    boss.onShake = (intensity) => this.callbacks.onShake(intensity);
    boss.onDefeated = () => {
      this.defeated = true;
      this.callbacks.onVictory();
    };

    this.boss = this.entities.add(boss);
    this.callbacks.onSummon(BOSS_NAME);
    return boss;
  }

  update(): void {
    if (this.boss?.removed) this.boss = null;
  }

  /** Removes the boss and every summon, so the fight can start over. */
  reset(context: EntityContext): void {
    for (const entity of context.entities.entities) {
      if (entity.team === 'boss') context.entities.remove(entity);
    }
    context.entities.flushRemoved();
    this.boss = null;
    this.defeated = false;
  }

  /** Human readable direction to the altar, shown as a hint on the HUD. */
  describeAltarDirection(position: THREE.Vector3): string {
    const dx = ALTAR.x - position.x;
    const dz = ALTAR.z - position.z;
    const horizontal = Math.hypot(dx, dz);
    const depth = Math.round(position.y - ALTAR.y);

    if (horizontal < 6 && Math.abs(depth) < 4) return 'The altar is right here';

    const compass = Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 'east' : 'west') : dz > 0 ? 'south' : 'north';
    const depthText = depth > 2 ? `${depth} blocks below` : depth < -2 ? `${-depth} blocks above` : 'at your level';
    return `Altar: ${Math.round(horizontal)}m ${compass}, ${depthText}`;
  }
}
