import * as THREE from 'three';

import { hitPlayer } from '../../../combat/DamageSystem.ts';
import { wrapAngle } from '../../../core/math.ts';
import { Entity, type EntityContext } from '../../Entity.ts';
import { coverBetween } from './cover.ts';
import type { WaveOutcome } from './Shockwave.ts';

/** Same slowdown the bosses use in Tranquila. */
export const GENTLE_TIME_SCALE = 0.65;
/** Height of the beam above the keeper's feet; one block of cover or a jump clears it. */
const BEAM_HEIGHT = 0.45;
const WARNING_SECONDS = 0.65;

export interface LightBeamOptions {
  length: number;
  /** Pulsing preview before the sweep starts. */
  warmUp: number;
  /** Seconds for one full turn. */
  sweep: number;
  damage: number;
  knockback: number;
  color: number;
  startAngle: number;
  direction: 1 | -1;
}

/** One full turn of a ground-level light bar. Jump it or put a block between you and the keeper. */
export class LightBeam extends Entity {
  outcome: WaveOutcome = 'pending';
  private time = 0;
  private angle: number;
  private scale = 1;
  private lastAhead: number | null = null;
  private readonly bar: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>;

  constructor(private readonly options: LightBeamOptions) {
    super(1, 0.2, 'boss');
    this.angle = options.startAngle;
    const geometry = new THREE.BoxGeometry(options.length, 0.32, 0.32);
    geometry.translate(options.length / 2, BEAM_HEIGHT, 0);
    this.bar = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({ color: options.color, transparent: true, opacity: 0.2, depthWrite: false }),
    );
    this.bar.renderOrder = 2;
    this.object3D.add(this.bar);
  }

  get sweeping(): boolean {
    return this.time >= this.options.warmUp;
  }

  private get angularSpeed(): number {
    return (Math.PI * 2) / this.options.sweep;
  }

  override update(context: EntityContext): void {
    this.scale = context.player.gentle ? GENTLE_TIME_SCALE : 1;
    const dt = context.dt * this.scale;
    this.time += dt;
    if (!this.sweeping) {
      this.bar.material.opacity = 0.18 + 0.14 * Math.sin(this.time * 18);
      return;
    }
    if (this.time >= this.options.warmUp + this.options.sweep) {
      context.entities.remove(this);
      return;
    }
    this.bar.material.opacity = 0.9;
    this.angle += this.options.direction * this.angularSpeed * dt;
    if (this.outcome === 'pending') this.checkPlayer(context);
  }

  /** Imminent pass, for the on-screen warning. */
  approaching(player: { x: number; y: number; z: number }): boolean {
    if (this.removed || !this.sweeping || this.outcome !== 'pending' || !this.inReach(player)) return false;
    const ahead = this.aheadOf(player);
    return ahead >= -0.05 && ahead / (this.angularSpeed * this.scale) <= WARNING_SECONDS;
  }

  shelters(world: { getBlock(x: number, y: number, z: number): number }, player: { x: number; y: number; z: number }): boolean {
    return coverBetween(world, this.position, player);
  }

  override syncTransform(): void {
    this.object3D.position.copy(this.position);
    this.object3D.rotation.y = this.angle;
  }

  override onRemoved(): void {
    this.bar.geometry.dispose();
    this.bar.material.dispose();
  }

  private checkPlayer(context: EntityContext): void {
    const player = context.player;
    if (!this.inReach(player.position)) {
      this.lastAhead = null;
      return;
    }
    const ahead = this.aheadOf(player.position);
    const crossed = this.lastAhead !== null && this.lastAhead > 0 && ahead <= 0 && this.lastAhead - ahead < Math.PI;
    this.lastAhead = ahead;
    if (!crossed) return;
    const grounded = player.position.y < this.position.y + 1.2 && player.body.onGround;
    this.outcome = !grounded ? 'jumped' : this.shelters(context.world, player.position) ? 'blocked' : 'hit';
    if (this.outcome === 'hit') hitPlayer(player, this.options.damage, this.position, this.options.knockback);
  }

  private inReach(player: { x: number; y: number; z: number }): boolean {
    const distance = Math.hypot(player.x - this.position.x, player.z - this.position.z);
    return distance <= this.options.length && Math.abs(player.y - this.position.y) < 2;
  }

  /** Radians the beam still has to turn before it reaches the player; negative once past. */
  private aheadOf(player: { x: number; z: number }): number {
    // rotation.y = θ points the bar's +x axis along (cos θ, -sin θ) in world x/z.
    const toPlayer = Math.atan2(-(player.z - this.position.z), player.x - this.position.x);
    return wrapAngle(toPlayer - this.angle) * this.options.direction;
  }
}
