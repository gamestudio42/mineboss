import * as THREE from 'three';

import { lerp } from '../core/math.ts';
import { HammerTier, PlateTier } from '../player/Hammer.ts';
import type { BlockAtlas } from './atlas.ts';
import {
  ATLAS_TILES_PER_ROW,
  TILE_BOTTOM,
  TILE_SIDE,
  TILE_TOP,
} from '../world/blocks.ts';

const METAL: Record<HammerTier, { light: number; mid: number; dark: number; rune: number }> = {
  [HammerTier.Wood]: { light: 0xc4c8ce, mid: 0x8e949c, dark: 0x5c6168, rune: 0xb48cf0 },
  [HammerTier.Iron]: { light: 0xdce3ec, mid: 0x9aa4b0, dark: 0x3e4852, rune: 0x8eb4d8 },
  [HammerTier.Gold]: { light: 0xffe08a, mid: 0xd4a84a, dark: 0x8a6a20, rune: 0xfff1b0 },
};

/** Anchored low-right so the head sits in the right third and the crosshair stays clear. */
const REST_POSITION = new THREE.Vector3(0.46, -0.5, -0.88);
const REST_ROTATION = new THREE.Euler(0.14, 0.34, 0.2);
const REST_SCALE = 0.62;

/** Extra rotation at the bottom of the strike, relative to rest. */
const SWING_PITCH = 0.42;
const SWING_YAW = -0.08;
const SWING_ROLL = 0.18;

const HELD_POSITION = new THREE.Vector3(-0.42, -0.38, -0.74);
const HELD_ROTATION = new THREE.Euler(0.18, 0.55, 0.08);

/** Sits at the bottom of the view so looking down shows the vest. */
const VEST_POSITION = new THREE.Vector3(0, -0.58, -0.4);
const VEST_ROTATION = new THREE.Euler(0.35, 0, 0);

const PLATE_METAL: Record<PlateTier.Iron | PlateTier.Gold, { light: number; mid: number; dark: number }> = {
  [PlateTier.Iron]: { light: 0xdce3ec, mid: 0x9aa4b0, dark: 0x3e4852 },
  [PlateTier.Gold]: { light: 0xffe08a, mid: 0xd4a84a, dark: 0x8a6a20 },
};
const UV_INSET = 0.5 / 16;

function tileUv(tile: number): { u0: number; u1: number; v0: number; v1: number } {
  const tx = tile % ATLAS_TILES_PER_ROW;
  const ty = Math.floor(tile / ATLAS_TILES_PER_ROW);
  return {
    u0: (tx + UV_INSET) / ATLAS_TILES_PER_ROW,
    u1: (tx + 1 - UV_INSET) / ATLAS_TILES_PER_ROW,
    v0: 1 - (ty + 1 - UV_INSET) / ATLAS_TILES_PER_ROW,
    v1: 1 - (ty + UV_INSET) / ATLAS_TILES_PER_ROW,
  };
}

/** BoxGeometry faces are +x, -x, +y, -y, +z, -z; four verts each. */
function paintBlockUvs(geometry: THREE.BufferGeometry, block: number): void {
  const tiles = [
    TILE_SIDE[block],
    TILE_SIDE[block],
    TILE_TOP[block],
    TILE_BOTTOM[block],
    TILE_SIDE[block],
    TILE_SIDE[block],
  ];
  const uv = geometry.getAttribute('uv');
  const corners = [
    [0, 1],
    [1, 1],
    [0, 0],
    [1, 0],
  ] as const;

  for (let face = 0; face < 6; face++) {
    const { u0, u1, v0, v1 } = tileUv(tiles[face]);
    for (let i = 0; i < 4; i++) {
      const index = face * 4 + i;
      uv.setXY(index, u0 + corners[i][0] * (u1 - u0), v0 + corners[i][1] * (v1 - v0));
    }
  }
  uv.needsUpdate = true;
}

/**
 * BoxGeometry stores four vertices per face. Darken the sides and bottom so an
 * unlit tool still reads as a solid rather than a flat sticker.
 */
function shadeFaces(geometry: THREE.BufferGeometry, hex: number): void {
  const color = new THREE.Color(hex);
  const shades = [0.74, 0.62, 1, 0.42, 0.88, 0.7];
  const colors = new Float32Array(geometry.attributes.position.count * 3);

  for (let face = 0; face < 6; face++) {
    const tint = color.clone().multiplyScalar(shades[face]);
    for (let i = 0; i < 4; i++) {
      const offset = (face * 4 + i) * 3;
      colors[offset] = tint.r;
      colors[offset + 1] = tint.g;
      colors[offset + 2] = tint.b;
    }
  }

  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

function part(
  width: number,
  height: number,
  depth: number,
  color: number,
): THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial> {
  const geometry = new THREE.BoxGeometry(width, height, depth);
  shadeFaces(geometry, color);

  const mesh = new THREE.Mesh(
    geometry,
    // Unlit and depth-tested off: the tool must never clip into a wall or go
    // black when the miner's lamp sits on top of it.
    new THREE.MeshBasicMaterial({ vertexColors: true, depthTest: false, fog: false }),
  );
  mesh.renderOrder = 10;
  return mesh;
}

/** First person hammer attached to the camera, plus the selected block. */
export class ViewModel {
  private readonly root = new THREE.Group();
  private readonly heldRoot = new THREE.Group();
  private readonly vestRoot = new THREE.Group();
  private readonly heldMesh: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>;
  private readonly metal = new Map<THREE.Mesh, 'light' | 'mid' | 'dark' | 'rune'>();
  private readonly vestMetal = new Map<THREE.Mesh, 'light' | 'mid' | 'dark'>();
  private swayPhase = 0;
  private plateFlash = 0;
  private tier = HammerTier.Wood;
  private plates = PlateTier.None;
  private heldBlock: number | null = null;
  private vestFlash: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial> | null = null;

  constructor(camera: THREE.PerspectiveCamera, atlas: BlockAtlas) {
    this.buildHammer();
    this.root.position.copy(REST_POSITION);
    this.root.rotation.copy(REST_ROTATION);
    this.root.scale.setScalar(REST_SCALE);
    camera.add(this.root);

    const geometry = new THREE.BoxGeometry(0.22, 0.22, 0.22);
    this.heldMesh = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({
        map: atlas.texture,
        alphaTest: 0.5,
        depthTest: false,
        fog: false,
      }),
    );
    this.heldMesh.renderOrder = 10;
    this.heldRoot.add(this.heldMesh);
    this.heldRoot.position.copy(HELD_POSITION);
    this.heldRoot.rotation.copy(HELD_ROTATION);
    this.heldRoot.visible = false;
    camera.add(this.heldRoot);

    this.buildVest();
    this.vestRoot.position.copy(VEST_POSITION);
    this.vestRoot.rotation.copy(VEST_ROTATION);
    this.vestRoot.visible = false;
    camera.add(this.vestRoot);
  }

  setHeld(block: number | null): void {
    if (block === this.heldBlock) return;
    this.heldBlock = block;
    this.heldRoot.visible = block !== null;
    if (block !== null) paintBlockUvs(this.heldMesh.geometry, block);
  }

  private add(
    width: number,
    height: number,
    depth: number,
    color: number,
    x: number,
    y: number,
    z: number,
    metal?: 'light' | 'mid' | 'dark' | 'rune',
  ): void {
    const mesh = part(width, height, depth, color);
    mesh.position.set(x, y, z);
    if (metal) this.metal.set(mesh, metal);
    this.root.add(mesh);
  }

  setPlates(tier: PlateTier): void {
    if (tier === this.plates) return;
    this.plates = tier;
    this.vestRoot.visible = tier !== PlateTier.None;
    if (tier === PlateTier.None) return;
    const palette = PLATE_METAL[tier];
    for (const [mesh, role] of this.vestMetal) {
      shadeFaces(mesh.geometry, palette[role]);
      mesh.geometry.attributes.color.needsUpdate = true;
    }
  }

  setTier(tier: HammerTier): void {
    if (tier === this.tier) return;
    this.tier = tier;
    const palette = METAL[tier];
    for (const [mesh, role] of this.metal) {
      shadeFaces(mesh.geometry, palette[role]);
      mesh.geometry.attributes.color.needsUpdate = true;
    }
  }

  /** Minecraft-style mallet: a square metal head on a straight wooden haft. */
  private buildHammer(): void {
    const wood = 0x9b6a34;
    const woodDark = 0x6b451f;
    const steel = 0xb9c0c8;
    const steelMid = 0x8b929a;
    const steelDark = 0x5a6068;

    this.add(0.08, 0.86, 0.08, wood, 0, -0.16, 0);
    this.add(0.086, 0.04, 0.086, woodDark, 0, 0.02, 0);
    this.add(0.086, 0.04, 0.086, woodDark, 0, -0.34, 0);

    // Head: one solid block with lighter striking ends and a darker rim, so it
    // reads as chunky pixel art instead of a bevelled prop.
    const hy = 0.32;
    this.add(0.3, 0.2, 0.2, steelMid, 0, hy, 0, 'mid');
    this.add(0.026, 0.18, 0.18, steel, 0.163, hy, 0, 'light');
    this.add(0.026, 0.18, 0.18, steelDark, -0.163, hy, 0, 'dark');
    this.add(0.31, 0.03, 0.21, steel, 0, hy + 0.1, 0, 'light');
    this.add(0.31, 0.03, 0.21, steelDark, 0, hy - 0.1, 0, 'dark');
    this.add(0.018, 0.205, 0.205, steelDark, 0.075, hy, 0, 'dark');
  }

  /** Chunky breastplate at the bottom of the first-person view. */
  private buildVest(): void {
    const steel = 0xb9c0c8;
    const steelMid = 0x8b929a;
    const steelDark = 0x5a6068;

    const add = (
      width: number,
      height: number,
      depth: number,
      color: number,
      x: number,
      y: number,
      z: number,
      metal: 'light' | 'mid' | 'dark',
    ): void => {
      const mesh = part(width, height, depth, color);
      mesh.position.set(x, y, z);
      mesh.renderOrder = 9;
      this.vestMetal.set(mesh, metal);
      this.vestRoot.add(mesh);
    };

    add(0.42, 0.28, 0.14, steelMid, 0, 0, 0, 'mid');
    add(0.44, 0.04, 0.16, steel, 0, 0.14, 0.01, 'light');
    add(0.16, 0.1, 0.12, steelDark, -0.2, 0.16, 0, 'dark');
    add(0.16, 0.1, 0.12, steelDark, 0.2, 0.16, 0, 'dark');
    add(0.08, 0.2, 0.03, steel, 0, 0.02, 0.08, 'light');

    this.vestFlash = new THREE.Mesh(
      new THREE.BoxGeometry(0.46, 0.32, 0.18),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        depthTest: false,
        fog: false,
      }),
    );
    this.vestFlash.renderOrder = 11;
    this.vestRoot.add(this.vestFlash);
  }

  /** Brief glare when the vest cuts a combat hit. */
  flashPlates(): void {
    if (this.plates === PlateTier.None) return;
    this.plateFlash = 0.24;
    if (this.vestFlash) {
      this.vestFlash.material.color.setHex(this.plates === PlateTier.Gold ? 0xffe08a : 0xe8eef6);
    }
  }

  /** `swing` counts down from `swingDuration` to zero after each hit. */
  update(dt: number, swing: number, swingDuration: number, walkSpeed: number): void {
    const progress = swingDuration > 0 ? 1 - Math.min(1, swing / swingDuration) : 1;
    const arc = Math.sin(progress * Math.PI);

    this.swayPhase += dt * walkSpeed * 1.8;
    const sway = Math.min(walkSpeed / 6, 1);

    this.root.position.set(
      REST_POSITION.x + Math.cos(this.swayPhase) * 0.02 * sway - arc * 0.04,
      REST_POSITION.y + Math.abs(Math.sin(this.swayPhase)) * 0.018 * sway - arc * 0.08,
      REST_POSITION.z + Math.sin(this.swayPhase) * 0.01 * sway - arc * 0.08,
    );

    this.root.rotation.x = lerp(REST_ROTATION.x, REST_ROTATION.x + SWING_PITCH, arc);
    this.root.rotation.y = lerp(REST_ROTATION.y, REST_ROTATION.y + SWING_YAW, arc);
    this.root.rotation.z = lerp(REST_ROTATION.z, REST_ROTATION.z + SWING_ROLL, arc);

    this.heldRoot.position.set(
      HELD_POSITION.x - Math.cos(this.swayPhase) * 0.016 * sway + arc * 0.03,
      HELD_POSITION.y + Math.abs(Math.sin(this.swayPhase)) * 0.014 * sway - arc * 0.05,
      HELD_POSITION.z - arc * 0.04,
    );
    this.heldRoot.rotation.x = HELD_ROTATION.x + arc * 0.35;

    const flash = this.plateFlash > 0 ? this.plateFlash / 0.24 : 0;
    if (this.plateFlash > 0) this.plateFlash = Math.max(0, this.plateFlash - dt);
    if (this.vestFlash) this.vestFlash.material.opacity = flash * 0.65;
    this.vestRoot.scale.setScalar(1 + flash * 0.14);
    this.vestRoot.position.set(
      VEST_POSITION.x + Math.cos(this.swayPhase) * 0.008 * sway,
      VEST_POSITION.y + Math.abs(Math.sin(this.swayPhase)) * 0.01 * sway + flash * 0.03,
      VEST_POSITION.z + flash * 0.05,
    );
  }
}
