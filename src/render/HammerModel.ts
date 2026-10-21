import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { HammerTier } from '../player/Hammer.ts';

const PALETTES = {
  [HammerTier.Wood]: { body: 0xb77b42, edge: 0xe7b86c, band: 0x574838, socket: 0x382c25, gem: 0xf5ca76 },
  [HammerTier.Iron]: { body: 0x859caf, edge: 0xe2edf0, band: 0x344c61, socket: 0x233140, gem: 0x65e6df },
  [HammerTier.Gold]: { body: 0xdb9c35, edge: 0xffe394, band: 0x80502e, socket: 0x4d302e, gem: 0x83f4cb },
};

export interface HammerMeshOptions {
  /** First-person view paints a glove on the shaft; the third-person body already has an arm. */
  glove?: boolean;
  /** Shift the mesh so the grip sits at the origin and a parent can place the hand. */
  gripAtOrigin?: boolean;
}

/** Centre of the leather wrap — the point a fist should close around. */
export const HAMMER_GRIP_Y = -0.35;

/** Small voxel solids merged into one draw call; colors stay readable in caves. */
export function createHammerGeometry(tier: HammerTier, options: HammerMeshOptions = {}): THREE.BufferGeometry {
  const p = PALETTES[tier];
  const pieces: THREE.BufferGeometry[] = [];
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, hex: number): void => {
    const geometry = new THREE.BoxGeometry(w, h, d);
    const color = new THREE.Color(hex);
    const shades = [0.78, 0.64, 1, 0.48, 0.92, 0.7];
    const colors = new Float32Array(24 * 3);
    for (let face = 0; face < 6; face++) {
      const tint = color.clone().multiplyScalar(shades[face]);
      for (let v = 0; v < 4; v++) tint.toArray(colors, (face * 4 + v) * 3);
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.translate(x, y, z);
    pieces.push(geometry);
  };

  // Oak shaft, a ferrule under the head and a leather-wrapped grip.
  box(0.105, 0.9, 0.105, 0, -0.08, 0, 0x956035);
  box(0.025, 0.43, 0.007, -0.024, 0.05, 0.056, 0xc68b4c);
  box(0.012, 0.24, 0.008, 0.025, 0.13, 0.056, 0x613e27);
  box(0.145, 0.1, 0.14, 0, 0.19, 0, p.band);
  box(0.13, 0.36, 0.13, 0, -0.31, 0, 0x49352f);
  for (let i = 0; i < 5; i++) box(0.143, 0.024, 0.143, 0, -0.16 - i * 0.067, 0, 0x8c6250);
  box(0.17, 0.07, 0.16, 0, -0.52, 0, p.band);
  box(0.12, 0.025, 0.115, 0, -0.566, 0, p.edge);

  // Broad head with stepped end caps and a raised central band.
  const hy = 0.39;
  box(0.55, 0.29, 0.27, 0, hy, 0, p.body);
  box(0.48, 0.025, 0.235, 0, hy + 0.1575, 0, p.edge);
  for (const side of [-1, 1]) {
    box(0.075, 0.33, 0.305, side * 0.27, hy, 0, p.band);
    box(0.055, 0.275, 0.255, side * 0.335, hy, 0, p.edge);
    box(0.018, 0.205, 0.185, side * 0.371, hy, 0, p.body);
    // Inlaid face panels and small square rivets.
    box(0.145, 0.175, 0.012, side * 0.155, hy, 0.141, p.edge);
    box(0.033, 0.033, 0.019, side * 0.22, hy + 0.09, 0.152, p.socket);
    box(0.033, 0.033, 0.019, side * 0.22, hy - 0.09, 0.152, p.socket);
  }
  box(0.125, 0.34, 0.306, 0, hy, 0, p.band);
  box(0.105, 0.15, 0.03, 0, hy, 0.169, p.socket);
  // A pixel-cut gem identifies the upgraded hammers at a glance.
  box(0.071, 0.09, 0.022, 0, hy, 0.195, p.gem);
  box(0.042, 0.125, 0.019, 0, hy, 0.194, p.gem);
  box(0.023, 0.035, 0.006, -0.014, hy + 0.022, 0.209, 0xfff3cf);

  if (options.glove !== false) {
    // A blocky glove wraps the shaft, with a visible thumb and blue sleeve.
    box(0.19, 0.16, 0.185, 0.025, -0.285, 0.018, 0xb77b51);
    box(0.07, 0.12, 0.075, -0.06, -0.245, 0.108, 0xd49a67);
    for (let i = 0; i < 3; i++) box(0.11, 0.012, 0.008, 0.055, -0.24 - i * 0.043, 0.115, 0x855338);
    box(0.2, 0.065, 0.19, 0.034, -0.4, 0.019, 0x284d64);
    box(0.195, 0.25, 0.18, 0.04, -0.55, 0.013, 0x447e97);
  }

  const merged = mergeGeometries(pieces, false)!;
  for (const geometry of pieces) geometry.dispose();
  if (options.gripAtOrigin) merged.translate(0, -HAMMER_GRIP_Y, 0);
  merged.computeBoundingSphere();
  return merged;
}
