import { hash2 } from '../../core/math.ts';
import { Minion } from '../../entities/boss/Minion.ts';
import type { EntityManager } from '../../entities/EntityManager.ts';
import type { Player } from '../../player/Player.ts';
import { Block, isSolid, getBlockDef } from '../blocks.ts';
import type { World } from '../World.ts';
import {
  ISLAND_Y,
  ONE_BLOCK_X,
  ONE_BLOCK_Z,
  PHASE_MOB_CAP,
  phaseAt,
  type OneBlockPace,
  phaseProgressLabel,
  pickWeighted,
  startingOneBlock,
  unlockBreaks,
  unlocksForBroken,
  type PhaseDef,
  type StructureUnlock,
} from './phases.ts';

const NEIGHBORS: ReadonlyArray<[number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

export interface OneBlockBreakResult {
  next: Block;
  unlocked: StructureUnlock | null;
  spawnedMob: boolean;
}

export interface SavedOneBlock {
  broken: number;
  phase: number;
  pace?: OneBlockPace;
  goals?: string[];
}

/** Regenerating core block, phase table and the mobs that crawl out of it. */
export class OneBlock {
  broken = 0;
  gentle = true;
  pace: OneBlockPace = 'classic';
  readonly goals = new Set<string>();
  private pendingMob = 0;
  onWarning: (() => void) | null = null;

  constructor(private seed: number) {}

  reset(seed: number, pace: OneBlockPace = 'classic'): void {
    this.pace = pace;
    this.goals.clear();
    this.seed = seed;
    this.broken = 0;
    this.pendingMob = 0;
  }

  load(saved: SavedOneBlock): void {
    this.pendingMob = 0;
    this.broken = Math.max(0, saved.broken | 0);
    this.pace = saved.pace ?? 'classic';
    this.goals.clear();
    for (const goal of saved.goals ?? []) this.goals.add(goal);
  }

  snapshot(): SavedOneBlock {
    return { broken: this.broken, phase: this.phaseIndex, pace: this.pace, goals: [...this.goals] };
  }

  get phase(): PhaseDef {
    return phaseAt(this.broken, this.pace).phase;
  }

  get phaseIndex(): number {
    return phaseAt(this.broken, this.pace).index;
  }

  get label(): string {
    return phaseProgressLabel(this.broken, this.pace);
  }

  get ruinUnlocked(): boolean {
    return unlocksForBroken(this.broken, this.pace).ruin;
  }

  get shrineUnlocked(): boolean {
    return unlocksForBroken(this.broken, this.pace).shrine;
  }

  get ruinAt(): number { return unlockBreaks('ruin', this.pace); }
  get shrineAt(): number { return unlockBreaks('shrine', this.pace); }

  get beaconUnlocked(): boolean {
    return unlocksForBroken(this.broken, this.pace).beacon;
  }

  get beaconAt(): number { return unlockBreaks('beacon', this.pace); }

  goalProgress(world: World): Array<{ id: string; label: string; current: number; target: number; reward: Block; count: number }> {
    let platform = 0, shelter = 0;
    for (const [key, block] of world.edits) {
      const [x,y,z] = key.split(',').map(Number);
      if (Math.abs(x) > 8 || Math.abs(z) > 8 || !isSolid(block) || getBlockDef(block).contactDamage) continue;
      if (y === ISLAND_Y && (x !== 0 || z !== 0)) platform++;
      if (y > ISLAND_Y && y <= ISLAND_Y + 6 && [Block.Planks, Block.Log, Block.Cobblestone, Block.Glass, Block.Moss].includes(block)) shelter++;
    }
    return [
      { id: 'platform', label: 'Amplie a ilha: 8 blocos de chão', current: platform, target: 8, reward: Block.Planks, count: 16 },
      { id: 'shelter', label: 'Comece um abrigo: 16 peças acima do chão', current: shelter, target: 16, reward: Block.Glass, count: 8 },
    ];
  }

  claimGoals(world: World, player: Player): string[] {
    const earned: string[] = [];
    for (const goal of this.goalProgress(world)) {
      if (this.goals.has(goal.id) || goal.current < goal.target) continue;
      this.goals.add(goal.id); player.inventory.add(goal.reward, goal.count); earned.push(goal.label);
    }
    return earned;
  }

  placeInitial(world: World): void {
    world.setBlock(ONE_BLOCK_X, ISLAND_Y - 1, ONE_BLOCK_Z, Block.Bedrock);
    world.setBlock(ONE_BLOCK_X, ISLAND_Y, ONE_BLOCK_Z, startingOneBlock());
  }

  /**
   * Replaces the core in-place (never air) after a successful mine.
   * The caller already granted the drop for the block that was broken.
   */
  break(world: World, player: Player, entities: EntityManager): OneBlockBreakResult {
    const before = unlocksForBroken(this.broken, this.pace);
    this.broken += 1;
    const after = unlocksForBroken(this.broken, this.pace);
    const phase = this.phase;

    const next = pickWeighted(phase.blocks, hash2(this.broken, 11, this.seed));
    world.setBlock(ONE_BLOCK_X, ISLAND_Y, ONE_BLOCK_Z, next);

    this.applyExtras(world, player, phase);

    let unlocked: StructureUnlock | null = null;
    if (after.beacon && !before.beacon) unlocked = 'beacon';
    else if (after.shrine && !before.shrine) unlocked = 'shrine';
    else if (after.ruin && !before.ruin) unlocked = 'ruin';

    const spawnedMob = this.trySpawnMob(world, entities, phase);
    return { next, unlocked, spawnedMob };
  }

  private applyExtras(world: World, player: Player, phase: PhaseDef): void {
    if (!phase.extras) return;

    for (const extra of phase.extras) {
      const roll = hash2(this.broken, extra.id * 19 + (extra.neighbor ? 7 : 3), this.seed);
      if (roll >= extra.chance) continue;

      if (this.gentle && extra.id === Block.Lava) continue;
      if (extra.neighbor) {
        this.placeNeighbor(world, extra.id);
        continue;
      }

      player.inventory.add(extra.id, 1);
    }
  }

  private placeNeighbor(world: World, id: Block): void {
    const start = Math.floor(hash2(this.broken, id, this.seed) * NEIGHBORS.length);
    for (let i = 0; i < NEIGHBORS.length; i++) {
      const [dx, dz] = NEIGHBORS[(start + i) % NEIGHBORS.length];
      const x = ONE_BLOCK_X + dx;
      const z = ONE_BLOCK_Z + dz;
      if (world.getBlock(x, ISLAND_Y, z) !== Block.Air) continue;
      world.setBlock(x, ISLAND_Y, z, id);
      return;
    }
  }

  private trySpawnMob(_world: World, entities: EntityManager, phase: PhaseDef): boolean {
    if (phase.mobChance <= 0 || this.pendingMob > 0) return false;
    if (hash2(this.broken, 97, this.seed) >= phase.mobChance * (this.gentle ? 0.4 : 1)) return false;

    let live = 0;
    for (const entity of entities.entities) {
      if (!entity.removed && entity instanceof Minion && !entity.clearedOnDeath) live += 1;
    }
    if (live >= PHASE_MOB_CAP) return false;

    this.pendingMob = this.gentle ? 3 : 2;
    this.onWarning?.();
    return false;
  }

  cancelWarning(): void { this.pendingMob = 0; }

  update(dt: number, world: World, entities: EntityManager, player?: Player): void {
    if (this.pendingMob <= 0) return;
    this.pendingMob -= dt;
    if (this.pendingMob > 0) return;
    const phase = this.phase;
    const live = entities.entities.filter(e => !e.removed && e instanceof Minion && !e.clearedOnDeath);
    if (live.length >= PHASE_MOB_CAP) { this.pendingMob = 1; return; }
    const spot = this.mobSpawn(world, player, live);
    if (!spot) { this.pendingMob = 1; return; }
    entities.add(
      new Minion(spot.x, spot.y, spot.z, {
        lifetime: 90,
        color: phase.mobTint,
        clearedOnDeath: false,
      }),
    );
  }

  private mobSpawn(world: World, player?: Player, live: readonly { position: { x: number; z: number } }[] = []): { x: number; y: number; z: number } | null {
    const start = Math.floor(hash2(this.broken, 53, this.seed) * NEIGHBORS.length);
    for (let i = 0; i < NEIGHBORS.length; i++) {
      const [dx, dz] = NEIGHBORS[(start + i) % NEIGHBORS.length];
      const x = ONE_BLOCK_X + dx;
      const z = ONE_BLOCK_Z + dz;
      // Leave room around the player and existing mobs, even on tiny islands.
      if (player && Math.hypot(player.position.x - x - 0.5, player.position.z - z - 0.5) < 1) continue;
      if (live.some(e => Math.hypot(e.position.x - x - 0.5, e.position.z - z - 0.5) < 1)) continue;
      const feet = world.getBlock(x, ISLAND_Y, z);
      const head = world.getBlock(x, ISLAND_Y + 1, z);
      if (isSolid(feet) && getBlockDef(feet).contactDamage === 0 && head === Block.Air && world.getBlock(x, ISLAND_Y + 2, z) === Block.Air) {
        return { x: x + 0.5, y: ISLAND_Y + 1, z: z + 0.5 };
      }
      const floor = world.getBlock(x, ISLAND_Y - 1, z);
      if (feet === Block.Air && head === Block.Air && isSolid(floor) && getBlockDef(floor).contactDamage === 0) {
        return { x: x + 0.5, y: ISLAND_Y, z: z + 0.5 };
      }
    }
    return null;
  }
}
