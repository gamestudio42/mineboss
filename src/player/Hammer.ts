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
  [HammerTier.Wood]: { name: 'Hammer', mineSpeed: 1, damage: 1 },
  [HammerTier.Iron]: { name: 'Iron hammer', mineSpeed: 1.75, damage: 1.1 },
  [HammerTier.Gold]: { name: 'Gold hammer', mineSpeed: 1.35, damage: 1.55 },
};

export const UPGRADE_COST = 3;

export function upgradeFrom(block: Block): HammerTier | null {
  if (block === Block.IronOre) return HammerTier.Iron;
  if (block === Block.GoldOre) return HammerTier.Gold;
  return null;
}

export function isUpgradeOre(block: Block): boolean {
  return upgradeFrom(block) !== null;
}
