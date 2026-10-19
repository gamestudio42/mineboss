import * as THREE from 'three';

import type { World } from '../world/World.ts';
import { raycastVoxels } from '../world/raycast.ts';
import type { Sfx } from '../audio/Sfx.ts';
import { hitEntity } from '../combat/DamageSystem.ts';
import type { Entity } from '../entities/Entity.ts';
import type { EntityManager } from '../entities/EntityManager.ts';
import type { Input } from '../core/Input.ts';
import type { ParticleSystem } from '../render/Particles.ts';
import type { Player } from './Player.ts';

const ATTACK_REACH = 3.8;
const ATTACK_COOLDOWN = 0.48;
const BASE_DAMAGE = 7;
/** Bonus for hitting while falling, the classic critical hit. */
const CRITICAL_MULTIPLIER = 1.5;
const KNOCKBACK = 4.5;
/** Tranquila widens every target so a child's wobbly crosshair still connects. */
export const GENTLE_AIM_MARGIN = 0.6;

/** Melee swings against entities; block mining lives in BlockInteraction. */
export class PlayerCombat {
  aimed: Entity | null = null;
  onHit: ((vulnerable: boolean) => void) | null = null;

  private cooldown = 0;
  private readonly origin = new THREE.Vector3();
  private readonly direction = new THREE.Vector3();
  private readonly impact = new THREE.Vector3();

  constructor(
    private readonly player: Player,
    private readonly entities: EntityManager,
    private readonly particles: ParticleSystem,
    private readonly sfx: Sfx,
    private readonly world?: World,
  ) {}

  update(dt: number, input: Input): void {
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.player.swing = Math.max(0, this.player.swing - dt);

    this.player.getEyePosition(this.origin);
    this.player.getForward(this.direction);

    const margin = this.player.gentle ? GENTLE_AIM_MARGIN : 0;
    const hit = this.entities.raycast(this.origin, this.direction, ATTACK_REACH, 'boss', margin);
    const wall = this.world ? raycastVoxels(this.world, this.origin, this.direction, ATTACK_REACH) : null;
    this.aimed = hit && (!wall || wall.distance >= hit.distance) ? hit.entity : null;

    if (!this.aimed || !(input.isMouseDown(0) || input.wasMousePressed(0)) || this.cooldown > 0) return;

    this.cooldown = ATTACK_COOLDOWN;
    this.player.startSwing();

    const critical = !this.player.body.onGround && this.player.velocity.y < -0.1;
    const damage =
      BASE_DAMAGE *
      this.player.meleeDamage *
      (critical ? CRITICAL_MULTIPLIER : 1) *
      this.aimed.damageMultiplier;

    if (!hitEntity(this.aimed, damage, this.origin, KNOCKBACK, this.particles)) return;

    const staggered = this.aimed.damageMultiplier > 1;
    this.sfx.play(staggered ? 'smash' : 'hit');
    this.aimed.hitFlash();
    this.aimed.getCenter(this.impact);
    this.onHit?.(staggered);
    this.particles.burst(this.impact, {
      count: staggered ? 20 : critical ? 14 : 8,
      color: staggered ? 0xe9d5ff : critical ? 0xffe08a : 0xff6a4a,
      speed: staggered ? 5.2 : 3.4,
      spread: staggered ? 0.95 : 0.6,
      life: 0.5,
    });
  }
}
