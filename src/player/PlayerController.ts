import * as THREE from 'three';

import type { Input } from '../core/Input.ts';
import { BASE_LOOK_SENSITIVITY } from '../core/Settings.ts';
import { clamp, damp } from '../core/math.ts';
import { getBlockDef } from '../world/blocks.ts';
import type { World } from '../world/World.ts';
import type { Player } from './Player.ts';

const PITCH_LIMIT = Math.PI / 2 - 0.001;

const WALK_SPEED = 4.6;
const SPRINT_SPEED = 6.4;
const FLY_SPEED = 14;
const GROUND_ACCELERATION = 45;
const AIR_ACCELERATION = 9;
const GRAVITY = 28;
const JUMP_VELOCITY = 9;
const TERMINAL_VELOCITY = 60;

/** Blocks of free fall that are absorbed before damage starts. */
const SAFE_FALL = 4;
const FALL_DAMAGE_PER_BLOCK = 0.9;

/** Turns input into motion and keeps the camera glued to the player's eyes. */
export class PlayerController {
  private readonly forward = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly eye = new THREE.Vector3();
  private bobPhase = 0;
  private bobAmount = 0;
  /** Multiplier around the default look speed, driven by the pause sliders. */
  lookScale = 1;

  constructor(
    private readonly player: Player,
    private readonly world: World,
    private readonly camera: THREE.PerspectiveCamera,
  ) {}

  look(input: Input): void {
    if (input.mouseDX === 0 && input.mouseDY === 0) return;
    const sensitivity = BASE_LOOK_SENSITIVITY * this.lookScale;
    this.player.yaw -= input.mouseDX * sensitivity;
    this.player.pitch = clamp(
      this.player.pitch - input.mouseDY * sensitivity,
      -PITCH_LIMIT,
      PITCH_LIMIT,
    );
  }

  update(dt: number, input: Input): void {
    const player = this.player;

    if (input.wasPressed('KeyF')) {
      player.flying = !player.flying;
      player.velocity.y = 0;
    }

    const forwardAxis = (input.isDown('KeyW') ? 1 : 0) - (input.isDown('KeyS') ? 1 : 0);
    const strafeAxis = (input.isDown('KeyD') ? 1 : 0) - (input.isDown('KeyA') ? 1 : 0);

    player.sprinting = input.isDown('ShiftLeft') && forwardAxis > 0;

    this.forward.set(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
    this.right.set(-this.forward.z, 0, this.forward.x);

    const wishX = this.forward.x * forwardAxis + this.right.x * strafeAxis;
    const wishZ = this.forward.z * forwardAxis + this.right.z * strafeAxis;
    const wishLength = Math.hypot(wishX, wishZ);

    const speed = player.flying ? FLY_SPEED : player.sprinting ? SPRINT_SPEED : WALK_SPEED;
    const targetX = wishLength > 0 ? (wishX / wishLength) * speed : 0;
    const targetZ = wishLength > 0 ? (wishZ / wishLength) * speed : 0;

    const acceleration = player.flying || player.body.onGround ? GROUND_ACCELERATION : AIR_ACCELERATION;
    player.velocity.x = damp(player.velocity.x, targetX, acceleration / speed, dt);
    player.velocity.z = damp(player.velocity.z, targetZ, acceleration / speed, dt);

    if (player.flying) {
      const lift = (input.isDown('Space') ? 1 : 0) - (input.isDown('ControlLeft') ? 1 : 0);
      player.velocity.y = damp(player.velocity.y, lift * FLY_SPEED, 12, dt);
    } else {
      player.velocity.y = Math.max(player.velocity.y - GRAVITY * dt, -TERMINAL_VELOCITY);
      if (input.isDown('Space') && player.body.onGround) {
        player.velocity.y = JUMP_VELOCITY;
        player.body.onGround = false;
      }
    }

    const wasAirborne = !player.body.onGround;
    const peakBefore = player.body.fallPeak;

    player.body.move(this.world, dt);

    if (wasAirborne && player.body.onGround && !player.flying) {
      this.applyFallDamage(peakBefore - player.position.y);
    }

    this.applyContactDamage(dt);
    this.updateCamera(dt, wishLength > 0);
  }

  private applyFallDamage(distance: number): void {
    if (distance <= SAFE_FALL) return;
    const damage = Math.round((distance - SAFE_FALL) * FALL_DAMAGE_PER_BLOCK);
    if (damage > 0) this.player.health.damage(damage, { bypassInvulnerability: true });
  }

  /** Standing in lava hurts continuously rather than through the i-frame window. */
  private applyContactDamage(dt: number): void {
    let worst = 0;
    this.player.body.forEachOverlappingBlock(this.world, (id) => {
      worst = Math.max(worst, getBlockDef(id).contactDamage);
    });

    if (worst > 0) this.player.health.damage(worst * dt, { bypassInvulnerability: true });
  }

  private updateCamera(dt: number, moving: boolean): void {
    const player = this.player;
    const speed = Math.hypot(player.velocity.x, player.velocity.z);
    const walking = moving && player.body.onGround && speed > 0.5;

    this.bobPhase += dt * speed * 1.9;
    this.bobAmount = damp(this.bobAmount, walking ? Math.min(speed / SPRINT_SPEED, 1) : 0, 8, dt);

    const bobY = Math.sin(this.bobPhase * 2) * 0.045 * this.bobAmount;
    const bobX = Math.cos(this.bobPhase) * 0.035 * this.bobAmount;

    player.getEyePosition(this.eye);
    this.camera.position.set(this.eye.x + bobX, this.eye.y + bobY, this.eye.z);
    this.camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ');
  }
}
