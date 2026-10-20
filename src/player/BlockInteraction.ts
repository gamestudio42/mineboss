import * as THREE from 'three';

import type { BuildEdit } from './BuildHistory.ts';
import type { Sfx } from '../audio/Sfx.ts';
import type { Input } from '../core/Input.ts';
import type { BlockAtlas } from '../render/atlas.ts';
import type { ParticleSystem } from '../render/Particles.ts';
import { ALTAR, isGroveBeaconColumn, isRuinStatueColumn } from '../world/arena.ts';
import { isOneBlockCell } from '../world/oneblock/phases.ts';
import {
  Block,
  TILE_SIDE,
  getBlockDef,
  isBed,
  isBedMaterial,
  isChest,
  isConsumable,
  isTorchFuel,
} from '../world/blocks.ts';
import { raycastVoxels, type VoxelHit } from '../world/raycast.ts';
import type { World } from '../world/World.ts';
import { WORLD_HEIGHT } from '../world/Chunk.ts';
import {
  isUpgradeOre,
} from './Hammer.ts';
import { PLAYER_HEIGHT, PLAYER_REACH, PLAYER_WIDTH, type Player } from './Player.ts';

const PLACE_COOLDOWN = 0.18;
const EAT_COOLDOWN = 0.55;

export interface InteractionResult {
  /** Distance to the aimed block, or Infinity when nothing is in range. */
  targetDistance: number;
  brokeBlock: boolean;
  brokenBlock?: Block;
}

/** Mining, block placement and the aiming highlight. */
export class BlockInteraction {
  target: VoxelHit | null = null;
  progress = 0;
  previewEnabled = true;
  placementHint = '';
  private readonly preview = new THREE.Mesh(
    new THREE.BoxGeometry(1.005, 1.005, 1.005),
    new THREE.MeshBasicMaterial({ color: 0x91edc3, transparent: true, opacity: 0.32, depthWrite: false }),
  );

  onAltarActivated: (() => void) | null = null;
  onStatueActivated: (() => void) | null = null;
  onBeaconActivated: (() => void) | null = null;
  /** Fired after a right-click eat attempt; amount is 0 when already full. */
  onConsumed: ((healed: number) => void) | null = null;
  onConsumableFound: ((name: string) => void) | null = null;
  onUpgradeFound: ((name: string) => void) | null = null;
  onTorchFuelFound: ((name: string) => void) | null = null;
  onBedFound: ((name: string) => void) | null = null;
  /** Fired after a placed chest is opened and removed. */
  onChestOpened: (() => void) | null = null;
  onBlockPlaced: ((block: Block) => void) | null = null;
  onBuildEdit: ((edit: BuildEdit) => void) | null = null;
  /** Right click on a friendly creature; returns true when it took the click. */
  onEntityUse: (() => boolean) | null = null;
  onSpawnSet: (() => void) | null = null;
  onHammerFeedback: ((text: string) => void) | null = null;
  /** Fired before the drop when the regenerating core is mined. */
  onOneBlockMined: ((hit: VoxelHit) => void) | null = null;

  private readonly origin = new THREE.Vector3();
  private readonly direction = new THREE.Vector3();
  private readonly breakPoint = new THREE.Vector3();
  private readonly highlight: THREE.LineSegments;
  private readonly crack: THREE.Mesh;
  private placeCooldown = 0;
  private mineCooldown = 0;
  private useHeld = false;
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
    this.preview.visible = false;
    scene.add(this.preview);
  }

  update(dt: number, input: Input, entityBlocksAim: boolean): InteractionResult {
    this.placeCooldown = Math.max(0, this.placeCooldown - dt);
    this.mineCooldown = Math.max(0, this.mineCooldown - dt);

    this.player.getEyePosition(this.origin);
    this.player.getForward(this.direction);
    this.target = raycastVoxels(this.world, this.origin, this.direction, PLAYER_REACH);

    const key = this.target ? `${this.target.x},${this.target.y},${this.target.z}` : '';
    if (key !== this.targetKey) {
      this.targetKey = key;
      this.progress = 0;
    }

    let brokeBlock = false;
    let brokenBlock: Block | undefined;
    if (this.target && !entityBlocksAim) {
      if (input.isMouseDown(0) || input.wasMousePressed(0)) {
        if (this.mineCooldown === 0) {
          brokenBlock = this.target.block;
          brokeBlock = this.mine(dt, this.target);
          if (!brokeBlock) brokenBlock = undefined;
        }
      }
      else this.progress = 0;
    } else {
      this.progress = 0;
    }

    const using = input.isMouseDown(2) || input.wasMousePressed(2);
    // Holding the button after tapping a creature must not start placing blocks behind it.
    if (!using) this.useHeld = false;
    else if (input.wasMousePressed(2) && this.onEntityUse?.()) this.useHeld = true;
    if (using && !this.useHeld && this.placeCooldown === 0) this.useItem(this.target);

    this.updateVisuals();
    return { targetDistance: this.target?.distance ?? Infinity, brokeBlock, brokenBlock };
  }

  private mine(dt: number, hit: VoxelHit): boolean {
    const def = getBlockDef(hit.block);
    if (!Number.isFinite(def.hardness)) return false;

    this.progress += this.player.creative ? 1 : (dt * this.player.mineSpeed) / def.hardness;
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

    const core = this.world.generator.mode === 'oneblock' && isOneBlockCell(hit.x, hit.y, hit.z);
    if (core) this.onOneBlockMined?.(hit);
    else this.editBlock(hit.x, hit.y, hit.z, Block.Air);
    this.progress = 0;
    if (this.player.creative) this.mineCooldown = PLACE_COOLDOWN;

    this.particles.burst(this.breakPoint, {
      count: 16,
      color: this.atlas.tileColors[TILE_SIDE[hit.block]],
      speed: 3.4,
      spread: 0.9,
      life: 0.7,
    });

    if (def.drop !== null && !this.player.creative) {
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

  get aimingBeacon(): boolean {
    return this.target !== null && this.isBeaconBlock(this.target);
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

  get aimingChest(): boolean {
    return this.target !== null && !this.player.creative && isChest(this.target.block) && !isOneBlockCell(this.target.x, this.target.y, this.target.z);
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

    if (hit && this.isBeaconBlock(hit)) {
      this.placeCooldown = PLACE_COOLDOWN;
      this.player.startSwing();
      this.onBeaconActivated?.();
      return;
    }

    if (hit && isBed(hit.block)) {
      this.restAt(hit);
      return;
    }

    if (hit && this.aimingChest) {
      this.placeCooldown = PLACE_COOLDOWN;
      if (!this.editBlock(hit.x, hit.y, hit.z, Block.Air)) return;
      this.onChestOpened?.();
      this.player.startSwing();
      this.sfx.play('place');
      return;
    }

    if (!this.player.creative) {
      if (this.tryConsume()) return;
      if (this.holdingUpgradeOre || this.holdingTorchFuel) {
        this.placeCooldown = EAT_COOLDOWN;
        this.onHammerFeedback?.('Aperte C para criar itens.');
        return;
      }
    }
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
    if (!this.editBlock(x, y, z, block)) return;
    this.player.inventory.takeSelected();
    this.onBlockPlaced?.(block);
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

      const block = slot.block;
      if (!this.editBlock(x, y, z, block)) continue;
      this.player.inventory.takeSelected(1);
      this.onBlockPlaced?.(block);
      this.player.startSwing();
      this.sfx.play('place');
      return true;
    }

    this.onHammerFeedback?.('Não há espaço para soltar');
    return false;
  }

  private restAt(hit: VoxelHit): void {
    this.placeCooldown = EAT_COOLDOWN;
    const x = hit.x + 0.5;
    const y = hit.y + 1;
    const z = hit.z + 0.5;
    const spawn = this.player.spawn;
    if (Math.hypot(spawn.x - x, spawn.y - y, spawn.z - z) < 0.2) {
      this.onHammerFeedback?.('Você já descansa aqui');
      return;
    }

    this.player.setSpawn(x, y, z);
    this.player.startSwing();
    this.sfx.play('eat');
    this.onSpawnSet?.();
  }

  private isAltarBlock(hit: VoxelHit): boolean {
    if (hit.block !== Block.RunicStone && hit.block !== Block.CrystalOre) return false;
    return Math.abs(hit.x - ALTAR.x) <= 2 && Math.abs(hit.z - ALTAR.z) <= 2 && Math.abs(hit.y - ALTAR.y) <= 2;
  }

  private isBeaconBlock(hit: VoxelHit): boolean {
    if (!isGroveBeaconColumn(hit.x, hit.z)) return false;
    return hit.block === Block.Glowstone || hit.block === Block.Moss;
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

  private editBlock(x: number, y: number, z: number, after: Block): boolean {
    const before = this.world.getBlock(x, y, z);
    const previousEdit = this.world.edits.get(`${x},${y},${z}`);
    if (!this.world.setBlock(x, y, z, after)) return false;
    this.onBuildEdit?.({ x, y, z, before, after, previousEdit });
    return true;
  }

  intersectsPlayer(x: number, y: number, z: number): boolean {
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
    this.updatePreview();
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

  private updatePreview(): void {
    this.preview.visible = false;
    this.placementHint = '';
    const hit = this.target;
    const slot = this.player.inventory.selectedSlot;
    const block = slot.block;
    if (!this.previewEnabled || !hit || block === null || slot.count <= 0 ||
        isConsumable(block) || isUpgradeOre(block) || isTorchFuel(block) ||
        this.aimingAltar || this.aimingStatue || this.aimingBeacon || this.aimingBed || this.aimingChest) return;
    const x = hit.x + hit.nx, y = hit.y + hit.ny, z = hit.z + hit.nz;
    const destination = this.world.getBlock(x, y, z);
    if (y < 0 || y >= WORLD_HEIGHT) this.placementHint = 'Limite do mundo: escolha outro lugar';
    else if (!this.world.getChunk(x >> 4, z >> 4)) this.placementHint = 'Espere o terreno carregar';
    else if (this.intersectsPlayer(x, y, z)) this.placementHint = 'Afaste-se um pouco para colocar aqui';
    else if (destination !== Block.Air && destination !== Block.Water) this.placementHint = 'Este espaço está ocupado';
    this.preview.material.color.setHex(this.placementHint ? 0xff8a73 : 0x91edc3);
    this.preview.material.opacity = this.placementHint ? 0.1 : 0.25;
    this.preview.position.set(x + 0.5, y + 0.5, z + 0.5);
    this.preview.visible = true;
  }
}
