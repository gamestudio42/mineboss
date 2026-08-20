import { saveSettings, type StoredSettings } from '../core/Settings.ts';

export interface OverlayContent {
  title: string;
  text: string;
  button: string;
  showControls?: boolean;
  showSettings?: boolean;
}

/** Full screen panel used for the title screen, pause, death and victory. */
export class Overlay {
  private readonly root: HTMLElement;
  private readonly title: HTMLElement;
  private readonly text: HTMLElement;
  private readonly button: HTMLButtonElement;
  private readonly controls: HTMLElement;
  private readonly settings: HTMLElement;
  private readonly volume: HTMLInputElement;
  private readonly mute: HTMLInputElement;
  private readonly sensitivity: HTMLInputElement;
  private readonly volumeValue: HTMLElement;
  private readonly sensitivityValue: HTMLElement;

  private action: (() => void) | null = null;
  private current: StoredSettings = { volume: 0.45, muted: false, sensitivity: 1 };

  onSettingsChange: ((settings: StoredSettings) => void) | null = null;

  constructor() {
    this.root = document.getElementById('overlay') as HTMLElement;
    this.title = this.root.querySelector('.title') as HTMLElement;
    this.text = document.getElementById('overlay-text') as HTMLElement;
    this.button = document.getElementById('overlay-button') as HTMLButtonElement;
    this.controls = document.getElementById('controls') as HTMLElement;
    this.settings = document.getElementById('settings') as HTMLElement;
    this.volume = document.getElementById('setting-volume') as HTMLInputElement;
    this.mute = document.getElementById('setting-mute') as HTMLInputElement;
    this.sensitivity = document.getElementById('setting-sensitivity') as HTMLInputElement;
    this.volumeValue = document.getElementById('setting-volume-value') as HTMLElement;
    this.sensitivityValue = document.getElementById('setting-sensitivity-value') as HTMLElement;

    this.button.addEventListener('click', () => this.action?.());
    this.volume.addEventListener('input', () => this.commit());
    this.sensitivity.addEventListener('input', () => this.commit());
    this.mute.addEventListener('change', () => this.commit());
  }

  get visible(): boolean {
    return !this.root.classList.contains('hidden');
  }

  bindSettings(settings: StoredSettings): void {
    this.current = settings;
    this.syncInputs();
  }

  show(content: OverlayContent, action: () => void): void {
    this.title.textContent = content.title;
    this.text.textContent = content.text;
    this.button.textContent = content.button;
    this.controls.classList.toggle('hidden', content.showControls === false);
    this.settings.classList.toggle('hidden', content.showSettings !== true);
    this.action = action;
    this.syncInputs();
    this.root.classList.remove('hidden');
  }

  hide(): void {
    this.root.classList.add('hidden');
  }

  private syncInputs(): void {
    this.volume.value = String(Math.round(this.current.volume * 100));
    this.mute.checked = this.current.muted;
    this.sensitivity.value = String(Math.round(this.current.sensitivity * 100));
    this.refreshLabels();
  }

  private commit(): void {
    this.current = {
      volume: Number(this.volume.value) / 100,
      muted: this.mute.checked,
      sensitivity: Number(this.sensitivity.value) / 100,
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
