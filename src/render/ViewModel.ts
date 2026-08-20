import * as THREE from 'three';

import { lerp } from '../core/math.ts';

/** Anchored low-right so the head sits in the right third and the crosshair stays clear. */
const REST_POSITION = new THREE.Vector3(0.42, -0.38, -0.64);
const REST_ROTATION = new THREE.Euler(-0.107, 0.216, 0.817);
const REST_SCALE = 0.54;

/** Extra rotation at the bottom of the strike, relative to rest. */
const SWING_PITCH = 0.42;
const SWING_YAW = -0.08;
const SWING_ROLL = 0.18;

function shadeHex(hex: number, amount: number): number {
  const color = new THREE.Color(hex);
  color.r = Math.min(1, color.r * amount);
  color.g = Math.min(1, color.g * amount);
  color.b = Math.min(1, color.b * amount);
  return color.getHex();
}

/**
 * BoxGeometry stores four vertices per face. Darken the sides and bottom so an
 * unlit tool still reads as a solid rather than a flat sticker.
 */
function shadeFaces(geometry: THREE.BoxGeometry, hex: number): void {
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

/** First person hammer attached to the camera. */
export class ViewModel {
  private readonly root = new THREE.Group();
  private swayPhase = 0;

  constructor(camera: THREE.PerspectiveCamera) {
    this.buildHammer();
    this.root.position.copy(REST_POSITION);
    this.root.rotation.copy(REST_ROTATION);
    this.root.scale.setScalar(REST_SCALE);
    camera.add(this.root);
  }

  private add(width: number, height: number, depth: number, color: number, x: number, y: number, z: number): void {
    const mesh = part(width, height, depth, color);
    mesh.position.set(x, y, z);
    this.root.add(mesh);
  }

  /**
   * Voxel sledge with a heavy beveled head: red wood, leather wraps, black
   * ferrule and a runic plate so it reads as a weapon rather than a grey brick.
   */
  private buildHammer(): void {
    const wood = 0x8a3a28;
    const woodDark = 0x5a2418;
    const leather = 0x4a2618;
    const rubber = 0x1a181c;
    const steel = 0xc4c8ce;
    const steelMid = 0x8e949c;
    const steelDark = 0x5c6168;
    const rune = 0xb48cf0;

    this.add(0.056, 0.86, 0.056, wood, 0, 0, 0);
    this.add(0.062, 0.2, 0.062, woodDark, 0, 0.18, 0);

    for (const y of [-0.26, -0.1, 0.06]) {
      this.add(0.074, 0.07, 0.074, leather, 0, y, 0);
      this.add(0.08, 0.012, 0.08, steelDark, 0, y + 0.042, 0);
    }

    this.add(0.082, 0.036, 0.082, steelMid, 0, -0.42, 0);
    this.add(0.07, 0.028, 0.07, rubber, 0, -0.448, 0);
    this.add(0.018, 0.07, 0.04, leather, 0, -0.5, 0.03);
    this.add(0.018, 0.07, 0.04, leather, 0, -0.5, -0.03);
    this.add(0.018, 0.018, 0.08, leather, 0, -0.54, 0);

    this.add(0.088, 0.11, 0.088, rubber, 0, 0.34, 0);
    this.add(0.078, 0.032, 0.078, steelDark, 0, 0.41, 0);

    const hy = 0.54;
    this.add(0.34, 0.2, 0.22, steelMid, 0, hy, 0);
    this.add(0.28, 0.03, 0.16, steel, 0, hy + 0.11, 0);
    this.add(0.28, 0.03, 0.16, steelDark, 0, hy - 0.11, 0);

    this.add(0.22, 0.14, 0.045, steel, 0, hy, 0.13);
    this.add(0.22, 0.14, 0.045, steel, 0, hy, -0.13);
    this.add(0.16, 0.1, 0.018, steelDark, 0, hy, 0.158);
    this.add(0.16, 0.1, 0.018, steelDark, 0, hy, -0.158);

    this.add(0.028, 0.13, 0.14, steelDark, 0.182, hy, 0);
    this.add(0.028, 0.13, 0.14, steelDark, -0.182, hy, 0);
    this.add(0.012, 0.08, 0.018, rune, 0.196, hy, 0);
    this.add(0.012, 0.018, 0.07, rune, 0.196, hy, 0);
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
  }
}
