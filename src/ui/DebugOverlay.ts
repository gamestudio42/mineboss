/** F3 panel with frame timing and streaming counters. */
export class DebugOverlay {
  private visible = false;
  private accumulator = 0;

  constructor(private readonly root: HTMLElement) {}

  toggle(): void {
    this.visible = !this.visible;
    this.root.classList.toggle('hidden', !this.visible);
  }

  update(dt: number, lines: () => string[]): void {
    if (!this.visible) return;

    // Refreshing every frame makes the numbers unreadable.
    this.accumulator += dt;
    if (this.accumulator < 0.2) return;
    this.accumulator = 0;
    this.root.textContent = lines().join('\n');
  }
}
