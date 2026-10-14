import * as THREE from 'three';

import type { World } from '../world/World.ts';

const MAX_LIGHTS = 12;
const REACH = 26;

/**
 * A small pool of point lights assigned to the nearest placed torches.
 * The terrain material is Lambert, so these actually light the cave walls.
 */
export class TorchLights {
  limit = MAX_LIGHTS;
  private readonly lights: THREE.PointLight[] = [];
  private readonly scratch: Array<{ x: number; y: number; z: number; distance: number }> = [];

  constructor(scene: THREE.Scene) {
    for (let i = 0; i < MAX_LIGHTS; i++) {
      const light = new THREE.PointLight(0xffb15a, 0, 16, 2);
      light.visible = false;
      scene.add(light);
      this.lights.push(light);
    }
  }

  update(world: World, x: number, y: number, z: number): void {
    this.scratch.length = 0;

    for (const torch of world.torches.values()) {
      const distance = Math.hypot(torch.x + 0.5 - x, torch.y + 0.7 - y, torch.z + 0.5 - z);
      if (distance > REACH) continue;
      this.scratch.push({ x: torch.x, y: torch.y, z: torch.z, distance });
    }

    this.scratch.sort((a, b) => a.distance - b.distance);

    for (let i = 0; i < this.lights.length; i++) {
      const light = this.lights[i];
      const torch = i < this.limit ? this.scratch[i] : undefined;
      if (!torch) {
        light.intensity = 0;
        light.visible = false;
        continue;
      }

      light.visible = true;
      light.intensity = 16;
      light.position.set(torch.x + 0.5, torch.y + 0.72, torch.z + 0.5);
    }
  }

  clear(): void {
    for (const light of this.lights) {
      light.intensity = 0;
      light.visible = false;
    }
  }
}
