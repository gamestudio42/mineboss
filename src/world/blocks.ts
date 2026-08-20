/**
 * Block registry. This module is imported by the mesher worker, so it must
 * stay free of DOM and three.js dependencies.
 */

export enum Block {
  Air = 0,
  Stone = 1,
  Dirt = 2,
  Grass = 3,
  Sand = 4,
  Gravel = 5,
  Cobblestone = 6,
  Log = 7,
  Leaves = 8,
  Planks = 9,
  CoalOre = 10,
  IronOre = 11,
  GoldOre = 12,
  CrystalOre = 13,
  Bedrock = 14,
  Lava = 15,
  Obsidian = 16,
  RunicStone = 17,
  DarkBrick = 18,
  Glowstone = 19,
  Mushroom = 20,
}

export enum Tile {
  Stone = 0,
  Dirt = 1,
  GrassTop = 2,
  GrassSide = 3,
  Sand = 4,
  Gravel = 5,
  Cobblestone = 6,
  LogSide = 7,
  LogTop = 8,
  Leaves = 9,
  Planks = 10,
  CoalOre = 11,
  IronOre = 12,
  GoldOre = 13,
  CrystalOre = 14,
  Bedrock = 15,
  Lava = 16,
  Obsidian = 17,
  RunicTop = 18,
  RunicSide = 19,
  DarkBrick = 20,
  Glowstone = 21,
  Mushroom = 22,
}

export const ATLAS_TILE_PX = 16;
export const ATLAS_TILES_PER_ROW = 8;
export const ATLAS_SIZE_PX = ATLAS_TILE_PX * ATLAS_TILES_PER_ROW;

export interface BlockDef {
  id: Block;
  name: string;
  /** Hides the neighbouring face when true. */
  opaque: boolean;
  /** Takes part in AABB collision. */
  solid: boolean;
  /** Seconds to break with the starting pickaxe; Infinity means indestructible. */
  hardness: number;
  /** Damage per second applied while the player intersects the block. */
  contactDamage: number;
  /** Extra vertex brightness for self-lit blocks, 0..1. */
  glow: number;
  /** [top, side, bottom] atlas tile indices. */
  tiles: [Tile, Tile, Tile];
  /** What lands in the inventory when mined; null means nothing. */
  drop: Block | null;
  /** Hit points restored when the player right-clicks the item; 0 means not food. */
  heal: number;
}

function def(
  id: Block,
  name: string,
  tiles: [Tile, Tile, Tile],
  options: Partial<Omit<BlockDef, 'id' | 'name' | 'tiles'>> = {},
): BlockDef {
  return {
    id,
    name,
    tiles,
    opaque: options.opaque ?? true,
    solid: options.solid ?? true,
    hardness: options.hardness ?? 0.4,
    contactDamage: options.contactDamage ?? 0,
    glow: options.glow ?? 0,
    drop: options.drop === undefined ? id : options.drop,
    heal: options.heal ?? 0,
  };
}

export const BLOCKS: readonly BlockDef[] = [
  def(Block.Air, 'Air', [Tile.Stone, Tile.Stone, Tile.Stone], {
    opaque: false,
    solid: false,
    hardness: Infinity,
    drop: null,
  }),
  def(Block.Stone, 'Stone', [Tile.Stone, Tile.Stone, Tile.Stone], {
    hardness: 0.45,
    drop: Block.Cobblestone,
  }),
  def(Block.Dirt, 'Dirt', [Tile.Dirt, Tile.Dirt, Tile.Dirt], { hardness: 0.25 }),
  def(Block.Grass, 'Grass Block', [Tile.GrassTop, Tile.GrassSide, Tile.Dirt], {
    hardness: 0.28,
    drop: Block.Dirt,
  }),
  def(Block.Sand, 'Sand', [Tile.Sand, Tile.Sand, Tile.Sand], { hardness: 0.2 }),
  def(Block.Gravel, 'Gravel', [Tile.Gravel, Tile.Gravel, Tile.Gravel], { hardness: 0.25 }),
  def(Block.Cobblestone, 'Cobblestone', [Tile.Cobblestone, Tile.Cobblestone, Tile.Cobblestone], {
    hardness: 0.5,
  }),
  def(Block.Log, 'Log', [Tile.LogTop, Tile.LogSide, Tile.LogTop], { hardness: 0.55 }),
  def(Block.Leaves, 'Leaves', [Tile.Leaves, Tile.Leaves, Tile.Leaves], {
    hardness: 0.12,
    drop: null,
  }),
  def(Block.Planks, 'Planks', [Tile.Planks, Tile.Planks, Tile.Planks], { hardness: 0.4 }),
  def(Block.CoalOre, 'Coal Ore', [Tile.CoalOre, Tile.CoalOre, Tile.CoalOre], { hardness: 0.7 }),
  def(Block.IronOre, 'Iron Ore', [Tile.IronOre, Tile.IronOre, Tile.IronOre], { hardness: 0.85 }),
  def(Block.GoldOre, 'Gold Ore', [Tile.GoldOre, Tile.GoldOre, Tile.GoldOre], { hardness: 0.95 }),
  def(Block.CrystalOre, 'Crystal Ore', [Tile.CrystalOre, Tile.CrystalOre, Tile.CrystalOre], {
    hardness: 1.1,
    glow: 0.35,
    heal: 8,
  }),
  def(Block.Bedrock, 'Bedrock', [Tile.Bedrock, Tile.Bedrock, Tile.Bedrock], {
    hardness: Infinity,
    drop: null,
  }),
  def(Block.Lava, 'Lava', [Tile.Lava, Tile.Lava, Tile.Lava], {
    hardness: Infinity,
    contactDamage: 7,
    glow: 0.85,
    drop: null,
  }),
  def(Block.Obsidian, 'Obsidian', [Tile.Obsidian, Tile.Obsidian, Tile.Obsidian], {
    hardness: 3.2,
  }),
  def(Block.RunicStone, 'Runic Stone', [Tile.RunicTop, Tile.RunicSide, Tile.DarkBrick], {
    hardness: 2.4,
    glow: 0.4,
  }),
  def(Block.DarkBrick, 'Dark Brick', [Tile.DarkBrick, Tile.DarkBrick, Tile.DarkBrick], {
    hardness: 1.4,
  }),
  def(Block.Glowstone, 'Glowstone', [Tile.Glowstone, Tile.Glowstone, Tile.Glowstone], {
    hardness: 0.4,
    glow: 1,
  }),
  def(Block.Mushroom, 'Mushroom', [Tile.Mushroom, Tile.Mushroom, Tile.Mushroom], {
    hardness: 0.08,
    solid: false,
    heal: 4,
  }),
];

const BLOCK_COUNT = BLOCKS.length;

/** Flat lookup tables; the mesher touches these millions of times per session. */
export const OPAQUE = new Uint8Array(BLOCK_COUNT);
export const SOLID = new Uint8Array(BLOCK_COUNT);
export const GLOW = new Float32Array(BLOCK_COUNT);
export const TILE_TOP = new Uint8Array(BLOCK_COUNT);
export const TILE_SIDE = new Uint8Array(BLOCK_COUNT);
export const TILE_BOTTOM = new Uint8Array(BLOCK_COUNT);

for (const block of BLOCKS) {
  OPAQUE[block.id] = block.opaque ? 1 : 0;
  SOLID[block.id] = block.solid ? 1 : 0;
  GLOW[block.id] = block.glow;
  TILE_TOP[block.id] = block.tiles[0];
  TILE_SIDE[block.id] = block.tiles[1];
  TILE_BOTTOM[block.id] = block.tiles[2];
}

export function getBlockDef(id: number): BlockDef {
  return BLOCKS[id] ?? BLOCKS[Block.Air];
}

export function isSolid(id: number): boolean {
  return SOLID[id] === 1;
}

export function isOpaque(id: number): boolean {
  return OPAQUE[id] === 1;
}

export function isConsumable(id: number): boolean {
  return getBlockDef(id).heal > 0;
}

/** Blocks the player can pick up and place from the hotbar. */
export const PLACEABLE_BLOCKS: readonly Block[] = [
  Block.Cobblestone,
  Block.Dirt,
  Block.Sand,
  Block.Planks,
  Block.Log,
  Block.Leaves,
  Block.Glowstone,
  Block.Obsidian,
  Block.DarkBrick,
];
