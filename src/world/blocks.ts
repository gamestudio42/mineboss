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
  Torch = 21,
  Water = 22,
  Bed = 23,
  BirchLog = 24,
  BirchLeaves = 25,
  SentinelTrophy = 26,
  WardenTrophy = 27,
  White = 28,
  Red = 29,
  Orange = 30,
  Yellow = 31,
  Green = 32,
  Blue = 33,
  Purple = 34,
  Pink = 35,
  Glass = 36,
  SentinelBanner = 37,
  WardenLantern = 38,
  Moss = 39,
  Flower = 40,
  Chest = 41,
  BeaconTrophy = 42,
  BeaconLantern = 43,
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
  Torch = 23,
  TorchFlame = 24,
  Water = 25,
  Bed = 26,
  BedEnd = 27,
  BirchLogSide = 28,
  BirchLogTop = 29,
  BirchLeaves = 30,
  White = 31,
  Red = 32,
  Orange = 33,
  Yellow = 34,
  Green = 35,
  Blue = 36,
  Purple = 37,
  Pink = 38,
  Glass = 39,
  SentinelTrophy = 40,
  WardenTrophy = 41,
  SentinelBanner = 42,
  WardenLantern = 43,
  Moss = 44,
  Flower = 45,
  Chest = 46,
  BeaconTrophy = 47,
  BeaconLantern = 48,
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
  def(Block.Air, 'Ar', [Tile.Stone, Tile.Stone, Tile.Stone], {
    opaque: false,
    solid: false,
    hardness: Infinity,
    drop: null,
  }),
  def(Block.Stone, 'Pedra', [Tile.Stone, Tile.Stone, Tile.Stone], {
    hardness: 0.45,
    drop: Block.Cobblestone,
  }),
  def(Block.Dirt, 'Terra', [Tile.Dirt, Tile.Dirt, Tile.Dirt], { hardness: 0.25 }),
  def(Block.Grass, 'Grama', [Tile.GrassTop, Tile.GrassSide, Tile.Dirt], {
    hardness: 0.28,
    drop: Block.Dirt,
  }),
  def(Block.Sand, 'Areia', [Tile.Sand, Tile.Sand, Tile.Sand], { hardness: 0.2 }),
  def(Block.Gravel, 'Cascalho', [Tile.Gravel, Tile.Gravel, Tile.Gravel], { hardness: 0.25 }),
  def(Block.Cobblestone, 'Pedregulho', [Tile.Cobblestone, Tile.Cobblestone, Tile.Cobblestone], {
    hardness: 0.5,
  }),
  def(Block.Log, 'Tronco', [Tile.LogTop, Tile.LogSide, Tile.LogTop], { hardness: 0.55 }),
  def(Block.Leaves, 'Folhas', [Tile.Leaves, Tile.Leaves, Tile.Leaves], {
    hardness: 0.12,
    drop: null,
  }),
  def(Block.BirchLog, 'Tronco de bétula', [Tile.BirchLogTop, Tile.BirchLogSide, Tile.BirchLogTop], {
    hardness: 0.5,
  }),
  def(Block.BirchLeaves, 'Folhas de bétula', [Tile.BirchLeaves, Tile.BirchLeaves, Tile.BirchLeaves], {
    hardness: 0.1,
    drop: null,
  }),
  def(Block.Planks, 'Tábuas', [Tile.Planks, Tile.Planks, Tile.Planks], { hardness: 0.4 }),
  def(Block.CoalOre, 'Carvão', [Tile.CoalOre, Tile.CoalOre, Tile.CoalOre], { hardness: 0.7 }),
  def(Block.IronOre, 'Ferro', [Tile.IronOre, Tile.IronOre, Tile.IronOre], { hardness: 0.85 }),
  def(Block.GoldOre, 'Ouro', [Tile.GoldOre, Tile.GoldOre, Tile.GoldOre], { hardness: 0.95 }),
  def(Block.CrystalOre, 'Cristal', [Tile.CrystalOre, Tile.CrystalOre, Tile.CrystalOre], {
    hardness: 1.1,
    glow: 0.35,
    heal: 8,
  }),
  def(Block.Bedrock, 'Rocha inquebrável', [Tile.Bedrock, Tile.Bedrock, Tile.Bedrock], {
    hardness: Infinity,
    drop: null,
  }),
  def(Block.Lava, 'Lava', [Tile.Lava, Tile.Lava, Tile.Lava], {
    hardness: Infinity,
    contactDamage: 7,
    glow: 0.85,
    drop: null,
  }),
  def(Block.Obsidian, 'Obsidiana', [Tile.Obsidian, Tile.Obsidian, Tile.Obsidian], {
    hardness: 3.2,
  }),
  def(Block.RunicStone, 'Pedra rúnica', [Tile.RunicTop, Tile.RunicSide, Tile.DarkBrick], {
    hardness: 2.4,
    glow: 0.4,
  }),
  def(Block.DarkBrick, 'Tijolos escuros', [Tile.DarkBrick, Tile.DarkBrick, Tile.DarkBrick], {
    hardness: 1.4,
  }),
  def(Block.Glowstone, 'Pedra luminosa', [Tile.Glowstone, Tile.Glowstone, Tile.Glowstone], {
    hardness: 0.4,
    glow: 1,
  }),
  def(Block.Mushroom, 'Cogumelo', [Tile.Mushroom, Tile.Mushroom, Tile.Mushroom], {
    hardness: 0.08,
    solid: false,
    heal: 4,
  }),
  def(Block.Torch, 'Tocha', [Tile.TorchFlame, Tile.Torch, Tile.Torch], {
    hardness: 0.08,
    opaque: false,
    solid: false,
    glow: 0.95,
  }),
  def(Block.Water, 'Água', [Tile.Water, Tile.Water, Tile.Water], {
    hardness: Infinity,
    opaque: false,
    solid: false,
    drop: null,
  }),
  def(Block.Bed, 'Cama', [Tile.Bed, Tile.BedEnd, Tile.Bed], {
    hardness: 0.12,
  }),
  def(Block.SentinelTrophy, 'Troféu do Sentinela', [Tile.SentinelTrophy, Tile.SentinelTrophy, Tile.DarkBrick], { glow: 0.5 }),
  def(Block.WardenTrophy, 'Troféu do Guardião', [Tile.WardenTrophy, Tile.WardenTrophy, Tile.DarkBrick], { glow: 0.7 }),
  def(Block.White, 'Branco', [Tile.White, Tile.White, Tile.White], { hardness: 0.25 }),
  def(Block.Red, 'Vermelho', [Tile.Red, Tile.Red, Tile.Red], { hardness: 0.25 }),
  def(Block.Orange, 'Laranja', [Tile.Orange, Tile.Orange, Tile.Orange], { hardness: 0.25 }),
  def(Block.Yellow, 'Amarelo', [Tile.Yellow, Tile.Yellow, Tile.Yellow], { hardness: 0.25 }),
  def(Block.Green, 'Verde', [Tile.Green, Tile.Green, Tile.Green], { hardness: 0.25 }),
  def(Block.Blue, 'Azul', [Tile.Blue, Tile.Blue, Tile.Blue], { hardness: 0.25 }),
  def(Block.Purple, 'Roxo', [Tile.Purple, Tile.Purple, Tile.Purple], { hardness: 0.25 }),
  def(Block.Pink, 'Rosa', [Tile.Pink, Tile.Pink, Tile.Pink], { hardness: 0.25 }),
  def(Block.Glass, 'Vidro', [Tile.Glass, Tile.Glass, Tile.Glass], { opaque: false, hardness: 0.2 }),
  def(Block.SentinelBanner, 'Emblema do Sentinela', [Tile.SentinelBanner, Tile.SentinelBanner, Tile.DarkBrick], { glow: 0.3 }),
  def(Block.WardenLantern, 'Lanterna do Guardião', [Tile.WardenLantern, Tile.WardenLantern, Tile.DarkBrick], { glow: 1 }),
  def(Block.Moss, 'Musgo', [Tile.Moss, Tile.Moss, Tile.Moss], { hardness: 0.3 }),
  def(Block.Flower, 'Flor', [Tile.Flower, Tile.Flower, Tile.Flower], { hardness: 0.12, heal: 2 }),
  def(Block.Chest, 'Baú', [Tile.Chest, Tile.Chest, Tile.Planks], { hardness: 0.35 }),
  def(Block.BeaconTrophy, 'Troféu do Faroleiro', [Tile.BeaconTrophy, Tile.BeaconTrophy, Tile.Moss], { glow: 0.6 }),
  def(Block.BeaconLantern, 'Lanterna do Farol', [Tile.BeaconLantern, Tile.BeaconLantern, Tile.Moss], { glow: 1 }),
].sort((a, b) => a.id - b.id);

const BLOCK_COUNT = BLOCKS.length;

/** Flat lookup tables; the mesher touches these millions of times per session. */
export const OPAQUE = new Uint8Array(BLOCK_COUNT);
export const SOLID = new Uint8Array(BLOCK_COUNT);
/** Non-air blocks that still need a mesh (torches are thin and not opaque). */
export const MESHABLE = new Uint8Array(BLOCK_COUNT);
export const GLOW = new Float32Array(BLOCK_COUNT);
export const TILE_TOP = new Uint8Array(BLOCK_COUNT);
export const TILE_SIDE = new Uint8Array(BLOCK_COUNT);
export const TILE_BOTTOM = new Uint8Array(BLOCK_COUNT);

for (const block of BLOCKS) {
  OPAQUE[block.id] = block.opaque ? 1 : 0;
  SOLID[block.id] = block.solid ? 1 : 0;
  MESHABLE[block.id] = block.id !== Block.Air ? 1 : 0;
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

export function isConsumable(id: number): boolean {
  return getBlockDef(id).heal > 0;
}

export function isTorchFuel(id: number): boolean {
  return id === Block.CoalOre;
}

export function isWater(id: number): boolean {
  return id === Block.Water;
}

export function isBedMaterial(id: number): boolean {
  return id === Block.Planks;
}

export function isBed(id: number): boolean {
  return id === Block.Bed;
}

export function isChest(id: number): boolean {
  return id === Block.Chest;
}
