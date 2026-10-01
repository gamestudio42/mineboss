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
  unlimited = false;
  readonly reserve = new Map<Block, number>();
  onOverflow: (() => void) | null = null;

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

    if (remaining > 0) {
      this.reserve.set(block, (this.reserve.get(block) ?? 0) + remaining);
      this.onOverflow?.();
    }
    return 0;
  }

  takeSelected(count = 1): Block | null {
    const slot = this.selectedSlot;
    if (slot.block === null || slot.count < count) return null;

    const block = slot.block;
    if (this.unlimited) return block;
    slot.count -= count;
    if (slot.count <= 0) slot.block = null;
    return block;
  }

  count(block: Block): number {
    return this.slots.reduce((sum, slot) => sum + (slot.block === block ? slot.count : 0), 0) + (this.reserve.get(block) ?? 0);
  }

  /** Check the entire cost first, then consume across hotbar and reserve. */
  remove(block: Block, count: number): boolean {
    if (!Number.isSafeInteger(count) || count <= 0 || this.count(block) < count) return false;
    let remaining = count;
    for (const slot of this.slots) {
      if (slot.block !== block) continue;
      const taken = Math.min(slot.count, remaining);
      slot.count -= taken; remaining -= taken;
      if (!slot.count) slot.block = null;
      if (!remaining) return true;
    }
    const rest = (this.reserve.get(block) ?? 0) - remaining;
    if (rest > 0) this.reserve.set(block, rest); else this.reserve.delete(block);
    return true;
  }

  clear(): void {
    this.reserve.clear();
    for (const slot of this.slots) {
      slot.block = null;
      slot.count = 0;
    }
  }

  equipReserve(block: Block): void {
    const count = this.reserve.get(block) ?? 0;
    if (!count) return;
    const slot = this.selectedSlot;
    const old = { ...slot };
    this.reserve.delete(block);
    slot.block = block;
    slot.count = Math.min(STACK_SIZE, count);
    if (count > STACK_SIZE) this.reserve.set(block, count - STACK_SIZE);
    if (old.block !== null && old.count > 0) this.reserve.set(old.block, (this.reserve.get(old.block) ?? 0) + old.count);
  }

  load(slots: Array<{ block: Block | null; count: number }>, selected: number): void {
    this.clear();
    for (let i = 0; i < HOTBAR_SLOTS; i++) {
      const source = slots[i];
      if (!source || source.block === null || source.count <= 0) continue;
      this.slots[i].block = source.block;
      this.slots[i].count = Math.min(STACK_SIZE, source.count);
    }
    this.select(selected);
  }
}
