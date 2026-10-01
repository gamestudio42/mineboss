import { Block } from '../world/blocks.ts';

export const enum HammerTier {
  Wood = 0,
  Iron = 1,
  Gold = 2,
}

export interface HammerStats {
  name: string;
  /** Multiplier on block break speed. */
  mineSpeed: number;
  /** Multiplier on melee damage. */
  damage: number;
}

export const HAMMER: Record<HammerTier, HammerStats> = {
  [HammerTier.Wood]: { name: 'Martelo', mineSpeed: 1, damage: 1 },
  [HammerTier.Iron]: { name: 'Martelo de ferro', mineSpeed: 1.75, damage: 1.1 },
  [HammerTier.Gold]: { name: 'Martelo de ouro', mineSpeed: 1.35, damage: 1.55 },
};

export const UPGRADE_COST = 3;
/** Extra ore, after that metal's hammer, binds a vest that cuts incoming melee. */
export const PLATE_COST = 4;

export const enum PlateTier {
  None = 0,
  Iron = 1,
  Gold = 2,
}

export interface PlateStats {
  name: string;
  /** Fraction of boss and minion damage absorbed. */
  reduction: number;
}

export const PLATES: Record<PlateTier, PlateStats> = {
  [PlateTier.None]: { name: '', reduction: 0 },
  [PlateTier.Iron]: { name: 'Armadura de ferro', reduction: 0.28 },
  [PlateTier.Gold]: { name: 'Armadura de ouro', reduction: 0.42 },
};

export function platesFrom(block: Block): PlateTier | null {
  if (block === Block.IronOre) return PlateTier.Iron;
  if (block === Block.GoldOre) return PlateTier.Gold;
  return null;
}

export function isPlateTier(value: unknown): value is PlateTier {
  return value === PlateTier.None || value === PlateTier.Iron || value === PlateTier.Gold;
}

export function upgradeFrom(block: Block): HammerTier | null {
  if (block === Block.IronOre) return HammerTier.Iron;
  if (block === Block.GoldOre) return HammerTier.Gold;
  return null;
}

export function isUpgradeOre(block: Block): boolean {
  return upgradeFrom(block) !== null;
}
