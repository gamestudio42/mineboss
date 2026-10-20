import { radialDamage } from '../../combat/DamageSystem.ts';
import { Health } from '../../combat/Health.ts';
import { clamp, damp } from '../../core/math.ts';
import { GROVE } from '../../world/arena.ts';
import { Block } from '../../world/blocks.ts';
import { Entity, type EntityContext } from '../Entity.ts';
import { BossModel } from './BossModel.ts';
import { Minion } from './Minion.ts';
import { LightBeam } from './attacks/LightBeam.ts';
import { Shockwave } from './attacks/Shockwave.ts';
import { Telegraph } from './attacks/Telegraph.ts';

export const BEACON_NAME = 'Faroleiro do Vazio';
/** The last boss outlasts the Sentinel (200). */
export const BEACON_MAX_HEALTH = 240;
const BEAM_LENGTH = 14;
/** Over a second of warning before the sweep, longer in Tranquila. */
const BEAM_WARM_UP = 1.1;

const WIDTH = 2.4;
const HEIGHT = 4.4;
const GRAVITY = 30;
const WALK_SPEED = 2.7;
const CHASE_STANDOFF = 3;
const MODEL_SCALE = 0.86;

const PHASES = [
  { label: 'Fase I', speed: 1, color: 0x8fbf4a, staggerTime: 3.4, beamSweep: 3.2 },
  { label: 'Fase II', speed: 1.18, color: 0xe6d56a, staggerTime: 2.8, beamSweep: 2.6 },
] as const;

export type BeaconStateName = 'awaken' | 'chase' | 'slam' | 'beam' | 'summon' | 'stagger' | 'phaseShift' | 'dying';

interface BeaconState {
  enter?(keeper: BeaconKeeper): void;
  update(keeper: BeaconKeeper, dt: number, time: number): BeaconStateName | void;
  exit?(keeper: BeaconKeeper): void;
}

/**
 * South-island keeper and last boss. A ground slam teaches the shockwave, a
 * turning light beam takes turns with it, and the second phase calls sprouts.
 * Every attack ends in a stagger window.
 */
export class BeaconKeeper extends Entity {
  readonly model = new BossModel();
  readonly telegraph = new Telegraph(0x8fbf4a);

  onPhaseChange: ((phase: number, label: string) => void) | null = null;
  onDefeated: (() => void) | null = null;
  onShake: ((intensity: number) => void) | null = null;
  onStagger: (() => void) | null = null;

  context!: EntityContext;

  phase = 0;
  attackCooldown = 1;
  lastAttack: BeaconStateName | null = null;
  beam: LightBeam | null = null;

  private machine: StateMachine | null = null;
  private facing = 0;
  private walkSpeed = 0;
  private visualOffsetY = 0;
  private collapse = 0;
  private slamImpacted = false;
  private summoned = false;
  private readonly floorY: number;

  constructor(floorY: number) {
    super(WIDTH, HEIGHT, 'boss', 1.1);
    this.floorY = floorY;
    this.health = new Health(BEACON_MAX_HEALTH, 0.14);
    this.position.set(GROVE.x + 0.5, floorY + 1, GROVE.z + 0.5);

    this.model.root.scale.setScalar(MODEL_SCALE);
    this.object3D.add(this.model.root, this.telegraph.object3D);
    this.model.setPhaseColor(PHASES[0].color);
    this.telegraph.hide();
  }

  get stateName(): BeaconStateName {
    return this.machine?.current ?? 'awaken';
  }

  get speedMultiplier(): number {
    return PHASES[this.phase].speed;
  }

  get staggerTime(): number {
    return PHASES[this.phase].staggerTime;
  }

  override update(context: EntityContext): void {
    this.context = context;
    const dt = context.dt * (context.player.gentle ? 0.65 : 1);
    const machine = (this.machine ??= new StateMachine(STATES, 'awaken', this));
    this.health?.update(dt);

    if (this.health?.dead && machine.current !== 'dying') machine.change('dying');
    else this.checkPhaseTransition();

    machine.update(dt);
    this.model.update(dt, this.walkSpeed, context.elapsed);
    this.faceTarget(dt);
  }

  override syncTransform(): void {
    this.object3D.position.set(this.position.x, this.position.y + this.visualOffsetY, this.position.z);
    this.object3D.rotation.y = this.facing;
    this.object3D.rotation.z = this.collapse * 1.35;
  }

  override onRemoved(): void {
    this.model.dispose();
    this.telegraph.dispose();
  }

  override hitFlash(): void {
    this.model.flash();
  }

  walkToward(target: { x: number; z: number }, speed: number, dt: number, stopDistance = 0.6): void {
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

  distanceToPlayer(): number {
    return Math.hypot(
      this.context.player.position.x - this.position.x,
      this.context.player.position.z - this.position.z,
    );
  }

  /** Slam and beam take turns; the second phase calls sprouts on a distant player. */
  pickAttack(): BeaconStateName {
    if (this.phase >= 1 && this.distanceToPlayer() > 7) return 'summon';
    return this.lastAttack === 'slam' ? 'beam' : 'slam';
  }

  /** Starts behind the player so the bar is seen coming around before it arrives. */
  startBeam(): void {
    const player = this.context.player.position;
    const toPlayer = Math.atan2(-(player.z - this.position.z), player.x - this.position.x);
    this.beam = new LightBeam({
      length: BEAM_LENGTH,
      warmUp: BEAM_WARM_UP,
      sweep: PHASES[this.phase].beamSweep,
      damage: 5,
      knockback: 4,
      color: PHASES[this.phase].color,
      startAngle: toPlayer + Math.PI,
      direction: Math.random() < 0.5 ? 1 : -1,
    });
    this.beam.position.set(this.position.x, this.position.y, this.position.z);
    this.context.entities.add(this.beam);
    this.context.sfx.play('summon');
  }

  get beamDone(): boolean {
    return this.beam === null || this.beam.removed;
  }

  endBeam(): void {
    if (this.beam && !this.beam.removed) this.context.entities.remove(this.beam);
    this.beam = null;
  }

  resetSlam(): void {
    this.slamImpacted = false;
  }

  get hasSlamImpacted(): boolean {
    return this.slamImpacted;
  }

  markSlamImpacted(): void {
    this.slamImpacted = true;
  }

  slamImpact(): void {
    this.context.sfx.play('slam');
    this.onShake?.(0.65);
    this.context.particles.burst(this.position, {
      count: 18,
      color: PHASES[this.phase].color,
      speed: 6,
      spread: 2,
      life: 0.8,
    });
    radialDamage(this.context.player, this.position, 4.2, 6, 7);
    const wave = new Shockwave({
      maxRadius: 11 + this.phase * 2,
      speed: 12,
      damage: 6,
      knockback: 7,
      color: PHASES[this.phase].color,
    });
    wave.position.set(this.position.x, this.position.y, this.position.z);
    this.context.entities.add(wave);
  }

  resetSummon(): void {
    this.summoned = false;
  }

  get hasSummoned(): boolean {
    return this.summoned;
  }

  markSummoned(): void {
    this.summoned = true;
  }

  summonSprouts(): void {
    for (const dz of [-2.4, 2.4]) {
      this.context.entities.add(new Minion(this.position.x, this.position.y, this.position.z + dz, {
        color: 0x6dbf4a,
        headColor: 0x2f6b3a,
        eyeColor: 0xfff1a8,
        lifetime: 24,
        health: 12,
      }));
    }
    this.context.sfx.play('roar');
  }

  openStaggerWindow(): void {
    this.damageMultiplier = 2;
    this.model.setCrouch(1);
    this.model.flash(0.32, 0xf4f0a8);
    this.context.sfx.play('stagger');
    this.onShake?.(0.4);
    this.onStagger?.();
  }

  clearBeacon(): void {
    const world = this.context.world;
    for (let y = this.floorY + 1; y <= this.floorY + 7; y++) {
      if (world.getBlock(GROVE.x, y, GROVE.z) === Block.Air) continue;
      if (!world.edits.has(`${GROVE.x},${y},${GROVE.z}`)) world.restoreStructure(GROVE.x, y, GROVE.z, Block.Air);
    }
  }

  setVisualOffset(value: number): void {
    this.visualOffsetY = value;
  }

  setCollapse(value: number): void {
    this.collapse = value;
  }

  private applyPhysics(dt: number): void {
    this.velocity.y -= GRAVITY * dt;
    this.body.move(this.context.world, dt);
    this.walkSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    this.contain();
  }

  private contain(): void {
    const limit = GROVE.radius - 2.2;
    const dx = this.position.x - GROVE.x;
    const dz = this.position.z - GROVE.z;
    const distance = Math.hypot(dx, dz);
    if (distance <= limit) return;
    const scale = limit / distance;
    this.position.x = GROVE.x + dx * scale;
    this.position.z = GROVE.z + dz * scale;
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
}

class StateMachine {
  private state: BeaconState;
  private name: BeaconStateName;
  private time = 0;

  constructor(
    private readonly states: Record<BeaconStateName, BeaconState>,
    initial: BeaconStateName,
    private readonly host: BeaconKeeper,
  ) {
    this.name = initial;
    this.state = states[initial];
    this.state.enter?.(host);
  }

  get current(): BeaconStateName {
    return this.name;
  }

  change(next: BeaconStateName): void {
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

const STATES: Record<BeaconStateName, BeaconState> = {
  awaken: {
    enter(keeper) {
      keeper.damageMultiplier = 0;
      keeper.setVisualOffset(-4);
      keeper.clearBeacon();
      keeper.context.sfx.play('roar');
      keeper.onShake?.(0.4);
    },
    update(keeper, dt, time) {
      const progress = clamp(time / 1.6, 0, 1);
      keeper.setVisualOffset(-4 * (1 - progress) ** 2);
      keeper.stopMoving(dt);
      if (progress >= 1) {
        keeper.damageMultiplier = 1;
        keeper.attackCooldown = 0.7;
        return 'chase';
      }
    },
  },
  chase: {
    enter(keeper) {
      keeper.model.setArmRaise(0);
      keeper.model.setCrouch(0);
      keeper.telegraph.hide();
    },
    update(keeper, dt) {
      keeper.walkToward(keeper.context.player.position, WALK_SPEED * keeper.speedMultiplier, dt, CHASE_STANDOFF);
      keeper.attackCooldown -= dt;
      if (keeper.attackCooldown <= 0) return keeper.pickAttack();
    },
  },
  slam: {
    enter(keeper) {
      keeper.lastAttack = 'slam';
      keeper.resetSlam();
      keeper.telegraph.show(0, 0, 0, 4.2);
    },
    update(keeper, dt, time) {
      const windUp = 0.9 / keeper.speedMultiplier;
      keeper.stopMoving(dt);
      if (time < windUp) {
        keeper.model.setArmRaise(time / windUp);
        keeper.telegraph.setProgress(time / windUp);
        return;
      }
      if (!keeper.hasSlamImpacted) {
        keeper.markSlamImpacted();
        keeper.telegraph.hide();
        keeper.model.setArmRaise(0);
        keeper.slamImpact();
      }
      if (time > windUp + 0.35) return 'stagger';
    },
    exit(keeper) {
      keeper.model.setArmRaise(0);
      keeper.telegraph.hide();
    },
  },
  beam: {
    enter(keeper) {
      keeper.lastAttack = 'beam';
      keeper.startBeam();
      keeper.model.setArmRaise(1);
    },
    update(keeper, dt, time) {
      keeper.stopMoving(dt);
      keeper.model.setArmRaise(0.6 + 0.4 * Math.sin(time * 6));
      if (keeper.beamDone) return 'stagger';
    },
    exit(keeper) {
      keeper.endBeam();
      keeper.model.setArmRaise(0);
    },
  },
  summon: {
    enter(keeper) {
      keeper.lastAttack = 'summon';
      keeper.resetSummon();
      keeper.model.setArmRaise(1);
      keeper.telegraph.show(0, 0, 0, 3.2);
    },
    update(keeper, dt, time) {
      const windUp = 0.7 / keeper.speedMultiplier;
      keeper.stopMoving(dt);
      keeper.telegraph.setProgress(Math.min(1, time / windUp));
      if (time < windUp) return;
      if (!keeper.hasSummoned) {
        keeper.markSummoned();
        keeper.summonSprouts();
      }
      if (time > windUp + 0.35) return 'stagger';
    },
    exit(keeper) {
      keeper.model.setArmRaise(0);
      keeper.telegraph.hide();
    },
  },
  stagger: {
    enter(keeper) {
      keeper.openStaggerWindow();
    },
    update(keeper, dt, time) {
      keeper.stopMoving(dt);
      if (time > keeper.staggerTime) {
        keeper.attackCooldown = 0.7 / keeper.speedMultiplier;
        return 'chase';
      }
    },
    exit(keeper) {
      keeper.damageMultiplier = 1;
      keeper.model.setCrouch(0);
    },
  },
  phaseShift: {
    enter(keeper) {
      keeper.damageMultiplier = 0;
      keeper.context.sfx.play('roar');
      keeper.onShake?.(0.5);
      keeper.slamImpact();
    },
    update(keeper, dt, time) {
      keeper.stopMoving(dt);
      if (time > 1.2) {
        keeper.damageMultiplier = 1;
        keeper.attackCooldown = 0.45;
        return 'chase';
      }
    },
  },
  dying: {
    enter(keeper) {
      keeper.damageMultiplier = 0;
      keeper.telegraph.hide();
      keeper.context.sfx.play('death');
      keeper.onShake?.(0.5);
    },
    update(keeper, dt, time) {
      keeper.stopMoving(dt);
      keeper.setCollapse(clamp(time / 1.6, 0, 1));
      if (time > 1.8) {
        keeper.onDefeated?.();
        keeper.context.entities.remove(keeper);
      }
    },
  },
};
