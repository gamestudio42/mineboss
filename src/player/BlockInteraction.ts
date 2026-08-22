import * as THREE from 'three';

import type { Sfx } from '../audio/Sfx.ts';
import type { Input } from '../core/Input.ts';
import type { BlockAtlas } from '../render/atlas.ts';
import type { ParticleSystem } from '../render/Particles.ts';
import { ALTAR } from '../world/arena.ts';
import {
  Block,
  TILE_SIDE,
  TORCHES_PER_COAL,
  getBlockDef,
  isConsumable,
  isTorchFuel,
} from '../world/blocks.ts';
import { raycastVoxels, type VoxelHit } from '../world/raycast.ts';
import type { World } from '../world/World.ts';
import { HAMMER, HammerTier, UPGRADE_COST, isUpgradeOre, upgradeFrom } from './Hammer.ts';
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
  /** Fired after a right-click eat attempt; amount is 0 when already full. */
  onConsumed: ((healed: number) => void) | null = null;
  onConsumableFound: ((name: string) => void) | null = null;
  onUpgradeFound: ((name: string) => void) | null = null;
  onTorchFuelFound: ((name: string) => void) | null = null;
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
    }
    this.sfx.play('break');
    return true;
  }

  get aimingAltar(): boolean {
    return this.target !== null && this.isAltarBlock(this.target);
  }

  get holdingConsumable(): boolean {
    const block = this.player.inventory.selectedSlot.block;
    return block !== null && (isConsumable(block) || isUpgradeOre(block));
  }

  get holdingTorchFuel(): boolean {
    const block = this.player.inventory.selectedSlot.block;
    return block !== null && isTorchFuel(block);
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

    if (this.tryConsume()) return;
    if (this.tryUpgrade()) return;
    if (this.tryCraftTorches()) return;
    if (!hit) return;

    const x = hit.x + hit.nx;
    const y = hit.y + hit.ny;
    const z = hit.z + hit.nz;
    if (this.world.getBlock(x, y, z) !== Block.Air) return;
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

    if (this.player.hammerTier >= next) {
      this.onHammerFeedback?.(
        this.player.hammerTier === next
          ? `Already ${stats.name.toLowerCase()}`
          : 'The hammer is already stronger',
      );
      return true;
    }

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
