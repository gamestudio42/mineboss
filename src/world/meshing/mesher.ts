import {
  ATLAS_TILES_PER_ROW,
  Block,
  GLOW,
  OPAQUE,
  TILE_BOTTOM,
  TILE_SIDE,
  TILE_TOP,
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
        if (block === Block.Air || OPAQUE[block] !== 1) continue;

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
