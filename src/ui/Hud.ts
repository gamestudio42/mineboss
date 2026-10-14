import {
  HAMMER,
  HammerTier,
  PLATES,
  PlateTier,
} from '../player/Hammer.ts';
import type { Inventory } from '../player/Inventory.ts';
import type { BlockAtlas } from '../render/atlas.ts';
import {
  getBlockDef,
  isBed,
  isBedMaterial,
  isChest,
  isConsumable,
  isTorchFuel,
} from '../world/blocks.ts';
import { BossHealthBar } from './BossHealthBar.ts';
import { Compass } from './Compass.ts';
import { DebugOverlay } from './DebugOverlay.ts';
import { Hotbar } from './Hotbar.ts';

const HEARTS = 10;

export type CrosshairMode = 'idle' | 'block' | 'attack' | 'altar' | 'heal' | 'craft' | 'smith' | 'rest';
const CROSSHAIR_MODES: CrosshairMode[] = [
  'idle',
  'block',
  'attack',
  'altar',
  'heal',
  'craft',
  'smith',
  'rest',
];

function requireElement(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing UI element #${id}`);
  return element;
}

function slotHint(block: number | null, count: number): string {
  if (block === null || count <= 0) return '';
  const name = getBlockDef(block).name;
  if (isConsumable(block)) return name + ' · direito: comer';
  if (isBed(block)) return name + ' · coloque e clique para descansar';
  if (isChest(block)) return name + ' · coloque e clique com o direito para abrir';
  if (isTorchFuel(block) || block === 11 || block === 12) return name + ' · C: criar itens';
  if (isBedMaterial(block)) return name + ' · direito: colocar · C: criar cama';
  return name + ' · direito: colocar';
}

/** All in-game HUD widgets: hearts, hotbar, hint line, boss bar and debug. */
export class Hud {
  reducedEffects = false;
  readonly bossBar: BossHealthBar;
  readonly compass: Compass;
  readonly debug: DebugOverlay;

  private readonly root = requireElement('hud');
  private readonly healthRoot = requireElement('health');
  private readonly hintRoot = requireElement('hint');
  private readonly objectiveRoot = requireElement('objective');
  private readonly hammerRoot = requireElement('hammer-label');
  private readonly slotHintRoot = requireElement('slot-hint');
  private readonly seedRoot = requireElement('seed-label');
  private readonly phaseRoot = requireElement('phase-label');
  private readonly waterVeil = requireElement('water-veil');
  private readonly crosshair = requireElement('crosshair');
  private readonly flash = requireElement('damage-flash');
  private readonly hotbar: Hotbar;
  private readonly hearts: HTMLElement[] = [];

  private lastHealth = -1;
  private lastHammer = -1;
  private lastPlates = PlateTier.None;
  private lastHint = '';
  private flashTimer = 0;
  private hintTimer = 0;
  private crosshairMode: CrosshairMode = 'idle';

  constructor(atlas: BlockAtlas) {
    this.hotbar = new Hotbar(requireElement('hotbar'), atlas);
    this.bossBar = new BossHealthBar(requireElement('boss-bar'));
    this.compass = new Compass();
    this.debug = new DebugOverlay(requireElement('debug'));

    for (let i = 0; i < HEARTS; i++) {
      const heart = document.createElement('div');
      heart.className = 'heart';
      this.healthRoot.append(heart);
      this.hearts.push(heart);
    }
  }

  setVisible(visible: boolean): void {
    this.root.classList.toggle('hidden', !visible);
  }

  update(
    dt: number,
    inventory: Inventory,
    health: number,
    hammerTier: HammerTier,
    plates: PlateTier,
  ): void {
    this.hotbar.update(inventory);
    this.updateHealth(health);
    this.updateLoadout(inventory, hammerTier, plates);

    if (this.flashTimer > 0) {
      this.flashTimer = Math.max(0, this.flashTimer - dt);
      if (this.flashTimer === 0) this.flash.style.opacity = '0';
    }

    if (this.hintTimer > 0) {
      this.hintTimer = Math.max(0, this.hintTimer - dt);
      if (this.hintTimer === 0) this.hintRoot.classList.remove('show');
    }
  }

  flashDamage(intensity = 1): void {
    this.flash.classList.remove('heal', 'plate');
    this.flash.style.opacity = String(this.reducedEffects ? 0.12 : Math.min(0.9, 0.35 + intensity * 0.2));
    this.flashTimer = 0.35;
  }

  flashHeal(): void {
    this.flash.classList.remove('plate');
    this.flash.classList.add('heal');
    this.flash.style.opacity = this.reducedEffects ? '0.1' : '0.55';
    this.flashTimer = 0.35;
  }

  flashPlates(): void {
    this.flash.classList.remove('heal');
    this.flash.classList.add('plate');
    this.flash.style.opacity = this.reducedEffects ? '0.1' : '0.5';
    this.flashTimer = 0.28;
  }

  showHint(text: string, seconds = 4): void {
    if (this.hintRoot.textContent !== text) this.hintRoot.textContent = text;
    this.hintRoot.classList.add('show');
    this.hintTimer = seconds;
  }

  hideHint(): void {
    this.hintTimer = 0;
    this.hintRoot.classList.remove('show');
  }

  setCrosshair(mode: CrosshairMode): void {
    if (mode === this.crosshairMode) return;
    this.crosshairMode = mode;
    for (const name of CROSSHAIR_MODES) this.crosshair.classList.toggle(name, name === mode);
  }

  setUnderwater(underwater: boolean): void {
    this.waterVeil.classList.toggle('show', underwater);
  }

  setSeed(seed: number): void {
    const label = `Mundo ${seed}`;
    if (this.seedRoot.textContent !== label) this.seedRoot.textContent = label;
  }

  setPhase(label: string): void {
    if (this.phaseRoot.textContent !== label) this.phaseRoot.textContent = label;
  }

  setObjective(text: string | null): void {
    if (!text) {
      this.objectiveRoot.classList.remove('show');
      return;
    }
    if (this.objectiveRoot.textContent !== text) this.objectiveRoot.textContent = text;
    this.objectiveRoot.classList.add('show');
  }

  private updateLoadout(inventory: Inventory, hammerTier: HammerTier, plates: PlateTier): void {
    if (hammerTier !== this.lastHammer || plates !== this.lastPlates) {
      this.lastHammer = hammerTier;
      this.lastPlates = plates;
      this.hammerRoot.textContent =
        plates === PlateTier.None
          ? HAMMER[hammerTier].name
          : `${HAMMER[hammerTier].name} · ${PLATES[plates].name.toLowerCase()}`;
    }

    const slot = inventory.selectedSlot;
    const hint = inventory.unlimited && slot.block !== null ? `${getBlockDef(slot.block).name} ∞` : slotHint(slot.block, slot.count);
    if (hint === this.lastHint) return;
    this.lastHint = hint;
    this.slotHintRoot.textContent = hint;
  }

  private updateHealth(health: number): void {
    const rounded = Math.max(0, Math.ceil(health * 2) / 2);
    if (rounded === this.lastHealth) return;
    this.lastHealth = rounded;

    for (let i = 0; i < HEARTS; i++) {
      const value = rounded - i * 2;
      const heart = this.hearts[i];
      heart.classList.toggle('empty', value <= 0);
      heart.classList.toggle('half', value > 0 && value < 2);
    }
  }
}
