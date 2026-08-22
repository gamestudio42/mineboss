import * as THREE from 'three';

import type { BlockAtlas } from './atlas.ts';

/**
 * Terrain shares one material: the atlas supplies the colour, vertex colours
 * carry baked ambient occlusion, face shading and block glow.
 */
export function createTerrainMaterial(atlas: BlockAtlas): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({
    map: atlas.texture,
    vertexColors: true,
  });
}

/** Own pass so lakes stay see-through without sorting the solid terrain. */
export function createWaterMaterial(atlas: BlockAtlas): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({
    map: atlas.texture,
    vertexColors: true,
    transparent: true,
    opacity: 0.52,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}
