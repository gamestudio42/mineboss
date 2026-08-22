import { HammerTier } from '../player/Hammer.ts';
import { HOTBAR_SLOTS } from '../player/Inventory.ts';
import { BLOCKS } from '../world/blocks.ts';

const STORAGE_KEY = 'mineboss.run';
const SAVE_VERSION = 1;

export interface SavedSlot {
  block: number | null;
  count: number;
}

export interface SavedEdit {
  x: number;
  y: number;
  z: number;
  id: number;
}

export interface SavedRun {
  version: number;
  seed: number;
  elapsed: number;
  deaths: number;
  blocksMined: number;
  hintedConsumable: boolean;
  hintedUpgrade: boolean;
  hintedTorch: boolean;
  player: {
    x: number;
    y: number;
    z: number;
    yaw: number;
    pitch: number;
    spawnX: number;
    spawnY: number;
    spawnZ: number;
    health: number;
    hammer: HammerTier;
    selected: number;
    slots: SavedSlot[];
  };
  arena: {
    defeated: boolean;
    discovered: boolean;
    cacheClaimed?: boolean;
  };
  edits: SavedEdit[];
}

function isHammer(value: unknown): value is HammerTier {
  return value === HammerTier.Wood || value === HammerTier.Iron || value === HammerTier.Gold;
}

function isBlockId(value: number | null): boolean {
  if (value === null) return true;
  return Number.isInteger(value) && value >= 0 && value < BLOCKS.length;
}

export function loadSave(): SavedRun | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SavedRun>;
    if (parsed.version !== SAVE_VERSION) return null;
    if (typeof parsed.seed !== 'number' || typeof parsed.elapsed !== 'number') return null;
    if (!parsed.player || !parsed.arena || !Array.isArray(parsed.edits)) return null;
    if (!isHammer(parsed.player.hammer)) return null;
    if (!Array.isArray(parsed.player.slots) || parsed.player.slots.length !== HOTBAR_SLOTS) return null;
    for (const slot of parsed.player.slots) {
      if (typeof slot.count !== 'number' || !isBlockId(slot.block ?? null)) return null;
    }
    for (const edit of parsed.edits) {
      if (!Number.isInteger(edit?.x) || !Number.isInteger(edit?.y) || !Number.isInteger(edit?.z)) {
        return null;
      }
      if (!isBlockId(edit.id)) return null;
    }
    return parsed as SavedRun;
  } catch {
    return null;
  }
}

export function saveRun(run: SavedRun): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(run));
  } catch {
    // Private mode or a full quota should not break the game.
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore quota / private-mode failures.
  }
}

export function hasSave(): boolean {
  return loadSave() !== null;
}
