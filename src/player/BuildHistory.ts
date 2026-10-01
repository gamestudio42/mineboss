import { ALTAR, isRuinStatueColumn } from '../world/arena.ts';
import { isSolid } from '../world/blocks.ts';
import { isOneBlockCell } from '../world/oneblock/phases.ts';
import type { World } from '../world/World.ts';

export interface BuildEdit { x: number; y: number; z: number; before: number; after: number; previousEdit?: number; }
/** A single, session-local undo, populated only by player building actions. */
export class BuildHistory {
  private last: BuildEdit | null = null;
  clear(): void { this.last = null; }
  record(edit: BuildEdit): void {
    if (isOneBlockCell(edit.x, edit.y, edit.z) || isRuinStatueColumn(edit.x, edit.z) ||
      (Math.abs(edit.x - ALTAR.x) <= 2 && Math.abs(edit.z - ALTAR.z) <= 2 && Math.abs(edit.y - ALTAR.y) <= 3)) {
      this.clear(); return;
    }
    this.last = edit;
  }
  undo(world: World, intersects: (x: number, y: number, z: number) => boolean): boolean {
    const edit = this.last;
    if (!edit) return false;
    world.ensureChunk(edit.x >> 4, edit.z >> 4);
    if (world.getBlock(edit.x, edit.y, edit.z) !== edit.after) { this.clear(); return false; }
    if (isSolid(edit.before) && intersects(edit.x, edit.y, edit.z)) return false;
    if (!world.setBlock(edit.x, edit.y, edit.z, edit.before)) return false;
    const key = `${edit.x},${edit.y},${edit.z}`;
    if (edit.previousEdit === undefined) world.edits.delete(key);
    else world.edits.set(key, edit.previousEdit);
    this.clear();
    return true;
  }
}
