import * as THREE from 'three';

export interface BurstOptions {
  count?: number;
  color?: THREE.ColorRepresentation;
  speed?: number;
  spread?: number;
  life?: number;
  gravity?: number;
  upwardBias?: number;
}

const MAX_PARTICLES = 900;

/**
 * One pooled point cloud for every effect in the game: block debris, hit
 * sparks and the boss impacts. Dead particles are parked far below the world.
 */
export class ParticleSystem {
  private readonly positions = new Float32Array(MAX_PARTICLES * 3);
  private readonly colors = new Float32Array(MAX_PARTICLES * 3);
  private readonly velocities = new Float32Array(MAX_PARTICLES * 3);
  private readonly life = new Float32Array(MAX_PARTICLES);
  private readonly maxLife = new Float32Array(MAX_PARTICLES);
  private readonly gravity = new Float32Array(MAX_PARTICLES);
  private readonly geometry = new THREE.BufferGeometry();
  private readonly points: THREE.Points;
  private readonly scratch = new THREE.Color();

  private cursor = 0;

  constructor(scene: THREE.Scene) {
    this.positions.fill(-1000);
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    this.geometry.setDrawRange(0, MAX_PARTICLES);

    const material = new THREE.PointsMaterial({
      size: 0.14,
      vertexColors: true,
      sizeAttenuation: true,
      transparent: true,
      depthWrite: false,
    });

    this.points = new THREE.Points(this.geometry, material);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  burst(position: THREE.Vector3, options: BurstOptions = {}): void {
    const count = options.count ?? 12;
    const speed = options.speed ?? 3;
    const spread = options.spread ?? 0.25;
    const life = options.life ?? 0.8;
    const gravity = options.gravity ?? 18;
    const upward = options.upwardBias ?? 0.6;
    this.scratch.set(options.color ?? 0xffffff);

    for (let i = 0; i < count; i++) {
      const index = this.cursor;
      this.cursor = (this.cursor + 1) % MAX_PARTICLES;
      const p = index * 3;

      this.positions[p] = position.x + (Math.random() - 0.5) * spread;
      this.positions[p + 1] = position.y + (Math.random() - 0.5) * spread;
      this.positions[p + 2] = position.z + (Math.random() - 0.5) * spread;

      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const magnitude = speed * (0.4 + Math.random() * 0.6);
      this.velocities[p] = Math.sin(phi) * Math.cos(theta) * magnitude;
      this.velocities[p + 1] = Math.abs(Math.cos(phi)) * magnitude * upward + magnitude * 0.2;
      this.velocities[p + 2] = Math.sin(phi) * Math.sin(theta) * magnitude;

      const tint = 0.75 + Math.random() * 0.5;
      this.colors[p] = this.scratch.r * tint;
      this.colors[p + 1] = this.scratch.g * tint;
      this.colors[p + 2] = this.scratch.b * tint;

      this.life[index] = life * (0.7 + Math.random() * 0.6);
      this.maxLife[index] = this.life[index];
      this.gravity[index] = gravity;
    }
  }

  update(dt: number): void {
    let anyAlive = false;

    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (this.life[i] <= 0) continue;

      anyAlive = true;
      this.life[i] -= dt;
      const p = i * 3;

      if (this.life[i] <= 0) {
        this.positions[p] = -1000;
        this.positions[p + 1] = -1000;
        this.positions[p + 2] = -1000;
        continue;
      }

      this.velocities[p + 1] -= this.gravity[i] * dt;
      this.positions[p] += this.velocities[p] * dt;
      this.positions[p + 1] += this.velocities[p + 1] * dt;
      this.positions[p + 2] += this.velocities[p + 2] * dt;

      // Fade out by darkening; PointsMaterial has no per-vertex alpha.
      const fade = Math.min(1, this.life[i] / this.maxLife[i] / 0.35);
      this.colors[p] *= fade < 1 ? 0.94 : 1;
      this.colors[p + 1] *= fade < 1 ? 0.94 : 1;
      this.colors[p + 2] *= fade < 1 ? 0.94 : 1;
    }

    if (anyAlive) {
      this.geometry.attributes.position.needsUpdate = true;
      this.geometry.attributes.color.needsUpdate = true;
    }
  }
}
