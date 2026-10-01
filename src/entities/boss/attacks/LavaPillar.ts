import * as THREE from 'three';

import { hitPlayer } from '../../../combat/DamageSystem.ts';
import { Entity, type EntityContext } from '../../Entity.ts';
import { Telegraph } from './Telegraph.ts';

const WARN_TIME = 1.1;
const ERUPT_TIME = 0.8;
const FADE_TIME = 0.5;
const RADIUS = 2.2;
const HEIGHT = 9;
const DAMAGE = 6;

/** Telegraphed column of fire that bursts out of the arena floor. */
export class LavaPillar extends Entity {
  private timer = 0;
  private erupted = false;

  private readonly telegraph = new Telegraph(0xff9d2e);
  private readonly column: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>;

  constructor(x: number, floorY: number, z: number) {
    super(RADIUS * 2, HEIGHT, 'boss');
    this.position.set(x, floorY, z);

    this.telegraph.show(0, 0, 0, RADIUS);
    this.object3D.add(this.telegraph.object3D);

    this.column = new THREE.Mesh(
      new THREE.CylinderGeometry(RADIUS * 0.85, RADIUS, HEIGHT, 20, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xff7a1f,
        transparent: true,
        opacity: 0.75,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    this.column.position.y = HEIGHT / 2;
    this.column.visible = false;
    this.object3D.add(this.column);
  }

  override update(context: EntityContext): void {
    this.timer += context.dt * (context.player.gentle ? 0.65 : 1);

    if (this.timer < WARN_TIME) {
      this.telegraph.setProgress(this.timer / WARN_TIME);
      return;
    }

    if (!this.erupted) {
      this.erupted = true;
      this.telegraph.hide();
      this.column.visible = true;
      context.sfx.play('explode');
      context.particles.burst(this.position, {
        count: 24,
        color: 0xff9d2e,
        speed: 9,
        spread: RADIUS,
        life: 1,
        gravity: 10,
      });
    }

    const eruptTime = this.timer - WARN_TIME;
    if (eruptTime < ERUPT_TIME) {
      const grow = Math.min(1, eruptTime / 0.18);
      this.column.scale.set(1, grow, 1);
      this.column.position.y = (HEIGHT * grow) / 2;
      this.damagePlayer(context);
      return;
    }

    const fade = (eruptTime - ERUPT_TIME) / FADE_TIME;
    this.column.material.opacity = 0.75 * (1 - fade);
    if (fade >= 1) context.entities.remove(this);
  }

  private damagePlayer(context: EntityContext): void {
    const player = context.player;
    const distance = Math.hypot(
      player.position.x - this.position.x,
      player.position.z - this.position.z,
    );
    if (distance > RADIUS) return;
    if (player.position.y > this.position.y + HEIGHT) return;

    if (hitPlayer(player, DAMAGE, this.position, 5)) context.sfx.play('hurt');
  }

  override onRemoved(): void {
    this.telegraph.dispose();
    this.column.geometry.dispose();
    this.column.material.dispose();
  }
}
