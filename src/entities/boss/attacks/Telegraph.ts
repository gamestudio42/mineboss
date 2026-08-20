import * as THREE from 'three';

/** Ground marker that warns where an attack is about to land. */
export class Telegraph {
  readonly object3D = new THREE.Group();

  private readonly outline: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  private readonly fill: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;

  constructor(color = 0xff3b30) {
    const flat = -Math.PI / 2;

    this.outline = new THREE.Mesh(
      new THREE.RingGeometry(0.92, 1, 48),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    this.outline.rotation.x = flat;

    this.fill = new THREE.Mesh(
      new THREE.CircleGeometry(1, 48),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.28,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    this.fill.rotation.x = flat;

    this.object3D.add(this.outline, this.fill);
    this.object3D.visible = false;
    this.object3D.renderOrder = 2;
  }

  show(x: number, y: number, z: number, radius: number): void {
    this.object3D.position.set(x, y + 0.06, z);
    this.outline.scale.setScalar(radius);
    this.object3D.visible = true;
    this.setProgress(0);
  }

  /** Grows the filled disc from the centre to the outline as the attack winds up. */
  setProgress(progress: number): void {
    const radius = this.outline.scale.x * Math.max(0.001, progress);
    this.fill.scale.setScalar(radius);
  }

  hide(): void {
    this.object3D.visible = false;
  }

  dispose(): void {
    this.outline.geometry.dispose();
    this.outline.material.dispose();
    this.fill.geometry.dispose();
    this.fill.material.dispose();
  }
}
