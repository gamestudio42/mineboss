import * as THREE from 'three';

import type { Input } from '../core/Input.ts';
import { BASE_LOOK_SENSITIVITY } from '../core/Settings.ts';
import { clamp, damp } from '../core/math.ts';
import { getBlockDef, isWater, isSolid } from '../world/blocks.ts';
import { raycastVoxels } from '../world/raycast.ts';
import type { World } from '../world/World.ts';
import { WORLD_HEIGHT } from '../world/Chunk.ts';
import type { Player } from './Player.ts';

/** First person, or behind the character so the suit stays visible while playing. */
export const enum CameraView {
  First = 0,
  Back = 1,
}

/** Blocks from the eyes to the third-person camera, before a wall shortens it. */
export const THIRD_PERSON_DISTANCE = 3.5;

const CAMERA_CLEARANCE = 0.32;
const MIN_CAMERA_DISTANCE = 0.55;
const cameraOrigin = new THREE.Vector3();
const cameraDirection = new THREE.Vector3();

export interface CameraPose {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
}

export function nextCameraView(view: CameraView): CameraView {
  return view === CameraView.First ? CameraView.Back : CameraView.First;
}

/**
 * First person stays on the eyes. The back view sits behind the look direction
 * and stops short of the first solid block so the camera does not enter a wall.
 * Aiming does not use this pose.
 */
export function placePlayerCamera(
  eyeX: number,
  eyeY: number,
  eyeZ: number,
  yaw: number,
  pitch: number,
  view: CameraView,
  bobX: number,
  bobY: number,
  world: World | null,
): CameraPose {
  if (view === CameraView.First) {
    return { x: eyeX + bobX, y: eyeY + bobY, z: eyeZ, yaw, pitch };
  }

  const cosPitch = Math.cos(pitch);
  const dirX = Math.sin(yaw) * cosPitch;
  const dirY = -Math.sin(pitch);
  const dirZ = Math.cos(yaw) * cosPitch;
  const distance = world
    ? cameraClearDistance(world, eyeX, eyeY, eyeZ, dirX, dirY, dirZ)
    : THIRD_PERSON_DISTANCE;

  return {
    x: eyeX + dirX * distance,
    y: eyeY + dirY * distance,
    z: eyeZ + dirZ * distance,
    yaw,
    pitch,
  };
}

/** Walks past air and non-solid blocks, then stops just before a solid one. */
function cameraClearDistance(
  world: World,
  eyeX: number,
  eyeY: number,
  eyeZ: number,
  dirX: number,
  dirY: number,
  dirZ: number,
): number {
  let traveled = 0;
  let remaining = THIRD_PERSON_DISTANCE;
  cameraOrigin.set(eyeX, eyeY, eyeZ);
  cameraDirection.set(dirX, dirY, dirZ);
  for (let step = 0; step < 6 && remaining > 0.05; step++) {
    const hit = raycastVoxels(world, cameraOrigin, cameraDirection, remaining);
    if (!hit) return THIRD_PERSON_DISTANCE;
    if (isSolid(hit.block)) {
      return Math.max(MIN_CAMERA_DISTANCE, traveled + hit.distance - CAMERA_CLEARANCE);
    }
    const advance = hit.distance + 0.05;
    traveled += advance;
    remaining -= advance;
    cameraOrigin.addScaledVector(cameraDirection, advance);
  }
  return THIRD_PERSON_DISTANCE;
}

const PITCH_LIMIT = Math.PI / 2 - 0.001;

/** Arrow keys mirror WASD for children who have not learned the letter layout. */
export const MOVE_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight'] as const;

type KeyState = Pick<Input, 'isDown'>;

const anyDown = (input: KeyState, ...codes: string[]): boolean => codes.some((code) => input.isDown(code));

export function movementAxes(input: KeyState): { forward: number; strafe: number } {
  return {
    forward: (anyDown(input, 'KeyW', 'ArrowUp') ? 1 : 0) - (anyDown(input, 'KeyS', 'ArrowDown') ? 1 : 0),
    strafe: (anyDown(input, 'KeyD', 'ArrowRight') ? 1 : 0) - (anyDown(input, 'KeyA', 'ArrowLeft') ? 1 : 0),
  };
}

export function isMoving(input: KeyState): boolean {
  return anyDown(input, ...MOVE_KEYS);
}

const WALK_SPEED = 4.6;
const SPRINT_SPEED = 6.4;
const FLY_SPEED = 6;
const FAST_FLY_SPEED = 14;
/** Short hops stay at building speed; a long forward hold glides up to cruise speed. */
const FLY_BOOST_DELAY = 1.2;
const FLY_BOOST_RAMP = 1;
const GROUND_ACCELERATION = 45;
const AIR_ACCELERATION = 9;
const GRAVITY = 28;
const JUMP_VELOCITY = 9;
const TERMINAL_VELOCITY = 60;
const SWIM_SPEED = 3.2;
const SWIM_LIFT = 5.4;
const SWIM_GRAVITY = 6;
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
  /** Keep the edge guard during a descent so momentum cannot skip its safe landing. */
  private guardedDescentY: number | null = null;
  private flyForwardTime = 0;
  /** Multiplier around the default look speed, driven by the pause sliders. */
  lookScale = 1;
  reducedMotion = false;
  edgeBlocked = false;
  view = CameraView.First;

  cycleView(): CameraView {
    this.view = nextCameraView(this.view);
    return this.view;
  }

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
    this.edgeBlocked = false;

    if (player.creative && input.wasPressed('KeyF')) {
      player.flying = !player.flying;
      player.velocity.y = 0;
    }

    const { forward: forwardAxis, strafe: strafeAxis } = movementAxes(input);
    const shift = anyDown(input, 'ShiftLeft', 'ShiftRight');

    player.sprinting = !player.flying && shift && forwardAxis > 0;
    this.flyForwardTime = player.flying && forwardAxis > 0 ? this.flyForwardTime + dt : 0;

    this.forward.set(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
    this.right.set(-this.forward.z, 0, this.forward.x);

    const wishX = this.forward.x * forwardAxis + this.right.x * strafeAxis;
    const wishZ = this.forward.z * forwardAxis + this.right.z * strafeAxis;
    const wishLength = Math.hypot(wishX, wishZ);

    const swimming = !player.flying && this.bodyInWater();
    player.swimming = swimming;
    const boost = clamp((this.flyForwardTime - FLY_BOOST_DELAY) / FLY_BOOST_RAMP, 0, 1);
    const speed = player.flying ? FLY_SPEED + (FAST_FLY_SPEED - FLY_SPEED) * boost : swimming ? SWIM_SPEED : player.sprinting ? SPRINT_SPEED : WALK_SPEED;
    const targetX = wishLength > 0 ? (wishX / wishLength) * speed : 0;
    const targetZ = wishLength > 0 ? (wishZ / wishLength) * speed : 0;

    const acceleration =
      player.flying || swimming || player.body.onGround ? GROUND_ACCELERATION : AIR_ACCELERATION;
    player.velocity.x = damp(player.velocity.x, targetX, acceleration / speed, dt);
    player.velocity.z = damp(player.velocity.z, targetZ, acceleration / speed, dt);

    // Ctrl is never bound: Ctrl+W closes the browser tab before the page can stop it.
    if (player.flying) {
      const lift = (input.isDown('Space') ? 1 : 0) - (shift ? 1 : 0);
      player.velocity.y = damp(player.velocity.y, lift * FLY_SPEED, 12, dt);
    } else if (swimming) {
      const lift = (input.isDown('Space') ? 1 : 0) - (shift ? 1 : 0);
      player.velocity.y = damp(player.velocity.y, lift * SWIM_LIFT - 1.2, 8, dt);
      player.velocity.y = Math.max(player.velocity.y - SWIM_GRAVITY * dt * 0.15, -6);
    } else {
      player.velocity.y = Math.max(player.velocity.y - GRAVITY * dt, -TERMINAL_VELOCITY);
      if (input.isDown('Space') && player.body.onGround) {
        player.velocity.y = JUMP_VELOCITY;
        player.body.onGround = false;
      }
    }

    const wasAirborne = !player.body.onGround;
    const peakBefore = player.body.fallPeak;
    // Creative players cannot take fall damage, so any safe floor is reachable.
    // Survival accepts the same drop distance as the fall-damage calculation.
    const maxProtectedDrop = player.creative ? WORLD_HEIGHT : SAFE_FALL;

    if (player.body.onGround || player.flying || swimming || !player.edgeProtection || player.velocity.y > 0 ||
        (this.guardedDescentY !== null && (player.position.y > this.guardedDescentY + 0.05 ||
          player.position.y < this.guardedDescentY - maxProtectedDrop - 0.05))) {
      this.guardedDescentY = null;
    }
    const protectEdge = player.edgeProtection && !player.flying && !swimming && player.velocity.y <= 0 &&
      (player.body.onGround || this.guardedDescentY !== null);
    const descentStartY = player.position.y;
    if (protectEdge) {
      const floorY = Math.floor(player.position.y - 0.1);
      const lowestFloor = Math.max(0, Math.floor((this.guardedDescentY ?? player.position.y) - 0.1) - maxProtectedDrop);
      const supported = (x: number, z: number): boolean => {
        for (const dx of [-0.25, 0.25]) for (const dz of [-0.25, 0.25]) {
          for (let y = floorY; y >= lowestFloor; y--) {
            const id = this.world.getBlock(Math.floor(x + dx), y, Math.floor(z + dz));
            // A safe block underneath lava must not make that column walkable.
            if (getBlockDef(id).contactDamage > 0) break;
            if (isSolid(id)) return true;
          }
        }
        return false;
      };
      const nx = player.position.x + player.velocity.x * dt;
      const nz = player.position.z + player.velocity.z * dt;
      if (Math.abs(player.velocity.x) > 0.001 && !supported(nx, player.position.z)) { player.velocity.x = 0; this.edgeBlocked = true; }
      if (Math.abs(player.velocity.z) > 0.001 && !supported(player.position.x + player.velocity.x * dt, nz)) { player.velocity.z = 0; this.edgeBlocked = true; }
    }
    player.body.move(this.world, dt);
    if (protectEdge && !wasAirborne && !player.body.onGround) this.guardedDescentY = descentStartY;
    if (player.body.onGround) this.guardedDescentY = null;

    if (swimming) player.body.fallPeak = player.position.y;
    else if (wasAirborne && player.body.onGround && !player.flying) {
      this.applyFallDamage(peakBefore - player.position.y);
    }

    this.applyContactDamage(dt);
    this.updateCamera(dt, wishLength > 0);
  }

  private bodyInWater(): boolean {
    let found = false;
    this.player.body.forEachOverlappingBlock(this.world, (id) => {
      if (isWater(id)) found = true;
    });
    return found;
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
    const walking = moving && !player.flying && player.body.onGround && speed > 0.5;

    this.bobPhase += dt * speed * 1.9;
    this.bobAmount = damp(this.bobAmount, walking ? Math.min(speed / SPRINT_SPEED, 1) : 0, 8, dt);

    const bobY = this.reducedMotion || this.view !== CameraView.First
      ? 0
      : Math.sin(this.bobPhase * 2) * 0.045 * this.bobAmount;
    const bobX = this.reducedMotion || this.view !== CameraView.First
      ? 0
      : Math.cos(this.bobPhase) * 0.035 * this.bobAmount;

    player.getEyePosition(this.eye);
    const pose = placePlayerCamera(
      this.eye.x,
      this.eye.y,
      this.eye.z,
      player.yaw,
      player.pitch,
      this.view,
      bobX,
      bobY,
      this.view === CameraView.First ? null : this.world,
    );
    this.camera.position.set(pose.x, pose.y, pose.z);
    this.camera.rotation.set(pose.pitch, pose.yaw, 0, 'YXZ');
  }
}
