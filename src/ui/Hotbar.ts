import type { BlockAtlas } from '../render/atlas.ts';
import type { Inventory } from '../player/Inventory.ts';
import { HOTBAR_SLOTS } from '../player/Inventory.ts';
import { ATLAS_TILE_PX, ATLAS_TILES_PER_ROW, TILE_SIDE } from '../world/blocks.ts';

const ICON_PX = 40;

interface SlotView {
  root: HTMLElement;
  context: CanvasRenderingContext2D;
  count: HTMLElement;
  renderedBlock: number | null;
}

/** Nine DOM slots that draw their icon straight from the texture atlas canvas. */
export class Hotbar {
  private readonly slots: SlotView[] = [];
  private activeIndex = -1;

  constructor(
    root: HTMLElement,
    private readonly atlas: BlockAtlas,
  ) {
    for (let i = 0; i < HOTBAR_SLOTS; i++) {
      const slot = document.createElement('div');
      slot.className = 'slot';

      const canvas = document.createElement('canvas');
      canvas.width = ICON_PX;
      canvas.height = ICON_PX;

      const count = document.createElement('span');
      count.className = 'count';

      slot.append(canvas, count);
      root.append(slot);

      const context = canvas.getContext('2d');
      if (!context) throw new Error('2D canvas context unavailable');
      context.imageSmoothingEnabled = false;

      this.slots.push({ root: slot, context, count, renderedBlock: null });
    }
  }

  update(inventory: Inventory): void {
    if (this.activeIndex !== inventory.selected) {
      this.slots[this.activeIndex]?.root.classList.remove('active');
      this.slots[inventory.selected].root.classList.add('active');
      this.activeIndex = inventory.selected;
    }

    for (let i = 0; i < this.slots.length; i++) {
      const view = this.slots[i];
      const slot = inventory.slots[i];
      const block = slot.count > 0 ? slot.block : null;

      if (view.renderedBlock !== block) {
        view.renderedBlock = block;
        view.context.clearRect(0, 0, ICON_PX, ICON_PX);
        if (block !== null) this.drawIcon(view.context, block);
      }

      const label = slot.count > 1 ? String(slot.count) : '';
      if (view.count.textContent !== label) view.count.textContent = label;
    }
  }

  private drawIcon(context: CanvasRenderingContext2D, block: number): void {
    const tile = TILE_SIDE[block];
    const sx = (tile % ATLAS_TILES_PER_ROW) * ATLAS_TILE_PX;
    const sy = Math.floor(tile / ATLAS_TILES_PER_ROW) * ATLAS_TILE_PX;
    context.drawImage(
      this.atlas.canvas,
      sx,
      sy,
      ATLAS_TILE_PX,
      ATLAS_TILE_PX,
      0,
      0,
      ICON_PX,
      ICON_PX,
    );
  }
}
