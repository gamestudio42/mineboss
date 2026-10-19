import { DEFAULT_SETTINGS, saveSettings, type StoredSettings } from '../core/Settings.ts';

export interface OverlayContent {
  title: string;
  text: string;
  button: string;
  secondary?: string;
  showControls?: boolean;
  showSettings?: boolean;
  onEscape?: () => void;
}

/** Full screen panel used for the title screen, pause, death and victory. */
export class Overlay {
  private readonly root: HTMLElement;
  private readonly title: HTMLElement;
  private readonly text: HTMLElement;
  private readonly button: HTMLButtonElement;
  private readonly secondary: HTMLButtonElement;
  private readonly controls: HTMLElement;
  private readonly settings: HTMLElement;
  private readonly volume: HTMLInputElement;
  private readonly mute: HTMLInputElement;
  private readonly sensitivity: HTMLInputElement;
  private readonly volumeValue: HTMLElement;
  private readonly sensitivityValue: HTMLElement;
  private readonly reducedMotion: HTMLInputElement;
  private readonly reducedEffects: HTMLInputElement;
  private readonly quality: HTMLSelectElement;
  private readonly narrator: HTMLInputElement;
  private readonly music: HTMLInputElement;

  private readonly extras = document.createElement('div');
  private readonly back = document.createElement('button');

  private action: (() => void) | null = null;
  private secondaryAction: (() => void) | null = null;
  private current: StoredSettings = { ...DEFAULT_SETTINGS };
  private escapeAction: (() => void) | null = null;

  onSettingsChange: ((settings: StoredSettings) => void) | null = null;

  constructor() {
    this.root = document.getElementById('overlay') as HTMLElement;
    this.title = this.root.querySelector('.title') as HTMLElement;
    this.text = document.getElementById('overlay-text') as HTMLElement;
    this.button = document.getElementById('overlay-button') as HTMLButtonElement;
    this.secondary = document.getElementById('overlay-secondary') as HTMLButtonElement;
    this.controls = document.getElementById('controls') as HTMLElement;
    this.settings = document.getElementById('settings') as HTMLElement;
    this.volume = document.getElementById('setting-volume') as HTMLInputElement;
    this.mute = document.getElementById('setting-mute') as HTMLInputElement;
    this.sensitivity = document.getElementById('setting-sensitivity') as HTMLInputElement;
    this.volumeValue = document.getElementById('setting-volume-value') as HTMLElement;
    this.sensitivityValue = document.getElementById('setting-sensitivity-value') as HTMLElement;
    this.reducedMotion = document.getElementById('setting-motion') as HTMLInputElement;
    this.reducedEffects = document.getElementById('setting-effects') as HTMLInputElement;
    this.quality = document.getElementById('setting-quality') as HTMLSelectElement;
    this.narrator = document.getElementById('setting-narrator') as HTMLInputElement;
    this.music = document.getElementById('setting-music') as HTMLInputElement;
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    this.title.id = 'overlay-title';
    this.root.setAttribute('aria-labelledby', this.title.id);

    this.extras.className = 'play-extras';
    this.controls.before(this.extras);
    this.back.textContent = 'Voltar aos modos';
    this.back.classList.add('hidden');
    this.secondary.parentElement?.append(this.back);
    this.button.addEventListener('click', () => this.action?.());
    this.secondary.addEventListener('click', () => this.secondaryAction?.());
    this.volume.addEventListener('input', () => this.commit());
    this.sensitivity.addEventListener('input', () => this.commit());
    this.mute.addEventListener('change', () => this.commit());
    this.reducedMotion.addEventListener('change', () => this.commit());
    this.reducedEffects.addEventListener('change', () => this.commit());
    this.quality.addEventListener('change', () => this.commit());
    this.narrator.addEventListener('change', () => this.commit());
    this.music.addEventListener('change', () => this.commit());
    window.addEventListener('keydown', event => {
      if (!this.visible) return;
      if (event.code === 'Escape') {
        event.preventDefault(); event.stopImmediatePropagation(); this.escapeAction?.();
      } else if (event.code === 'Tab') {
        const controls = [...this.root.querySelectorAll<HTMLElement>('button, input, select')]
          .filter(element => !element.closest('.hidden') && !element.hasAttribute('disabled'));
        const first = controls[0], last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    });
  }

  get visible(): boolean {
    return !this.root.classList.contains('hidden');
  }

  bindSettings(settings: StoredSettings): void {
    this.current = settings;
    this.syncInputs();
  }

  show(content: OverlayContent, action: () => void, secondaryAction?: () => void): void {
    this.extras.replaceChildren();
    this.back.classList.add('hidden');
    this.back.onclick = null;
    this.title.textContent = content.title;
    this.text.textContent = content.text;
    this.button.textContent = content.button;
    this.secondary.textContent = content.secondary ?? 'Nova partida';
    this.secondary.classList.toggle('hidden', content.secondary === undefined);
    this.controls.classList.toggle('hidden', content.showControls === false);
    this.settings.classList.toggle('hidden', content.showSettings !== true);
    this.action = action;
    this.secondaryAction = secondaryAction ?? null;
    this.escapeAction = content.onEscape ?? secondaryAction ?? action;
    this.syncInputs();
    this.root.classList.remove('hidden');
    this.button.focus({ preventScroll: true });
  }

  setBackAction(action: () => void, label = 'Voltar aos modos'): void {
    this.back.textContent = label;
    this.back.classList.remove('hidden');
    this.back.onclick = action;
    this.escapeAction = action;
  }

  addAction(label: string, action: () => void, options: { icon?: string; description?: string; disabled?: boolean } = {}): void {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.disabled = options.disabled === true;
    if (options.icon) {
      button.classList.add('menu-card');
      const icon = document.createElement('span'); icon.className = 'menu-icon';
      icon.textContent = options.icon; icon.setAttribute('aria-hidden', 'true'); button.prepend(icon);
    }
    if (options.description) {
      const description = document.createElement('small'); description.textContent = options.description;
      button.append(description);
    }
    button.onclick = action;
    this.extras.append(button);
  }

  addContent(node: HTMLElement): void { this.extras.append(node); }

  hide(): void {
    if (this.root.contains(document.activeElement)) (document.activeElement as HTMLElement)?.blur();
    this.root.classList.add('hidden');
  }

  private syncInputs(): void {
    this.volume.value = String(Math.round(this.current.volume * 100));
    this.mute.checked = this.current.muted;
    this.sensitivity.value = String(Math.round(this.current.sensitivity * 100));
    this.reducedMotion.checked = this.current.reducedMotion;
    this.reducedEffects.checked = this.current.reducedEffects;
    this.quality.value = this.current.quality;
    this.narrator.checked = this.current.narrator;
    this.music.checked = this.current.music;
    this.refreshLabels();
  }

  private commit(): void {
    this.current = {
      volume: Number(this.volume.value) / 100,
      muted: this.mute.checked,
      sensitivity: Number(this.sensitivity.value) / 100,
      reducedMotion: this.reducedMotion.checked,
      reducedEffects: this.reducedEffects.checked,
      quality: this.quality.value as StoredSettings['quality'],
      narrator: this.narrator.checked,
      music: this.music.checked,
    };
    this.refreshLabels();
    saveSettings(this.current);
    this.onSettingsChange?.(this.current);
  }

  private refreshLabels(): void {
    this.volumeValue.textContent = `${Math.round(this.current.volume * 100)}%`;
    this.sensitivityValue.textContent = `${this.current.sensitivity.toFixed(1)}×`;
  }
}
