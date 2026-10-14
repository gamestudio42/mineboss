import * as THREE from 'three';

import { Sfx } from '../audio/Sfx.ts';
import { BossPractice } from '../entities/boss/BossPractice.ts';
import { BossArena } from '../entities/boss/BossArena.ts';
import { RuinEncounter } from '../entities/boss/RuinEncounter.ts';
import { EntityManager } from '../entities/EntityManager.ts';
import type { EntityContext } from '../entities/Entity.ts';
import { recipePanel } from '../ui/RecipePanel.ts';
import { craftRecipe } from '../player/Recipes.ts';
import type { OneBlockPace } from '../world/oneblock/phases.ts';
import { BuildHistory } from '../player/BuildHistory.ts';
import { updateBuildLesson } from '../ui/BuildLesson.ts';
import { BlockInteraction } from '../player/BlockInteraction.ts';
import { HAMMER, HammerTier, PLATE_COST, PLATES, PlateTier, UPGRADE_COST } from '../player/Hammer.ts';
import { Player, SWING_DURATION } from '../player/Player.ts';
import { PlayerCombat } from '../player/PlayerCombat.ts';
import { PlayerController } from '../player/PlayerController.ts';
import { createBlockAtlas } from '../render/atlas.ts';
import { createTerrainMaterial, createWaterMaterial } from '../render/materials.ts';
import { ParticleSystem } from '../render/Particles.ts';
import { TorchLights } from '../render/TorchLights.ts';
import { ViewModel } from '../render/ViewModel.ts';
import { Hud } from '../ui/Hud.ts';
import { Overlay } from '../ui/Overlay.ts';
import {
  ALTAR,
  CACHE,
  ENTRANCE,
  RUIN_COURTYARD,
  RUIN_STATUE,
  chunkTouchesArena,
  chunkTouchesCache,
  chunkTouchesEntrance,
  chunkTouchesRuin,
} from '../world/arena.ts';
import { Block, isWater } from '../world/blocks.ts';
import { ChunkManager } from '../world/ChunkManager.ts';
import { OneBlock } from '../world/oneblock/OneBlock.ts';
import { ISLAND_Y, VOID_KILL_Y, isOneBlockCell } from '../world/oneblock/phases.ts';
import { TerrainGenerator } from '../world/terrain/generator.ts';
import { World } from '../world/World.ts';
import { Input } from './Input.ts';
import { Loop } from './Loop.ts';
import { formatRunLine, recordRun, type RunRecord } from './Records.ts';
import { modeName, type GameMode } from './GameMode.ts';
import { blockGrid, CATALOG_GROUPS } from '../ui/BlockCatalog.ts';
import { getBlockDef, isSolid } from '../world/blocks.ts';
import { ENTRANCE_SPAWN } from '../world/arena.ts';
import { loadSave, loadPreviousSave, parseSave, saveRun, SAVE_VERSION, type SavedRun } from './Save.ts';
import { loadSettings, QUALITY, type StoredSettings } from './Settings.ts';
import { buildIdeaPanel, BUILD_IDEAS } from '../ui/BuildIdeas.ts';
import { combatCue, showActionCue } from '../ui/CombatCue.ts';
import { Shockwave } from '../entities/boss/attacks/Shockwave.ts';
import { clamp, damp, wrapAngle } from './math.ts';

export type GameState = 'menu' | 'playing' | 'paused' | 'dead' | 'victory';

const SKY_COLOR = 0x8fb8e0;
const CAVE_COLOR = 0x090b11;
const WATER_COLOR = 0x1a4a7a;
const BASE_FOV = 76;
const SPRINT_FOV = 84;
/** Below this height the atmosphere is fully underground. */
const UNDERGROUND_Y = 42;

const SPAWN_X = 0;
const SPAWN_Z = 0;
const STEP_DISTANCE = 2.4;
const DEFAULT_SEED = 1337;
const AUTOSAVE_INTERVAL = 12;

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
  private readonly waterColor = new THREE.Color(WATER_COLOR);
  private readonly blendedColor = new THREE.Color();
  private readonly eyeScratch = new THREE.Vector3();

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
  private readonly ruin: RuinEncounter;
  private survival: SavedRun['survival'];
  private practice: BossPractice | null = null;
  private fightCreative = false;
  private creativePalette: SavedRun['creativePalette'];
  private tutorialDone = false;
  private home: SavedRun['home'];
  private fightReturn: { position: THREE.Vector3; spawn: THREE.Vector3; yaw: number; pitch: number; flying?: boolean } | null = null;
  private readonly buildHistory = new BuildHistory();
  private readonly trophies = new Set<number>();
  private guidance = true;
  private buildLesson = 0;
  private mode: GameMode = 'adventure';
  private readonly oneBlock: OneBlock;
  private readonly hud: Hud;
  private readonly overlay = new Overlay();

  private reducedMotion = false;
  private elapsed = 0;
  private trauma = 0;
  private stepDistance = 0;
  /** Death is applied at the end of the tick so leftover attacks cannot eat the altar. */
  private pendingDeath = false;
  private hintedConsumable = false;
  private hintedUpgrade = false;
  private hintedTorch = false;
  private hintedBed = false;
  private hintedPlates = false;
  private hintedStagger = false;
  private deaths = 0;
  private blocksMined = 0;
  private seed = DEFAULT_SEED;
  private saveTimer = 0;
  private saveSoon = false;
  private wasInWater = false;
  private voidFall = false;
  private readonly context: EntityContext;

  constructor(readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.camera = new THREE.PerspectiveCamera(BASE_FOV, 1, 0.1, 520);
    this.camera.rotation.order = 'YXZ';
    // The camera carries the first person view model, so it must be in the graph.
    this.scene.add(this.camera);

    this.fog = new THREE.Fog(SKY_COLOR, 40, 170);
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
    const waterMaterial = createWaterMaterial(this.atlas);

    this.world = new World(new TerrainGenerator(this.seed));
    this.oneBlock = new OneBlock(this.seed);
    this.chunks = new ChunkManager(this.world, this.scene, [terrainMaterial, emissiveMaterial], waterMaterial);
    this.particles = new ParticleSystem(this.scene);
    this.torchLights = new TorchLights(this.scene);
    this.entities = new EntityManager(this.scene);

    this.controller = new PlayerController(this.player, this.world, this.camera);
    this.combat = new PlayerCombat(this.player, this.entities, this.particles, this.sfx, this.world);
    this.interaction = new BlockInteraction(
      this.player,
      this.world,
      this.atlas,
      this.particles,
      this.sfx,
      this.scene,
    );

    this.viewModel = new ViewModel(this.camera, this.atlas);
    this.hud = new Hud(this.atlas);
    this.combat.onHit = vulnerable => this.hud.showHint(vulnerable ? 'Acertou! Ele está vulnerável!' : 'Acertou!', 0.7);
    this.arena = new BossArena(this.entities, {
      onSummon: (name) => {
        this.hud.bossBar.show(name);
        this.hud.bossBar.setPhase('Fase I');
        this.sfx.play('roar');
      },
      onPhase: (phase, label) => {
        this.hud.bossBar.setPhase(label);
        if (phase === 2) {
          this.hud.showHint('Desvie das pedras e dos monstrinhos. Bata quando ele ficar vulnerável.', 3.5);
          return;
        }
        this.hud.showHint(`${label}: ele está mais forte`, 2.5);
      },
      onVictory: () => this.win(),
      onShake: (intensity) => this.shake(intensity),
      onStagger: () => this.hintStagger(),
    });
    this.ruin = new RuinEncounter(this.entities, {
      onSummon: (name) => {
        this.hud.bossBar.show(name);
        this.hud.bossBar.setPhase('Fase I');
        this.sfx.play('roar');
      },
      onPhase: (_phase, label) => {
        this.hud.bossBar.setPhase(label);
        this.hud.showHint(`${label}: ele joga pedras — saia dos círculos`, 3.2);
      },
      onDefeated: () => {
        this.rewardBoss(Block.SentinelTrophy);
        this.finishFight();
        this.ruin.rebuildStatue(this.world);
        this.showBossVictory('Sentinela vencido!');
        this.hud.bossBar.hide();
        this.hud.showHint(
          (this.mode === 'adventure' || this.oneBlock.shrineUnlocked)
            ? 'Você venceu o Sentinela! O santuário fica ao norte'
            : 'Você venceu o Sentinela! Continue explorando o bloco',
          4.2,
        );
        this.saveSoon = true;
      },
      onShake: (intensity) => this.shake(intensity),
      onStagger: () => this.hintStagger(),
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
    this.input.onLockError = () => {
      if (this.state !== 'playing') return;
      this.pause();
      this.overlay.show({ title: 'Vamos ativar o mouse', text: 'Clique na aba do jogo para ativá-la e tente abaixo. Se o navegador pedir, permita usar o mouse.', button: 'Ativar mouse', secondary: 'Voltar à pausa', showControls: false }, () => this.startPlaying(), () => this.showPaused());
    };
    document.getElementById('mouse-activate')!.onclick = () => this.input.requestLock();
    this.loop = new Loop((dt) => this.tick(dt));

    const settings = loadSettings();
    this.applySettings(settings);
    this.overlay.bindSettings(settings);
    this.overlay.onSettingsChange = (next) => this.applySettings(next);

    this.interaction.onBlockPlaced = () => {
      if (this.buildLesson === 1) this.buildLesson = 2;
      if (this.mode === 'oneblock') {
        const earned = this.oneBlock.claimGoals(this.world, this.player);
        if (earned.length) { this.hud.showHint('Você conseguiu! Novos materiais na mochila.', 5); this.saveSoon = true; }
      }
    };
    this.interaction.onBuildEdit = edit => { if (this.player.creative && !this.arena.active && !this.ruin.active) this.buildHistory.record(edit); };
    this.player.inventory.onOverflow = () => this.hud.showHint('Barra cheia: material guardado na mochila. Aperte B.', 4);
    this.oneBlock.onWarning = () => this.hud.showHint('⚠ Um monstrinho está chegando! Afaste-se do bloco.', 3);
    window.addEventListener('pagehide', () => { if (this.state !== 'menu') this.persistSave({ atSpawn: this.player.dead }); });
    this.interaction.onAltarActivated = () => this.tryStartFight();
    this.interaction.onStatueActivated = () => this.tryStartRuinFight();
    this.interaction.onOneBlockMined = () => this.handleOneBlockMined();
    this.interaction.onConsumed = (healed) => {
      if (healed <= 0) {
        this.hud.showHint('Sua vida já está cheia', 1.6);
        return;
      }
      this.hud.flashHeal();
    };
    this.interaction.onConsumableFound = (name) => {
      if (this.hintedConsumable) return;
      this.hintedConsumable = true;
      this.hud.showHint(`Botão direito: comer ${name} e recuperar vida`, 3.5);
    };
    this.interaction.onUpgradeFound = (name) => {
      if (!this.hintedUpgrade) {
        this.hintedUpgrade = true;
        this.hud.showHint(`C: criar um martelo com ${UPGRADE_COST} ${name}`, 3.5);
        return;
      }
      if (name.includes('Gold') && this.player.hammerTier >= HammerTier.Gold && this.player.plates < PlateTier.Gold) {
        this.hud.showHint(`C: criar armadura com ${PLATE_COST} ${name}`, 3.5);
        return;
      }
      if (this.player.hammerTier < HammerTier.Iron || this.player.plates >= PlateTier.Iron) return;
      this.hud.showHint(`C: criar armadura com ${PLATE_COST} ${name}`, 3.5);
    };
    this.interaction.onHammerFeedback = (text) => this.hud.showHint(text, 2.4);
    this.interaction.onTorchFuelFound = (name) => {
      if (this.hintedTorch) return;
      this.hintedTorch = true;
      this.hud.showHint(`C: use ${name} para criar tochas`, 3.5);
    };
    this.interaction.onBedFound = () => {
      if (this.hintedBed) return;
      this.hintedBed = true;
      this.hud.showHint('Coloque a cama e clique nela com o botão direito para descansar', 3.8);
    };
    this.interaction.onSpawnSet = () => {
      this.hud.showHint('Você vai voltar aqui ao renascer', 2.6);
      this.saveSoon = true;
    };
    this.player.health.onDamage = (amount) => {
      this.hud.flashDamage(amount / 6);
      this.sfx.play('hurt');
      this.shake(Math.min(0.4, amount / 24));
    };
    this.player.onPlateAbsorb = () => {
      this.viewModel.flashPlates();
      this.hud.flashPlates();
      this.sfx.play('plate');
      if (this.hintedPlates) return;
      this.hintedPlates = true;
      this.hud.showHint('Sua armadura protegeu você', 3.2);
    };
    this.player.health.onDeath = () => {
      this.pendingDeath = true;
    };

    this.world.onEdit = () => {
      this.saveSoon = true;
    };

    window.addEventListener('resize', this.resize);
    this.resize();

    const save = loadSave(this.mode);
    if (save) this.applySave(save);
    else this.prepareWorld();
    this.showMenu();
  }

  private prepareWorld(): void {
    this.syncGeneratorUnlocks();
    const x = this.mode === 'adventure' ? 10 : SPAWN_X;
    const z = this.mode === 'adventure' ? 10 : SPAWN_Z;
    this.chunks.preload(x, z, 2);

    this.player.setSpawn(x + 0.5, this.mode === 'adventure' ? this.world.surfaceY(x, z) + 1 : ISLAND_Y + 1, z + 0.5);
    this.player.respawn();
    this.home = { x: this.player.spawn.x, y: this.player.spawn.y, z: this.player.spawn.z };
    this.player.yaw = 0;
    // In OneBlock the only mineable block starts beneath the player.
    this.player.pitch = this.mode === 'oneblock' ? -1.38 : 0;
    this.player.inventory.clear();
    this.player.inventory.select(0);
    if (this.mode === 'adventure') {
      this.player.inventory.add(Block.Cobblestone, 32);
      this.player.inventory.add(Block.Planks, 16);
      this.player.inventory.add(Block.Bed, 1);
      this.player.inventory.add(Block.Mushroom, 4);
      this.player.inventory.add(Block.CoalOre, 8);
      this.player.yaw = Math.atan2(-(ENTRANCE.x - x), -(ENTRANCE.z - z));
    } else {
      this.player.inventory.add(Block.Dirt, 4);
      this.player.inventory.add(Block.Mushroom, 2);
    }
    this.controller.update(0.0001, this.input);
  }

  private showMenu(): void {
    this.state = 'menu';
    this.hud.setVisible(false);
    this.overlay.show({
      title: 'MINEBOSS',
      text: 'Escolha seu mundo. Cada modo guarda uma partida separada.\nAventura: explore o mundo aberto. OneBlock: construa no vazio.',
      button: '🌳 Aventura', secondary: '🏝 OneBlock', showControls: false, onEscape: () => {},
    }, () => this.showModeMenu('adventure'), () => this.showModeMenu('oneblock'));
    this.overlay.addAction('Som e conforto', () => {
      this.overlay.show({ title: 'Som e conforto', text: 'Ajuste a imagem, a câmera e o som.', button: 'Voltar', showControls: false, showSettings: true, onEscape: () => this.showMenu() }, () => this.showMenu());
    }, { icon: '⚙' });
  }

  private showModeMenu(mode: GameMode): void {
    const save = loadSave(mode);
    this.overlay.show({
      title: modeName(mode),
      text: mode === 'adventure' ? 'Explore florestas, cavernas e ruínas. Descubra os bosses no mundo aberto.' : 'Mine o bloco infinito, expanda sua ilha e desbloqueie as ilhas dos bosses.',
      button: save ? 'Continuar' : 'Jogar', secondary: save ? 'Nova partida' : 'Voltar',
      showControls: false,
    }, () => {
      if (save) { this.applySave(save); this.startPlaying(); }
      else this.chooseStyle(mode);
    }, () => save ? this.confirmNewGame(mode) : this.showMenu());
    this.overlay.setBackAction(() => this.showMenu());
    this.overlay.addAction('Cuidar dos mundos', () => this.showWorldOptions(mode), { icon: '💾' });
    if (save?.updatedAt) {
      const stamp = document.createElement('p'); stamp.textContent = `Salvo em ${new Date(save.updatedAt).toLocaleString('pt-BR')}`; this.overlay.addContent(stamp);
    }
  }

  private confirmNewGame(mode: GameMode): void {
    this.overlay.show({ title: 'Nova partida', text: `Substituir a partida de ${modeName(mode)}? O outro modo será preservado.`, button: 'Criar partida', secondary: 'Voltar', showControls: false },
      () => this.chooseStyle(mode), () => this.showModeMenu(mode));
  }

  private startPlaying(): void {
    this.sfx.resume();
    this.overlay.hide();
    this.hud.setVisible(true);
    this.state = 'playing';
    this.input.requestLock();
    document.getElementById('mouse-prompt')!.classList.toggle('hidden', this.input.locked);
    if (this.arena.active || this.ruin.active || this.practice) {
      this.hud.hideHint();
    } else if (this.mode === 'oneblock' && !this.oneBlock.ruinUnlocked) {
      this.hud.showHint('Use o direito para colocar terra e ampliar a ilha.', 5);
    } else if (this.player.creative) {
      this.hud.showHint('B: escolha blocos. Esc: construir, base e chefões.', 4);
    } else if (!this.arena.ruinFound) {
      this.hud.showHint('Encontre o Sentinela: siga a bússola ou use Visitar no menu', 4.2);
    } else if (!this.player.creative && !this.hintedBed && this.player.inventory.slots.some((slot) => slot.block === Block.Bed)) {
      this.hintedBed = true;
      this.hud.showHint('Coloque a cama e clique nela com o botão direito para descansar', 3.8);
    }
    this.persistSave();
  }

  private pause(): void {
    if (this.state !== 'playing') return;
    this.persistSave();
    this.state = 'paused';
    document.getElementById('mouse-prompt')!.classList.add('hidden');
    this.input.releaseLock();
    const fighting = this.arena.active || this.ruin.active || Boolean(this.practice);
    this.overlay.show(
      {
        title: 'Vamos brincar?',
        onEscape: () => this.startPlaying(),
        text: fighting ? 'Continue ou saia da batalha.' : this.mode === 'oneblock' && !this.oneBlock.ruinUnlocked ? 'Seu bloco infinito está esperando.' : 'Continue construindo ou visite o chefão quando quiser.',
        button: 'Continuar',
        secondary: 'Modos de jogo',
        showControls: false,
      },
      () => this.startPlaying(),
      () => this.showMenu(),
    );
    this.addPlayActions();
  }

  private die(): void {
    if (this.state === 'dead') return;
    this.pendingDeath = false;
    this.deaths += 1;
    this.state = 'dead';
    this.sfx.play('death');
    this.input.releaseLock();
    this.hud.bossBar.hide();
    const sentinelFight = this.ruin.active;
    const voided = this.voidFall;
    this.voidFall = false;
    this.arena.reset(this.context);
    this.ruin.reset(this.context);
    this.entities.clear();
    this.oneBlock.cancelWarning();
    this.finishFight();
    this.ensureSafeSpawn();
    this.persistSave({ atSpawn: true });

    this.overlay.show(
      {
        title: 'Vamos tentar de novo?',
        text: this.deathText(sentinelFight, voided),
        button: 'Renascer',
        secondary: 'Modos de jogo',
        showControls: false,
        showSettings: true,
      },
      () => {
        const flying = this.player.flying;
        this.player.respawn();
        this.player.flying = this.player.creative && flying;
        if (this.world.generator.shrineUnlocked && !this.arena.defeated) {
          this.arena.rebuildAltar(this.context.world);
        }
        if (this.world.generator.ruinUnlocked && !this.ruin.defeated) {
          this.ruin.rebuildStatue(this.context.world);
        }
        if (this.arena.discovered) {
          this.player.yaw = Math.atan2(
            -(ALTAR.x - this.player.spawn.x),
            -(ALTAR.z - this.player.spawn.z),
          );
        }
        this.startPlaying();
      },
      () => this.showMenu(),
    );
    this.overlay.addAction('Voltar à base', () => { this.goHome(); this.startPlaying(); });
  }

  private win(): void {
    this.rewardBoss(Block.WardenTrophy);
    this.finishFight();
    this.arena.rebuildAltar(this.world);
    this.unlockCacheIsland();
    this.state = 'victory';
    this.sfx.play('victory');
    this.input.releaseLock();
    this.hud.bossBar.hide();
    this.persistSave();

    this.overlay.show(
      {
        title: 'Você venceu!',
        text: this.victoryText(),
        button: 'Voltar à base',
        secondary: 'Continuar explorando',
        showControls: false,
        showSettings: true,
      },
      () => { this.goHome(); this.startPlaying(); },
      () => this.startPlaying(),
    );
  }

  /** Regenerates the world and sends the player back to the surface spawn. */
  private newGame(mode: GameMode, pace: OneBlockPace = 'classic'): void {
    this.mode = mode;
    this.practice = null;
    this.fightCreative = false;
    this.creativePalette = undefined;
    this.tutorialDone = false;
    this.guidance = true;
    this.home = undefined;
    this.fightReturn = null;
    this.buildHistory.clear();
    this.buildLesson = 0;
    this.survival = undefined;
    this.trophies.clear();
    this.player.creative = false;
    this.player.health.immune = false;
    this.player.inventory.unlimited = false;
    this.player.gentle = true;
    this.player.edgeProtection = true;
    this.player.flying = false;
    this.player.pitch = 0;
    // Lock first, while the click is still a user gesture. Terrain preload
    // is synchronous and would otherwise make Chrome reject pointer lock.
    this.sfx.resume();
    this.input.requestLock();

    this.pendingDeath = false;
    this.elapsed = 0;
    this.trauma = 0;
    this.stepDistance = 0;
    this.saveTimer = 0;
    this.saveSoon = false;
    this.wasInWater = false;
    this.voidFall = false;
    this.deaths = 0;
    this.blocksMined = 0;
    this.hintedConsumable = false;
    this.hintedUpgrade = false;
    this.hintedTorch = false;
    this.hintedBed = false;
    this.hintedPlates = false;
    this.hintedStagger = false;
    this.player.hammerTier = HammerTier.Wood;
    this.player.plates = PlateTier.None;
    this.viewModel.setTier(HammerTier.Wood);
    this.viewModel.setPlates(PlateTier.None);
    this.viewModel.setHeld(null);

    this.entities.clear();
    this.arena.beginNewRun();
    this.ruin.beginNewRun();
    this.particles.clear();
    this.torchLights.clear();
    this.chunks.reset();
    this.seed = (Math.random() * 0x7fffffff) | 0;
    this.world.reseed(this.seed, this.mode);
    this.oneBlock.reset(this.seed, pace);

    this.player.swing = 0;
    this.hud.bossBar.hide();
    this.hud.hideHint();
    this.hud.setObjective(null);
    this.hud.compass.update(false, 0, '');

    this.prepareWorld();
    this.startPlaying();
  }

  private tryStartFight(): void {
    if (this.arena.active || this.ruin.active || !this.world.generator.shrineUnlocked || !this.arena.canSummon(this.player.position)) return;
    this.confirmFight(false);
  }

  private tryStartRuinFight(): void {
    if (this.arena.active || this.ruin.active || !this.world.generator.ruinUnlocked || !this.ruin.canSummon(this.player.position)) return;
    this.confirmFight(true);
  }

  private hintStagger(): void {
    this.hintedStagger = true;
    this.hud.showHint('BATA AGORA! O chefão está vulnerável!', 3.4);
  }

  private deathText(sentinelFight: boolean, voided: boolean): string {
    if (voided && !sentinelFight) {
      return 'Você caiu! Seus itens estão guardados. Renasça e amplie sua ilha.';
    }
    if (sentinelFight) {
      return 'Seus itens continuam com você. Renasça perto e tente o Sentinela de novo quando quiser.';
    }
    if (this.arena.defeated) {
      return 'Seus itens estão seguros. Renasça para continuar.';
    }
    return 'Seus itens estão seguros. Renasça e escolha quando tentar de novo.';
  }

  private handleLockChange(locked: boolean): void {
    document.getElementById('mouse-prompt')!.classList.toggle('hidden', locked || this.state !== 'playing');
    if (locked && this.state !== 'playing') { this.input.releaseLock(); return; }
    if (!locked && this.state === 'playing') this.pause();
  }

  private tick(dt: number): void {
    if (this.state === 'playing') {
      if (this.input.locked) this.updateWorld(dt);
      else if (this.input.wasPressed('Escape')) this.pause();
    }

    this.updateAtmosphere(dt);
    this.renderer.render(this.scene, this.camera);
    this.viewModel.render(this.renderer, this.scene);
    this.input.endFrame();
  }

  private updateWorld(dt: number): void {
    if (this.input.wasPressed('Escape')) { this.pause(); return; }
    if (this.input.wasPressed('KeyB') && !this.practice) { this.openCatalog(); return; }
    if (this.input.wasPressed('KeyC') && !this.player.creative && !this.arena.active && !this.ruin.active && !this.practice) { this.showRecipes(); return; }
    if (this.input.wasPressed('KeyH')) { this.showHelp(); return; }
    if (this.input.wasPressed('KeyZ')) this.undoBuild(this.input.isDown('ShiftLeft') || this.input.isDown('ShiftRight'));
    if (this.input.wasPressed('KeyY')) this.undoBuild(true);
    this.elapsed += dt;

    this.handleHotbarInput();
    if (this.input.wasPressed('KeyQ') && !this.practice) this.interaction.tossSelected();
    if (this.input.wasPressed('F3')) this.hud.debug.toggle();

    this.player.health.immune = this.player.creative || this.practice !== null;
    this.oneBlock.gentle = this.player.gentle;
    if (this.mode === 'oneblock') this.oneBlock.update(dt, this.world, this.entities, this.player);
    this.controller.look(this.input);
    this.controller.update(dt, this.input);
    if (this.mode === 'oneblock' && !this.player.flying && this.player.position.y < VOID_KILL_Y) {
      this.voidFall = true;
      this.player.health.damage(this.player.health.max, { bypassInvulnerability: true });
    }
    this.combat.update(dt, this.input);
    this.interaction.previewEnabled = !this.arena.active && !this.ruin.active && !this.practice;
    const interaction = this.practice ? { brokeBlock: false } : this.interaction.update(dt, this.input, this.combat.aimed !== null);
    if (this.state !== 'playing') return;
    if (interaction.brokeBlock) {
      this.blocksMined += 1;
      if (this.buildLesson === 2) { this.buildLesson = 0; this.tutorialDone = true; this.saveSoon = true; this.hud.showHint('Muito bem! Você já sabe escolher, colocar e remover blocos.', 5); }
    }

    this.context.dt = dt;
    this.context.elapsed = this.elapsed;
    this.entities.update(this.context);
    if (this.state !== 'playing') return;
    this.arena.update();
    this.ruin.update();
    if (this.world.generator.shrineUnlocked && !this.player.creative) this.arena.tryDiscover(this.player);
    this.tryDiscoverRuin();
    this.tryClaimCache();

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
    this.viewModel.update(dt, this.player.swing, SWING_DURATION, this.reducedMotion ? 0 : walkSpeed);
    this.updateHud(dt);
    this.updateSave(dt);

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
    this.hud.update(
      dt,
      this.player.inventory,
      this.player.health.current,
      this.player.hammerTier,
      this.player.plates,
    );
    this.viewModel.setPlates(this.player.plates);
    this.hud.setSeed(this.seed);
    this.hud.setPhase(this.mode === 'oneblock' ? `${this.oneBlock.label} · ${!this.oneBlock.ruinUnlocked ? 'Ruína: ' + this.oneBlock.broken + '/' + this.oneBlock.ruinAt : !this.oneBlock.shrineUnlocked ? 'Santuário: ' + this.oneBlock.broken + '/' + this.oneBlock.shrineAt : 'Ilhas liberadas'}` : this.player.creative ? 'Aventura · Construção livre ∞' : 'Aventura · Sobrevivência');
    const fighting = this.arena.active || this.ruin.active || Boolean(this.practice);
    updateBuildLesson(fighting ? 0 : this.buildLesson);
    document.getElementById('flight-status')!.textContent = this.player.creative ? (this.player.flying ? 'Voando · Espaço sobe · Ctrl desce · Shift acelera · F pousa' : 'No chão · Espaço pula · F voa') : '';
    document.getElementById('play-help')!.textContent = fighting
      ? 'Espaço: pular · Esquerdo: atacar · Esc: pausar'
      : this.player.creative ? 'B: blocos · Z: desfazer · Y: refazer · Esc: menu'
      : 'B: mochila · C: criar · H: ajuda · Esc: menu';
    const held = this.player.inventory.selectedSlot;
    this.viewModel.setHeld(held.count > 0 ? held.block : null);

    const boss = this.arena.boss ?? this.ruin.boss;
    if (boss && !boss.removed) {
      this.hud.bossBar.update(boss.health?.fraction ?? 0);
      this.hud.bossBar.setVulnerable(boss.stateName === 'stagger');
    } else if (this.arena.defeated || this.ruin.defeated) {
      if (!this.arena.active && !this.ruin.active) this.hud.bossBar.hide();
    }

    this.updateCrosshair();
    this.updateGuide();

    this.hud.debug.update(dt, () => this.debugLines());
  }

  private applySettings(settings: StoredSettings): void {
    this.sfx.setVolume(settings.volume);
    this.sfx.setMuted(settings.muted);
    this.controller.lookScale = settings.sensitivity;
    this.reducedMotion = this.controller.reducedMotion = settings.reducedMotion;
    this.hud.reducedEffects = settings.reducedEffects;
    const quality = QUALITY[settings.quality];
    this.chunks.setRenderDistance(quality.distance);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality.pixelRatio));
    this.particles.density = settings.reducedEffects ? Math.min(.2, quality.particles) : quality.particles;
    this.torchLights.limit = quality.lights;
    document.documentElement.classList.toggle('calm-effects', settings.reducedMotion || settings.reducedEffects);
    this.resize();
  }

  private updateCrosshair(): void {
    const fighting = this.arena.active || this.ruin.active || Boolean(this.practice);
    const target = this.interaction.target;
    const aimingCore = this.mode === 'oneblock' && target !== null && isOneBlockCell(target.x, target.y, target.z);
    const boss = this.arena.boss ?? this.ruin.boss;
    const incoming = this.entities.entities.some(entity => entity instanceof Shockwave && entity.approaching(this.player.position));
    const cue = combatCue(boss && !boss.removed ? boss.stateName : undefined, this.practice?.stage, incoming);
    if (cue) showActionCue(cue);
    else if (this.controller.edgeBlocked) showActionCue({ icon: '✋', key: 'Espaço', text: 'Proteção de borda: queda à frente', kind: 'warning' });
    else if (this.interaction.placementHint) showActionCue({ icon: '!', key: '', text: this.interaction.placementHint, kind: 'warning' });
    else if (this.buildLesson) showActionCue(null);
    else if (this.combat.aimed) showActionCue({ icon: '🔨', key: 'Esquerdo', text: 'Bater', kind: 'attack' });
    else if (this.interaction.aimingAltar || this.interaction.aimingStatue) showActionCue({ icon: '👑', key: 'Direito', text: 'Visitar chefão', kind: 'build' });
    else if (this.interaction.aimingBed) showActionCue({ icon: '☾', key: 'Direito', text: 'Descansar', kind: 'build' });
    else if (this.interaction.holdingConsumable) showActionCue({ icon: '♥', key: 'Direito', text: 'Comer', kind: 'build' });
    else if (aimingCore) showActionCue({ icon: '🔨', key: 'Esquerdo', text: 'Segure para pegar blocos', kind: 'build' });
    else if (this.interaction.holdingTorchFuel || this.interaction.holdingUpgradeOre) showActionCue({ icon: '🔨', key: 'C', text: 'Criar itens', kind: 'build' });
    else if (target) showActionCue({ icon: '🧱', key: 'Direito', text: 'Colocar · esquerdo remove', kind: 'build' });
    else showActionCue(null);
    if (this.combat.aimed) this.hud.setCrosshair('attack');
    else if (fighting) this.hud.setCrosshair('idle');
    else if (this.interaction.aimingAltar || this.interaction.aimingStatue) this.hud.setCrosshair('altar');
    else if (this.interaction.holdingConsumable) this.hud.setCrosshair('heal');
    else if (this.interaction.holdingUpgradeOre) this.hud.setCrosshair('smith');
    else if (this.interaction.aimingBed) this.hud.setCrosshair('rest');
    else if (this.interaction.holdingTorchFuel) this.hud.setCrosshair('craft');
    else if (this.interaction.holdingBedMaterial && !this.interaction.target) this.hud.setCrosshair('craft');
    else if (this.interaction.target) this.hud.setCrosshair('block');
    else this.hud.setCrosshair('idle');
  }

  private updateGuide(): void {
    const position = this.player.position;
    if (this.practice) { this.hud.setObjective(null); this.hud.compass.update(false,0,''); return; }
    if (this.player.creative && !this.ruin.active && !this.arena.active) {
      this.hud.setObjective(this.guidance ? 'Construa do seu jeito · Esc: sua base e chefões' : null);
      this.hud.compass.update(false, 0, '');
      return;
    }
    if (!this.guidance && !this.ruin.active && !this.arena.active) {
      this.hud.setObjective('Construa do seu jeito · B: blocos e mochila');
      this.hud.compass.update(false, 0, '');
      return;
    }

    if (this.ruin.active) {
      this.hud.setObjective(null);
      this.hud.compass.update(false, 0, '');
      return;
    }

    if (this.arena.active) {
      this.hud.setObjective(null);
      this.hud.compass.update(false, 0, '');
      return;
    }

    if ((this.mode === 'adventure' || this.oneBlock.ruinUnlocked) && !this.ruin.defeated && this.arena.guideStage(position) === 'surface') {
      this.hud.setObjective(
        this.arena.ruinFound ? 'Botão direito na estátua: enfrentar o Sentinela' : 'Encontre o Sentinela: siga a bússola ou use Visitar no menu',
      );
      this.pointCompass(position, RUIN_STATUE.x + 0.5, position.y, RUIN_STATUE.z + 0.5);
      return;
    }

    if (this.mode === 'adventure' || this.oneBlock.shrineUnlocked || this.arena.defeated) {
      this.hud.setObjective(this.arena.objectiveText(position));
      const target = this.arena.guideTarget(position);
      if (!target) {
        this.hud.compass.update(false, 0, '');
        return;
      }
      this.pointCompass(position, target.x, target.y, target.z);
      return;
    }

    this.hud.setObjective('Quebre o bloco infinito');
    this.hud.compass.update(false, 0, '');
  }

  private pointCompass(position: { x: number; y: number; z: number }, x: number, y: number, z: number): void {
    const dx = x - position.x;
    const dz = z - position.z;
    const targetYaw = Math.atan2(-dx, -dz);
    const relative = wrapAngle(targetYaw - this.player.yaw);
    const horizontal = Math.round(Math.hypot(dx, dz));
    const depth = Math.round(position.y - y);
    const depthText =
      depth > 2 ? `${depth} abaixo` : depth < -2 ? `${-depth} acima` : 'mesma altura';

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
      `ruin     ${this.ruin.boss ? `${this.ruin.boss.stateName} p${this.ruin.boss.phase + 1}` : this.ruin.defeated ? 'fallen' : 'dormant'}`,
      `hammer   ${HAMMER[this.player.hammerTier].name}${this.player.plates !== PlateTier.None ? ` + ${PLATES[this.player.plates].name}` : ''}`,
      `seed     ${this.seed}`,
      `phase    ${this.oneBlock.label} (${this.oneBlock.broken})`,
      `ground   ${this.player.body.onGround ? 'yes' : 'no'}${this.player.flying ? ' (flying)' : ''}`,
    ];
  }

  private updateFootsteps(dt: number): void {
    if (this.player.flying) return;

    const swimming = this.player.swimming;
    if (!swimming && !this.player.body.onGround) return;

    const speed = Math.hypot(
      this.player.velocity.x,
      swimming ? this.player.velocity.y : 0,
      this.player.velocity.z,
    );
    this.stepDistance += speed * dt;
    const stride = swimming ? STEP_DISTANCE * 1.15 : STEP_DISTANCE;
    if (this.stepDistance < stride) return;

    this.stepDistance = 0;
    this.sfx.play(swimming ? 'splash' : 'step');
  }

  private shake(intensity: number): void {
    this.trauma = clamp(this.trauma + intensity, 0, 1);
  }

  private applyShake(dt: number): void {
    if (this.reducedMotion) { this.trauma = 0; return; }
    if (this.trauma <= 0) return;

    this.trauma = Math.max(0, this.trauma - dt * 1.4);
    const amount = this.trauma * this.trauma;

    this.camera.position.x += (Math.random() - 0.5) * amount * 0.9;
    this.camera.position.y += (Math.random() - 0.5) * amount * 0.9;
    this.camera.rotation.z += (Math.random() - 0.5) * amount * 0.12;
  }

  /** Blends light and fog toward pitch black as the camera descends. */
  private updateAtmosphere(dt: number): void {
    const t = clamp((this.camera.position.y - UNDERGROUND_Y) / 26, 0, 1);
    this.blendedColor.copy(this.caveColor).lerp(this.skyColor, t);

    const submerged = this.eyeInWater();
    if (submerged) this.blendedColor.copy(this.waterColor);

    this.fog.color.copy(this.blendedColor);
    (this.scene.background as THREE.Color).copy(this.blendedColor);
    this.fog.near = submerged ? 1.4 : 16 + t * 36;
    this.fog.far = submerged ? 16 : 90 + t * 80;
    this.sunLight.intensity = submerged ? 0.18 : 0.1 + t * 0.95;
    this.skyLight.intensity = submerged ? 0.28 : 0.42 + t * 0.73;

    this.lamp.position.copy(this.camera.position);
    this.lamp.intensity = submerged ? 22 : 34 * (1 - t);
    this.lamp.color.setHex(submerged ? 0x7ec8ff : 0xffd7a3);

    const fighting = this.arena.active || this.ruin.active ? 1 : 0;
    const drown = submerged ? 0.35 : 1;
    this.sfx.setAmbience(
      t * (1 - fighting * 0.35) * drown,
      (1 - t) * (1 - fighting * 0.2) * drown,
      fighting,
    );
    this.hud.setUnderwater(submerged);

    const sprinting = this.state === 'playing' && this.player.sprinting && !this.player.swimming && !this.player.flying;
    const targetFov = sprinting && !this.reducedMotion ? SPRINT_FOV : BASE_FOV;
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov = damp(this.camera.fov, targetFov, 10, dt);
      this.camera.updateProjectionMatrix();
    }

    this.updateWaterEntry();
  }

  private eyeInWater(): boolean {
    this.player.getEyePosition(this.eyeScratch);
    return isWater(
      this.world.getBlock(
        Math.floor(this.eyeScratch.x),
        Math.floor(this.eyeScratch.y),
        Math.floor(this.eyeScratch.z),
      ),
    );
  }

  private updateWaterEntry(): void {
    const inWater = this.player.swimming || this.eyeInWater();
    if (inWater && !this.wasInWater) {
      this.sfx.play('splash');
      this.particles.burst(this.camera.position, {
        count: 14,
        color: 0x7eb6e8,
        speed: 2.2,
        spread: 0.45,
        life: 0.45,
        gravity: 8,
        upwardBias: 0.2,
      });
    }
    this.wasInWater = inWater;
  }

  private tryDiscoverRuin(): void {
    if (this.ruin.active || this.arena.active || this.practice) return;
    if (this.mode === 'oneblock' && !this.oneBlock.ruinUnlocked) return;
    if (!this.arena.tryDiscoverRuin(this.player.position)) return;
    this.hud.showHint('Você encontrou o Sentinela! Botão direito na estátua para escolher a luta', 4.2);
    this.saveSoon = true;
  }

  private tryClaimCache(): void {
    if (!this.world.generator.cacheUnlocked) return;
    if (!this.arena.tryClaim(this.player.position)) return;

    this.player.setSpawn(this.player.position.x, this.player.position.y, this.player.position.z);
    const leftovers =
      this.player.inventory.add(Block.Mushroom, 6) +
      this.player.inventory.add(Block.CrystalOre, 2) +
      this.player.inventory.add(Block.Torch, 8) +
      this.player.inventory.add(Block.GoldOre, 3);

    this.sfx.play('summon');
    this.player.getEyePosition(this.eyeScratch);
    this.particles.burst(this.eyeScratch, {
      count: 18,
      color: 0xffe08a,
      speed: 2.4,
      spread: 0.55,
      life: 0.55,
      gravity: 6,
    });
    this.hud.showHint(
      leftovers > 0
        ? 'Recompensa guardada na mochila. Você vai renascer aqui.'
        : 'Você encontrou materiais! Vai renascer aqui.',
      4.5,
    );
    this.saveSoon = true;
  }

  private updateSave(dt: number): void {
    this.saveTimer += dt;
    if ((this.saveSoon && this.saveTimer >= 1) || this.saveTimer >= AUTOSAVE_INTERVAL) {
      this.saveSoon = false;
      this.saveTimer = 0;
      this.persistSave();
    }
  }

  private persistSave(options: { atSpawn?: boolean } = {}): void {
    if (this.player.dead && !options.atSpawn) return;
    const ok = saveRun(this.snapshotRun(options.atSpawn === true));
    document.getElementById('save-status')!.textContent = ok ? '✓ Mundo salvo neste navegador' : '⚠ Não foi possível salvar. Exporte seu mundo pelo menu.';
  }

  private snapshotRun(atSpawn: boolean): SavedRun {
    const returnTo = this.fightReturn;
    const position = returnTo?.position ?? (atSpawn ? this.player.spawn : this.player.position);
    const spawn = returnTo?.spawn ?? this.player.spawn;
    const palette = this.fightCreative && this.creativePalette ? this.creativePalette : this.inventorySnapshot();
    return {
      version: SAVE_VERSION,
      updatedAt: Date.now(),
      home: this.home,
      guidance: this.guidance,
      tutorialDone: this.tutorialDone,
      creativePalette: this.player.creative ? this.inventorySnapshot() : this.creativePalette,
      creative: this.player.creative || this.fightCreative,
      gentle: this.player.gentle,
      edgeProtection: this.player.edgeProtection,
      reserve: palette.reserve,
      survival: this.fightCreative ? this.inventorySnapshot() : this.survival,
      trophies: [...this.trophies],
      mode: this.mode,
      seed: this.seed,
      elapsed: this.elapsed,
      deaths: this.deaths,
      blocksMined: this.blocksMined,
      hintedConsumable: this.hintedConsumable,
      hintedUpgrade: this.hintedUpgrade,
      hintedTorch: this.hintedTorch,
      hintedBed: this.hintedBed,
      hintedPlates: this.hintedPlates,
      hintedStagger: this.hintedStagger,
      player: {
        flying: returnTo?.flying ?? this.player.flying,
        x: position.x,
        y: position.y,
        z: position.z,
        yaw: returnTo?.yaw ?? this.player.yaw,
        pitch: returnTo?.pitch ?? (atSpawn ? 0 : this.player.pitch),
        spawnX: spawn.x,
        spawnY: spawn.y,
        spawnZ: spawn.z,
        health: atSpawn ? this.player.health.max : this.player.health.current,
        hammer: this.player.hammerTier,
        plates: this.player.plates,
        selected: palette.selected,
        slots: palette.slots.map((slot) => ({
          block: slot.block,
          count: slot.count,
        })),
      },
      arena: {
        defeated: this.arena.defeated,
        discovered: this.arena.discovered,
        cacheClaimed: this.arena.cacheClaimed,
        ruinFound: this.arena.ruinFound,
        ruinDefeated: this.ruin.defeated,
      },
      oneBlock: this.oneBlock.snapshot(),
      edits: this.world.exportEdits(),
    };
  }

  private applySave(save: SavedRun): void {
    const onEdit = this.world.onEdit;
    this.world.onEdit = null;

    this.practice = null;
    this.fightCreative = false;
    this.fightReturn = null;
    this.buildHistory.clear();
    this.buildLesson = 0;
    this.hud.hideHint();
    this.hud.setObjective(null);
    this.hud.compass.update(false, 0, '');
    this.player.creative = save.creative === true && save.mode === 'adventure';
    this.player.gentle = save.gentle !== false;
    this.player.edgeProtection = save.edgeProtection !== false;
    this.player.health.immune = this.player.creative;
    this.player.inventory.unlimited = this.player.creative;
    this.survival = save.survival;
    this.creativePalette = save.creativePalette;
    this.guidance = save.guidance !== false;
    this.tutorialDone = save.tutorialDone === true;
    this.home = save.home ?? { x: save.player.spawnX, y: save.player.spawnY, z: save.player.spawnZ };
    this.trophies.clear();
    for (const id of save.trophies ?? []) this.trophies.add(id);
    this.mode = save.mode;
    this.pendingDeath = false;
    this.saveSoon = false;
    this.saveTimer = 0;
    this.hud.bossBar.hide();
    this.seed = save.seed;
    this.elapsed = save.elapsed;
    this.deaths = save.deaths;
    this.blocksMined = save.blocksMined;
    this.hintedConsumable = save.hintedConsumable;
    this.hintedUpgrade = save.hintedUpgrade;
    this.hintedTorch = save.hintedTorch;
    this.hintedBed = save.hintedBed === true;
    this.hintedPlates = save.hintedPlates === true;
    this.hintedStagger = save.hintedStagger === true;

    this.entities.clear();
    this.arena.beginNewRun();
    this.ruin.beginNewRun();
    this.arena.defeated = save.arena.defeated;
    this.arena.discovered = save.arena.discovered;
    this.arena.cacheClaimed = save.arena.cacheClaimed === true;
    this.arena.ruinFound = save.arena.ruinFound === true;
    this.ruin.defeated = save.arena.ruinDefeated === true;
    this.particles.clear();
    this.torchLights.clear();
    this.chunks.reset();
    this.world.reseed(save.seed, this.mode);
    this.oneBlock.reset(save.seed);
    this.oneBlock.load(save.oneBlock);
    this.syncGeneratorUnlocks();
    this.world.importEdits(save.edits);

    this.player.inventory.load(save.player.slots, save.player.selected);
    for (const slot of save.reserve ?? []) if (slot.block !== null) this.player.inventory.reserve.set(slot.block, slot.count);
    this.player.hammerTier = save.player.hammer;
    this.player.plates = save.player.plates ?? (save.player.plated ? PlateTier.Iron : PlateTier.None);
    this.viewModel.setTier(save.player.hammer);
    this.viewModel.setPlates(this.player.plates);
    this.player.setSpawn(save.player.spawnX, save.player.spawnY, save.player.spawnZ);
    this.player.position.set(save.player.x, save.player.y, save.player.z);
    this.player.velocity.set(0, 0, 0);
    this.player.body.fallPeak = save.player.y;
    this.player.body.onGround = false;
    this.player.health.setCurrent(Math.max(1, save.player.health));
    this.player.yaw = save.player.yaw;
    this.player.pitch = save.player.pitch;
    this.player.flying = false;
    this.player.swing = 0;

    this.chunks.preload(save.player.x, save.player.z, 2);
    if (this.world.generator.shrineUnlocked && !this.arena.defeated) this.arena.rebuildAltar(this.world);
    if (this.world.generator.ruinUnlocked && !this.ruin.defeated) this.ruin.rebuildStatue(this.world);
    if (this.mode === 'oneblock') {
      this.world.ensureChunk(0, 0);
      if (!isSolid(this.world.getBlock(0, ISLAND_Y, 0))) this.world.setBlock(0, ISLAND_Y, 0, Block.Dirt);
    }
    this.player.health.invulnerability = 5;
    if (this.player.creative) this.player.flying = save.player.flying !== false;
    if (this.player.position.y < 0 || this.player.body.intersectsWorld(this.world)) {
      this.ensureSafeSpawn();
      this.player.respawn();
    }
    this.controller.update(0.0001, this.input);
    this.world.onEdit = onEdit;
  }

  private currentRun(): RunRecord {
    return {
      elapsed: this.elapsed,
      deaths: this.deaths,
      hammer: this.player.hammerTier,
      plates: this.player.plates,
      blocksMined: this.blocksMined,
    };
  }

  private victoryText(): string {
    const run = this.currentRun();
    const { best, isNewBest } = recordRun(run, `${this.mode}-${this.player.gentle ? 'gentle' : 'normal'}`);
    const lines = [
      'Você venceu o Guardião! Seu troféu está nos materiais. Decore sua base!',
      '',
      formatRunLine(run),
    ];
    if (isNewBest) lines.push('Novo recorde');
    else lines.push(`Recorde: ${formatRunLine(best)}`);
    return lines.join('\n');
  }

  private inventorySnapshot(): NonNullable<SavedRun['survival']> {
    return { slots: this.player.inventory.slots.map(s => ({ ...s })), selected: this.player.inventory.selected, reserve: this.reserveSnapshot() };
  }

  private reserveSnapshot(): Array<{ block: number; count: number }> {
    return [...this.player.inventory.reserve].map(([block, count]) => ({ block, count }));
  }

  private setCreative(enabled: boolean): void {
    if (this.mode !== 'adventure' || this.player.creative === enabled) return;
    if (enabled) {
      this.survival = this.inventorySnapshot();
      this.player.inventory.clear();
      if (this.creativePalette) {
        this.player.inventory.load(this.creativePalette.slots, this.creativePalette.selected);
        for (const slot of this.creativePalette.reserve) if (slot.block !== null) this.player.inventory.reserve.set(slot.block, slot.count);
      } else for (const block of [Block.Planks, Block.Cobblestone, Block.Glowstone, Block.Log, Block.Leaves, Block.Bed]) this.player.inventory.add(block, 64);
      this.player.health.reset();
    } else {
      this.creativePalette = this.inventorySnapshot();
      const saved = this.survival;
      this.player.inventory.clear();
      if (saved) {
        this.player.inventory.load(saved.slots, saved.selected);
        for (const slot of saved.reserve) if (slot.block !== null) this.player.inventory.reserve.set(slot.block, slot.count);
      }
      this.survival = undefined;
      this.player.flying = false;
      this.player.body.fallPeak = this.player.position.y;
      this.player.health.invulnerability = 5;
    }
    this.player.creative = enabled;
    this.player.inventory.unlimited = enabled;
    this.player.health.immune = enabled;
  }

  private chooseStyle(mode: GameMode): void {
    if (mode === 'oneblock') {
      this.overlay.show({ title: 'Ritmo do OneBlock', text: 'Curto: ruína em 90 blocos e santuário em 140. Clássico: 360 e 560. Seus mundos antigos mantêm o ritmo original.', button: 'Ritmo curto', secondary: 'Ritmo clássico', showControls: false }, () => this.newGame(mode, 'quick'), () => this.newGame(mode, 'classic'));
      this.overlay.setBackAction(() => this.showModeMenu(mode)); return;
    }
    this.overlay.show({ title: 'Como quer brincar?', text: 'Construção livre: blocos sem fim e voo. Sobrevivência: colete materiais. Você pode trocar depois, no mesmo mundo.', button: 'Construção livre ∞', secondary: 'Sobrevivência', showControls: false },
      () => { this.newGame(mode); this.setCreative(true); this.openCatalog(); }, () => this.newGame(mode));
    this.overlay.setBackAction(() => this.showModeMenu(mode));
  }

  private showPaused(): void {
    this.state = 'playing';
    this.pause();
  }

  private stopForPanel(): void {
    document.getElementById('mouse-prompt')!.classList.add('hidden');
    this.state = 'paused';
    this.input.releaseLock();
    this.persistSave();
  }

  private addPlayActions(): void {
    if (this.practice) {
      this.overlay.addAction('Sair do treino', () => this.stopPractice(), { icon: '🏠' });
      this.overlay.addAction('Como brincar', () => this.showHelp(), { icon: '?' });
      return;
    }
    const fighting = this.arena.active || this.ruin.active;
    if (fighting) {
      this.overlay.addAction('Sair da batalha', () => {
        this.arena.reset(this.context); this.ruin.reset(this.context);
        this.finishFight(); this.goHome(); this.startPlaying();
      }, { icon: '🏠', description: 'Voltar com seus itens' });
    } else {
      this.overlay.addAction(this.player.creative ? 'Construir' : 'Mochila e criação', () => this.showBuildingTools(), { icon: '🧱', description: 'Blocos e ideias' });
      this.overlay.addAction('Chefões', () => this.showBossMenu(), { icon: '👑', description: 'Treinar ou enfrentar' });
      this.overlay.addAction('Minha base', () => this.showHomeMenu(), { icon: '🏠', description: 'Seu lugar no mundo' });
    }
    this.overlay.addAction('Como brincar', () => this.showHelp(), { icon: '?', description: 'Uma ajuda rápida' });
    this.overlay.addAction('Mais opções', () => this.showMoreOptions());
  }

  private showBuildingTools(): void {
    this.stopForPanel();
    this.overlay.show({ title: this.player.creative ? 'Vamos construir!' : 'Mochila e criação', text: this.player.creative ? 'O contorno verde mostra onde colocar. Z desfaz; Y refaz.' : 'Escolha seus materiais ou crie itens.', button: 'Voltar ao jogo', secondary: 'Menu', showControls: false }, () => this.startPlaying(), () => this.showPaused());
    this.overlay.addAction(this.player.creative ? 'Escolher blocos' : 'Abrir mochila', () => this.openCatalog(), { icon: '🧱' });
    if (this.player.creative) {
      this.overlay.addAction('Ideias para construir', () => this.showBuildIdeas(), { icon: '🏰' });
      this.overlay.addAction('Desfazer', () => { this.undoBuild(); this.showBuildingTools(); }, { icon: '↶', disabled: !this.buildHistory.canUndo });
      this.overlay.addAction('Refazer', () => { this.undoBuild(true); this.showBuildingTools(); }, { icon: '↷', disabled: !this.buildHistory.canRedo });
    } else this.overlay.addAction('Criar itens', () => this.showRecipes(), { icon: '🔨' });
    if (this.mode === 'oneblock') this.overlay.addAction('Ideias para a ilha', () => this.showIslandGoals(), { icon: '🏝' });
  }

  private showBossMenu(): void {
    this.stopForPanel();
    this.overlay.show({ title: 'Chefões', text: 'Você escolhe quando enfrentar. O treino não tira vida.', button: 'Voltar ao jogo', secondary: 'Menu', showControls: false }, () => this.startPlaying(), () => this.showPaused());
    if (this.world.generator.ruinUnlocked) {
      this.overlay.addAction('Treinar com segurança', () => this.startPractice(), { icon: '🎯', description: 'Pular, desviar e bater' });
      this.overlay.addAction('Visitar o Sentinela', () => this.confirmFight(true), { icon: '🗿', description: 'Chefão das ruínas' });
    } else this.overlay.addAction('Sentinela', () => {}, { icon: '🔒', description: `${this.oneBlock.broken}/${this.oneBlock.ruinAt} blocos`, disabled: true });
    if (this.world.generator.shrineUnlocked) this.overlay.addAction('Visitar o Guardião', () => this.confirmFight(false), { icon: '💎', description: 'Chefão do santuário' });
  }

  private showHomeMenu(): void {
    this.stopForPanel();
    this.overlay.show({ title: 'Minha base', text: 'Volte para casa ou escolha um novo lugar para ela.', button: 'Voltar ao jogo', secondary: 'Menu', showControls: false }, () => this.startPlaying(), () => this.showPaused());
    this.overlay.addAction('Voltar à base', () => { this.goHome(); this.startPlaying(); }, { icon: '🏠' });
    this.overlay.addAction('Marcar minha base', () => this.markHome(), { icon: '📍', description: 'Usar o chão onde estou' });
  }

  private showWorldOptions(mode: GameMode): void {
    this.overlay.show({ title: 'Cuidar dos mundos', text: 'Peça ajuda a um adulto para trocar ou recuperar seu mundo.', button: 'Voltar', showControls: false, onEscape: () => this.showModeMenu(mode) }, () => this.showModeMenu(mode));
    this.overlay.addAction('Importar mundo', () => this.importWorld());
    if (loadPreviousSave(mode)) this.overlay.addAction('Recuperar cópia anterior', () => this.confirmRecovery(mode));
  }

  private showMoreOptions(): void {
    this.stopForPanel();
    const fighting = this.arena.active || this.ruin.active || Boolean(this.practice);
    this.overlay.show({ title: 'Mais opções', text: 'Ajuste o jogo e cuide da sua partida.', button: 'Voltar à pausa', secondary: 'Continuar jogo', showSettings: true, showControls: false },
      () => this.showPaused(), () => this.startPlaying());
    if (!fighting) {
      if (this.mode === 'adventure') this.overlay.addAction(this.player.creative ? 'Trocar para Sobrevivência' : 'Construção livre ∞', () => {
        if (this.player.creative) this.goHome();
        this.setCreative(!this.player.creative); this.showMoreOptions();
      });
      this.overlay.addAction(`Dificuldade: ${this.player.gentle ? 'Tranquila' : 'Normal'}`, () => { this.player.gentle = !this.player.gentle; this.showMoreOptions(); });
      this.overlay.addAction(`Proteção de borda: ${this.player.edgeProtection ? 'ligada' : 'desligada'}`, () => { this.player.edgeProtection = !this.player.edgeProtection; this.showMoreOptions(); });
      this.overlay.addAction(`Guia: ${this.guidance ? 'ligado' : 'desligado'}`, () => { this.guidance = !this.guidance; this.showMoreOptions(); });
    }
    if (!fighting && loadPreviousSave(this.mode)) this.overlay.addAction('Recuperar cópia anterior', () => this.confirmRecovery(this.mode));
    this.overlay.addAction('Exportar mundo', () => this.exportWorld());
    if (!fighting) this.overlay.addAction('Importar mundo', () => this.importWorld());
  }

  private openCatalog(category = '🌳 Natureza'): void {
    this.stopForPanel();
    const creative = this.player.creative;
    this.overlay.show({ title: creative ? 'Escolha um bloco' : 'Sua mochila', text: creative ? 'Escolha uma figura. Depois, use o botão direito para colocar e o esquerdo para remover.' : 'Os materiais que não couberam na barra ficam aqui. Escolha um para usar no espaço selecionado.', button: 'Voltar ao jogo', secondary: 'Menu', showControls: false }, () => this.startPlaying(), () => this.showPaused());
    if (creative) {
      for (const group of Object.keys(CATALOG_GROUPS)) this.overlay.addAction(group, () => this.openCatalog(group));
      const blocks = [...(CATALOG_GROUPS[category] ?? [])];
      if (category === '✨ Decoração') {
        blocks.push(...this.trophies);
        if (this.trophies.has(Block.SentinelTrophy)) blocks.push(Block.SentinelBanner);
        if (this.trophies.has(Block.WardenTrophy)) blocks.push(Block.WardenLantern);
      }
      this.overlay.addContent(blockGrid(this.atlas, blocks.map(block => ({ block })), block => {
        Object.assign(this.player.inventory.selectedSlot, { block, count: 64 });
        if (!this.tutorialDone) this.buildLesson = 1;
        this.startPlaying();
      }, this.player.inventory.selectedSlot.block));
      this.overlay.addAction('Ideias para construir', () => this.showBuildIdeas());
    } else {
      this.overlay.addContent(blockGrid(this.atlas, this.reserveSnapshot(), block => {
        this.player.inventory.equipReserve(block); this.startPlaying();
      }));
      if (!this.player.inventory.reserve.size) {
        const empty = document.createElement('p'); empty.textContent = 'A mochila está vazia. Seus materiais estão na barra do jogo.'; this.overlay.addContent(empty);
      }
    }
  }

  private showRecipes(): void {
    this.stopForPanel();
    this.overlay.show({ title: 'Criar itens', text: 'Escolha o que quer fazer. Os materiais da barra e da mochila contam juntos.', button: 'Voltar ao jogo', secondary: 'Menu', showControls: false }, () => this.startPlaying(), () => this.showPaused());
    this.overlay.addContent(recipePanel(this.atlas, this.player, id => {
      if (craftRecipe(this.player, id)) {
        this.viewModel.setTier(this.player.hammerTier);
        this.viewModel.setPlates(this.player.plates);
        this.sfx.play('place'); this.persistSave();
      }
      this.showRecipes();
    }));
  }

  private showIslandGoals(): void {
    this.stopForPanel();
    const goals = this.oneBlock.goalProgress(this.world);
    this.overlay.show({ title: 'Ideias para a ilha', text: 'Você pode seguir estas ideias ou construir do seu jeito. Cada prêmio é dado uma vez.', button: 'Voltar ao jogo', secondary: 'Menu', showControls: false }, () => this.startPlaying(), () => this.showPaused());
    for (const goal of goals) {
      const text = document.createElement('p');
      text.textContent = `${this.oneBlock.goals.has(goal.id) ? 'Concluído' : Math.min(goal.current, goal.target) + '/' + goal.target} · ${goal.label} · prêmio: ${goal.count} ${getBlockDef(goal.reward).name}`;
      this.overlay.addContent(text);
    }
  }

  private showBuildIdeas(): void {
    this.stopForPanel();
    this.overlay.show({ title: 'O que vamos construir?', text: 'Veja uma ideia por etapas e construa do seu jeito.', button: 'Voltar ao jogo', secondary: 'Construir', showControls: false }, () => this.startPlaying(), () => this.showBuildingTools());
    for (const idea of BUILD_IDEAS) this.overlay.addAction(idea.name, () => this.showBuildIdea(idea.id, 0), { icon: idea.icon, description: `${idea.steps.length} etapas com figuras` });
  }

  private showBuildIdea(id: string, step: number): void {
    const idea = BUILD_IDEAS.find(item => item.id === id)!;
    this.overlay.show({ title: idea.name, text: `${step + 1}/${idea.steps.length} · ${idea.steps[step]}`, button: step < idea.steps.length - 1 ? 'Próxima etapa' : 'Escolher materiais', secondary: 'Outras ideias', showControls: false, onEscape: () => this.showBuildIdeas() },
      () => step < idea.steps.length - 1 ? this.showBuildIdea(id, step + 1) : this.openCatalog(), () => this.showBuildIdeas());
    this.overlay.addContent(buildIdeaPanel(idea, step));
    if (step > 0) this.overlay.addAction('Etapa anterior', () => this.showBuildIdea(id, step - 1));
    this.overlay.addAction('Usar estes materiais', () => {
      if (!this.player.creative) return;
      idea.materials.forEach((block, i) => Object.assign(this.player.inventory.slots[i], { block, count: 64 }));
      this.player.inventory.select(0); this.startPlaying();
    }, { icon: '🧱' });
  }

  private showHelp(): void {
    this.stopForPanel();
    const firstSteps = this.mode === 'oneblock'
      ? '1. Olhe para baixo: o bloco infinito está sob seus pés.\n2. Segure o botão esquerdo para quebrá-lo.\n3. Escolha terra na barra e use o direito para ampliar a ilha.'
      : this.player.creative
        ? '1. Aperte B e escolha um bloco.\n2. Mire no chão e use o direito para colocar.\n3. Clique com o esquerdo para remover.'
        : '1. Use o esquerdo para pegar blocos.\n2. Use o direito para colocar ou usar.\n3. Aperte B para abrir a mochila.';
    const bossTip = this.mode === 'oneblock' && !this.oneBlock.ruinUnlocked
      ? `O Sentinela aparece depois de ${this.oneBlock.ruinAt} blocos quebrados.`
      : 'Para o chefão: Esc > Chefões > Visitar o Sentinela. Pule as ondas e bata quando aparecer BATA AGORA!';
    this.overlay.show({ title: 'Como brincar', text: `${firstSteps}\n\nPara andar: W A S D e mouse.\n${bossTip}`, button: 'Voltar ao jogo', secondary: 'Menu', showControls: false }, () => this.startPlaying(), () => this.showPaused());
    if (this.player.creative) {
      this.overlay.addAction('Praticar construção', () => { this.tutorialDone = false; this.buildLesson = 0; this.openCatalog(); });
      this.overlay.addAction('Pular tutorial', () => { this.tutorialDone = true; this.buildLesson = 0; this.startPlaying(); });
    }
    this.overlay.addAction('Mais controles e receitas', () => this.showAdvancedHelp());
  }

  private showAdvancedHelp(): void {
    this.stopForPanel();
    this.overlay.show({ title: 'Controles e receitas', text: 'F liga o voo na construção livre; Espaço sobe e Ctrl desce.\nCogumelo ou cristal: botão direito para comer.\n1 carvão faz 4 tochas.\nC abre a tela de criar: 4 tábuas fazem uma cama.\n3 ferros ou ouros melhoram o martelo; mais 4 fazem armadura.\nEsc abre o menu e salva. Exporte o mundo para guardar uma cópia.', button: 'Voltar ao jogo', secondary: 'Ajuda resumida', showControls: true }, () => this.startPlaying(), () => this.showHelp());
  }

  private startPractice(): void {
    this.stopForPanel();
    this.fightReturn = { position: this.player.position.clone(), spawn: this.player.spawn.clone(), yaw: this.player.yaw, pitch: this.player.pitch, flying: this.player.flying };
    this.fightCreative = this.player.creative;
    this.setCreative(false);
    this.buildHistory.clear(); this.buildLesson=0;
    const x=RUIN_COURTYARD.centerX+7.5,z=RUIN_COURTYARD.centerZ+7.5;
    this.chunks.preload(x,z,2);
    this.player.setSpawn(x,this.world.generator.surfaceHeight(x,z)+1,z);
    this.ensureSafeSpawn();this.player.respawn();this.player.yaw=Math.PI/2;
    this.practice = new BossPractice(this.player.position.x-3,this.player.position.y,this.player.position.z,
      text=>this.hud.showHint(text,4),()=>this.stopPractice(true));
    this.entities.add(this.practice);
    this.startPlaying();
  }

  private stopPractice(completed = false): void {
    this.practice = null;
    for (const entity of this.entities.entities) if (entity instanceof BossPractice || entity.team==='boss' && entity.clearedOnDeath) this.entities.remove(entity);
    this.finishFight(); this.goHome(); this.stopForPanel();
    this.overlay.show({ title: completed ? 'Treino concluído!' : 'Treino encerrado', text: completed ? 'Você pulou, desviou e acertou! Pode visitar o chefão quando quiser.' : 'Sua construção está esperando. Pode treinar outra vez quando quiser.', button: 'Voltar ao jogo', secondary: 'Menu', showControls: false },()=>this.startPlaying(),()=>this.showPaused());
  }

  private confirmFight(sentinel: boolean): void {
    this.stopForPanel();
    this.overlay.show({ title: sentinel ? 'Enfrentar o Sentinela?' : 'Enfrentar o Guardião?', text: `Dificuldade ${this.player.gentle ? 'Tranquila' : 'Normal'}. Pule as ondas e saia dos círculos. Quando ele ficar vulnerável, bata!\nDurante a luta, voo e invulnerabilidade ficam desligados. Seus itens e construções são preservados.`, button: 'Enfrentar chefão', secondary: 'Agora não', showControls: false }, () => {
      this.buildLesson = 0;
      this.hud.hideHint();
      this.fightReturn = { position: this.player.position.clone(), spawn: this.player.spawn.clone(), yaw: this.player.yaw, pitch: this.player.pitch, flying: this.player.flying };
      this.buildHistory.clear();
      this.fightCreative = this.player.creative;
      this.setCreative(false);
      if (sentinel) {
        this.player.setSpawn(RUIN_STATUE.x + 7.5, this.world.generator.surfaceHeight(RUIN_STATUE.x, RUIN_STATUE.z) + 1, RUIN_STATUE.z + 0.5);
      } else this.player.setSpawn(ENTRANCE_SPAWN.x, ENTRANCE_SPAWN.y, ENTRANCE_SPAWN.z);
      this.ensureSafeSpawn(); this.player.respawn();
      this.player.yaw = sentinel ? Math.PI / 2 : Math.PI;
      if (sentinel) this.ruin.summon(this.world); else this.arena.summon();
      this.hud.setObjective('Pule e desvie · bata quando aparecer BATA AGORA!');
      this.hud.compass.update(false, 0, '');
      this.sfx.play('summon'); this.startPlaying();
    }, () => this.startPlaying());
  }

  private finishFight(): void {
    this.hud.bossBar.hide();
    this.hud.hideHint();
    this.hud.setObjective(null);
    for (const entity of this.entities.entities) {
      if (entity !== this.arena.boss && entity !== this.ruin.boss && entity.team === 'boss' && entity.clearedOnDeath) this.entities.remove(entity);
    }
    if (this.fightCreative) { this.fightCreative = false; this.setCreative(true); }
    this.player.health.immune = this.player.creative;
    this.player.health.invulnerability = 5;
    if (this.fightReturn) {
      this.player.flying = this.player.creative && this.fightReturn.flying === true;
      this.player.spawn.copy(this.fightReturn.spawn);
      this.fightReturn = null;
    }
  }

  private rewardBoss(block: Block): void {
    if (this.trophies.has(block)) return;
    this.trophies.add(block);
    this.player.inventory.add(block, 1);
    this.player.inventory.add(block === Block.SentinelTrophy ? Block.SentinelBanner : Block.WardenLantern, 8);
    if (!this.player.creative) { this.player.inventory.add(Block.Glowstone, 16); this.player.inventory.add(Block.Planks, 32); }
    this.saveSoon = true;
  }

  private showBossVictory(title: string): void {
    this.state = 'victory'; this.input.releaseLock(); this.persistSave();
    this.overlay.show({ title, text: 'Você conseguiu! Seu troféu está nos materiais. Decore sua base ou continue a aventura. A estátua permite lutar de novo.', button: 'Voltar à base', secondary: 'Continuar explorando', showControls: false }, () => {
      this.goHome();
      this.startPlaying();
    }, () => this.startPlaying());
  }

  private markHome(): void {
    const p = this.player.position;
    const floor = this.world.getBlock(Math.floor(p.x), Math.floor(p.y - 0.1), Math.floor(p.z));
    if (!this.player.body.onGround || !isSolid(floor) || getBlockDef(floor).contactDamage > 0) {
      this.overlay.show({ title: 'Pouse para marcar sua base', text: 'Escolha um chão firme e desligue o voo com F. Depois marque sua base aqui.', button: 'Voltar ao jogo', showControls: false }, () => this.startPlaying());
      return;
    }
    this.home = { x: p.x, y: p.y, z: p.z };
    this.player.spawn.copy(p);
    this.persistSave();
    this.startPlaying(); this.hud.showHint('Sua base está marcada! Esc: Voltar à base.', 5);
  }

  private goHome(): void {
    if (this.arena.active || this.ruin.active || this.practice) return;
    const home = this.home ?? this.player.spawn;
    const spawn = this.player.spawn.clone();
    const flying = this.player.flying;
    this.player.setSpawn(home.x, home.y, home.z);
    this.ensureSafeSpawn();
    this.player.respawn();
    this.player.spawn.copy(spawn);
    this.player.flying = this.player.creative && flying;
    this.player.pitch = 0;
    this.controller.update(0.0001, this.input);
  }

  private undoBuild(redo = false): void {
    if (!this.player.creative || this.arena.active || this.ruin.active) return;
    const ok = this.buildHistory[redo ? 'redo' : 'undo'](this.world, (x,y,z) => this.interaction.intersectsPlayer(x,y,z));
    if (ok && this.buildLesson === 2) this.buildLesson = 1;
    this.hud.showHint(ok ? (redo ? 'Bloco refeito! Y refaz mais.' : 'Bloco desfeito! Z desfaz mais; Y refaz.') : 'Nenhuma ação disponível aqui. Se há um bloco em você, afaste-se e tente de novo.', 3);
  }

  private ensureSafeSpawn(): void {
    const spawn = this.player.spawn;
    this.chunks.preload(spawn.x, spawn.z, 2);
    const safe = (x: number, y: number, z: number): boolean => {
      const floor = this.world.getBlock(x, y - 1, z);
      return isSolid(floor) && getBlockDef(floor).contactDamage === 0 &&
        [0, 1].every(dy => { const id = this.world.getBlock(x, y + dy, z); return !isSolid(id) && getBlockDef(id).contactDamage === 0; });
    };
    const sx = Math.floor(spawn.x), sy = Math.floor(spawn.y), sz = Math.floor(spawn.z);
    for (let radius = 0; radius <= 8; radius++) for (let dy = 0; dy <= 12; dy++) {
      for (let dx = -radius; dx <= radius; dx++) for (let dz = -radius; dz <= radius; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== radius) continue;
        for (const y of dy === 0 ? [sy] : [sy + dy, sy - dy]) {
          if (y < (this.mode === 'oneblock' ? VOID_KILL_Y + 1 : 1) || y > 125) continue;
          if (safe(sx + dx, y, sz + dz)) { this.player.setSpawn(sx + dx + 0.5, y, sz + dz + 0.5); return; }
        }
      }
    }
    // Emergency platform above the spawn column; never overwrite an existing block.
    for (let y = 125; y > 1; y--) if ([0, 1, 2].every(dy => this.world.getBlock(sx, y + dy, sz) === Block.Air)) {
      this.world.setBlock(sx, y, sz, Block.Cobblestone);
      this.player.setSpawn(sx + 0.5, y + 1, sz + 0.5); return;
    }
  }

  private confirmRecovery(mode: GameMode): void {
    const previous = loadPreviousSave(mode);
    if (!previous) return;
    this.overlay.show({ title: 'Recuperar cópia anterior?', text: `Voltar à cópia de ${modeName(mode)}${previous.updatedAt ? ' salva em ' + new Date(previous.updatedAt).toLocaleString('pt-BR') : ''}? O outro modo continua igual.`, button: 'Recuperar mundo', secondary: 'Cancelar', showControls: false }, () => {
      if (!saveRun(previous)) { this.hud.showHint('Não foi possível recuperar. Exporte o mundo e libere espaço.', 6); return; }
      this.applySave(previous); this.startPlaying();
    }, () => this.showModeMenu(mode));
  }

  private exportWorld(): void {
    const run = this.snapshotRun(this.player.dead);
    const url = URL.createObjectURL(new Blob([JSON.stringify(run)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = `mineboss-${this.mode}-${this.seed}.json`; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  private importWorld(): void {
    const input = document.createElement('input'); input.type = 'file'; input.accept = '.json,application/json';
    input.onchange = async () => {
      const file = input.files?.[0]; if (!file) return;
      let run: SavedRun | null = null;
      try { if (file.size <= 20_000_000) run = parseSave(await file.text()); } catch { /* report below */ }
      if (!run) {
        this.overlay.show({ title: 'Arquivo inválido', text: 'Seu mundo atual não foi alterado. Escolha uma cópia exportada pelo MineBoss.', button: 'Voltar', showControls: false }, () => this.showMenu()); return;
      }
      const imported = run;
      this.overlay.show({ title: 'Importar mundo?', text: `Este arquivo substitui somente a partida de ${modeName(imported.mode)}. Exporte a partida atual antes se quiser guardá-la.`, button: 'Importar', secondary: 'Cancelar', showControls: false }, () => {
        if (!saveRun(imported)) { document.getElementById('save-status')!.textContent = '⚠ Importação não salva: armazenamento indisponível.'; return; }
        this.applySave(imported); this.startPlaying();
      }, () => this.showMenu());
    };
    input.click();
  }

  private handleOneBlockMined(): void {
    const result = this.oneBlock.break(this.world, this.player, this.entities);
    if (result.unlocked === 'ruin') {
      this.revealStructure(chunkTouchesRuin, RUIN_COURTYARD.centerX, RUIN_COURTYARD.centerZ, RUIN_COURTYARD.radius + 6);
      this.hud.showHint('Uma ilha apareceu! Siga a bússola até o Sentinela', 4.5);
    } else if (result.unlocked === 'shrine') {
      this.revealStructure(
        (cx, cz) => chunkTouchesArena(cx, cz) || chunkTouchesEntrance(cx, cz),
        ENTRANCE.x,
        ENTRANCE.z,
        36,
      );
      this.hud.showHint('O santuário apareceu ao norte! Há um chefão lá embaixo', 4.8);
    }
    if (result.spawnedMob) this.sfx.play('roar');
    this.saveSoon = true;
  }

  private syncGeneratorUnlocks(): void {
    this.world.generator.applyUnlocks({
      ruin: this.mode === 'adventure' || this.oneBlock.ruinUnlocked,
      shrine: this.mode === 'adventure' || this.oneBlock.shrineUnlocked,
      cache: this.mode === 'adventure' || this.arena.defeated,
    });
  }

  private unlockCacheIsland(): void {
    if (this.world.generator.cacheUnlocked) return;
    this.world.generator.cacheUnlocked = true;
    this.revealStructure(chunkTouchesCache, CACHE.x, CACHE.z, 8);
  }

  private revealStructure(
    test: (cx: number, cz: number) => boolean,
    x: number,
    z: number,
    radius: number,
  ): void {
    this.syncGeneratorUnlocks();
    this.chunks.regenerateWhere(test);
    this.chunks.preload(x, z, Math.max(2, Math.ceil(radius / 16)));
    this.chunks.preload(this.player.position.x, this.player.position.z, 2);
  }

  private readonly resize = (): void => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  };
}
