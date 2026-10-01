import type { BlockAtlas } from '../render/atlas.ts';
import { Block, getBlockDef, TILE_SIDE, ATLAS_TILE_PX, ATLAS_TILES_PER_ROW } from '../world/blocks.ts';

export const CATALOG_GROUPS: Record<string, Block[]> = {
  '🌳 Natureza': [Block.Grass, Block.Dirt, Block.Sand, Block.Log, Block.BirchLog, Block.Leaves, Block.BirchLeaves],
  '🏠 Construção': [Block.Stone, Block.Cobblestone, Block.Planks, Block.DarkBrick, Block.Obsidian, Block.Glass],
  'Cores': [Block.White, Block.Red, Block.Orange, Block.Yellow, Block.Green, Block.Blue, Block.Purple, Block.Pink] ,
  '✨ Decoração': [Block.Glowstone, Block.Torch, Block.Bed],
};

export function blockGrid(atlas: BlockAtlas, items: Array<{ block: Block; count?: number }>, choose: (block: Block) => void, selected?: Block | null): HTMLElement {
  const grid = document.createElement('div');
  grid.className = 'block-grid';
  for (const { block, count } of items) {
    const button = document.createElement('button');
    button.type = 'button';
    const name = getBlockDef(block).name;
    button.setAttribute('aria-label', name);
    button.setAttribute('aria-pressed', String(block === selected));
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 48;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    const tile = TILE_SIDE[block];
    ctx.drawImage(atlas.canvas, tile % ATLAS_TILES_PER_ROW * ATLAS_TILE_PX, Math.floor(tile / ATLAS_TILES_PER_ROW) * ATLAS_TILE_PX, ATLAS_TILE_PX, ATLAS_TILE_PX, 0, 0, 48, 48);
    const label = document.createElement('span');
    label.textContent = name + (count === undefined ? ' ∞' : ` ×${count}`);
    button.append(canvas, label);
    button.onclick = () => choose(block);
    grid.append(button);
  }
  return grid;
}
