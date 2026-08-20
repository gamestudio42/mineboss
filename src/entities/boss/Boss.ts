import * as THREE from 'three';

import { Boulder } from '../../combat/Projectile.ts';
import { hitPlayer, radialDamage } from '../../combat/DamageSystem.ts';
import { Health } from '../../combat/Health.ts';
import { clamp, damp, randomRange } from '../../core/math.ts';
import { ALTAR, ARENA, ARENA_STAND_Y } from '../../world/arena.ts';
import { Block } from '../../world/blocks.ts';
import { Entity, type EntityContext } from '../Entity.ts';
import { BossModel } from './BossModel.ts';
import { BossStateMachine, type BossState, type BossStateName } from './BossStateMachine.ts';
import { LavaPillar } from './attacks/LavaPillar.ts';
import { Shockwave } from './attacks/Shockwave.ts';
import { Telegraph } from './attacks/Telegraph.ts';
import { Minion } from './Minion.ts';

export const BOSS_NAME = 'The Deep Warden';
export const BOSS_MAX_HEALTH = 520;

const WIDTH = 3;
const HEIGHT = 5.2;
const GRAVITY = 30;
const WALK_SPEED = 2.9;
/** Chase keeps this gap so the player can read the wind-up animations. */
const CHASE_STANDOFF = 3.2;
const CHARGE_SPEED = 16;

const PHASES = [
  { label: 'Phase I', speed: 1, color: 0x8b5cf6, staggerTime: 3.2 },
  { label: 'Phase II', speed: 1.15, color: 0x38bdf8, staggerTime: 2.7 },
  { label: 'Phase III', speed: 1.4, color: 0xff5a2e, staggerTime: 2.2 },
] as const;

/**
 * The Deep Warden. Behaviour lives in a state machine; every heavy attack ends
 * in a stagger, which is the window where the player can safely deal damage.
 */
export class Boss extends Entity {
  readonly model = new BossModel();
  readonly telegraph = new Telegraph();

  onPhaseChange: ((phase: number, label: string) => void) | null = null;
  onDefeated: (() => void) | null = null;
  onShake: ((intensity: number) => void) | null = null;

  /** Set at the top of every update so state handlers can reach the world. */
  context!: EntityContext;

  phase = 0;
  attackCooldown = 1.2;

  /** Created on the first update, once `context` is available to state handlers. */
  private machine: BossStateMachine | null = null;
  private readonly target = new THREE.Vector3();
  private readonly chargeDirection = new THREE.Vector3();
  private facing = 0;
  private walkSpeed = 0;
  private visualOffsetY = 0;
  private collapse = 0;
  private slamImpacted = false;
  private throwsLeft = 0;
  private throwTimer = 0;
  private pillarsLeft = 0;
  private pillarTimer = 0;

  constructor() {
    super(WIDTH, HEIGHT, 'boss', 1.2);

    this.health = new Health(BOSS_MAX_HEALTH, 0.12);
    this.position.set(ALTAR.x + 0.5, ARENA_STAND_Y, ALTAR.z + 0.5);

    this.object3D.add(this.model.root, this.telegraph.object3D);
    this.model.setPhaseColor(PHASES[0].color);
    this.telegraph.hide();
  }

  get stateName(): BossStateName {
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

    const machine = (this.machine ??= new BossStateMachine(STATES, 'awaken', this));
    this.health?.update(dt);

    if (this.health?.dead && machine.current !== 'dying') {
      machine.change('dying');
    } else {
      this.checkPhaseTransition();
    }

    machine.update(dt);
    this.model.update(dt, this.walkSpeed, context.elapsed);
    this.faceTarget(dt);
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
    this.telegraph.dispose();
  }

  /** Applies gravity, walks toward a point and keeps the boss inside the arena. */
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
    this.containInArena();
    this.shovePlayer(dt);
  }

  /** A golem this size shoves the player aside instead of swallowing the camera. */
  private shovePlayer(dt: number): void {
    const player = this.context.player;
    const minDistance = WIDTH * 0.5 + 0.45;
    const dx = player.position.x - this.position.x;
    const dz = player.position.z - this.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance > minDistance) return;

    const angle = distance < 1e-3 ? this.facing + Math.PI : Math.atan2(dz, dx);
    const push = (minDistance - distance) * 26;
    player.velocity.x += Math.cos(angle) * push * dt;
    player.velocity.z += Math.sin(angle) * push * dt;
  }

  distanceToPlayer(): number {
    const player = this.context.player.position;
    return Math.hypot(player.x - this.position.x, player.z - this.position.z);
  }

  /** Point where the player will be after `lead` seconds, for aimed attacks. */
  predictPlayer(lead: number, target: THREE.Vector3): THREE.Vector3 {
    const player = this.context.player;
    return target.set(
      player.position.x + player.velocity.x * lead,
      player.position.y,
      player.position.z + player.velocity.z * lead,
    );
  }

  getChestPosition(target: THREE.Vector3): THREE.Vector3 {
    return target.set(this.position.x, this.position.y + 3.4, this.position.z);
  }

  spawnShockwave(damage: number, maxRadius: number, speed: number): void {
    const wave = new Shockwave({
      maxRadius,
      speed,
      damage,
      knockback: 8,
      color: PHASES[this.phase].color,
    });
    wave.position.set(this.position.x, this.position.y, this.position.z);
    this.context.entities.add(wave);
  }

  /** Chooses the next attack from the pool unlocked by the current phase. */
  pickAttack(): BossStateName {
    const distance = this.distanceToPlayer();
    const options: BossStateName[] = [];

    if (distance < 11) options.push('slam', 'slam');
    if (distance > 7) options.push('charge', 'charge');
    if (this.phase >= 1) {
      if (distance > 6) options.push('boulder');
      if (this.countMinions() < 4) options.push('summon');
    }
    if (this.phase >= 2) options.push('pillars', 'pillars');
    if (options.length === 0) options.push('slam');

    return options[Math.floor(Math.random() * options.length)];
  }

  startCharge(): void {
    this.predictPlayer(0.35, this.target);
    this.chargeDirection
      .set(this.target.x - this.position.x, 0, this.target.z - this.position.z)
      .normalize();
  }

  /** Returns true when the dash should end: player hit or wall reached. */
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

    if (distance < 3 && verticalGap < 5) {
      if (hitPlayer(player, 11, this.position, 12)) {
        this.context.sfx.play('slam');
        this.onShake?.(0.5);
      }
      return true;
    }

    if (travelled < speed * dt * 0.45) {
      this.context.sfx.play('explode');
      this.onShake?.(0.75);
      this.context.particles.burst(this.getChestPosition(this.target), {
        count: 22,
        color: 0x8a8078,
        speed: 6,
        life: 0.8,
      });
      return true;
    }

    return false;
  }

  throwBoulder(): void {
    const boulder = new Boulder({
      directDamage: 9,
      blastDamage: 7,
      blastRadius: 3.6,
      terrainRadius: 2.4,
    });

    this.getChestPosition(this.target);
    boulder.position.set(this.target.x, this.target.y, this.target.z);
    boulder.launchAt(this.predictPlayer(0.8, new THREE.Vector3()), 0.95);

    this.context.entities.add(boulder);
    this.context.sfx.play('hit');
  }

  summonMinions(count: number): void {
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Math.random();
      const radius = 4.5;
      const x = this.position.x + Math.cos(angle) * radius;
      const z = this.position.z + Math.sin(angle) * radius;

      const minion = new Minion(x, this.position.y + 0.5, z);
      minion.body.unstick(this.context.world, 6);
      this.context.entities.add(minion);
      this.context.particles.burst(minion.position, {
        count: 14,
        color: PHASES[this.phase].color,
        speed: 4,
        life: 0.6,
      });
    }

    this.context.sfx.play('summon');
  }

  spawnPillar(): void {
    this.predictPlayer(randomRange(0.2, 0.9), this.target);
    const pillar = new LavaPillar(this.target.x, ARENA_STAND_Y, this.target.z);
    this.context.entities.add(pillar);
  }

  /** Slam impact: shockwave, close-range damage and screen shake. */
  slamImpact(): void {
    const context = this.context;
    context.sfx.play('slam');
    this.onShake?.(0.9);

    this.getChestPosition(this.target);
    context.particles.burst(this.position, {
      count: 30,
      color: 0x9c8f7f,
      speed: 7,
      spread: 2.5,
      life: 0.9,
    });

    radialDamage(context.player, this.position, 5.5, 9, 9);
    this.spawnShockwave(8, 16 + this.phase * 3, 13 + this.phase * 2);
  }

  clearAltar(): void {
    const world = this.context.world;
    for (let y = ALTAR.y - 1; y <= ALTAR.y + 1; y++) {
      for (let z = ALTAR.z - 2; z <= ALTAR.z + 2; z++) {
        for (let x = ALTAR.x - 2; x <= ALTAR.x + 2; x++) {
          if (world.getBlock(x, y, z) === Block.Obsidian) continue;
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

  private countMinions(): number {
    let count = 0;
    for (const entity of this.context.entities.entities) {
      if (!entity.removed && entity instanceof Minion) count += 1;
    }
    return count;
  }

  private checkPhaseTransition(): void {
    const fraction = this.health?.fraction ?? 1;
    const target = fraction <= 0.33 ? 2 : fraction <= 0.66 ? 1 : 0;

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

  private containInArena(): void {
    const limit = ARENA.radius - 2.5;
    const dx = this.position.x - ARENA.centerX;
    const dz = this.position.z - ARENA.centerZ;
    const distance = Math.hypot(dx, dz);
    if (distance <= limit) return;

    const scale = limit / distance;
    this.position.x = ARENA.centerX + dx * scale;
    this.position.z = ARENA.centerZ + dz * scale;
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
  }

  tickThrows(dt: number): boolean {
    if (this.throwsLeft <= 0) return true;

    this.throwTimer -= dt;
    if (this.throwTimer <= 0) {
      this.throwTimer = 0.42;
      this.throwsLeft -= 1;
      this.throwBoulder();
    }

    return false;
  }

  setPillars(count: number): void {
    this.pillarsLeft = count;
    this.pillarTimer = 0;
  }

  tickPillars(dt: number): boolean {
    if (this.pillarsLeft <= 0) return true;

    this.pillarTimer -= dt;
    if (this.pillarTimer <= 0) {
      this.pillarTimer = 0.5;
      this.pillarsLeft -= 1;
      this.spawnPillar();
    }

    return false;
  }
}

const STATES: Record<BossStateName, BossState> = {
  awaken: {
    enter(boss) {
      boss.damageMultiplier = 0;
      boss.setVisualOffset(-6);
      boss.clearAltar();
      boss.context.sfx.play('roar');
      boss.onShake?.(0.6);
    },
    update(boss, dt, time) {
      const progress = clamp(time / 2.4, 0, 1);
      boss.setVisualOffset(-6 * (1 - progress) ** 2);
      boss.stopMoving(dt);

      if (progress >= 1) {
        boss.damageMultiplier = 1;
        boss.attackCooldown = 1;
        return 'chase';
      }
    },
  },

  chase: {
    enter(boss) {
      boss.model.setArmRaise(0);
      boss.model.setCrouch(0);
      boss.telegraph.hide();
    },
    update(boss, dt) {
      boss.walkToward(
        boss.context.player.position,
        WALK_SPEED * boss.speedMultiplier,
        dt,
        CHASE_STANDOFF,
      );

      boss.attackCooldown -= dt;
      if (boss.attackCooldown <= 0) return boss.pickAttack();
    },
  },

  slam: {
    enter(boss) {
      boss.resetSlam();
      boss.telegraph.show(0, 0, 0, 5.5);
    },
    update(boss, dt, time) {
      const windUp = 0.95 / boss.speedMultiplier;
      boss.stopMoving(dt);

      if (time < windUp) {
        boss.model.setArmRaise(time / windUp);
        boss.telegraph.setProgress(time / windUp);
        return;
      }

      if (!boss.hasSlamImpacted) {
        boss.markSlamImpacted();
        boss.telegraph.hide();
        boss.model.setArmRaise(0);
        boss.slamImpact();
      }

      if (time > windUp + 0.45) return 'stagger';
    },
    exit(boss) {
      boss.model.setArmRaise(0);
      boss.telegraph.hide();
    },
  },

  charge: {
    enter(boss) {
      boss.startCharge();
      boss.model.setCrouch(1);
      boss.telegraph.show(0, 0, 0, 3.2);
    },
    update(boss, dt, time) {
      const windUp = 0.7 / boss.speedMultiplier;

      if (time < windUp) {
        boss.stopMoving(dt);
        boss.telegraph.setProgress(time / windUp);
        if (time < windUp * 0.5) boss.startCharge();
        return;
      }

      boss.telegraph.hide();
      if (boss.advanceCharge(dt)) return 'stagger';
      if (time > windUp + 1.6) return 'chase';
    },
    exit(boss) {
      boss.model.setCrouch(0);
      boss.telegraph.hide();
    },
  },

  boulder: {
    enter(boss) {
      boss.setThrows(3);
      boss.model.setArmRaise(0.5);
    },
    update(boss, dt) {
      boss.stopMoving(dt);
      if (boss.tickThrows(dt)) {
        boss.attackCooldown = 1.6 / boss.speedMultiplier;
        return 'chase';
      }
    },
    exit(boss) {
      boss.model.setArmRaise(0);
    },
  },

  summon: {
    enter(boss) {
      boss.model.setArmRaise(0.8);
      boss.summonMinions(3);
      boss.onShake?.(0.3);
    },
    update(boss, dt, time) {
      boss.stopMoving(dt);
      if (time > 1.2) {
        boss.attackCooldown = 1.8 / boss.speedMultiplier;
        return 'chase';
      }
    },
    exit(boss) {
      boss.model.setArmRaise(0);
    },
  },

  pillars: {
    enter(boss) {
      boss.setPillars(5);
      boss.model.setArmRaise(0.65);
      boss.context.sfx.play('summon');
    },
    update(boss, dt) {
      boss.stopMoving(dt);
      if (boss.tickPillars(dt)) {
        boss.attackCooldown = 1.5 / boss.speedMultiplier;
        return 'chase';
      }
    },
    exit(boss) {
      boss.model.setArmRaise(0);
    },
  },

  stagger: {
    enter(boss) {
      boss.damageMultiplier = 2;
      boss.model.setCrouch(1);
      boss.context.sfx.play('stagger');
    },
    update(boss, dt, time) {
      boss.stopMoving(dt);

      if (Math.random() < dt * 6) {
        boss.context.particles.burst(boss.getChestPosition(new THREE.Vector3()), {
          count: 2,
          color: 0xc4b5fd,
          speed: 1.6,
          life: 0.7,
          gravity: -4,
        });
      }

      if (time > boss.staggerTime) {
        boss.attackCooldown = 0.9 / boss.speedMultiplier;
        return 'chase';
      }
    },
    exit(boss) {
      boss.damageMultiplier = 1;
      boss.model.setCrouch(0);
    },
  },

  phaseShift: {
    enter(boss) {
      boss.damageMultiplier = 0;
      boss.model.setArmRaise(1);
      boss.context.sfx.play('roar');
      boss.onShake?.(0.8);
      boss.spawnShockwave(6, 20, 18);
    },
    update(boss, dt, time) {
      boss.stopMoving(dt);
      boss.model.setArmRaise(1 - clamp((time - 1.2) / 0.6, 0, 1));

      if (time > 1.9) {
        boss.damageMultiplier = 1;
        boss.attackCooldown = 0.6;
        return 'chase';
      }
    },
  },

  dying: {
    enter(boss) {
      boss.damageMultiplier = 0;
      boss.telegraph.hide();
      boss.context.sfx.play('death');
      boss.onShake?.(0.7);
    },
    update(boss, dt, time) {
      boss.stopMoving(dt);
      boss.setCollapse(clamp(time / 2.2, 0, 1));

      if (Math.random() < dt * 10) {
        boss.context.particles.burst(boss.getChestPosition(new THREE.Vector3()), {
          count: 4,
          color: 0xffb26b,
          speed: 4,
          spread: 2,
          life: 1.1,
        });
      }

      if (time > 2.6) {
        boss.onDefeated?.();
        boss.context.entities.remove(boss);
      }
    },
  },
};
