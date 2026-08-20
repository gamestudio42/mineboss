export interface OverlayContent {
  title: string;
  text: string;
  button: string;
  showControls?: boolean;
}

/** Full screen panel used for the title screen, pause, death and victory. */
export class Overlay {
  private readonly root: HTMLElement;
  private readonly title: HTMLElement;
  private readonly text: HTMLElement;
  private readonly button: HTMLButtonElement;
  private readonly controls: HTMLElement;

  private action: (() => void) | null = null;

  constructor() {
    this.root = document.getElementById('overlay') as HTMLElement;
    this.title = this.root.querySelector('.title') as HTMLElement;
    this.text = document.getElementById('overlay-text') as HTMLElement;
    this.button = document.getElementById('overlay-button') as HTMLButtonElement;
    this.controls = document.getElementById('controls') as HTMLElement;

    this.button.addEventListener('click', () => this.action?.());
  }

  get visible(): boolean {
    return !this.root.classList.contains('hidden');
  }

  show(content: OverlayContent, action: () => void): void {
    this.title.textContent = content.title;
    this.text.textContent = content.text;
    this.button.textContent = content.button;
    this.controls.classList.toggle('hidden', content.showControls === false);
    this.action = action;
    this.root.classList.remove('hidden');
  }

  hide(): void {
    this.root.classList.add('hidden');
  }
}
