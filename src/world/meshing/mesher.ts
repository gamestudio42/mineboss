import {
  ATLAS_TILES_PER_ROW,
  Block,
  GLOW,
  OPAQUE,
  TILE_BOTTOM,
  TILE_SIDE,
  TILE_TOP,
  Tile,
} from '../blocks.ts';
import { SECTION_HEIGHT } from '../Chunk.ts';

/** Padded volume: the 16^3 section plus one block of neighbours on every side. */
export const VOLUME_SIZE = SECTION_HEIGHT + 2;
export const VOLUME_LENGTH = VOLUME_SIZE ** 3;

/** Blocks with at least this much glow are drawn unlit so they light up caves. */
const EMISSIVE_THRESHOLD = 0.3;

/** Half a texel, keeps nearest sampling away from the neighbouring atlas tile. */
const UV_INSET = 0.5 / 16;

const AO_BRIGHTNESS = [0.42, 0.62, 0.82, 1] as const;

export function volumeIndex(x: number, y: number, z: number): number {
  return ((y + 1) * VOLUME_SIZE + (z + 1)) * VOLUME_SIZE + (x + 1);
}

type Vec3 = readonly [number, number, number];

interface FaceDef {
  normal: Vec3;
  /** Texture-space right axis. */
  u: Vec3;
  /** Texture-space up axis; `u x v` equals the normal so quads wind CCW. */
  v: Vec3;
  shade: number;
  tileOf: Uint8Array;
}

const FACES: readonly FaceDef[] = [
  { normal: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0], shade: 0.72, tileOf: TILE_SIDE },
  { normal: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0], shade: 0.72, tileOf: TILE_SIDE },
  { normal: [0, 1, 0], u: [0, 0, 1], v: [1, 0, 0], shade: 1, tileOf: TILE_TOP },
  { normal: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1], shade: 0.5, tileOf: TILE_BOTTOM },
  { normal: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0], shade: 0.86, tileOf: TILE_SIDE },
  { normal: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0], shade: 0.86, tileOf: TILE_SIDE },
];

/** Corner offsets along (u, v) in the face plane, wound counter-clockwise. */
const CORNERS: readonly (readonly [number, number])[] = [
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1],
];

export interface SectionMesh {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  colors: Float32Array;
  indices: Uint32Array;
  /** Index count of the lit group; the remainder is the unlit emissive group. */
  litIndexCount: number;
}

/** Freshly allocated every time: the buffers are transferred out of the worker. */
export function emptyMesh(): SectionMesh {
  return {
    positions: new Float32Array(0),
    normals: new Float32Array(0),
    uvs: new Float32Array(0),
    colors: new Float32Array(0),
    indices: new Uint32Array(0),
    litIndexCount: 0,
  };
}

function vertexAO(side1: number, side2: number, corner: number): number {
  if (side1 === 1 && side2 === 1) return 0;
  return 3 - (side1 + side2 + corner);
}

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

/** Thin upright stick plus a glowing head, so a torch is not a full cube. */
function emitTorch(
  positions: number[],
  normals: number[],
  uvs: number[],
  colors: number[],
  indices: number[],
  vertexCount: number,
  x: number,
  y: number,
  z: number,
): number {
  const cx = x + 0.5;
  const cz = z + 0.5;
  vertexCount = emitBox(
    positions,
    normals,
    uvs,
    colors,
    indices,
    vertexCount,
    cx - 0.06,
    y,
    cz - 0.06,
    cx + 0.06,
    y + 0.62,
    cz + 0.06,
    Tile.Torch,
    0.72,
  );
  return emitBox(
    positions,
    normals,
    uvs,
    colors,
    indices,
    vertexCount,
    cx - 0.1,
    y + 0.54,
    cz - 0.1,
    cx + 0.1,
    y + 0.86,
    cz + 0.1,
    Tile.TorchFlame,
    1.15,
  );
}

function emitBox(
  positions: number[],
  normals: number[],
  uvs: number[],
  colors: number[],
  indices: number[],
  vertexCount: number,
  x0: number,
  y0: number,
  z0: number,
  x1: number,
  y1: number,
  z1: number,
  tile: number,
  brightness: number,
): number {
  const { u0, u1, v0, v1 } = tileUv(tile);
  const faces: Array<{ n: Vec3; corners: Array<Vec3> }> = [
    {
      n: [1, 0, 0],
      corners: [
        [x1, y0, z0],
        [x1, y0, z1],
        [x1, y1, z1],
        [x1, y1, z0],
      ],
    },
    {
      n: [-1, 0, 0],
      corners: [
        [x0, y0, z1],
        [x0, y0, z0],
        [x0, y1, z0],
        [x0, y1, z1],
      ],
    },
    {
      n: [0, 1, 0],
      corners: [
        [x0, y1, z0],
        [x1, y1, z0],
        [x1, y1, z1],
        [x0, y1, z1],
      ],
    },
    {
      n: [0, -1, 0],
      corners: [
        [x0, y0, z1],
        [x1, y0, z1],
        [x1, y0, z0],
        [x0, y0, z0],
      ],
    },
    {
      n: [0, 0, 1],
      corners: [
        [x0, y0, z1],
        [x0, y1, z1],
        [x1, y1, z1],
        [x1, y0, z1],
      ],
    },
    {
      n: [0, 0, -1],
      corners: [
        [x1, y0, z0],
        [x1, y1, z0],
        [x0, y1, z0],
        [x0, y0, z0],
      ],
    },
  ];

  const uvCorners = [
    [u0, v0],
    [u1, v0],
    [u1, v1],
    [u0, v1],
  ] as const;

  for (const face of faces) {
    const shade = brightness * (0.55 + 0.45 * Math.max(0, face.n[1] * 0.5 + 0.5));
    const base = vertexCount;
    for (let i = 0; i < 4; i++) {
      const [px, py, pz] = face.corners[i];
      positions.push(px, py, pz);
      normals.push(face.n[0], face.n[1], face.n[2]);
      uvs.push(uvCorners[i][0], uvCorners[i][1]);
      colors.push(shade, shade, shade);
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    vertexCount += 4;
  }

  return vertexCount;
}

/** Water only draws faces that touch air or another non-water block. */
function emitWater(
  volume: Uint8Array,
  positions: number[],
  normals: number[],
  uvs: number[],
  colors: number[],
  indices: number[],
  vertexCount: number,
  x: number,
  y: number,
  z: number,
): number {
  const { u0, u1, v0, v1 } = tileUv(Tile.Water);

  for (const face of FACES) {
    const [nx, ny, nz] = face.normal;
    const neighbor = volume[volumeIndex(x + nx, y + ny, z + nz)];
    if (neighbor === Block.Water || OPAQUE[neighbor] === 1) continue;

    const [ux, uy, uz] = face.u;
    const [vx, vy, vz] = face.v;
    const drop = ny > 0 ? 0.12 : 0;

    for (const [su, sv] of CORNERS) {
      positions.push(
        x + 0.5 + (nx + ux * su + vx * sv) * 0.5,
        y + 0.5 + (ny + uy * su + vy * sv) * 0.5 - drop,
        z + 0.5 + (nz + uz * su + vz * sv) * 0.5,
      );
      normals.push(nx, ny, nz);
      const texU = (su + 1) / 2;
      const texV = (sv + 1) / 2;
      uvs.push(u0 + texU * (u1 - u0), v0 + texV * (v1 - v0));
      const brightness = face.shade * 0.92;
      colors.push(brightness, brightness, brightness);
    }

    const base = vertexCount;
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    vertexCount += 4;
  }

  return vertexCount;
}

/**
 * Turns a padded voxel volume into renderable geometry.
 *
 * Only faces that touch a non-opaque neighbour are emitted, and every vertex
 * carries baked ambient occlusion plus per-face shading in its colour.
 */
export function buildSectionMesh(volume: Uint8Array): SectionMesh {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];
  const litIndices: number[] = [];
  const emissiveIndices: number[] = [];

  let vertexCount = 0;

  for (let y = 0; y < SECTION_HEIGHT; y++) {
    for (let z = 0; z < SECTION_HEIGHT; z++) {
      for (let x = 0; x < SECTION_HEIGHT; x++) {
        const block = volume[volumeIndex(x, y, z)];
        if (block === Block.Air) continue;
        if (block === Block.Torch) {
          vertexCount = emitTorch(positions, normals, uvs, colors, emissiveIndices, vertexCount, x, y, z);
          continue;
        }
        if (block === Block.Water) {
          vertexCount = emitWater(volume, positions, normals, uvs, colors, litIndices, vertexCount, x, y, z);
          continue;
        }
        if (OPAQUE[block] !== 1) continue;

        const glow = GLOW[block];
        const emissive = glow >= EMISSIVE_THRESHOLD;

        for (const face of FACES) {
          const [nx, ny, nz] = face.normal;
          if (OPAQUE[volume[volumeIndex(x + nx, y + ny, z + nz)]] === 1) continue;

          const [ux, uy, uz] = face.u;
          const [vx, vy, vz] = face.v;

          const tile = face.tileOf[block];
          const tx = tile % ATLAS_TILES_PER_ROW;
          const ty = Math.floor(tile / ATLAS_TILES_PER_ROW);
          const u0 = (tx + UV_INSET) / ATLAS_TILES_PER_ROW;
          const u1 = (tx + 1 - UV_INSET) / ATLAS_TILES_PER_ROW;
          const v0 = 1 - (ty + 1 - UV_INSET) / ATLAS_TILES_PER_ROW;
          const v1 = 1 - (ty + UV_INSET) / ATLAS_TILES_PER_ROW;

          const occlusion: number[] = [];

          for (const [su, sv] of CORNERS) {
            positions.push(
              x + 0.5 + (nx + ux * su + vx * sv) * 0.5,
              y + 0.5 + (ny + uy * su + vy * sv) * 0.5,
              z + 0.5 + (nz + uz * su + vz * sv) * 0.5,
            );
            normals.push(nx, ny, nz);

            const texU = (su + 1) / 2;
            const texV = (sv + 1) / 2;
            uvs.push(u0 + texU * (u1 - u0), v0 + texV * (v1 - v0));

            // Ambient occlusion samples the two edge neighbours and the corner
            // neighbour that share this vertex on the outer side of the face.
            const side1 =
              OPAQUE[volume[volumeIndex(x + nx + ux * su, y + ny + uy * su, z + nz + uz * su)]];
            const side2 =
              OPAQUE[volume[volumeIndex(x + nx + vx * sv, y + ny + vy * sv, z + nz + vz * sv)]];
            const diagonal =
              OPAQUE[
                volume[
                  volumeIndex(
                    x + nx + ux * su + vx * sv,
                    y + ny + uy * su + vy * sv,
                    z + nz + uz * su + vz * sv,
                  )
                ]
              ];

            const ao = vertexAO(side1, side2, diagonal);
            occlusion.push(ao);

            let brightness = face.shade * AO_BRIGHTNESS[ao];
            if (glow > 0) brightness += (1 - brightness) * glow * 0.85;
            colors.push(brightness, brightness, brightness);
          }

          const target = emissive ? emissiveIndices : litIndices;
          const base = vertexCount;
          // Flip the diagonal when it would otherwise cut across the AO gradient.
          if (occlusion[0] + occlusion[2] > occlusion[1] + occlusion[3]) {
            target.push(base, base + 1, base + 3, base + 1, base + 2, base + 3);
          } else {
            target.push(base, base + 1, base + 2, base, base + 2, base + 3);
          }
          vertexCount += 4;
        }
      }
    }
  }

  if (vertexCount === 0) return emptyMesh();

  const indices = new Uint32Array(litIndices.length + emissiveIndices.length);
  indices.set(litIndices, 0);
  indices.set(emissiveIndices, litIndices.length);

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    uvs: new Float32Array(uvs),
    colors: new Float32Array(colors),
    indices,
    litIndexCount: litIndices.length,
  };
}
