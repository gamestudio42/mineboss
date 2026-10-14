import { Block } from '../blocks.ts';

export const ISLAND_Y = 72;
export const ONE_BLOCK_X = 0;
export const ONE_BLOCK_Z = 0;
export const VOID_KILL_Y = 12;
export const PHASE_MOB_CAP = 4;

export type PhaseId =
  | 'plains'
  | 'woods'
  | 'garden'
  | 'underground'
  | 'wastes'
  | 'ore'
  | 'ember'
  | 'deep'
  | 'after';

export type OneBlockPace = 'classic' | 'quick';
export function paceScale(pace: OneBlockPace): number { return pace === 'quick' ? 4 : 1; }

export type StructureUnlock = 'ruin' | 'shrine' | 'beacon';

export interface WeightedBlock {
  id: Block;
  weight: number;
}

export interface PhaseExtra {
  id: Block;
  chance: number;
  /** Place beside the One Block instead of adding to the hotbar. */
  neighbor?: boolean;
}

export interface PhaseDef {
  id: PhaseId;
  name: string;
  /** Finite length, or 0 for an endless final phase. */
  length: number;
  blocks: readonly WeightedBlock[];
  mobChance: number;
  mobTint: number;
  extras?: readonly PhaseExtra[];
  unlock?: StructureUnlock;
}

export const PHASES: readonly PhaseDef[] = [
  {
    id: 'plains',
    name: 'Planície',
    // Lengths stay divisible by 4 so the quick pace (÷4) keeps integer thresholds.
    length: 40,
    mobChance: 0,
    mobTint: 0x6b8f4e,
    extras: [
      { id: Block.Planks, chance: 0.22 },
      { id: Block.Mushroom, chance: 0.18 },
    ],
    blocks: [
      { id: Block.Grass, weight: 30 },
      { id: Block.Dirt, weight: 22 },
      { id: Block.Log, weight: 16 },
      { id: Block.Planks, weight: 18 },
      { id: Block.Leaves, weight: 6 },
    ],
  },
  {
    id: 'woods',
    name: 'Floresta',
    length: 40,
    mobChance: 0,
    mobTint: 0x5a4030,
    extras: [
      { id: Block.Planks, chance: 0.25 },
      { id: Block.Mushroom, chance: 0.16 },
    ],
    blocks: [
      { id: Block.Log, weight: 24 },
      { id: Block.BirchLog, weight: 16 },
      { id: Block.Planks, weight: 28 },
      { id: Block.Dirt, weight: 14 },
      { id: Block.Leaves, weight: 6 },
      { id: Block.BirchLeaves, weight: 4 },
    ],
  },
  {
    id: 'garden',
    name: 'Jardim',
    length: 40,
    mobChance: 0,
    mobTint: 0x6b8f4e,
    extras: [
      { id: Block.Chest, chance: 0.1, neighbor: true },
      { id: Block.Mushroom, chance: 0.12 },
    ],
    blocks: [
      { id: Block.Moss, weight: 30 },
      { id: Block.Grass, weight: 16 },
      { id: Block.Dirt, weight: 14 },
      { id: Block.Flower, weight: 16 },
      { id: Block.Log, weight: 12 },
      { id: Block.Leaves, weight: 4 },
    ],
  },
  {
    id: 'underground',
    name: 'Cavernas',
    length: 120,
    mobChance: 0,
    mobTint: 0x6a6e78,
    extras: [
      { id: Block.CoalOre, chance: 0.18 },
      { id: Block.Chest, chance: 0.07, neighbor: true },
    ],
    blocks: [
      { id: Block.Stone, weight: 32 },
      { id: Block.Cobblestone, weight: 24 },
      { id: Block.CoalOre, weight: 18 },
      { id: Block.Gravel, weight: 12 },
      { id: Block.IronOre, weight: 10 },
      { id: Block.Dirt, weight: 4 },
    ],
  },
  {
    id: 'wastes',
    name: 'Deserto',
    length: 80,
    mobChance: 0,
    mobTint: 0xc4a36a,
    extras: [
      { id: Block.CoalOre, chance: 0.1 },
      { id: Block.Chest, chance: 0.05, neighbor: true },
    ],
    blocks: [
      { id: Block.Sand, weight: 40 },
      { id: Block.Gravel, weight: 22 },
      { id: Block.Cobblestone, weight: 20 },
      { id: Block.Sand, weight: 10 },
      { id: Block.Stone, weight: 8 },
    ],
  },
  {
    id: 'ore',
    name: 'Minérios',
    length: 100,
    mobChance: 0.045,
    mobTint: 0x8a9aaa,
    unlock: 'ruin',
    extras: [
      { id: Block.IronOre, chance: 0.15 },
      { id: Block.Chest, chance: 0.08, neighbor: true },
    ],
    blocks: [
      { id: Block.Stone, weight: 28 },
      { id: Block.IronOre, weight: 24 },
      { id: Block.CoalOre, weight: 20 },
      { id: Block.GoldOre, weight: 12 },
      { id: Block.Cobblestone, weight: 16 },
    ],
  },
  {
    id: 'ember',
    name: 'Brasas',
    length: 100,
    mobChance: 0.06,
    mobTint: 0x5a2a22,
    extras: [
      { id: Block.Lava, chance: 0.08, neighbor: true },
      { id: Block.Water, chance: 0.04, neighbor: true },
      { id: Block.Chest, chance: 0.06, neighbor: true },
    ],
    blocks: [
      { id: Block.DarkBrick, weight: 28 },
      { id: Block.Glowstone, weight: 18 },
      { id: Block.Obsidian, weight: 16 },
      { id: Block.Stone, weight: 22 },
      { id: Block.GoldOre, weight: 10 },
      { id: Block.CoalOre, weight: 6 },
    ],
  },
  {
    id: 'deep',
    name: 'Profundezas',
    length: 120,
    mobChance: 0.08,
    mobTint: 0x4a3870,
    unlock: 'shrine',
    extras: [
      { id: Block.CrystalOre, chance: 0.05 },
      { id: Block.Chest, chance: 0.07, neighbor: true },
    ],
    blocks: [
      { id: Block.Obsidian, weight: 24 },
      { id: Block.RunicStone, weight: 16 },
      { id: Block.CrystalOre, weight: 14 },
      { id: Block.GoldOre, weight: 16 },
      { id: Block.DarkBrick, weight: 18 },
      { id: Block.Glowstone, weight: 12 },
    ],
  },
  {
    id: 'after',
    name: 'Exploração livre',
    length: 0,
    unlock: 'beacon',
    mobChance: 0.07,
    mobTint: 0xc9a227,
    extras: [
      { id: Block.Mushroom, chance: 0.06 },
      { id: Block.Chest, chance: 0.04, neighbor: true },
    ],
    blocks: [
      { id: Block.Stone, weight: 16 },
      { id: Block.Dirt, weight: 10 },
      { id: Block.Log, weight: 10 },
      { id: Block.IronOre, weight: 12 },
      { id: Block.GoldOre, weight: 10 },
      { id: Block.CrystalOre, weight: 8 },
      { id: Block.Glowstone, weight: 8 },
      { id: Block.Obsidian, weight: 8 },
      { id: Block.Cobblestone, weight: 10 },
      { id: Block.DarkBrick, weight: 8 },
    ],
  },
];

const PHASE_START: number[] = [];
{
  let start = 0;
  for (const phase of PHASES) {
    PHASE_START.push(start);
    start += phase.length;
  }
}

export function isOneBlockCell(x: number, y: number, z: number): boolean {
  return x === ONE_BLOCK_X && y === ISLAND_Y && z === ONE_BLOCK_Z;
}

export function phaseAt(broken: number, pace: OneBlockPace = 'classic'): { phase: PhaseDef; index: number; local: number } {
  const count = Math.max(0, broken);
  for (let i = 0; i < PHASES.length; i++) {
    const phase = PHASES[i];
    const start = PHASE_START[i] / paceScale(pace);
    if (phase.length === 0 || count < start + phase.length / paceScale(pace)) {
      return { phase, index: i, local: count - start };
    }
  }
  const last = PHASES.length - 1;
  return { phase: PHASES[last], index: last, local: count - PHASE_START[last] };
}

/** Breaks required before the phase that unlocks a structure. */
export function unlockBreaks(kind: StructureUnlock, pace: OneBlockPace = 'classic'): number {
  let total = 0;
  for (const phase of PHASES) {
    if (phase.unlock === kind) return total / paceScale(pace);
    total += phase.length;
  }
  return total / paceScale(pace);
}

export interface ChestItem {
  id: Block;
  count: number;
}

/** Rolled when a chest is opened. Depends on the current phase, not on block metadata. */
export function chestLoot(phaseIndex: number): ChestItem[] {
  if (phaseIndex <= 2) {
    return [
      { id: Block.Dirt, count: 6 },
      { id: Block.Planks, count: 6 },
      { id: Block.Mushroom, count: 2 },
    ];
  }
  if (phaseIndex <= 4) {
    return [
      { id: Block.Cobblestone, count: 8 },
      { id: Block.CoalOre, count: 3 },
      { id: Block.Planks, count: 4 },
    ];
  }
  if (phaseIndex === 5) {
    return [
      { id: Block.IronOre, count: 3 },
      { id: Block.CoalOre, count: 4 },
      { id: Block.Planks, count: 4 },
    ];
  }
  return [
    { id: Block.GoldOre, count: 2 },
    { id: Block.Glowstone, count: 2 },
    { id: Block.Mushroom, count: 2 },
  ];
}

export function unlocksForBroken(broken: number, pace: OneBlockPace = 'classic'): { ruin: boolean; shrine: boolean; beacon: boolean } {
  const { index } = phaseAt(broken, pace);
  let ruin = false;
  let shrine = false;
  let beacon = false;
  for (let i = 0; i <= index; i++) {
    if (PHASES[i].unlock === 'ruin') ruin = true;
    if (PHASES[i].unlock === 'shrine') shrine = true;
    if (PHASES[i].unlock === 'beacon') beacon = true;
  }
  return { ruin, shrine, beacon };
}

export function pickWeighted(blocks: readonly WeightedBlock[], roll: number): Block {
  let total = 0;
  for (const entry of blocks) total += entry.weight;
  let cursor = roll * total;
  for (const entry of blocks) {
    cursor -= entry.weight;
    if (cursor <= 0) return entry.id;
  }
  return blocks[blocks.length - 1].id;
}

export function startingOneBlock(): Block {
  return Block.Grass;
}

export function phaseProgressLabel(broken: number, pace: OneBlockPace = 'classic'): string {
  const { phase, local } = phaseAt(broken, pace);
  if (phase.length === 0) return `${phase.name}`;
  return `${phase.name} ${Math.min(local, phase.length / paceScale(pace))} / ${phase.length / paceScale(pace)}`;
}
