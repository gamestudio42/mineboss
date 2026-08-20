import * as THREE from 'three';

import { lerp } from '../core/math.ts';

const REST_POSITION = new THREE.Vector3(0.44, -0.36, -1);

function part(
  width: number,
  height: number,
  depth: number,
  color: number,
): THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial> {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    // Unlit and depth-tested off: the tool must never clip into a wall or go
    // black when the miner's lamp sits on top of it.
    new THREE.MeshBasicMaterial({ color, depthTest: false, fog: false }),
  );
  mesh.renderOrder = 10;
  return mesh;
}

/** First person pickaxe attached to the camera. */
export class ViewModel {
  private readonly root = new THREE.Group();
  private swayPhase = 0;

  constructor(camera: THREE.PerspectiveCamera) {
    const handle = part(0.07, 0.62, 0.07, 0x8a6a3f);
    const headLeft = part(0.16, 0.1, 0.09, 0x9aa0a8);
    const headRight = part(0.16, 0.1, 0.09, 0x82888f);
    const tip = part(0.08, 0.09, 0.08, 0xb9c0c8);

    headLeft.position.set(-0.11, 0.28, 0);
    headRight.position.set(0.11, 0.28, 0);
    tip.position.set(0, 0.34, 0);

    this.root.add(handle, headLeft, headRight, tip);
    this.root.position.copy(REST_POSITION);
    this.root.rotation.set(0.2, -0.35, -0.3);
    this.root.scale.setScalar(0.72);

    camera.add(this.root);
  }

  /** `swing` counts down from `swingDuration` to zero after each hit. */
  update(dt: number, swing: number, swingDuration: number, walkSpeed: number): void {
    const progress = swingDuration > 0 ? 1 - Math.min(1, swing / swingDuration) : 1;
    const arc = Math.sin(progress * Math.PI);

    this.swayPhase += dt * walkSpeed * 1.8;
    const sway = Math.min(walkSpeed / 6, 1);

    this.root.position.set(
      REST_POSITION.x + Math.cos(this.swayPhase) * 0.02 * sway,
      REST_POSITION.y + Math.abs(Math.sin(this.swayPhase)) * 0.018 * sway - arc * 0.16,
      REST_POSITION.z + arc * 0.18,
    );

    this.root.rotation.x = lerp(0.2, -1.25, arc);
    this.root.rotation.z = lerp(-0.3, 0.15, arc);
  }
}
