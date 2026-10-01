import { Block } from '../blocks.ts';

export const ISLAND_Y = 72;
export const ONE_BLOCK_X = 0;
export const ONE_BLOCK_Z = 0;
export const VOID_KILL_Y = 12;
export const PHASE_MOB_CAP = 4;

export type PhaseId =
  | 'plains'
  | 'woods'
  | 'underground'
  | 'wastes'
  | 'ore'
  | 'ember'
  | 'deep'
  | 'after';

export type OneBlockPace = 'classic' | 'quick';
export function paceScale(pace: OneBlockPace): number { return pace === 'quick' ? 4 : 1; }

export type StructureUnlock = 'ruin' | 'shrine';

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
    extras: [{ id: Block.Mushroom, chance: 0.12 }],
    name: 'Planície',
    length: 80,
    mobChance: 0,
    mobTint: 0x6b8f4e,
    blocks: [
      { id: Block.Grass, weight: 36 },
      { id: Block.Dirt, weight: 28 },
      { id: Block.Log, weight: 16 },
      { id: Block.Leaves, weight: 8 },
      { id: Block.Dirt, weight: 12 },
    ],
  },
  {
    id: 'woods',
    name: 'Floresta',
    length: 80,
    mobChance: 0.02,
    mobTint: 0x5a4030,
    blocks: [
      { id: Block.Log, weight: 28 },
      { id: Block.BirchLog, weight: 18 },
      { id: Block.Planks, weight: 16 },
      { id: Block.Dirt, weight: 20 },
      { id: Block.Leaves, weight: 10 },
      { id: Block.BirchLeaves, weight: 8 },
    ],
  },
  {
    id: 'underground',
    name: 'Cavernas',
    length: 120,
    mobChance: 0.03,
    mobTint: 0x6a6e78,
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
    mobChance: 0.035,
    mobTint: 0xc4a36a,
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
    extras: [{ id: Block.CrystalOre, chance: 0.05 }],
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
    mobChance: 0.07,
    mobTint: 0xc9a227,
    extras: [{ id: Block.Mushroom, chance: 0.06 }],
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

export function unlocksForBroken(broken: number, pace: OneBlockPace = 'classic'): { ruin: boolean; shrine: boolean } {
  const { index } = phaseAt(broken, pace);
  let ruin = false;
  let shrine = false;
  for (let i = 0; i <= index; i++) {
    if (PHASES[i].unlock === 'ruin') ruin = true;
    if (PHASES[i].unlock === 'shrine') shrine = true;
  }
  return { ruin, shrine };
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
