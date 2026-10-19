import { HammerTier, PlateTier, isPlateTier } from '../player/Hammer.ts';
import { HOTBAR_SLOTS } from '../player/Inventory.ts';
import { BLOCKS } from '../world/blocks.ts';
import type { SavedOneBlock } from '../world/oneblock/OneBlock.ts';

const STORAGE_KEY = 'mineboss.run';
export const SAVE_VERSION = 5;
import type { GameMode } from './GameMode.ts';

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

export interface SavedPoint { x: number; y: number; z: number; }
export interface SavedInventory { slots: SavedSlot[]; selected: number; reserve: SavedSlot[]; }

export interface SavedRun {
  guidance?: boolean;
  tutorialDone?: boolean;
  creativePalette?: SavedInventory;
  home?: SavedPoint;
  updatedAt?: number;
  mode: GameMode;
  creative?: boolean;
  gentle?: boolean;
  edgeProtection?: boolean;
  reserve?: SavedSlot[];
  survival?: { slots: SavedSlot[]; selected: number; reserve: SavedSlot[] };
  trophies?: number[];

  version: number;
  seed: number;
  elapsed: number;
  deaths: number;
  blocksMined: number;
  hintedConsumable: boolean;
  hintedUpgrade: boolean;
  hintedTorch: boolean;
  hintedBed?: boolean;
  hintedPlates?: boolean;
  hintedStagger?: boolean;
  shownHints?: string[];
  player: {
    flying?: boolean;
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
    plates?: PlateTier;
    /** Legacy boolean from the first iron-only vest. */
    plated?: boolean;
    selected: number;
    slots: SavedSlot[];
  };
  arena: {
    defeated: boolean;
    discovered: boolean;
    cacheClaimed?: boolean;
    ruinFound?: boolean;
    ruinDefeated?: boolean;
    beaconDefeated?: boolean;
  };
  oneBlock: SavedOneBlock;
  edits: SavedEdit[];
}

function isHammer(value: unknown): value is HammerTier {
  return value === HammerTier.Wood || value === HammerTier.Iron || value === HammerTier.Gold;
}

function isBlockId(value: number | null): boolean {
  if (value === null) return true;
  return Number.isInteger(value) && value >= 0 && value < BLOCKS.length;
}

/** Validate imported files before touching the current world or browser storage. */
export function parseSave(raw: string, mode?: GameMode): SavedRun | null {
  try {
    if (raw.length > 20_000_000) return null;
    const parsed = JSON.parse(raw) as Partial<SavedRun>;
    const savedMode = parsed.version === 1 ? 'adventure' : parsed.version === 2 ? 'oneblock' : parsed.mode;
    if (savedMode !== 'adventure' && savedMode !== 'oneblock') return null;
    if (mode && savedMode !== mode) return null;
    if (![1, 2, 3, 4, SAVE_VERSION].includes(parsed.version ?? 0)) return null;
    parsed.mode = savedMode;
    if (parsed.version === 1) parsed.oneBlock = { broken: 0, phase: 0 };
    parsed.version = SAVE_VERSION;
    const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
    const count = (n: unknown): n is number => finite(n) && Number.isSafeInteger(n) && n >= 0;
    const coord = (n: unknown): n is number => finite(n) && Math.abs(n) <= 1_000_000;
    if (!Number.isSafeInteger(parsed.seed) || !finite(parsed.elapsed) || parsed.elapsed < 0) return null;
    if (!count(parsed.deaths) || !count(parsed.blocksMined)) return null;
    const p = parsed.player;
    if (!p || !parsed.arena || !parsed.oneBlock || !Array.isArray(parsed.edits)) return null;
    if (![p.x, p.y, p.z, p.spawnX, p.spawnY, p.spawnZ].every(coord)) return null;
    if (![p.yaw, p.pitch, p.health].every(finite) || p.health < 0 || p.health > 20) return null;
    if (!isHammer(p.hammer) || (p.plates !== undefined && !isPlateTier(p.plates))) return null;
    if (p.flying !== undefined && typeof p.flying !== 'boolean') return null;
    const slots = (s: unknown, hotbar: boolean): boolean => Array.isArray(s) &&
      (hotbar ? s.length === HOTBAR_SLOTS : s.length <= BLOCKS.length) && s.every(slot =>
        slot && (slot.block === null || (Number.isInteger(slot.block) && isBlockId(slot.block))) &&
        count(slot.count) && (!hotbar || slot.count <= 64));
    const selected = (n: unknown): boolean => count(n) && n < HOTBAR_SLOTS;
    if (!slots(p.slots, true) || !selected(p.selected)) return null;
    if (parsed.reserve !== undefined && !slots(parsed.reserve, false)) return null;
    if (parsed.survival && (!slots(parsed.survival.slots, true) || !slots(parsed.survival.reserve, false) || !selected(parsed.survival.selected))) return null;
    if (parsed.creativePalette && (!slots(parsed.creativePalette.slots, true) || !slots(parsed.creativePalette.reserve, false) || !selected(parsed.creativePalette.selected))) return null;
    if (parsed.home && ![parsed.home.x, parsed.home.y, parsed.home.z].every(coord)) return null;
    if (parsed.updatedAt !== undefined && !count(parsed.updatedAt)) return null;
    if (parsed.creative && (savedMode !== 'adventure' || !parsed.survival)) return null;
    for (const key of ['creative', 'gentle', 'edgeProtection', 'guidance', 'tutorialDone'] as const) {
      if (parsed[key] !== undefined && typeof parsed[key] !== 'boolean') return null;
    }
    if (typeof parsed.arena.defeated !== 'boolean' || typeof parsed.arena.discovered !== 'boolean') return null;
    for (const key of ['cacheClaimed', 'ruinFound', 'ruinDefeated', 'beaconDefeated'] as const) {
      if (parsed.arena[key] !== undefined && typeof parsed.arena[key] !== 'boolean') return null;
    }
    if (!count(parsed.oneBlock.broken) || parsed.oneBlock.broken > 1_000_000_000 || !count(parsed.oneBlock.phase)) return null;
    if (parsed.oneBlock.pace !== undefined && !['classic','quick'].includes(parsed.oneBlock.pace)) return null;
    if (parsed.oneBlock.goals !== undefined && (!Array.isArray(parsed.oneBlock.goals) || parsed.oneBlock.goals.some(goal => !['platform','shelter'].includes(goal)))) return null;
    if (parsed.trophies !== undefined && (!Array.isArray(parsed.trophies) || parsed.trophies.some(id => id !== 26 && id !== 27 && id !== 42))) return null;
    if (parsed.shownHints !== undefined && (!Array.isArray(parsed.shownHints) || parsed.shownHints.length > 32 || parsed.shownHints.some(id => typeof id !== 'string' || id.length === 0 || id.length > 32))) return null;
    if (parsed.edits.length > 300_000) return null;
    for (const edit of parsed.edits) {
      if (!edit || ![edit.x, edit.y, edit.z].every(n => coord(n) && Number.isInteger(n))) return null;
      if (edit.y < 0 || edit.y >= 128 || !Number.isInteger(edit.id) || !isBlockId(edit.id)) return null;
    }
    return parsed as SavedRun;
  } catch { return null; }
}

export function loadSave(mode: GameMode = 'adventure'): SavedRun | null {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}.${mode}`) ?? localStorage.getItem(STORAGE_KEY);
    return (raw ? parseSave(raw, mode) : null) ?? loadPreviousSave(mode);
  } catch { return null; }
}

export function loadPreviousSave(mode: GameMode): SavedRun | null {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}.${mode}.previous`);
    return raw ? parseSave(raw, mode) : null;
  } catch { return null; }
}

export function saveRun(run: SavedRun): boolean {
  try {
    const raw = JSON.stringify(run);
    if (!parseSave(raw, run.mode)) return false;
    const key = `${STORAGE_KEY}.${run.mode}`;
    const previous = localStorage.getItem(key);
    const previousRun = previous ? parseSave(previous, run.mode) : null;
    const recovery = loadPreviousSave(run.mode);
    // Keep a useful checkpoint instead of replacing it on every menu click.
    const checkpointDue = !recovery || !run.updatedAt ||
      run.updatedAt - (recovery.updatedAt ?? 0) >= 60_000 || previousRun?.seed !== run.seed;
    // Back up only valid data; a corrupted primary must not replace recovery.
    if (previous && previous !== raw && previousRun && checkpointDue) {
      localStorage.setItem(`${key}.previous`, previous);
    }
    localStorage.setItem(key, raw);
    return true;
  } catch {
    return false;
  }
}
