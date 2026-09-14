import * as THREE from 'three';

import type { Sfx } from '../audio/Sfx.ts';
import type { Input } from '../core/Input.ts';
import type { BlockAtlas } from '../render/atlas.ts';
import type { ParticleSystem } from '../render/Particles.ts';
import { ALTAR, isRuinStatueColumn } from '../world/arena.ts';
import {
  Block,
  PLANKS_PER_BED,
  TILE_SIDE,
  TORCHES_PER_COAL,
  getBlockDef,
  isBed,
  isBedMaterial,
  isConsumable,
  isTorchFuel,
} from '../world/blocks.ts';
import { raycastVoxels, type VoxelHit } from '../world/raycast.ts';
import type { World } from '../world/World.ts';
import {
  HAMMER,
  HammerTier,
  PLATE_COST,
  PLATES,
  PlateTier,
  UPGRADE_COST,
  isUpgradeOre,
  platesFrom,
  upgradeFrom,
} from './Hammer.ts';
import { PLAYER_HEIGHT, PLAYER_REACH, PLAYER_WIDTH, type Player } from './Player.ts';

const PLACE_COOLDOWN = 0.18;
const EAT_COOLDOWN = 0.55;

export interface InteractionResult {
  /** Distance to the aimed block, or Infinity when nothing is in range. */
  targetDistance: number;
  brokeBlock: boolean;
}

/** Mining, block placement and the aiming highlight. */
export class BlockInteraction {
  target: VoxelHit | null = null;
  progress = 0;

  onAltarActivated: (() => void) | null = null;
  onStatueActivated: (() => void) | null = null;
  /** Fired after a right-click eat attempt; amount is 0 when already full. */
  onConsumed: ((healed: number) => void) | null = null;
  onConsumableFound: ((name: string) => void) | null = null;
  onUpgradeFound: ((name: string) => void) | null = null;
  onTorchFuelFound: ((name: string) => void) | null = null;
  onBedFound: ((name: string) => void) | null = null;
  onSpawnSet: (() => void) | null = null;
  onHammerFeedback: ((text: string) => void) | null = null;

  private readonly origin = new THREE.Vector3();
  private readonly direction = new THREE.Vector3();
  private readonly breakPoint = new THREE.Vector3();
  private readonly highlight: THREE.LineSegments;
  private readonly crack: THREE.Mesh;
  private placeCooldown = 0;
  private targetKey = '';

  constructor(
    private readonly player: Player,
    private readonly world: World,
    private readonly atlas: BlockAtlas,
    private readonly particles: ParticleSystem,
    private readonly sfx: Sfx,
    scene: THREE.Scene,
  ) {
    this.highlight = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1.002, 1.002, 1.002)),
      new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.55 }),
    );
    this.highlight.visible = false;
    this.highlight.frustumCulled = false;
    scene.add(this.highlight);

    this.crack = new THREE.Mesh(
      new THREE.BoxGeometry(1.01, 1.01, 1.01),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0 }),
    );
    this.crack.visible = false;
    scene.add(this.crack);
  }

  update(dt: number, input: Input, entityBlocksAim: boolean): InteractionResult {
    this.placeCooldown = Math.max(0, this.placeCooldown - dt);

    this.player.getEyePosition(this.origin);
    this.player.getForward(this.direction);
    this.target = raycastVoxels(this.world, this.origin, this.direction, PLAYER_REACH);

    const key = this.target ? `${this.target.x},${this.target.y},${this.target.z}` : '';
    if (key !== this.targetKey) {
      this.targetKey = key;
      this.progress = 0;
    }

    let brokeBlock = false;
    if (this.target && !entityBlocksAim) {
      if (input.isMouseDown(0)) brokeBlock = this.mine(dt, this.target);
      else this.progress = 0;
    } else {
      this.progress = 0;
    }

    if (input.isMouseDown(2) && this.placeCooldown === 0) this.useItem(this.target);

    this.updateVisuals();
    return { targetDistance: this.target?.distance ?? Infinity, brokeBlock };
  }

  private mine(dt: number, hit: VoxelHit): boolean {
    const def = getBlockDef(hit.block);
    if (!Number.isFinite(def.hardness)) return false;

    this.progress += (dt * this.player.mineSpeed) / def.hardness;
    this.player.startSwing();

    this.breakPoint.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
    if (Math.random() < dt * 12) {
      this.particles.burst(this.breakPoint, {
        count: 2,
        color: this.atlas.tileColors[TILE_SIDE[hit.block]],
        speed: 1.6,
        spread: 0.9,
        life: 0.35,
      });
    }

    if (this.progress < 1) return false;

    this.world.setBlock(hit.x, hit.y, hit.z, Block.Air);
    this.progress = 0;

    this.particles.burst(this.breakPoint, {
      count: 16,
      color: this.atlas.tileColors[TILE_SIDE[hit.block]],
      speed: 3.4,
      spread: 0.9,
      life: 0.7,
    });

    if (def.drop !== null) {
      this.player.inventory.add(def.drop, 1);
      const drop = getBlockDef(def.drop);
      if (drop.heal > 0) this.onConsumableFound?.(drop.name);
      if (isUpgradeOre(def.drop)) this.onUpgradeFound?.(drop.name);
      if (isTorchFuel(def.drop)) this.onTorchFuelFound?.(drop.name);
      if (isBed(def.drop)) this.onBedFound?.(drop.name);
    }
    this.sfx.play('break');
    return true;
  }

  get aimingAltar(): boolean {
    return this.target !== null && this.isAltarBlock(this.target);
  }

  get aimingStatue(): boolean {
    return this.target !== null && this.isStatueBlock(this.target);
  }

  get holdingConsumable(): boolean {
    const block = this.player.inventory.selectedSlot.block;
    return block !== null && isConsumable(block);
  }

  get holdingUpgradeOre(): boolean {
    const block = this.player.inventory.selectedSlot.block;
    return block !== null && isUpgradeOre(block);
  }

  get holdingTorchFuel(): boolean {
    const block = this.player.inventory.selectedSlot.block;
    return block !== null && isTorchFuel(block);
  }

  get holdingBedMaterial(): boolean {
    const block = this.player.inventory.selectedSlot.block;
    return block !== null && isBedMaterial(block);
  }

  get aimingBed(): boolean {
    return this.target !== null && isBed(this.target.block);
  }

  /**
   * Right click wakes the altar, eats, upgrades the hammer, crafts torches or
   * places a block. Eating and crafting work while looking at air.
   */
  private useItem(hit: VoxelHit | null): void {
    if (hit && this.isAltarBlock(hit)) {
      this.placeCooldown = PLACE_COOLDOWN;
      this.player.startSwing();
      this.onAltarActivated?.();
      return;
    }

    if (hit && this.isStatueBlock(hit)) {
      this.placeCooldown = PLACE_COOLDOWN;
      this.player.startSwing();
      this.onStatueActivated?.();
      return;
    }

    if (hit && isBed(hit.block)) {
      this.restAt(hit);
      return;
    }

    if (this.tryConsume()) return;
    if (this.tryUpgrade()) return;
    if (this.tryCraftTorches()) return;
    if (this.tryCraftBed(hit)) return;
    if (!hit) return;

    const x = hit.x + hit.nx;
    const y = hit.y + hit.ny;
    const z = hit.z + hit.nz;
    const dest = this.world.getBlock(x, y, z);
    if (dest !== Block.Air && dest !== Block.Water) return;
    if (this.intersectsPlayer(x, y, z)) return;

    const block = this.player.inventory.selectedSlot.block;
    if (block === null || isConsumable(block) || isUpgradeOre(block) || isTorchFuel(block)) return;

    this.placeCooldown = PLACE_COOLDOWN;
    this.player.inventory.takeSelected();
    this.world.setBlock(x, y, z, block);
    this.player.startSwing();
    this.sfx.play('place');
  }

  private tryConsume(): boolean {
    const slot = this.player.inventory.selectedSlot;
    if (this.player.dead || slot.block === null || !isConsumable(slot.block)) return false;

    this.placeCooldown = EAT_COOLDOWN;
    const heal = getBlockDef(slot.block).heal;
    const restored = this.player.health.heal(heal);
    if (restored <= 0) {
      this.onConsumed?.(0);
      return true;
    }

    this.player.inventory.takeSelected();
    this.player.startSwing();
    this.sfx.play('eat');
    this.player.getEyePosition(this.origin);
    this.particles.burst(this.origin, {
      count: 10,
      color: 0x7dff9a,
      speed: 1.6,
      spread: 0.45,
      life: 0.4,
      gravity: 6,
    });
    this.onConsumed?.(restored);
    return true;
  }

  private tryUpgrade(): boolean {
    const slot = this.player.inventory.selectedSlot;
    if (this.player.dead || slot.block === null) return false;

    const next = upgradeFrom(slot.block);
    if (next === null) return false;

    this.placeCooldown = EAT_COOLDOWN;
    const stats = HAMMER[next];

    if (this.player.hammerTier >= next) return this.trySmithPlates();

    if (slot.count < UPGRADE_COST) {
      this.onHammerFeedback?.(`Need ${UPGRADE_COST} ${getBlockDef(slot.block).name}`);
      return true;
    }

    this.player.inventory.takeSelected(UPGRADE_COST);
    this.player.hammerTier = next;
    this.player.startSwing();
    this.sfx.play('eat');
    this.player.getEyePosition(this.origin);
    this.particles.burst(this.origin, {
      count: 14,
      color: next === HammerTier.Gold ? 0xffe08a : 0xc8d0d8,
      speed: 2,
      spread: 0.5,
      life: 0.45,
      gravity: 6,
    });
    this.onHammerFeedback?.(`${stats.name}: mines faster and hits harder`);
    return true;
  }

  /** Four of that metal, after its hammer is already bound, forge a vest. */
  private trySmithPlates(): boolean {
    const slot = this.player.inventory.selectedSlot;
    if (slot.block === null) return false;
    const next = platesFrom(slot.block);
    if (next === null) return false;

    this.placeCooldown = EAT_COOLDOWN;
    const stats = PLATES[next];
    if (this.player.plates >= next) {
      this.onHammerFeedback?.(
        this.player.plates === next
          ? `Already wearing ${stats.name.toLowerCase()}`
          : 'The plates are already stronger',
      );
      return true;
    }

    if (slot.count < PLATE_COST) {
      this.onHammerFeedback?.(`Need ${PLATE_COST} ${getBlockDef(slot.block).name}`);
      return true;
    }

    this.player.inventory.takeSelected(PLATE_COST);
    this.player.plates = next;
    this.player.startSwing();
    this.sfx.play('eat');
    this.player.getEyePosition(this.origin);
    this.particles.burst(this.origin, {
      count: 12,
      color: next === PlateTier.Gold ? 0xffe08a : 0xc8d0d8,
      speed: 1.8,
      spread: 0.45,
      life: 0.4,
      gravity: 6,
    });
    this.onHammerFeedback?.(`${stats.name}: the Warden hits softer`);
    return true;
  }

  /** Drops one selected block into the air just ahead of the player. */
  tossSelected(): boolean {
    const slot = this.player.inventory.selectedSlot;
    if (slot.block === null || slot.count <= 0) return false;

    this.player.getForward(this.direction);
    this.direction.y = 0;
    if (this.direction.lengthSq() < 1e-6) this.direction.set(0, 0, -1);
    this.direction.normalize();

    const origin = this.player.position;
    const x = Math.floor(origin.x + this.direction.x * 1.45);
    const z = Math.floor(origin.z + this.direction.z * 1.45);
    const baseY = Math.floor(origin.y + 0.2);

    for (const dy of [0, 1, -1]) {
      const y = baseY + dy;
      const dest = this.world.getBlock(x, y, z);
      if (dest !== Block.Air && dest !== Block.Water) continue;
      if (this.intersectsPlayer(x, y, z)) continue;

      const block = this.player.inventory.takeSelected(1);
      if (block === null) return false;
      this.world.setBlock(x, y, z, block);
      this.player.startSwing();
      this.sfx.play('place');
      return true;
    }

    this.onHammerFeedback?.('No room to toss');
    return false;
  }

  /** Four planks become a bedroll, but only while looking at air so planks still place. */
  private tryCraftBed(hit: VoxelHit | null): boolean {
    if (hit) return false;
    const slot = this.player.inventory.selectedSlot;
    if (this.player.dead || slot.block === null || !isBedMaterial(slot.block)) return false;

    this.placeCooldown = EAT_COOLDOWN;
    if (slot.count < PLANKS_PER_BED) {
      this.onHammerFeedback?.(`Need ${PLANKS_PER_BED} Planks`);
      return true;
    }

    this.player.inventory.takeSelected(PLANKS_PER_BED);
    const leftover = this.player.inventory.add(Block.Bed, 1);
    if (leftover === 1) {
      this.player.inventory.add(Block.Planks, PLANKS_PER_BED);
      this.onHammerFeedback?.('Hotbar is full');
      return true;
    }

    this.player.startSwing();
    this.sfx.play('place');
    this.onBedFound?.('Bedroll');
    this.onHammerFeedback?.('Crafted a bedroll — place it, then right click to rest');
    return true;
  }

  private restAt(hit: VoxelHit): void {
    this.placeCooldown = EAT_COOLDOWN;
    const x = hit.x + 0.5;
    const y = hit.y + 1;
    const z = hit.z + 0.5;
    const spawn = this.player.spawn;
    if (Math.hypot(spawn.x - x, spawn.y - y, spawn.z - z) < 0.2) {
      this.onHammerFeedback?.('You already rest here');
      return;
    }

    this.player.setSpawn(x, y, z);
    this.player.startSwing();
    this.sfx.play('eat');
    this.onSpawnSet?.();
  }

  /** One coal becomes four placeable lights. */
  private tryCraftTorches(): boolean {
    const slot = this.player.inventory.selectedSlot;
    if (this.player.dead || slot.block === null || !isTorchFuel(slot.block)) return false;

    this.placeCooldown = EAT_COOLDOWN;
    this.player.inventory.takeSelected(1);
    const leftover = this.player.inventory.add(Block.Torch, TORCHES_PER_COAL);
    if (leftover === TORCHES_PER_COAL) {
      this.player.inventory.add(Block.CoalOre, 1);
      this.onHammerFeedback?.('Hotbar is full');
      return true;
    }

    this.player.startSwing();
    this.sfx.play('place');
    this.player.getEyePosition(this.origin);
    this.particles.burst(this.origin, {
      count: 10,
      color: 0xffb15a,
      speed: 1.8,
      spread: 0.45,
      life: 0.4,
      gravity: 6,
    });
    const made = TORCHES_PER_COAL - leftover;
    this.onHammerFeedback?.(made === TORCHES_PER_COAL ? `Crafted ${made} torches` : `Crafted ${made} torches — hotbar is full`);
    return true;
  }

  private isAltarBlock(hit: VoxelHit): boolean {
    if (hit.block !== Block.RunicStone && hit.block !== Block.CrystalOre) return false;
    return Math.abs(hit.x - ALTAR.x) <= 2 && Math.abs(hit.z - ALTAR.z) <= 2 && Math.abs(hit.y - ALTAR.y) <= 2;
  }

  private isStatueBlock(hit: VoxelHit): boolean {
    if (!isRuinStatueColumn(hit.x, hit.z)) return false;
    return (
      hit.block === Block.RunicStone ||
      hit.block === Block.Glowstone ||
      hit.block === Block.CrystalOre ||
      hit.block === Block.Cobblestone
    );
  }

  private intersectsPlayer(x: number, y: number, z: number): boolean {
    const position = this.player.position;
    const half = PLAYER_WIDTH / 2;
    return (
      x + 1 > position.x - half &&
      x < position.x + half &&
      y + 1 > position.y &&
      y < position.y + PLAYER_HEIGHT &&
      z + 1 > position.z - half &&
      z < position.z + half
    );
  }

  private updateVisuals(): void {
    // A zero distance hit means the camera is inside the block, and the
    // highlight box would smear its edges across the whole screen.
    if (!this.target || this.target.distance < 0.15) {
      this.highlight.visible = false;
      this.crack.visible = false;
      return;
    }

    const center = this.breakPoint.set(this.target.x + 0.5, this.target.y + 0.5, this.target.z + 0.5);
    this.highlight.position.copy(center);
    this.highlight.visible = true;

    const material = this.crack.material as THREE.MeshBasicMaterial;
    this.crack.visible = this.progress > 0.02;
    this.crack.position.copy(center);
    material.opacity = this.progress * 0.6;
  }
}
