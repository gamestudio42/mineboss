import { ALTAR, isRuinStatueColumn } from '../world/arena.ts';
import { isSolid } from '../world/blocks.ts';
import { isOneBlockCell } from '../world/oneblock/phases.ts';
import type { World } from '../world/World.ts';

export interface BuildEdit { x: number; y: number; z: number; before: number; after: number; previousEdit?: number; }
const LIMIT = 50;
/** Bounded, session-local history. Never restores a block over the player. */
export class BuildHistory {
  private readonly past: BuildEdit[] = [];
  private readonly future: BuildEdit[] = [];
  get canUndo(): boolean { return this.past.length > 0; }
  get canRedo(): boolean { return this.future.length > 0; }
  clear(): void { this.past.length = this.future.length = 0; }
  record(edit: BuildEdit): void {
    this.future.length = 0;
    if (isOneBlockCell(edit.x, edit.y, edit.z) || isRuinStatueColumn(edit.x, edit.z) ||
      (Math.abs(edit.x - ALTAR.x) <= 2 && Math.abs(edit.z - ALTAR.z) <= 2 && Math.abs(edit.y - ALTAR.y) <= 3)) return;
    this.past.push({ ...edit });
    if (this.past.length > LIMIT) this.past.shift();
  }
  undo(world: World, intersects: (x: number, y: number, z: number) => boolean): boolean {
    return this.restore(world, intersects, false);
  }
  redo(world: World, intersects: (x: number, y: number, z: number) => boolean): boolean {
    return this.restore(world, intersects, true);
  }
  private restore(world: World, intersects: (x: number, y: number, z: number) => boolean, redo: boolean): boolean {
    const source = redo ? this.future : this.past;
    const edit = source.at(-1);
    if (!edit) return false;
    world.ensureChunk(edit.x >> 4, edit.z >> 4);
    const expected = redo ? edit.before : edit.after;
    const next = redo ? edit.after : edit.before;
    if (world.getBlock(edit.x, edit.y, edit.z) !== expected) { this.clear(); return false; }
    if (isSolid(next) && intersects(edit.x, edit.y, edit.z)) return false;
    if (!world.setBlock(edit.x, edit.y, edit.z, next)) return false;
    if (!redo) {
      const key = `${edit.x},${edit.y},${edit.z}`;
      if (edit.previousEdit === undefined) world.edits.delete(key);
      else world.edits.set(key, edit.previousEdit);
    }
    source.pop();
    (redo ? this.past : this.future).push(edit);
    return true;
  }
}
