export type BootStep = 'graphics' | 'world' | 'done' | 'failed';

export const BOOT_LABEL: Record<BootStep, string> = {
  graphics: 'Preparando os gráficos…',
  world: 'Abrindo o terreno…',
  done: 'Pronto',
  failed: 'Não foi possível abrir o mundo. Precisa de WebGL2.',
};

const FADE_MS = 300;
/** Keep the brand on screen long enough to read, even on a fast machine. */
const MIN_VISIBLE_MS = 700;

export function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

export function bootPercent(progress: number): number {
  return Math.round(Math.min(1, Math.max(0, progress)) * 100);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/** Loading cover shown until the renderer and the title menu are ready, then faded out. */
export class BootScreen {
  private readonly started = performance.now();

  constructor(readonly root: HTMLElement) {}

  static fromDocument(): BootScreen {
    const root = document.getElementById('boot-screen');
    if (!root) throw new Error('Missing #boot-screen');
    return new BootScreen(root);
  }

  set(step: BootStep, progress: number): void {
    this.root.dataset.step = step;
    this.root.setAttribute('aria-busy', step === 'done' || step === 'failed' ? 'false' : 'true');
    const label = this.root.querySelector('[data-testid="boot-step"]');
    if (label) label.textContent = BOOT_LABEL[step];
    const percent = bootPercent(progress);
    const bar = this.root.querySelector('.boot-progress');
    bar?.setAttribute('aria-valuenow', String(percent));
    const fill = this.root.querySelector<HTMLElement>('.boot-progress-fill');
    if (fill) fill.style.width = `${percent}%`;
  }

  async finish(): Promise<void> {
    this.set('done', 1);
    if (prefersReducedMotion()) {
      this.root.remove();
      return;
    }
    const hold = Math.max(0, MIN_VISIBLE_MS - (performance.now() - this.started));
    if (hold) await sleep(hold);
    this.root.classList.add('leaving');
    await sleep(FADE_MS);
    this.root.remove();
  }

  fail(): void {
    this.set('failed', 1);
  }
}
