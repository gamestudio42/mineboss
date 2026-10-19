/** Freeze lengths in seconds. Longer than ~0.2 s reads as lag instead of weight. */
export const HIT_STOP = {
  stagger: 0.07,
  phase: 0.15,
  defeat: 0.15,
} as const;

/** Holds the creatures still for a beat while the camera and the player keep moving. */
export class HitStop {
  private remaining = 0;

  get active(): boolean {
    return this.remaining > 0;
  }

  /** Overlapping hits keep the longest freeze instead of stacking into a stall. */
  trigger(seconds: number): void {
    this.remaining = Math.max(this.remaining, seconds);
  }

  /** True when this frame should skip the entity update. */
  update(dt: number): boolean {
    if (this.remaining <= 0) return false;
    const left = this.remaining - dt;
    this.remaining = left > 1e-6 ? left : 0;
    return true;
  }

  clear(): void {
    this.remaining = 0;
  }
}
