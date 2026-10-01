import * as THREE from 'three';

import { lerp } from '../core/math.ts';
import { HammerTier, PlateTier } from '../player/Hammer.ts';
import { createHammerGeometry } from './HammerModel.ts';
import type { BlockAtlas } from './atlas.ts';
import {
  ATLAS_TILES_PER_ROW,
  TILE_BOTTOM,
  TILE_SIDE,
  TILE_TOP,
} from '../world/blocks.ts';

/** Anchored low-right so the head sits in the right third and the crosshair stays clear. */
const REST_POSITION = new THREE.Vector3(0.48, -0.46, -0.88);
const REST_ROTATION = new THREE.Euler(0.08, -0.38, 0.27);
const REST_SCALE = 0.72;
const VIEW_MODEL_LAYER = 1;

/** Extra rotation at the bottom of the strike, relative to rest. */
const SWING_PITCH = -0.85;
const SWING_YAW = -0.16;
const SWING_ROLL = 0.48;

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
    new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }),
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
  private readonly hammer = new THREE.Mesh(
    createHammerGeometry(HammerTier.Wood),
    new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }),
  );
  private readonly vestMetal = new Map<THREE.Mesh, 'light' | 'mid' | 'dark'>();
  private swayPhase = 0;
  private plateFlash = 0;
  private tier = HammerTier.Wood;
  private plates = PlateTier.None;
  private heldBlock: number | null = null;
  private vestFlash: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial> | null = null;

  constructor(private readonly camera: THREE.PerspectiveCamera, atlas: BlockAtlas) {
    this.root.add(this.hammer);
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
    for (const root of [this.root, this.heldRoot, this.vestRoot]) {
      root.traverse(object => object.layers.set(VIEW_MODEL_LAYER));
    }
  }

  /** Clear world depth once, then let tool parts occlude each other correctly. */
  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene): void {
    const mask = this.camera.layers.mask;
    const autoClear = renderer.autoClear;
    const autoReset = renderer.info.autoReset;
    const background = scene.background;
    try {
      renderer.autoClear = false;
      renderer.info.autoReset = false;
      scene.background = null;
      renderer.clearDepth();
      this.camera.layers.set(VIEW_MODEL_LAYER);
      renderer.render(scene, this.camera);
    } finally {
      this.camera.layers.mask = mask;
      renderer.autoClear = autoClear;
      renderer.info.autoReset = autoReset;
      scene.background = background;
    }
  }

  setHeld(block: number | null): void {
    if (block === this.heldBlock) return;
    this.heldBlock = block;
    this.heldRoot.visible = block !== null;
    if (block !== null) paintBlockUvs(this.heldMesh.geometry, block);
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
    this.hammer.geometry.dispose();
    this.hammer.geometry = createHammerGeometry(tier);
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
    // Brief wind-up, fast contact, then a softer return to the resting pose.
    const contact = progress < 0.18 ? 0 : progress < 0.52
      ? (progress - 0.18) / 0.34 : (1 - progress) / 0.48;
    const arc = Math.sin(Math.max(0, contact) * Math.PI / 2);
    const windup = progress < 0.18 ? Math.sin(progress / 0.18 * Math.PI) : 0;

    this.swayPhase += dt * walkSpeed * 1.8;
    const sway = Math.min(walkSpeed / 6, 1);

    this.root.position.set(
      REST_POSITION.x + Math.cos(this.swayPhase) * 0.014 * sway - arc * 0.15,
      REST_POSITION.y + Math.abs(Math.sin(this.swayPhase)) * 0.012 * sway - arc * 0.1 + windup * 0.035,
      REST_POSITION.z + Math.sin(this.swayPhase) * 0.008 * sway - arc * 0.16 + windup * 0.025,
    );

    this.root.rotation.x = lerp(REST_ROTATION.x, REST_ROTATION.x + SWING_PITCH, arc) + windup * 0.12;
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
