import * as THREE from 'three';

import { Boulder } from '../../combat/Projectile.ts';
import { hitPlayer, radialDamage } from '../../combat/DamageSystem.ts';
import { Health } from '../../combat/Health.ts';
import { clamp, damp } from '../../core/math.ts';
import {
  RUIN_COURTYARD,
  RUIN_STATUE,
  isRuinStatueColumn,
} from '../../world/arena.ts';
import { Block } from '../../world/blocks.ts';
import { SEA_LEVEL } from '../../world/terrain/generator.ts';
import { Entity, type EntityContext } from '../Entity.ts';
import { BossModel } from './BossModel.ts';
import { Shockwave } from './attacks/Shockwave.ts';
import { Telegraph } from './attacks/Telegraph.ts';

export const SENTINEL_NAME = 'The Ruin Sentinel';
export const SENTINEL_MAX_HEALTH = 200;

const WIDTH = 2.2;
const HEIGHT = 4;
const GRAVITY = 30;
const WALK_SPEED = 2.6;
const CHASE_STANDOFF = 2.8;
const CHARGE_SPEED = 12;
const MODEL_SCALE = 0.77;

const PHASES = [
  { label: 'Phase I', speed: 1, color: 0xd4a017, staggerTime: 3.6 },
  { label: 'Phase II', speed: 1.12, color: 0x7c9a3c, staggerTime: 3.2 },
] as const;

type SentinelStateName =
  | 'awaken'
  | 'chase'
  | 'slam'
  | 'charge'
  | 'shard'
  | 'stagger'
  | 'phaseShift'
  | 'dying';

interface SentinelState {
  enter?(sentinel: RuinSentinel): void;
  update(sentinel: RuinSentinel, dt: number, time: number): SentinelStateName | void;
  exit?(sentinel: RuinSentinel): void;
}

/**
 * Smaller surface golem that teaches telegraph, shockwave jumps and stagger
 * before the player descends to the Warden.
 */
export class RuinSentinel extends Entity {
  readonly model = new BossModel();
  readonly telegraph = new Telegraph(0xd4a017);
  readonly landingTelegraph = new Telegraph(0xd4a017);

  onPhaseChange: ((phase: number, label: string) => void) | null = null;
  onDefeated: (() => void) | null = null;
  onShake: ((intensity: number) => void) | null = null;
  onStagger: (() => void) | null = null;

  context!: EntityContext;

  phase = 0;
  attackCooldown = 1.1;

  private machine: StateMachine | null = null;
  private readonly target = new THREE.Vector3();
  private readonly chargeDirection = new THREE.Vector3();
  private readonly throwAim = new THREE.Vector3();
  private facing = 0;
  private walkSpeed = 0;
  private visualOffsetY = 0;
  private collapse = 0;
  private slamImpacted = false;
  private throwsLeft = 0;
  private throwTimer = 0;
  private readonly floorY: number;

  constructor(floorY: number) {
    super(WIDTH, HEIGHT, 'boss', 1.1);
    this.floorY = floorY;
    this.health = new Health(SENTINEL_MAX_HEALTH, 0.14);
    this.position.set(RUIN_STATUE.x + 0.5, floorY + 1, RUIN_STATUE.z + 0.5);

    this.model.root.scale.setScalar(MODEL_SCALE);
    this.object3D.add(this.model.root, this.telegraph.object3D);
    this.landingTelegraph.hide();
    this.model.setPhaseColor(PHASES[0].color);
    this.telegraph.hide();
  }

  get stateName(): SentinelStateName {
    return this.machine?.current ?? 'awaken';
  }

  get phaseLabel(): string {
    return PHASES[this.phase].label;
  }

  get speedMultiplier(): number {
    return PHASES[this.phase].speed;
  }

  get staggerTime(): number {
    return PHASES[this.phase].staggerTime;
  }

  override update(context: EntityContext): void {
    this.context = context;
    const dt = context.dt;

    const machine = (this.machine ??= new StateMachine(STATES, 'awaken', this));
    this.health?.update(dt);

    if (this.health?.dead && machine.current !== 'dying') {
      machine.change('dying');
    } else {
      this.checkPhaseTransition();
    }

    machine.update(dt);
    this.model.update(dt, this.walkSpeed, context.elapsed);
    this.faceTarget(dt);
    this.mountLandingTelegraph();
  }

  override syncTransform(): void {
    this.object3D.position.set(
      this.position.x,
      this.position.y + this.visualOffsetY,
      this.position.z,
    );
    this.object3D.rotation.y = this.facing;
    this.object3D.rotation.z = this.collapse * 1.35;
  }

  override onRemoved(): void {
    this.landingTelegraph.object3D.removeFromParent();
    this.telegraph.dispose();
    this.landingTelegraph.dispose();
  }

  walkToward(target: THREE.Vector3, speed: number, dt: number, stopDistance = 0.6): void {
    const dx = target.x - this.position.x;
    const dz = target.z - this.position.z;
    const distance = Math.hypot(dx, dz);

    if (distance > stopDistance) {
      this.velocity.x = damp(this.velocity.x, (dx / distance) * speed, 6, dt);
      this.velocity.z = damp(this.velocity.z, (dz / distance) * speed, 6, dt);
    } else {
      this.velocity.x = damp(this.velocity.x, 0, 10, dt);
      this.velocity.z = damp(this.velocity.z, 0, 10, dt);
    }

    this.applyPhysics(dt);
  }

  stopMoving(dt: number): void {
    this.velocity.x = damp(this.velocity.x, 0, 12, dt);
    this.velocity.z = damp(this.velocity.z, 0, 12, dt);
    this.applyPhysics(dt);
  }

  applyPhysics(dt: number): void {
    this.velocity.y -= GRAVITY * dt;
    this.body.move(this.context.world, dt);
    this.walkSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    this.containInCourtyard();
    this.shovePlayer(dt);
  }

  private shovePlayer(dt: number): void {
    const player = this.context.player;
    const minDistance = WIDTH * 0.5 + 0.45;
    const dx = player.position.x - this.position.x;
    const dz = player.position.z - this.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance > minDistance) return;

    const angle = distance < 1e-3 ? this.facing + Math.PI : Math.atan2(dz, dx);
    const push = (minDistance - distance) * 22;
    player.velocity.x += Math.cos(angle) * push * dt;
    player.velocity.z += Math.sin(angle) * push * dt;
  }

  distanceToPlayer(): number {
    const player = this.context.player.position;
    return Math.hypot(player.x - this.position.x, player.z - this.position.z);
  }

  predictPlayer(lead: number, target: THREE.Vector3): THREE.Vector3 {
    const player = this.context.player;
    return target.set(
      player.position.x + player.velocity.x * lead,
      player.position.y,
      player.position.z + player.velocity.z * lead,
    );
  }

  getChestPosition(target: THREE.Vector3): THREE.Vector3 {
    return target.set(this.position.x, this.position.y + 2.6, this.position.z);
  }

  override hitFlash(): void {
    this.model.flash();
  }

  openStaggerWindow(): void {
    this.damageMultiplier = 2;
    this.model.setCrouch(1);
    this.model.flash(0.32, 0xfde68a);
    this.context.sfx.play('stagger');
    this.onShake?.(0.4);
    this.getChestPosition(this.target);
    this.context.particles.burst(this.target, {
      count: 22,
      color: 0xfde68a,
      speed: 5,
      spread: 1,
      life: 0.85,
      gravity: -5,
      upwardBias: 1,
    });
    this.context.particles.burst(this.target, {
      count: 10,
      color: PHASES[this.phase].color,
      speed: 3.6,
      spread: 0.7,
      life: 0.65,
      gravity: -3,
    });
    this.onStagger?.();
  }

  spawnShockwave(damage: number, maxRadius: number, speed: number): void {
    const wave = new Shockwave({
      maxRadius,
      speed,
      damage,
      knockback: 7,
      color: PHASES[this.phase].color,
    });
    wave.position.set(this.position.x, this.position.y, this.position.z);
    this.context.entities.add(wave);
  }

  pickAttack(): SentinelStateName {
    const distance = this.distanceToPlayer();
    const options: SentinelStateName[] = [];

    if (distance < 10) options.push('slam', 'slam');
    if (distance > 6) options.push('charge', 'charge');
    if (this.phase >= 1 && distance > 5) options.push('shard');
    if (options.length === 0) options.push('slam');

    return options[Math.floor(Math.random() * options.length)];
  }

  startCharge(): void {
    this.predictPlayer(0.3, this.target);
    this.chargeDirection
      .set(this.target.x - this.position.x, 0, this.target.z - this.position.z)
      .normalize();
  }

  advanceCharge(dt: number): boolean {
    const speed = CHARGE_SPEED * this.speedMultiplier;
    this.velocity.x = this.chargeDirection.x * speed;
    this.velocity.z = this.chargeDirection.z * speed;

    const beforeX = this.position.x;
    const beforeZ = this.position.z;
    this.applyPhysics(dt);
    const travelled = Math.hypot(this.position.x - beforeX, this.position.z - beforeZ);

    const player = this.context.player;
    const distance = this.distanceToPlayer();
    const verticalGap = Math.abs(player.position.y - this.position.y);

    if (distance < 2.6 && verticalGap < 4) {
      if (hitPlayer(player, 7, this.position, 9)) {
        this.context.sfx.play('slam');
        this.onShake?.(0.4);
      }
      return true;
    }

    if (travelled < speed * dt * 0.45) {
      this.context.sfx.play('explode');
      this.onShake?.(0.5);
      return true;
    }

    return false;
  }

  throwShard(): void {
    const shard = new Boulder({
      directDamage: 6,
      blastDamage: 5,
      blastRadius: 2.4,
      terrainRadius: 0,
    });

    this.getChestPosition(this.target);
    shard.position.set(this.target.x, this.target.y, this.target.z);
    shard.launchAt(this.throwAim, 0.85);

    this.context.entities.add(shard);
    this.context.sfx.play('hit');
  }

  prepareNextShard(): void {
    this.throwTimer = 0.5;
    this.predictPlayer(0.85, this.throwAim);
    this.throwAim.y = this.floorY + 1;
    this.landingTelegraph.show(this.throwAim.x, this.throwAim.y, this.throwAim.z, 2.2);
    this.landingTelegraph.setProgress(0);
  }

  slamImpact(): void {
    this.context.sfx.play('slam');
    this.onShake?.(0.7);
    this.context.particles.burst(this.position, {
      count: 22,
      color: 0x9c8f7f,
      speed: 6,
      spread: 2,
      life: 0.8,
    });
    radialDamage(this.context.player, this.position, 4.2, 6, 7);
    this.spawnShockwave(6, 11 + this.phase * 2, 12);
  }

  clearStatue(): void {
    const world = this.context.world;
    const top = this.floorY + 6;
    for (let z = RUIN_STATUE.z - 1; z <= RUIN_STATUE.z + 1; z++) {
      for (let x = RUIN_STATUE.x - 1; x <= RUIN_STATUE.x + 1; x++) {
        for (let y = this.floorY + 1; y <= top; y++) {
          if (!isRuinStatueColumn(x, z)) continue;
          if (world.getBlock(x, y, z) === Block.Air) continue;
          world.setBlock(x, y, z, Block.Air);
        }
      }
    }
  }

  setVisualOffset(value: number): void {
    this.visualOffsetY = value;
  }

  setCollapse(value: number): void {
    this.collapse = value;
  }

  markSlamImpacted(): void {
    this.slamImpacted = true;
  }

  get hasSlamImpacted(): boolean {
    return this.slamImpacted;
  }

  resetSlam(): void {
    this.slamImpacted = false;
  }

  setThrows(count: number): void {
    this.throwsLeft = count;
    this.throwTimer = 0;
    if (count > 0) this.prepareNextShard();
  }

  tickThrows(dt: number): boolean {
    if (this.throwsLeft <= 0) return true;

    this.throwTimer -= dt;
    this.landingTelegraph.setProgress(1 - clamp(this.throwTimer / 0.5, 0, 1));

    if (this.throwTimer <= 0) {
      this.throwsLeft -= 1;
      this.throwShard();
      if (this.throwsLeft > 0) this.prepareNextShard();
      else this.landingTelegraph.hide();
    }

    return false;
  }

  private checkPhaseTransition(): void {
    const fraction = this.health?.fraction ?? 1;
    const target = fraction <= 0.5 ? 1 : 0;
    if (target <= this.phase || !this.machine) return;
    if (this.machine.current === 'awaken' || this.machine.current === 'phaseShift') return;

    this.phase = target;
    this.model.setPhaseColor(PHASES[target].color);
    this.onPhaseChange?.(target + 1, PHASES[target].label);
    this.machine.change('phaseShift');
  }

  private faceTarget(dt: number): void {
    const player = this.context.player.position;
    const desired = Math.atan2(player.x - this.position.x, player.z - this.position.z);
    let delta = desired - this.facing;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    this.facing += delta * Math.min(1, dt * 5);
  }

  private containInCourtyard(): void {
    const limit = RUIN_COURTYARD.radius - 2.2;
    const dx = this.position.x - RUIN_COURTYARD.centerX;
    const dz = this.position.z - RUIN_COURTYARD.centerZ;
    const distance = Math.hypot(dx, dz);
    if (distance <= limit) return;

    const scale = limit / distance;
    this.position.x = RUIN_COURTYARD.centerX + dx * scale;
    this.position.z = RUIN_COURTYARD.centerZ + dz * scale;
  }

  private mountLandingTelegraph(): void {
    const scene = this.object3D.parent;
    if (!scene || this.landingTelegraph.object3D.parent === scene) return;
    scene.add(this.landingTelegraph.object3D);
  }
}

class StateMachine {
  private state: SentinelState;
  private name: SentinelStateName;
  time = 0;

  constructor(
    private readonly states: Record<SentinelStateName, SentinelState>,
    initial: SentinelStateName,
    private readonly host: RuinSentinel,
  ) {
    this.name = initial;
    this.state = states[initial];
    this.state.enter?.(host);
  }

  get current(): SentinelStateName {
    return this.name;
  }

  change(next: SentinelStateName): void {
    if (next === this.name) return;
    this.state.exit?.(this.host);
    this.name = next;
    this.state = this.states[next];
    this.time = 0;
    this.state.enter?.(this.host);
  }

  update(dt: number): void {
    this.time += dt;
    const next = this.state.update(this.host, dt, this.time);
    if (next) this.change(next);
  }
}

const STATES: Record<SentinelStateName, SentinelState> = {
  awaken: {
    enter(sentinel) {
      sentinel.damageMultiplier = 0;
      sentinel.setVisualOffset(-5);
      sentinel.clearStatue();
      sentinel.context.sfx.play('roar');
      sentinel.onShake?.(0.45);
    },
    update(sentinel, dt, time) {
      const progress = clamp(time / 2, 0, 1);
      sentinel.setVisualOffset(-5 * (1 - progress) ** 2);
      sentinel.stopMoving(dt);

      if (progress >= 1) {
        sentinel.damageMultiplier = 1;
        sentinel.attackCooldown = 0.9;
        return 'chase';
      }
    },
  },

  chase: {
    enter(sentinel) {
      sentinel.model.setArmRaise(0);
      sentinel.model.setCrouch(0);
      sentinel.telegraph.hide();
    },
    update(sentinel, dt) {
      sentinel.walkToward(
        sentinel.context.player.position,
        WALK_SPEED * sentinel.speedMultiplier,
        dt,
        CHASE_STANDOFF,
      );

      sentinel.attackCooldown -= dt;
      if (sentinel.attackCooldown <= 0) return sentinel.pickAttack();
    },
  },

  slam: {
    enter(sentinel) {
      sentinel.resetSlam();
      sentinel.telegraph.show(0, 0, 0, 4.2);
    },
    update(sentinel, dt, time) {
      const windUp = 1 / sentinel.speedMultiplier;
      sentinel.stopMoving(dt);

      if (time < windUp) {
        sentinel.model.setArmRaise(time / windUp);
        sentinel.telegraph.setProgress(time / windUp);
        return;
      }

      if (!sentinel.hasSlamImpacted) {
        sentinel.markSlamImpacted();
        sentinel.telegraph.hide();
        sentinel.model.setArmRaise(0);
        sentinel.slamImpact();
      }

      if (time > windUp + 0.4) return 'stagger';
    },
    exit(sentinel) {
      sentinel.model.setArmRaise(0);
      sentinel.telegraph.hide();
    },
  },

  charge: {
    enter(sentinel) {
      sentinel.startCharge();
      sentinel.model.setCrouch(1);
      sentinel.telegraph.show(0, 0, 0, 2.6);
    },
    update(sentinel, dt, time) {
      const windUp = 0.75 / sentinel.speedMultiplier;

      if (time < windUp) {
        sentinel.stopMoving(dt);
        sentinel.telegraph.setProgress(time / windUp);
        if (time < windUp * 0.5) sentinel.startCharge();
        return;
      }

      sentinel.telegraph.hide();
      if (sentinel.advanceCharge(dt)) return 'stagger';
      if (time > windUp + 1.4) return 'stagger';
    },
    exit(sentinel) {
      sentinel.model.setCrouch(0);
      sentinel.telegraph.hide();
    },
  },

  shard: {
    enter(sentinel) {
      sentinel.setThrows(2);
      sentinel.model.setArmRaise(0.5);
    },
    update(sentinel, dt) {
      sentinel.stopMoving(dt);
      if (sentinel.tickThrows(dt)) return 'stagger';
    },
    exit(sentinel) {
      sentinel.model.setArmRaise(0);
      sentinel.landingTelegraph.hide();
    },
  },

  stagger: {
    enter(sentinel) {
      sentinel.openStaggerWindow();
    },
    update(sentinel, dt, time) {
      sentinel.stopMoving(dt);

      if (Math.random() < dt * 8) {
        sentinel.context.particles.burst(sentinel.getChestPosition(new THREE.Vector3()), {
          count: 4,
          color: 0xfde68a,
          speed: 2.2,
          life: 0.7,
          gravity: -4,
        });
      }

      if (time > sentinel.staggerTime) {
        sentinel.attackCooldown = 0.85 / sentinel.speedMultiplier;
        return 'chase';
      }
    },
    exit(sentinel) {
      sentinel.damageMultiplier = 1;
      sentinel.model.setCrouch(0);
    },
  },

  phaseShift: {
    enter(sentinel) {
      sentinel.damageMultiplier = 0;
      sentinel.model.setArmRaise(1);
      sentinel.context.sfx.play('roar');
      sentinel.onShake?.(0.55);
      sentinel.spawnShockwave(5, 14, 16);
    },
    update(sentinel, dt, time) {
      sentinel.stopMoving(dt);
      sentinel.model.setArmRaise(1 - clamp((time - 1) / 0.5, 0, 1));

      if (time > 1.6) {
        sentinel.damageMultiplier = 1;
        sentinel.attackCooldown = 0.55;
        return 'chase';
      }
    },
  },

  dying: {
    enter(sentinel) {
      sentinel.damageMultiplier = 0;
      sentinel.telegraph.hide();
      sentinel.landingTelegraph.hide();
      sentinel.context.sfx.play('death');
      sentinel.onShake?.(0.5);
    },
    update(sentinel, dt, time) {
      sentinel.stopMoving(dt);
      sentinel.setCollapse(clamp(time / 1.8, 0, 1));

      if (Math.random() < dt * 10) {
        sentinel.context.particles.burst(sentinel.getChestPosition(new THREE.Vector3()), {
          count: 4,
          color: 0xc4b454,
          speed: 3.6,
          spread: 1.6,
          life: 1,
        });
      }

      if (time > 2.1) {
        sentinel.onDefeated?.();
        sentinel.context.entities.remove(sentinel);
      }
    },
  },
};

export function ruinFloorY(surfaceHeight: number): number {
  return Math.max(surfaceHeight, SEA_LEVEL);
}
