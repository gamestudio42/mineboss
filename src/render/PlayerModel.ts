import * as THREE from 'three';

import { HammerTier, PlateTier } from '../player/Hammer.ts';
import {
  ATLAS_TILES_PER_ROW,
  TILE_BOTTOM,
  TILE_SIDE,
  TILE_TOP,
} from '../world/blocks.ts';
import type { BlockAtlas } from './atlas.ts';
import { createHammerGeometry } from './HammerModel.ts';

const SKIN = 0xf0c9a0;
const HAIR = 0x5c3a24;
const SHIRT = 0x3d8fd1;
const SHIRT_DARK = 0x2b6ea8;
const PANTS = 0x3a4a6b;
const SHOES = 0x4a3728;
const EYE = 0x2a2420;

const PLATE_METAL: Record<PlateTier.Iron | PlateTier.Gold, { body: number; trim: number }> = {
  [PlateTier.Iron]: { body: 0x9aa4b0, trim: 0xdce3ec },
  [PlateTier.Gold]: { body: 0xd4a84a, trim: 0xffe08a },
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
      uv.setXY(face * 4 + i, u0 + corners[i][0] * (u1 - u0), v0 + corners[i][1] * (v1 - v0));
    }
  }
  uv.needsUpdate = true;
}

function box(
  parent: THREE.Object3D,
  width: number,
  height: number,
  depth: number,
  color: number,
  x: number,
  y: number,
  z: number,
): THREE.Mesh<THREE.BoxGeometry, THREE.MeshLambertMaterial> {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    new THREE.MeshLambertMaterial({ color }),
  );
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

export interface PlayerPose {
  x: number;
  y: number;
  z: number;
  yaw: number;
  moving: boolean;
  speed: number;
  swing: number;
  swingDuration: number;
  reducedMotion: boolean;
}

/**
 * Blocky person standing on the player's feet. The face looks along local -Z,
 * which matches the player's yaw. Armor is a slightly larger shell so the
 * suit reads without covering the eyes.
 */
export class PlayerModel {
  readonly root = new THREE.Group();

  private readonly leftLeg = new THREE.Group();
  private readonly rightLeg = new THREE.Group();
  private readonly leftArm = new THREE.Group();
  private readonly rightArm = new THREE.Group();
  private readonly armor: Array<{ mesh: THREE.Mesh<THREE.BoxGeometry, THREE.MeshLambertMaterial>; trim: boolean }> = [];
  private readonly hair: THREE.Mesh[] = [];
  private readonly hammer: THREE.Mesh;
  private readonly held: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>;
  private walkPhase = 0;
  private walkAmount = 0;
  private plates = PlateTier.None;
  private tier = HammerTier.Wood;
  private heldBlock: number | null = null;

  constructor(atlas: BlockAtlas) {
    const hip = 0.74;
    const shoulder = 1.28;

    this.leftLeg.position.set(-0.12, hip, 0);
    this.rightLeg.position.set(0.12, hip, 0);
    this.root.add(this.leftLeg, this.rightLeg);
    box(this.leftLeg, 0.2, 0.7, 0.22, PANTS, 0, -0.35, 0);
    box(this.rightLeg, 0.2, 0.7, 0.22, PANTS, 0, -0.35, 0);
    box(this.leftLeg, 0.22, 0.14, 0.26, SHOES, 0, -0.64, -0.02);
    box(this.rightLeg, 0.22, 0.14, 0.26, SHOES, 0, -0.64, -0.02);
    this.suitPiece(this.leftLeg, 0.24, 0.42, 0.08, 0, -0.22, -0.12, false);
    this.suitPiece(this.rightLeg, 0.24, 0.42, 0.08, 0, -0.22, -0.12, false);
    this.suitPiece(this.leftLeg, 0.24, 0.16, 0.28, 0, -0.6, -0.02, true);
    this.suitPiece(this.rightLeg, 0.24, 0.16, 0.28, 0, -0.6, -0.02, true);

    const torso = new THREE.Group();
    torso.position.y = 1.02;
    this.root.add(torso);
    box(torso, 0.46, 0.56, 0.26, SHIRT, 0, 0, 0);
    box(torso, 0.2, 0.16, 0.04, SHIRT_DARK, 0, 0.08, -0.14);
    this.suitPiece(torso, 0.52, 0.5, 0.1, 0, 0.02, -0.14, false);
    this.suitPiece(torso, 0.52, 0.5, 0.1, 0, 0.02, 0.16, false);
    this.suitPiece(torso, 0.5, 0.08, 0.3, 0, 0.26, 0, true);

    const head = new THREE.Group();
    head.position.y = 1.58;
    this.root.add(head);
    const face = box(head, 0.44, 0.44, 0.44, SKIN, 0, 0, 0);
    face.material.emissive.setHex(0x8a6244);
    face.material.emissiveIntensity = 0.55;
    this.hair.push(box(head, 0.46, 0.16, 0.46, HAIR, 0, 0.22, 0.02));
    this.hair.push(box(head, 0.46, 0.28, 0.12, HAIR, 0, 0.06, 0.16));
    const eyeWhite = new THREE.MeshBasicMaterial({ color: 0xf4f1ea });
    const pupil = new THREE.MeshBasicMaterial({ color: EYE });
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.03), eyeWhite);
      eye.position.set(side * 0.1, 0.04, -0.23);
      const dot = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, 0.02), pupil);
      dot.position.set(side * 0.1, 0.03, -0.25);
      head.add(eye, dot);
    }
    const smile = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 0.035, 0.03),
      new THREE.MeshBasicMaterial({ color: 0x8a4b3a }),
    );
    smile.position.set(0, -0.1, -0.25);
    head.add(smile);
    this.suitPiece(head, 0.56, 0.2, 0.56, 0, 0.24, 0, true);
    this.suitPiece(head, 0.52, 0.28, 0.08, -0.24, 0.02, 0, false);
    this.suitPiece(head, 0.52, 0.28, 0.08, 0.24, 0.02, 0, false);
    this.suitPiece(head, 0.52, 0.28, 0.1, 0, 0.02, 0.22, false);

    this.leftArm.position.set(-0.34, shoulder, 0);
    this.rightArm.position.set(0.34, shoulder, 0);
    this.root.add(this.leftArm, this.rightArm);
    box(this.leftArm, 0.16, 0.58, 0.16, SKIN, 0, -0.32, 0);
    box(this.rightArm, 0.16, 0.58, 0.16, SKIN, 0, -0.32, 0);
    box(this.leftArm, 0.18, 0.16, 0.18, SHIRT, 0, -0.06, 0);
    box(this.rightArm, 0.18, 0.16, 0.18, SHIRT, 0, -0.06, 0);
    this.suitPiece(this.leftArm, 0.22, 0.14, 0.22, 0, -0.04, 0, true);
    this.suitPiece(this.rightArm, 0.22, 0.14, 0.22, 0, -0.04, 0, true);
    this.suitPiece(this.leftArm, 0.2, 0.36, 0.08, 0, -0.28, -0.1, false);
    this.suitPiece(this.rightArm, 0.2, 0.36, 0.08, 0, -0.28, -0.1, false);

    this.hammer = new THREE.Mesh(
      createHammerGeometry(HammerTier.Wood),
      new THREE.MeshLambertMaterial({ vertexColors: true }),
    );
    this.hammer.scale.setScalar(0.52);
    this.hammer.position.set(0.1, -0.55, -0.28);
    this.hammer.rotation.set(0.55, 0.2, 0.15);
    this.rightArm.add(this.hammer);

    const heldGeometry = new THREE.BoxGeometry(0.26, 0.26, 0.26);
    this.held = new THREE.Mesh(
      heldGeometry,
      new THREE.MeshBasicMaterial({ map: atlas.texture, alphaTest: 0.5 }),
    );
    this.held.position.set(0.16, -0.58, -0.28);
    this.held.visible = false;
    this.rightArm.add(this.held);

    this.root.visible = false;
  }

  setVisible(visible: boolean): void {
    this.root.visible = visible;
  }

  setPlates(tier: PlateTier): void {
    if (tier === this.plates) return;
    this.plates = tier;
    const show = tier !== PlateTier.None;
    const palette = show ? PLATE_METAL[tier as PlateTier.Iron | PlateTier.Gold] : null;
    for (const piece of this.armor) {
      piece.mesh.visible = show;
      if (palette) {
        piece.mesh.material.color.setHex(piece.trim ? palette.trim : palette.body);
        piece.mesh.material.emissive.setHex(piece.trim ? palette.trim : palette.body);
        piece.mesh.material.emissiveIntensity = 0.22;
      }
    }
    for (const mesh of this.hair) mesh.visible = !show;
  }

  setTier(tier: HammerTier): void {
    if (tier === this.tier) return;
    this.tier = tier;
    this.hammer.geometry.dispose();
    this.hammer.geometry = createHammerGeometry(tier);
  }

  setHeld(block: number | null): void {
    if (block === this.heldBlock) return;
    this.heldBlock = block;
    this.held.visible = block !== null;
    if (block !== null) paintBlockUvs(this.held.geometry, block);
  }

  update(dt: number, pose: PlayerPose): void {
    const stride = pose.reducedMotion ? 0.16 : 0.62;
    const target = pose.moving ? Math.min(pose.speed / 4.6, 1) : 0;
    this.walkAmount += (target - this.walkAmount) * Math.min(1, dt * 8);
    this.walkPhase += dt * Math.max(pose.speed, 0.01) * 7;
    const step = Math.sin(this.walkPhase) * stride * this.walkAmount;
    this.leftLeg.rotation.x = step;
    this.rightLeg.rotation.x = -step;
    this.leftArm.rotation.x = -step * 0.75;

    const progress = pose.swingDuration > 0 ? 1 - Math.min(1, pose.swing / pose.swingDuration) : 1;
    const attack = pose.swing > 0 ? Math.sin(Math.min(1, progress) * Math.PI) : 0;
    this.rightArm.rotation.x = attack > 0.01 ? -1.2 * attack : step * 0.75;

    const bob = pose.reducedMotion ? 0 : Math.abs(Math.sin(this.walkPhase)) * 0.045 * this.walkAmount;
    this.root.position.set(pose.x, pose.y + bob, pose.z);
    this.root.rotation.y = pose.yaw;
  }

  /** A plate that sits just outside the body. Hidden until a suit is forged. */
  private suitPiece(
    parent: THREE.Object3D,
    width: number,
    height: number,
    depth: number,
    x: number,
    y: number,
    z: number,
    trim: boolean,
  ): void {
    const mesh = box(parent, width, height, depth, PLATE_METAL[PlateTier.Iron].body, x, y, z);
    mesh.visible = false;
    this.armor.push({ mesh, trim });
  }
}
