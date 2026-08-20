import type * as THREE from 'three';

import type { EntityManager } from '../EntityManager.ts';
import type { EntityContext } from '../Entity.ts';
import type { Player } from '../../player/Player.ts';
import { Block } from '../../world/blocks.ts';
import type { World } from '../../world/World.ts';
import {
  ALTAR,
  ARENA,
  ENTRANCE,
  ENTRANCE_SPAWN,
  distanceToArenaCenter,
  isInsideArena,
} from '../../world/arena.ts';
import { Boss, BOSS_NAME } from './Boss.ts';

export interface ArenaCallbacks {
  onSummon: (name: string) => void;
  onPhase: (phase: number, label: string) => void;
  onVictory: () => void;
  onShake: (intensity: number) => void;
}

export type GuideStage = 'surface' | 'stairs' | 'altar' | 'fight' | 'done';

export interface GuideTarget {
  x: number;
  y: number;
  z: number;
}

/** Owns the encounter: summoning, phase notifications, cleanup and reset. */
export class BossArena {
  boss: Boss | null = null;
  defeated = false;
  /** Set the first time the player walks into the arena; used as a respawn. */
  discovered = false;

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

  /**
   * The first time the player enters the chamber, lock spawn to the doorway
   * so a death does not send them back to the surface.
   */
  tryDiscover(player: Player): void {
    if (this.discovered) return;
    if (!isInsideArena(player.position.x, player.position.y, player.position.z)) return;

    this.discovered = true;
    player.setSpawn(ENTRANCE_SPAWN.x, ENTRANCE_SPAWN.y, ENTRANCE_SPAWN.z);
  }

  /** Clears the hunt so a new game can wake the Warden again. */
  beginNewRun(): void {
    this.defeated = false;
    this.discovered = false;
    this.boss = null;
  }

  /**
   * Removes the boss and every summon. Leaves `defeated` alone so a later
   * death while exploring cannot reopen a finished fight.
   */
  reset(context: EntityContext): void {
    for (const entity of context.entities.entities) {
      if (entity.team === 'boss') context.entities.remove(entity);
    }
    context.entities.flushRemoved();
    this.boss = null;
    if (!this.defeated) this.rebuildAltar(context.world);
  }

  /** Rebuilds the 5x5 obsidian plinth, 3x3 runes and the crystal cap. */
  rebuildAltar(world: World): void {
    for (let dz = -2; dz <= 2; dz++) {
      for (let dx = -2; dx <= 2; dx++) {
        const x = ALTAR.x + dx;
        const z = ALTAR.z + dz;
        world.setBlock(x, ARENA.floorY + 1, z, Block.Obsidian);

        const inner = Math.abs(dx) <= 1 && Math.abs(dz) <= 1;
        world.setBlock(x, ARENA.floorY + 2, z, inner ? Block.RunicStone : Block.Air);
        world.setBlock(
          x,
          ARENA.floorY + 3,
          z,
          dx === 0 && dz === 0 ? Block.CrystalOre : Block.Air,
        );
      }
    }
  }

  guideStage(position: THREE.Vector3): GuideStage {
    if (this.defeated) return 'done';
    if (this.active) return 'fight';
    if (isInsideArena(position.x, position.y, position.z)) return 'altar';
    if (this.nearStairs(position)) return 'stairs';
    return 'surface';
  }

  /** Point the compass at the shrine until the player is inside, then the altar. */
  guideTarget(position: THREE.Vector3): GuideTarget | null {
    const stage = this.guideStage(position);
    if (stage === 'fight' || stage === 'done') return null;
    if (stage === 'altar') return { x: ALTAR.x + 0.5, y: ALTAR.y, z: ALTAR.z + 0.5 };
    if (stage === 'stairs') return { x: ENTRANCE.x + 0.5, y: ARENA.floorY + 1, z: ENTRANCE.z + 0.5 };
    return { x: ENTRANCE.x + 0.5, y: position.y, z: ENTRANCE.z + 0.5 };
  }

  objectiveText(position: THREE.Vector3): string | null {
    switch (this.guideStage(position)) {
      case 'surface':
        return 'Follow the shrine — or the compass';
      case 'stairs':
        return 'Descend the stairs into the dark';
      case 'altar':
        return 'Right click the runic altar';
      case 'fight':
        return 'Stagger it, then strike — eat to recover';
      default:
        return null;
    }
  }

  /** Human readable direction to the current guide target. */
  describeAltarDirection(position: THREE.Vector3): string {
    const target = this.guideTarget(position);
    if (!target) return '';

    const dx = target.x - position.x;
    const dz = target.z - position.z;
    const horizontal = Math.hypot(dx, dz);
    const depth = Math.round(position.y - target.y);

    if (horizontal < 6 && Math.abs(depth) < 4) return 'The altar is right here';

    const compass = Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 'east' : 'west') : dz > 0 ? 'south' : 'north';
    const depthText = depth > 2 ? `${depth} blocks below` : depth < -2 ? `${-depth} blocks above` : 'at your level';
    return `Altar: ${Math.round(horizontal)}m ${compass}, ${depthText}`;
  }

  private nearStairs(position: THREE.Vector3): boolean {
    const dx = position.x - ENTRANCE.x;
    const dz = position.z - ENTRANCE.z;
    const horizontal = Math.hypot(dx, dz);
    const inShaft = Math.max(Math.abs(dx), Math.abs(dz)) <= ENTRANCE.shaft + 2;
    const descending = inShaft && position.y < ARENA.ceilingY + 16;
    return horizontal < 8 || descending;
  }
}
