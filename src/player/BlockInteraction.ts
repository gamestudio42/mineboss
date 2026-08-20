import * as THREE from 'three';

import type { Sfx } from '../audio/Sfx.ts';
import type { Input } from '../core/Input.ts';
import type { BlockAtlas } from '../render/atlas.ts';
import type { ParticleSystem } from '../render/Particles.ts';
import { ALTAR } from '../world/arena.ts';
import { Block, TILE_SIDE, getBlockDef } from '../world/blocks.ts';
import { raycastVoxels, type VoxelHit } from '../world/raycast.ts';
import type { World } from '../world/World.ts';
import { PLAYER_HEIGHT, PLAYER_REACH, PLAYER_WIDTH, type Player } from './Player.ts';

const PLACE_COOLDOWN = 0.18;

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

      if (input.isMouseDown(2) && this.placeCooldown === 0) this.useOrPlace(this.target);
    } else {
      this.progress = 0;
    }

    this.updateVisuals();
    return { targetDistance: this.target?.distance ?? Infinity, brokeBlock };
  }

  private mine(dt: number, hit: VoxelHit): boolean {
    const def = getBlockDef(hit.block);
    if (!Number.isFinite(def.hardness)) return false;

    this.progress += dt / def.hardness;
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

    if (def.drop !== null) this.player.inventory.add(def.drop, 1);
    this.sfx.play('break');
    return true;
  }

  get aimingAltar(): boolean {
    return this.target !== null && this.isAltarBlock(this.target);
  }

  /** Right click either wakes the altar or places the selected block. */
  private useOrPlace(hit: VoxelHit): void {
    this.placeCooldown = PLACE_COOLDOWN;

    if (this.isAltarBlock(hit)) {
      this.player.startSwing();
      this.onAltarActivated?.();
      return;
    }

    const x = hit.x + hit.nx;
    const y = hit.y + hit.ny;
    const z = hit.z + hit.nz;
    if (this.world.getBlock(x, y, z) !== Block.Air) return;
    if (this.intersectsPlayer(x, y, z)) return;

    const block = this.player.inventory.takeSelected();
    if (block === null) return;

    this.world.setBlock(x, y, z, block);
    this.player.startSwing();
    this.sfx.play('place');
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
