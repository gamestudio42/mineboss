import * as THREE from 'three';

import { Sfx } from '../audio/Sfx.ts';
import { BossArena } from '../entities/boss/BossArena.ts';
import { EntityManager } from '../entities/EntityManager.ts';
import type { EntityContext } from '../entities/Entity.ts';
import { BlockInteraction } from '../player/BlockInteraction.ts';
import { HAMMER, HammerTier, UPGRADE_COST } from '../player/Hammer.ts';
import { Player, SWING_DURATION } from '../player/Player.ts';
import { PlayerCombat } from '../player/PlayerCombat.ts';
import { PlayerController } from '../player/PlayerController.ts';
import { createBlockAtlas } from '../render/atlas.ts';
import { createTerrainMaterial } from '../render/materials.ts';
import { ParticleSystem } from '../render/Particles.ts';
import { TorchLights } from '../render/TorchLights.ts';
import { ViewModel } from '../render/ViewModel.ts';
import { Hud } from '../ui/Hud.ts';
import { Overlay } from '../ui/Overlay.ts';
import { Block } from '../world/blocks.ts';
import { ChunkManager } from '../world/ChunkManager.ts';
import { TerrainGenerator } from '../world/terrain/generator.ts';
import { World } from '../world/World.ts';
import { Input } from './Input.ts';
import { Loop } from './Loop.ts';
import { loadSettings, type StoredSettings } from './Settings.ts';
import { ALTAR, ENTRANCE } from '../world/arena.ts';
import { clamp, wrapAngle } from './math.ts';

export type GameState = 'menu' | 'playing' | 'paused' | 'dead' | 'victory';

const SKY_COLOR = 0x8fb8e0;
const CAVE_COLOR = 0x090b11;
/** Below this height the atmosphere is fully underground. */
const UNDERGROUND_Y = 42;

const SPAWN_X = 10;
const SPAWN_Z = 10;
const STEP_DISTANCE = 2.4;

/** Wires every subsystem together and drives the top-level game state. */
export class Game {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly input: Input;
  readonly loop: Loop;

  state: GameState = 'menu';

  private readonly sunLight: THREE.DirectionalLight;
  private readonly skyLight: THREE.HemisphereLight;
  private readonly lamp: THREE.PointLight;
  private readonly fog: THREE.Fog;
  private readonly skyColor = new THREE.Color(SKY_COLOR);
  private readonly caveColor = new THREE.Color(CAVE_COLOR);
  private readonly blendedColor = new THREE.Color();

  private readonly sfx = new Sfx();
  private readonly atlas = createBlockAtlas();
  private readonly world: World;
  private readonly chunks: ChunkManager;
  private readonly particles: ParticleSystem;
  private readonly torchLights: TorchLights;
  private readonly entities: EntityManager;
  private readonly player = new Player();
  private readonly controller: PlayerController;
  private readonly combat: PlayerCombat;
  private readonly interaction: BlockInteraction;
  private readonly viewModel: ViewModel;
  private readonly arena: BossArena;
  private readonly hud: Hud;
  private readonly overlay = new Overlay();

  private elapsed = 0;
  private trauma = 0;
  private stepDistance = 0;
  /** Death is applied at the end of the tick so leftover attacks cannot eat the altar. */
  private pendingDeath = false;
  private hintedConsumable = false;
  private hintedUpgrade = false;
  private hintedTorch = false;
  private deaths = 0;
  private blocksMined = 0;
  private readonly context: EntityContext;

  constructor(readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.camera = new THREE.PerspectiveCamera(76, 1, 0.1, 400);
    this.camera.rotation.order = 'YXZ';
    // The camera carries the first person view model, so it must be in the graph.
    this.scene.add(this.camera);

    this.fog = new THREE.Fog(SKY_COLOR, 50, 118);
    this.scene.fog = this.fog;
    this.scene.background = this.skyColor.clone();

    this.skyLight = new THREE.HemisphereLight(0xbdd7ff, 0x4a4335, 1.15);
    this.scene.add(this.skyLight);

    this.sunLight = new THREE.DirectionalLight(0xfff3d6, 1.05);
    this.sunLight.position.set(0.55, 1, 0.3).normalize();
    this.scene.add(this.sunLight);

    // Miner's lamp: the only thing that makes caves and the arena readable.
    this.lamp = new THREE.PointLight(0xffd7a3, 0, 42, 2);
    this.scene.add(this.lamp);

    const terrainMaterial = createTerrainMaterial(this.atlas);
    const emissiveMaterial = new THREE.MeshBasicMaterial({
      map: this.atlas.texture,
      vertexColors: true,
    });

    this.world = new World(new TerrainGenerator(1337));
    this.chunks = new ChunkManager(this.world, this.scene, [terrainMaterial, emissiveMaterial]);
    this.particles = new ParticleSystem(this.scene);
    this.torchLights = new TorchLights(this.scene);
    this.entities = new EntityManager(this.scene);

    this.controller = new PlayerController(this.player, this.world, this.camera);
    this.combat = new PlayerCombat(this.player, this.entities, this.particles, this.sfx);
    this.interaction = new BlockInteraction(
      this.player,
      this.world,
      this.atlas,
      this.particles,
      this.sfx,
      this.scene,
    );

    this.viewModel = new ViewModel(this.camera);
    this.hud = new Hud(this.atlas);
    this.arena = new BossArena(this.entities, {
      onSummon: (name) => {
        this.hud.bossBar.show(name);
        this.hud.bossBar.setPhase('Phase I');
        this.hud.showHint('Jump the shockwave. Stagger it. Eat to heal.', 5);
        this.sfx.play('roar');
      },
      onPhase: (_phase, label) => {
        this.hud.bossBar.setPhase(label);
        this.hud.showHint(`${label}: it grows angrier`, 2.5);
      },
      onVictory: () => this.win(),
      onShake: (intensity) => this.shake(intensity),
    });

    this.context = {
      dt: 0,
      world: this.world,
      player: this.player,
      particles: this.particles,
      entities: this.entities,
      atlas: this.atlas,
      sfx: this.sfx,
      elapsed: 0,
    };

    this.input = new Input(canvas);
    this.input.onLockChange = (locked) => this.handleLockChange(locked);
    this.loop = new Loop((dt) => this.tick(dt));

    const settings = loadSettings();
    this.applySettings(settings);
    this.overlay.bindSettings(settings);
    this.overlay.onSettingsChange = (next) => this.applySettings(next);

    this.interaction.onAltarActivated = () => this.tryStartFight();
    this.interaction.onConsumed = (healed) => {
      if (healed <= 0) {
        this.hud.showHint('Already at full health', 1.6);
        return;
      }
      this.hud.flashHeal();
    };
    this.interaction.onConsumableFound = (name) => {
      if (this.hintedConsumable) return;
      this.hintedConsumable = true;
      this.hud.showHint(`Right click to eat ${name} and recover health`, 3.5);
    };
    this.interaction.onUpgradeFound = (name) => {
      if (this.hintedUpgrade) return;
      this.hintedUpgrade = true;
      this.hud.showHint(`Right click ${UPGRADE_COST} ${name} to strengthen the hammer`, 3.5);
    };
    this.interaction.onHammerFeedback = (text) => this.hud.showHint(text, 2.4);
    this.interaction.onTorchFuelFound = (name) => {
      if (this.hintedTorch) return;
      this.hintedTorch = true;
      this.hud.showHint(`Right click ${name} to craft four torches`, 3.5);
    };
    this.player.health.onDamage = (amount) => {
      this.hud.flashDamage(amount / 6);
      this.sfx.play('hurt');
      this.shake(Math.min(0.4, amount / 24));
    };
    this.player.health.onDeath = () => {
      this.pendingDeath = true;
    };

    window.addEventListener('resize', this.resize);
    this.resize();

    this.prepareWorld();
    this.showMenu();
  }

  private prepareWorld(): void {
    this.chunks.preload(SPAWN_X, SPAWN_Z, 2);

    const ground = this.world.surfaceY(SPAWN_X, SPAWN_Z);
    this.player.setSpawn(SPAWN_X + 0.5, ground + 1, SPAWN_Z + 0.5);
    this.player.respawn();
    this.player.yaw = Math.atan2(-(ENTRANCE.x - SPAWN_X), -(ENTRANCE.z - SPAWN_Z));
    this.player.inventory.clear();
    this.player.inventory.select(0);
    this.player.inventory.add(Block.Cobblestone, 32);
    this.player.inventory.add(Block.Planks, 16);
    this.player.inventory.add(Block.Mushroom, 4);
    this.player.inventory.add(Block.CoalOre, 8);
    this.controller.update(0.0001, this.input);
  }

  private showMenu(): void {
    this.state = 'menu';
    this.hud.setVisible(false);
    this.overlay.show(
      {
        title: 'MINEBOSS',
        text: 'Follow the shrine, descend the stairs and wake what sleeps beneath.',
        button: 'Click to play',
        showSettings: true,
      },
      () => this.startPlaying(),
    );
  }

  private startPlaying(): void {
    this.sfx.resume();
    this.overlay.hide();
    this.hud.setVisible(true);
    this.state = 'playing';
    this.input.requestLock();
  }

  private pause(): void {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.overlay.show(
      {
        title: 'PAUSED',
        text: 'The world keeps its secrets while you are away.',
        button: 'Resume',
        secondary: 'New game',
        showSettings: true,
      },
      () => this.startPlaying(),
      () => this.newGame(),
    );
  }

  private die(): void {
    if (this.state === 'dead') return;
    this.pendingDeath = false;
    this.deaths += 1;
    this.state = 'dead';
    this.sfx.play('death');
    this.input.releaseLock();
    this.hud.bossBar.hide();
    this.arena.reset(this.context);

    this.overlay.show(
      {
        title: 'YOU DIED',
        text: this.arena.defeated
          ? 'You fall. The depths remain quiet. Your pack stays with you.'
          : 'The Warden returns to its slumber. You keep your items — respawn at the stairs and right click the altar to wake it again.',
        button: 'Respawn',
        secondary: 'New game',
        showControls: false,
      },
      () => {
        this.player.respawn();
        if (!this.arena.defeated) this.arena.rebuildAltar(this.context.world);
        if (this.arena.discovered) {
          this.player.yaw = Math.atan2(
            -(ALTAR.x - this.player.spawn.x),
            -(ALTAR.z - this.player.spawn.z),
          );
        }
        this.startPlaying();
      },
      () => this.newGame(),
    );
  }

  private win(): void {
    this.state = 'victory';
    this.sfx.play('victory');
    this.input.releaseLock();
    this.hud.bossBar.hide();

    this.overlay.show(
      {
        title: 'VICTORY',
        text: this.victoryText(),
        button: 'Keep exploring',
        secondary: 'New game',
        showControls: false,
      },
      () => this.startPlaying(),
      () => this.newGame(),
    );
  }

  /** Regenerates the world and sends the player back to the surface spawn. */
  private newGame(): void {
    // Lock first, while the click is still a user gesture. Terrain preload
    // is synchronous and would otherwise make Chrome reject pointer lock.
    this.sfx.resume();
    this.input.requestLock();

    this.pendingDeath = false;
    this.elapsed = 0;
    this.trauma = 0;
    this.stepDistance = 0;
    this.deaths = 0;
    this.blocksMined = 0;
    this.hintedConsumable = false;
    this.hintedUpgrade = false;
    this.hintedTorch = false;
    this.player.hammerTier = HammerTier.Wood;
    this.viewModel.setTier(HammerTier.Wood);

    this.entities.clear();
    this.arena.beginNewRun();
    this.particles.clear();
    this.torchLights.clear();
    this.chunks.reset();
    this.world.clear();

    this.player.swing = 0;
    this.hud.bossBar.hide();
    this.hud.hideHint();
    this.hud.setObjective(null);
    this.hud.compass.update(false, 0, '');

    this.prepareWorld();
    this.startPlaying();
  }

  private tryStartFight(): void {
    if (!this.arena.canSummon(this.player.position)) {
      if (this.arena.defeated) this.hud.showHint('The altar is spent', 2);
      return;
    }

    this.sfx.play('summon');
    this.arena.summon();
  }

  private handleLockChange(locked: boolean): void {
    if (!locked && this.state === 'playing') this.pause();
  }

  private tick(dt: number): void {
    if (this.state === 'playing') this.updateWorld(dt);

    this.updateAtmosphere();
    this.renderer.render(this.scene, this.camera);
    this.input.endFrame();
  }

  private updateWorld(dt: number): void {
    this.elapsed += dt;

    this.handleHotbarInput();
    if (this.input.wasPressed('F3')) this.hud.debug.toggle();

    this.controller.look(this.input);
    this.controller.update(dt, this.input);
    this.combat.update(dt, this.input);
    const interaction = this.interaction.update(dt, this.input, this.combat.aimed !== null);
    if (interaction.brokeBlock) this.blocksMined += 1;

    this.context.dt = dt;
    this.context.elapsed = this.elapsed;
    this.entities.update(this.context);
    this.arena.update();
    this.arena.tryDiscover(this.player);

    this.player.health.update(dt);
    this.chunks.update(this.player.position.x, this.player.position.z);
    this.particles.update(dt);
    this.torchLights.update(
      this.world,
      this.player.position.x,
      this.player.position.y + 1.2,
      this.player.position.z,
    );

    this.applyShake(dt);
    this.updateFootsteps(dt);
    // Fly mode must not drive the walk sway, or the pickaxe looks like footsteps.
    const walkSpeed = this.player.flying
      ? 0
      : Math.hypot(this.player.velocity.x, this.player.velocity.z);
    this.viewModel.setTier(this.player.hammerTier);
    this.viewModel.update(dt, this.player.swing, SWING_DURATION, walkSpeed);
    this.updateHud(dt);

    if (this.pendingDeath) {
      this.die();
      // Voxel writes from reset land after the regular remesh; flush them now
      // so the restored altar is visible on the death screen.
      this.chunks.update(this.player.position.x, this.player.position.z);
    }
  }

  private handleHotbarInput(): void {
    for (let i = 0; i < 9; i++) {
      if (this.input.wasPressed(`Digit${i + 1}`)) this.player.inventory.select(i);
    }
    if (this.input.wheelDelta !== 0) this.player.inventory.cycle(this.input.wheelDelta);
  }

  private updateHud(dt: number): void {
    this.hud.update(dt, this.player.inventory, this.player.health.current);

    const boss = this.arena.boss;
    if (boss && !boss.removed) {
      this.hud.bossBar.update(boss.health?.fraction ?? 0);
      this.hud.bossBar.setVulnerable(boss.stateName === 'stagger');
    } else if (this.arena.defeated) {
      this.hud.bossBar.hide();
    }

    this.updateCrosshair();
    this.updateGuide();

    this.hud.debug.update(dt, () => this.debugLines());
  }

  private applySettings(settings: StoredSettings): void {
    this.sfx.setVolume(settings.volume);
    this.sfx.setMuted(settings.muted);
    this.controller.lookScale = settings.sensitivity;
  }

  private updateCrosshair(): void {
    if (this.combat.aimed) this.hud.setCrosshair('attack');
    else if (this.interaction.aimingAltar) this.hud.setCrosshair('altar');
    else if (this.interaction.holdingConsumable) this.hud.setCrosshair('heal');
    else if (this.interaction.holdingTorchFuel) this.hud.setCrosshair('craft');
    else if (this.interaction.target) this.hud.setCrosshair('block');
    else this.hud.setCrosshair('idle');
  }

  private updateGuide(): void {
    const position = this.player.position;
    this.hud.setObjective(this.arena.objectiveText(position));

    const target = this.arena.guideTarget(position);
    if (!target) {
      this.hud.compass.update(false, 0, '');
      return;
    }

    const dx = target.x - position.x;
    const dz = target.z - position.z;
    const targetYaw = Math.atan2(-dx, -dz);
    const relative = wrapAngle(targetYaw - this.player.yaw);
    const horizontal = Math.round(Math.hypot(dx, dz));
    const depth = Math.round(position.y - target.y);
    const depthText =
      depth > 2 ? `${depth} below` : depth < -2 ? `${-depth} above` : 'level';

    this.hud.compass.update(true, relative, `${horizontal}m · ${depthText}`);
  }

  private debugLines(): string[] {
    const position = this.player.position;
    const boss = this.arena.boss;

    return [
      `fps      ${this.loop.fps.toFixed(0)}`,
      `pos      ${position.x.toFixed(1)} ${position.y.toFixed(1)} ${position.z.toFixed(1)}`,
      `chunk    ${Math.floor(position.x / 16)} ${Math.floor(position.z / 16)}`,
      `chunks   ${this.chunks.loadedChunks} loaded`,
      `mesh     ${this.chunks.activeJobs} active / ${this.chunks.queuedJobs} queued`,
      `draws    ${this.renderer.info.render.calls}`,
      `tris     ${this.renderer.info.render.triangles}`,
      `entities ${this.entities.entities.length}`,
      `boss     ${boss ? `${boss.stateName} p${boss.phase + 1}` : 'dormant'}`,
      `hammer   ${HAMMER[this.player.hammerTier].name}`,
      `ground   ${this.player.body.onGround ? 'yes' : 'no'}${this.player.flying ? ' (flying)' : ''}`,
    ];
  }

  private updateFootsteps(dt: number): void {
    if (!this.player.body.onGround || this.player.flying) return;

    const speed = Math.hypot(this.player.velocity.x, this.player.velocity.z);
    this.stepDistance += speed * dt;
    if (this.stepDistance < STEP_DISTANCE) return;

    this.stepDistance = 0;
    this.sfx.play('step');
  }

  private shake(intensity: number): void {
    this.trauma = clamp(this.trauma + intensity, 0, 1);
  }

  private applyShake(dt: number): void {
    if (this.trauma <= 0) return;

    this.trauma = Math.max(0, this.trauma - dt * 1.4);
    const amount = this.trauma * this.trauma;

    this.camera.position.x += (Math.random() - 0.5) * amount * 0.9;
    this.camera.position.y += (Math.random() - 0.5) * amount * 0.9;
    this.camera.rotation.z += (Math.random() - 0.5) * amount * 0.12;
  }

  /** Blends light and fog toward pitch black as the camera descends. */
  private updateAtmosphere(): void {
    const t = clamp((this.camera.position.y - UNDERGROUND_Y) / 26, 0, 1);
    this.blendedColor.copy(this.caveColor).lerp(this.skyColor, t);

    this.fog.color.copy(this.blendedColor);
    (this.scene.background as THREE.Color).copy(this.blendedColor);
    this.fog.near = 4 + t * 46;
    this.fog.far = 46 + t * 72;
    this.sunLight.intensity = 0.1 + t * 0.95;
    this.skyLight.intensity = 0.42 + t * 0.73;

    this.lamp.position.copy(this.camera.position);
    this.lamp.intensity = 34 * (1 - t);

    const fighting = this.arena.active ? 1 : 0;
    this.sfx.setAmbience(t * (1 - fighting * 0.35), (1 - t) * (1 - fighting * 0.2), fighting);
  }

  private victoryText(): string {
    const minutes = Math.floor(this.elapsed / 60);
    const seconds = Math.floor(this.elapsed % 60)
      .toString()
      .padStart(2, '0');
    const deathLabel = this.deaths === 1 ? '1 death' : `${this.deaths} deaths`;
    const blockLabel = this.blocksMined === 1 ? '1 block mined' : `${this.blocksMined} blocks mined`;
    return [
      'The Deep Warden collapses into rubble. The depths are yours.',
      '',
      `${minutes}:${seconds} · ${deathLabel} · ${HAMMER[this.player.hammerTier].name} · ${blockLabel}`,
    ].join('\n');
  }

  private readonly resize = (): void => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  };
}
