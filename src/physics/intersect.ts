import type * as THREE from 'three';

export interface Box {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

/** Box around a body whose position is the centre of its footprint. */
export function bodyBox(
  position: THREE.Vector3,
  width: number,
  height: number,
  target: Box,
): Box {
  const half = width / 2;
  target.minX = position.x - half;
  target.minY = position.y;
  target.minZ = position.z - half;
  target.maxX = position.x + half;
  target.maxY = position.y + height;
  target.maxZ = position.z + half;
  return target;
}

export function createBox(): Box {
  return { minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0 };
}

/** Slab test; returns the entry distance or null when the ray misses. */
export function rayBox(
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  box: Box,
  maxDistance: number,
): number | null {
  let near = 0;
  let far = maxDistance;

  const axes: Array<[number, number, number, number]> = [
    [origin.x, direction.x, box.minX, box.maxX],
    [origin.y, direction.y, box.minY, box.maxY],
    [origin.z, direction.z, box.minZ, box.maxZ],
  ];

  for (const [start, delta, min, max] of axes) {
    if (Math.abs(delta) < 1e-8) {
      if (start < min || start > max) return null;
      continue;
    }

    const inverse = 1 / delta;
    let t0 = (min - start) * inverse;
    let t1 = (max - start) * inverse;
    if (t0 > t1) [t0, t1] = [t1, t0];

    near = Math.max(near, t0);
    far = Math.min(far, t1);
    if (near > far) return null;
  }

  return near;
}
