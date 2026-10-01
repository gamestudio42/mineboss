import { RECIPES, recipeStatus } from '../player/Recipes.ts';
import type { Player } from '../player/Player.ts';
import type { BlockAtlas } from '../render/atlas.ts';
import { blockGrid } from './BlockCatalog.ts';
import { getBlockDef } from '../world/blocks.ts';

export function recipePanel(atlas: BlockAtlas, player: Player, craft: (id: string) => void): HTMLElement {
  const panel = document.createElement('div'); panel.className = 'recipe-grid';
  for (const recipe of RECIPES) {
    const tile = blockGrid(atlas, [{ block: recipe.icon }], () => craft(recipe.id));
    const button = tile.querySelector('button')!;
    const label = tile.querySelector('span')!;
    const status = recipeStatus(player, recipe);
    button.disabled = status !== null;
    button.removeAttribute('aria-pressed');
    button.setAttribute('aria-label', 'Criar ' + recipe.name);
    if (recipe.hammer !== undefined || recipe.plates !== undefined) {
      const ctx = tile.querySelector('canvas')!.getContext('2d')!;
      ctx.clearRect(0, 0, 48, 48);
      const gold = recipe.hammer === 2 || recipe.plates === 2;
      ctx.fillStyle = gold ? '#ffc748' : '#bbcbd6';
      ctx.strokeStyle = '#283445'; ctx.lineWidth = 3;
      if (recipe.hammer !== undefined) {
        ctx.fillRect(6, 5, 36, 17); ctx.strokeRect(6, 5, 36, 17);
        ctx.fillStyle = '#986335'; ctx.fillRect(20, 22, 8, 23); ctx.strokeRect(20, 22, 8, 23);
      } else {
        ctx.beginPath(); ctx.moveTo(7, 4); ctx.lineTo(17, 4); ctx.lineTo(24, 12);
        ctx.lineTo(31, 4); ctx.lineTo(41, 4); ctx.lineTo(37, 22); ctx.lineTo(37, 44);
        ctx.lineTo(11, 44); ctx.lineTo(11, 22); ctx.closePath(); ctx.fill(); ctx.stroke();
      }
    }
    label.textContent = recipe.name;
    const cost = document.createElement('span');
    cost.textContent = `${recipe.cost} ${getBlockDef(recipe.ingredient).name} · você tem ${player.inventory.count(recipe.ingredient)}`;
    const result = document.createElement('small'); result.textContent = status ?? 'Criar';
    button.append(cost, result); panel.append(tile);
  }
  return panel;
}
