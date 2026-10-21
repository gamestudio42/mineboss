import * as THREE from 'three';

/** 8×8 voxels on each head face. Nearest filtering keeps the pixels chunky. */
export const FACE_PX = 8;

export const SKIN_RGB = [232, 184, 142] as const;
export const SKIN_SHADOW_RGB = [204, 148, 108] as const;
export const NOSE_RGB = [210, 132, 96] as const;
export const LIP_RGB = [176, 110, 86] as const;
export const HAIR_RGB = [58, 36, 22] as const;
export const HAIR_LIGHT_RGB = [90, 56, 36] as const;
export const WHITE_RGB = [255, 252, 246] as const;
export const PUPIL_RGB = [62, 40, 28] as const;
export const BROW_RGB = [90, 56, 36] as const;
export const EAR_RGB = [196, 130, 96] as const;

export type Rgb = readonly [number, number, number];

const S = SKIN_RGB;
const D = SKIN_SHADOW_RGB;
const N = NOSE_RGB;
const L = LIP_RGB;
const H = HAIR_RGB;
const A = HAIR_LIGHT_RGB;
const W = WHITE_RGB;
const P = PUPIL_RGB;
const B = BROW_RGB;
const E = EAR_RGB;

/**
 * Front of the head, top row first. Features stay painted on the cube — the
 * same idea as a classic voxel miner, not a copy of any commercial skin.
 *
 * H hair · S skin · B brow · W white · P pupil · N nose · L lip
 */
export const PLAYER_FACE: Rgb[][] = [
  [H, H, H, H, H, H, H, H],
  [H, H, S, S, S, S, H, H],
  [S, S, B, S, S, B, S, S],
  [S, W, P, S, S, P, W, S],
  [S, W, W, S, S, W, W, S],
  [S, S, S, N, N, S, S, S],
  [S, S, S, L, L, S, S, S],
  [S, S, S, S, S, S, S, S],
];

export const PLAYER_HEAD_TOP: Rgb[][] = [
  [H, H, H, A, A, H, H, H],
  [H, H, H, A, A, H, H, H],
  [H, H, H, H, H, H, H, H],
  [H, H, H, H, H, H, H, H],
  [H, H, H, H, H, H, H, H],
  [H, H, H, H, H, H, H, H],
  [H, H, H, H, H, H, H, H],
  [H, H, H, H, H, H, H, H],
];

export const PLAYER_HEAD_BOTTOM: Rgb[][] = Array.from({ length: FACE_PX }, () =>
  Array.from({ length: FACE_PX }, () => S),
);

export const PLAYER_HEAD_BACK: Rgb[][] = [
  [H, H, H, A, A, H, H, H],
  [H, H, H, H, H, H, H, H],
  [H, H, H, H, H, H, H, H],
  [H, H, H, H, H, H, H, H],
  [H, H, H, H, H, H, H, H],
  [H, H, H, H, H, H, H, H],
  [H, H, D, D, D, D, H, H],
  [H, H, D, D, D, D, H, H],
];

/** +X (character's left) and -X (character's right): hair cap, skin, ear. */
export const PLAYER_HEAD_SIDE: Rgb[][] = [
  [H, H, H, H, H, H, H, H],
  [H, H, H, H, H, H, H, H],
  [H, H, H, S, S, H, H, H],
  [S, S, S, E, E, S, S, S],
  [S, S, S, E, E, S, S, S],
  [S, S, S, S, S, S, S, S],
  [S, S, D, D, D, D, S, S],
  [S, S, D, D, D, D, S, S],
];

function pixelsToTexture(pixels: Rgb[][]): THREE.DataTexture {
  const height = pixels.length;
  const width = pixels[0].length;
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // DataTexture has origin at the bottom-left; the art is top-first.
      const offset = ((height - 1 - y) * width + x) * 4;
      const [r, g, b] = pixels[y][x];
      data[offset] = r;
      data[offset + 1] = g;
      data[offset + 2] = b;
      data[offset + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Six materials for a BoxGeometry (+x, -x, +y, -y, +z, -z). The face looks
 * along local -Z, matching the player yaw.
 */
export function createPlayerHeadMaterials(): THREE.MeshBasicMaterial[] {
  const maps = [
    PLAYER_HEAD_SIDE,
    PLAYER_HEAD_SIDE,
    PLAYER_HEAD_TOP,
    PLAYER_HEAD_BOTTOM,
    PLAYER_HEAD_BACK,
    PLAYER_FACE,
  ];
  return maps.map(
    (pixels) =>
      new THREE.MeshBasicMaterial({
        map: pixelsToTexture(pixels),
      }),
  );
}
