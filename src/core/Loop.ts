/** requestAnimationFrame driver with a clamped delta and a rolling FPS estimate. */
export class Loop {
  private rafId = 0;
  private last = 0;
  private running = false;
  private fpsAccum = 0;
  private fpsFrames = 0;

  fps = 0;

  constructor(private readonly tick: (dt: number) => void) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.rafId = requestAnimationFrame(this.frame);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  private readonly frame = (now: number): void => {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this.frame);

    // Clamp so an alt-tab pause cannot teleport entities through the world.
    const elapsed = Math.max(0, (now - this.last) / 1000);
    const dt = Math.min(elapsed, 0.1);
    this.last = now;

    this.fpsAccum += elapsed;
    this.fpsFrames += 1;
    if (this.fpsAccum >= 0.5) {
      this.fps = this.fpsFrames / this.fpsAccum;
      this.fpsAccum = 0;
      this.fpsFrames = 0;
    }

    this.tick(dt);
  };
}
