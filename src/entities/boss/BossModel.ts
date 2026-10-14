import * as THREE from 'three';

import { damp, lerp } from '../../core/math.ts';

const STONE = 0x453f52;
const STONE_DARK = 0x322d3d;
const AURA_INTENSITY = 13;

function block(
  width: number,
  height: number,
  depth: number,
  color: number,
): THREE.Mesh<THREE.BoxGeometry, THREE.MeshLambertMaterial> {
  return new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    new THREE.MeshLambertMaterial({ color, flatShading: true }),
  );
}

/**
 * Blocky golem assembled from boxes, with glowing cores on its back that are
 * exposed while it is staggered.
 */
export class BossModel {
  readonly root = new THREE.Group();

  private readonly torso: THREE.Group;
  private readonly head: THREE.Mesh<THREE.BoxGeometry, THREE.MeshLambertMaterial>;
  private readonly leftArm: THREE.Group;
  private readonly rightArm: THREE.Group;
  private readonly leftLeg: THREE.Group;
  private readonly rightLeg: THREE.Group;
  private readonly cores: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>[] = [];
  private readonly eyes: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>[] = [];
  private readonly bodyParts: THREE.Mesh<THREE.BoxGeometry, THREE.MeshLambertMaterial>[] = [];
  /** Keeps the golem readable against the unlit arena and lights the floor. */
  private readonly aura: THREE.PointLight;
  private readonly baseEmissive = new THREE.Color(0x8b5cf6).multiplyScalar(0.06);

  private walkPhase = 0;
  private armRaise = 0;
  private crouch = 0;
  private flashTimer = 0;
  private flashColor = 0x772222;

  constructor() {
    this.torso = new THREE.Group();
    this.torso.position.y = 3.1;
    this.root.add(this.torso);

    const chest = block(2.6, 2.2, 1.6, STONE);
    const belly = block(2, 0.9, 1.4, STONE_DARK);
    belly.position.y = -1.5;
    this.torso.add(chest, belly);

    this.head = block(1.4, 1.2, 1.3, STONE);
    this.head.position.y = 1.7;
    this.torso.add(this.head);

    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(
        new THREE.BoxGeometry(0.32, 0.18, 0.08),
        new THREE.MeshBasicMaterial({ color: 0xff8a3c }),
      );
      eye.position.set(side * 0.34, 0.1, 0.68);
      this.head.add(eye);
      this.eyes.push(eye);
    }

    this.leftArm = this.buildArm(-1);
    this.rightArm = this.buildArm(1);
    this.torso.add(this.leftArm, this.rightArm);

    this.leftLeg = this.buildLeg(-1);
    this.rightLeg = this.buildLeg(1);
    this.root.add(this.leftLeg, this.rightLeg);

    for (let i = 0; i < 3; i++) {
      const core = new THREE.Mesh(
        new THREE.SphereGeometry(0.3, 10, 8),
        new THREE.MeshBasicMaterial({ color: 0x8b5cf6 }),
      );
      core.position.set((i - 1) * 0.75, 0.4 - Math.abs(i - 1) * 0.5, -0.85);
      this.torso.add(core);
      this.cores.push(core);
    }

    this.bodyParts.push(chest, belly, this.head);
    this.applyBaseEmissive();

    this.aura = new THREE.PointLight(0x8b5cf6, AURA_INTENSITY, 30, 2);
    // Sits in front of the chest so it rims the golem instead of glowing inside it.
    this.aura.position.set(0, 2.6, 3.6);
    this.root.add(this.aura);
  }

  private buildArm(side: number): THREE.Group {
    const arm = new THREE.Group();
    arm.position.set(side * 1.75, 0.7, 0);

    const upper = block(0.9, 2.4, 0.9, STONE);
    upper.position.y = -1.1;
    const fist = block(1.2, 1, 1.2, STONE_DARK);
    fist.position.y = -2.5;

    arm.add(upper, fist);
    this.bodyParts.push(upper, fist);
    return arm;
  }

  dispose(): void {
    this.root.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      object.geometry.dispose();
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.dispose();
    });
    this.aura.dispose();
  }

  private buildLeg(side: number): THREE.Group {
    const leg = new THREE.Group();
    leg.position.set(side * 0.65, 1.9, 0);

    const thigh = block(0.95, 2, 0.95, STONE_DARK);
    thigh.position.y = -1;
    const foot = block(1.1, 0.5, 1.4, STONE);
    foot.position.set(0, -2.1, 0.15);

    leg.add(thigh, foot);
    this.bodyParts.push(thigh, foot);
    return leg;
  }

  setPhaseColor(color: number): void {
    for (const core of this.cores) core.material.color.setHex(color);
    for (const eye of this.eyes) eye.material.color.setHex(color);
    this.aura.color.setHex(color);
    this.baseEmissive.setHex(color).multiplyScalar(0.06);
    this.applyBaseEmissive();
  }

  /** Faint self-glow so the silhouette stays visible in the unlit arena. */
  private applyBaseEmissive(): void {
    for (const part of this.bodyParts) part.material.emissive.copy(this.baseEmissive);
  }

  /** 0 = idle, 1 = arms fully overhead, used for the slam telegraph. */
  setArmRaise(value: number): void {
    this.armRaise = value;
  }

  /** 0 = upright, 1 = hunched forward while staggered or charging. */
  setCrouch(value: number): void {
    this.crouch = value;
  }

  setCoreScale(scale: number): void {
    for (const core of this.cores) core.scale.setScalar(scale);
  }

  flash(seconds = 0.14, hex = 0x772222): void {
    this.flashTimer = seconds;
    this.flashColor = hex;
  }

  update(dt: number, walkSpeed: number, elapsed: number): void {
    this.walkPhase += dt * walkSpeed * 1.6;

    const stride = Math.min(walkSpeed / 3, 1);
    const swing = Math.sin(this.walkPhase) * 0.6 * stride;

    this.leftLeg.rotation.x = swing;
    this.rightLeg.rotation.x = -swing;

    // Positive pitch swings the arms up and behind the head for the windup.
    const armIdle = -swing * 0.7;
    const raised = lerp(armIdle, 2.5, this.armRaise);
    this.leftArm.rotation.x = raised;
    this.rightArm.rotation.x = raised;
    this.leftArm.rotation.z = this.armRaise * 0.2;
    this.rightArm.rotation.z = -this.armRaise * 0.2;

    this.torso.rotation.x = damp(this.torso.rotation.x, this.crouch * 0.65, 10, dt);
    this.torso.position.y = 3.1 - this.crouch * 0.5 + Math.sin(elapsed * 1.6) * 0.05;
    this.head.rotation.x = -this.crouch * 0.4;

    const pulse = 1 + Math.sin(elapsed * 4) * 0.08;
    this.setCoreScale(pulse * (1 + this.crouch * 0.55));
    // Flares while hunched over, selling the vulnerable stagger window.
    this.aura.intensity = AURA_INTENSITY * pulse * (1 + this.crouch * 0.9);

    if (this.flashTimer > 0) {
      this.flashTimer = Math.max(0, this.flashTimer - dt);
      if (this.flashTimer > 0) {
        for (const part of this.bodyParts) part.material.emissive.setHex(this.flashColor);
      } else {
        this.applyBaseEmissive();
      }
    }
  }
}
