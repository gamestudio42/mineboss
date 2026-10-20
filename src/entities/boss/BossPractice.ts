import * as THREE from 'three';
import { Health } from '../../combat/Health.ts';
import { Entity, type EntityContext } from '../Entity.ts';
import { holdsCoverBlock } from './attacks/cover.ts';
import { Shockwave, type WaveOutcome } from './attacks/Shockwave.ts';
import { Telegraph } from './attacks/Telegraph.ts';

/** Seconds to place a block before the bonus wave starts. */
export const WALL_PREP_SECONDS = 6;

const AFTER_WALL: Record<Exclude<WaveOutcome, 'pending'>, string> = {
  blocked: 'O muro segurou a onda! Agora saia do círculo antes de ele encher.',
  jumped: 'Pular também vale! Agora saia do círculo antes de ele encher.',
  hit: 'Sem problema! Nas lutas, um muro de blocos segura a onda. Agora saia do círculo.',
};

/** Harmless practice using the same wave and ground marker as the encounters. */
export class BossPractice extends Entity {
  /** `wall` is a bonus: any outcome moves on, and it is skipped without a block in the hotbar. */
  stage: 'wave' | 'wall' | 'circle' | 'hit' | 'done' = 'wave';
  private timer = 0;
  private wave: Shockwave | null = null;
  private readonly telegraph = new Telegraph();
  private circleX = 0;
  private circleZ = 0;
  private circleActive = false;
  private readonly dummy: THREE.Mesh<THREE.BoxGeometry, THREE.MeshLambertMaterial>;
  constructor(x: number, y: number, z: number, private readonly hint: (text: string) => void, private readonly complete: () => void) {
    super(1.4, 2.5, 'boss');
    this.position.set(x,y,z);
    this.health = new Health(100);
    this.health.immune = true;
    this.health.onDamage = () => { if (this.stage === 'hit') this.stage = 'done'; };
    this.dummy = new THREE.Mesh(new THREE.BoxGeometry(1.4,2.5,1.4),new THREE.MeshLambertMaterial({color:0xcab56c}));
    this.dummy.position.y = 1.25;
    this.object3D.add(this.dummy, this.telegraph.object3D);
    this.hint('Treino sem dano · Espaço: pule a onda que vem até você');
  }
  get objective(): string {
    if (this.stage === 'wave') return '1/3 · Espaço: pule a onda';
    if (this.stage === 'wall') return 'Bônus · Coloque um bloco entre você e o boneco';
    return this.stage === 'circle' ? '2/3 · Saia do círculo vermelho' : '3/3 · BATA AGORA! Mire no boneco e segure o esquerdo';
  }
  override update(context: EntityContext): void {
    if (this.stage === 'done') { context.entities.remove(this); this.complete(); return; }
    const p = context.player;
    if (p.position.y < this.position.y - 3 || p.position.distanceTo(this.position) > 16) {
      p.position.set(this.position.x + 3,this.position.y,this.position.z);
      p.velocity.set(0,0,0); p.body.fallPeak = p.position.y;
    }
    this.timer += context.dt;
    if (this.stage === 'wave') {
      if (this.timer < 3 || (this.wave && !this.wave.removed)) return;
      this.timer = 0;
      this.sendWave(context, (jumped) => {
        if (!jumped) { this.hint('Sem problema! Aperte Espaço quando a onda chegar.'); return; }
        this.timer = 0;
        if (holdsCoverBlock(p.inventory)) {
          this.stage = 'wall';
          this.hint('Bônus: coloque um bloco entre você e o boneco. A onda não passa pelo muro.');
        } else {
          this.stage = 'circle';
          this.hint('Boa! Agora saia do círculo antes de ele encher.');
        }
      });
    } else if (this.stage === 'wall') {
      if (this.timer < WALL_PREP_SECONDS || (this.wave && !this.wave.removed)) return;
      this.timer = 0;
      this.sendWave(context, (_avoided, outcome) => {
        this.stage = 'circle';
        this.timer = 0;
        if (outcome !== 'pending') this.hint(AFTER_WALL[outcome]);
      });
    } else if (this.stage === 'circle') {
      if (!this.circleActive) {
        this.circleX=p.position.x;this.circleZ=p.position.z;this.circleActive=true;this.timer=0;
        this.telegraph.show(this.circleX-this.position.x,0,this.circleZ-this.position.z,2);
      }
      this.telegraph.setProgress(Math.min(1,this.timer/3));
      if (this.timer < 3) return;
      this.telegraph.hide();this.circleActive=false;this.timer=0;
      if (Math.hypot(p.position.x-this.circleX,p.position.z-this.circleZ)>2) {
        this.stage='hit';this.health!.immune=false;
        this.dummy.material.color.setHex(0x89d889);
        this.hint('BATA AGORA! Chegue perto, mire no boneco e use o esquerdo.');
        context.sfx.play('stagger');
      } else this.hint('Tente de novo: ande para fora do círculo vermelho.');
    }
  }
  private sendWave(context: EntityContext, onPass: (avoided: boolean, outcome: WaveOutcome) => void): void {
    this.wave = new Shockwave({ maxRadius: 12, speed: 3, damage: 0, knockback: 0, onPass });
    this.wave.position.copy(this.position);
    context.entities.add(this.wave);
    context.sfx.play('stagger');
  }
  override onRemoved(): void { this.telegraph.dispose();this.dummy.geometry.dispose();this.dummy.material.dispose(); }
}
