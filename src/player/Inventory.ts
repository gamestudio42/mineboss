import type { Block } from '../world/blocks.ts';

export const HOTBAR_SLOTS = 9;
export const STACK_SIZE = 64;

export interface Slot {
  block: Block | null;
  count: number;
}

/** Nine stack slots; the game only exposes the hotbar, there is no deep inventory. */
export class Inventory {
  readonly slots: Slot[] = Array.from({ length: HOTBAR_SLOTS }, () => ({
    block: null,
    count: 0,
  }));

  selected = 0;

  get selectedSlot(): Slot {
    return this.slots[this.selected];
  }

  select(index: number): void {
    this.selected = ((index % HOTBAR_SLOTS) + HOTBAR_SLOTS) % HOTBAR_SLOTS;
  }

  cycle(direction: number): void {
    this.select(this.selected + Math.sign(direction));
  }

  /** Fills existing stacks first, then empty slots. Returns the leftover count. */
  add(block: Block, count = 1): number {
    let remaining = count;

    for (const slot of this.slots) {
      if (remaining === 0) break;
      if (slot.block !== block || slot.count >= STACK_SIZE) continue;
      const room = STACK_SIZE - slot.count;
      const moved = Math.min(room, remaining);
      slot.count += moved;
      remaining -= moved;
    }

    for (const slot of this.slots) {
      if (remaining === 0) break;
      if (slot.block !== null && slot.count > 0) continue;
      slot.block = block;
      slot.count = Math.min(STACK_SIZE, remaining);
      remaining -= slot.count;
    }

    return remaining;
  }

  takeSelected(count = 1): Block | null {
    const slot = this.selectedSlot;
    if (slot.block === null || slot.count < count) return null;

    const block = slot.block;
    slot.count -= count;
    if (slot.count <= 0) slot.block = null;
    return block;
  }

  clear(): void {
    for (const slot of this.slots) {
      slot.block = null;
      slot.count = 0;
    }
  }
}
