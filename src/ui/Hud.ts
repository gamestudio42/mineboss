import { HAMMER, HammerTier, PLATE_COST, UPGRADE_COST, upgradeFrom } from '../player/Hammer.ts';
import type { Inventory } from '../player/Inventory.ts';
import type { BlockAtlas } from '../render/atlas.ts';
import {
  TORCHES_PER_COAL,
  getBlockDef,
  isConsumable,
  isTorchFuel,
} from '../world/blocks.ts';
import { BossHealthBar } from './BossHealthBar.ts';
import { Compass } from './Compass.ts';
import { DebugOverlay } from './DebugOverlay.ts';
import { Hotbar } from './Hotbar.ts';

const HEARTS = 10;

export type CrosshairMode = 'idle' | 'block' | 'attack' | 'altar' | 'heal' | 'craft' | 'smith';
const CROSSHAIR_MODES: CrosshairMode[] = [
  'idle',
  'block',
  'attack',
  'altar',
  'heal',
  'craft',
  'smith',
];

function requireElement(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing UI element #${id}`);
  return element;
}

function slotHint(block: number | null, count: number, tier: HammerTier, plated: boolean): string {
  if (block === null || count <= 0) return '';

  const name = getBlockDef(block).name;
  if (isConsumable(block)) return `${name} — right click to eat`;
  if (isTorchFuel(block)) return `${name} — right click: ${TORCHES_PER_COAL} torches`;

  const next = upgradeFrom(block);
  if (next !== null) {
    if (next === HammerTier.Iron && tier >= HammerTier.Iron) {
      return plated
        ? `${name} — already plated`
        : `${name} — ${PLATE_COST} to smith iron plates`;
    }
    if (tier >= next) return `${name} — already ${HAMMER[tier].name.toLowerCase()}`;
    return `${name} — ${UPGRADE_COST} to smith ${HAMMER[next].name}`;
  }

  return `${name} — right click to place · Q to toss`;
}

/** All in-game HUD widgets: hearts, hotbar, hint line, boss bar and debug. */
export class Hud {
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
  private readonly waterVeil = requireElement('water-veil');
  private readonly crosshair = requireElement('crosshair');
  private readonly flash = requireElement('damage-flash');
  private readonly hotbar: Hotbar;
  private readonly hearts: HTMLElement[] = [];

  private lastHealth = -1;
  private lastHammer = -1;
  private lastPlated = false;
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
    plated: boolean,
  ): void {
    this.hotbar.update(inventory);
    this.updateHealth(health);
    this.updateLoadout(inventory, hammerTier, plated);

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
    this.flash.classList.remove('heal');
    this.flash.style.opacity = String(Math.min(0.9, 0.35 + intensity * 0.2));
    this.flashTimer = 0.35;
  }

  flashHeal(): void {
    this.flash.classList.add('heal');
    this.flash.style.opacity = '0.55';
    this.flashTimer = 0.35;
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
    const label = `Seed ${seed}`;
    if (this.seedRoot.textContent !== label) this.seedRoot.textContent = label;
  }

  setObjective(text: string | null): void {
    if (!text) {
      this.objectiveRoot.classList.remove('show');
      return;
    }
    if (this.objectiveRoot.textContent !== text) this.objectiveRoot.textContent = text;
    this.objectiveRoot.classList.add('show');
  }

  private updateLoadout(inventory: Inventory, hammerTier: HammerTier, plated: boolean): void {
    if (hammerTier !== this.lastHammer || plated !== this.lastPlated) {
      this.lastHammer = hammerTier;
      this.lastPlated = plated;
      this.hammerRoot.textContent = plated
        ? `${HAMMER[hammerTier].name} · plates`
        : HAMMER[hammerTier].name;
    }

    const slot = inventory.selectedSlot;
    const hint = slotHint(slot.block, slot.count, hammerTier, plated);
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
