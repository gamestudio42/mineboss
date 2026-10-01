import { Block, getBlockDef } from '../world/blocks.ts';
import { HammerTier, PlateTier } from './Hammer.ts';
import type { Player } from './Player.ts';

export interface Recipe {
  id: string; name: string; ingredient: Block; cost: number; icon: Block;
  output?: Block; amount?: number; hammer?: HammerTier; plates?: PlateTier;
}
export const RECIPES: readonly Recipe[] = [
  { id: 'torch', name: '4 tochas', ingredient: Block.CoalOre, cost: 1, icon: Block.Torch, output: Block.Torch, amount: 4 },
  { id: 'bed', name: 'Cama', ingredient: Block.Planks, cost: 4, icon: Block.Bed, output: Block.Bed, amount: 1 },
  { id: 'iron-hammer', name: 'Martelo de ferro', ingredient: Block.IronOre, cost: 3, icon: Block.IronOre, hammer: HammerTier.Iron },
  { id: 'gold-hammer', name: 'Martelo de ouro', ingredient: Block.GoldOre, cost: 3, icon: Block.GoldOre, hammer: HammerTier.Gold },
  { id: 'iron-armor', name: 'Armadura de ferro', ingredient: Block.IronOre, cost: 4, icon: Block.IronOre, plates: PlateTier.Iron },
  { id: 'gold-armor', name: 'Armadura de ouro', ingredient: Block.GoldOre, cost: 4, icon: Block.GoldOre, plates: PlateTier.Gold },
];
export function recipeStatus(player: Player, recipe: Recipe): string | null {
  if (player.creative || player.dead) return 'Disponível na Sobrevivência';
  if (recipe.hammer !== undefined && player.hammerTier >= recipe.hammer) return 'Você já tem';
  if (recipe.plates !== undefined) {
    if (player.plates >= recipe.plates) return 'Você já tem';
    if (player.hammerTier < recipe.plates) return 'Faça o martelo deste metal primeiro';
  }
  if (player.inventory.count(recipe.ingredient) < recipe.cost) return `Precisa de ${recipe.cost} ${getBlockDef(recipe.ingredient).name.toLowerCase()}`;
  return null;
}
export function craftRecipe(player: Player, id: string): boolean {
  const recipe = RECIPES.find(item => item.id === id);
  if (!recipe || recipeStatus(player, recipe)) return false;
  if (!player.inventory.remove(recipe.ingredient, recipe.cost)) return false;
  if (recipe.output !== undefined) player.inventory.add(recipe.output, recipe.amount);
  if (recipe.hammer !== undefined) player.hammerTier = recipe.hammer;
  if (recipe.plates !== undefined) player.plates = recipe.plates;
  return true;
}
