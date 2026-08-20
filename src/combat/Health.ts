/** Hit points with an invulnerability window, shared by the player and mobs. */
export class Health {
  current: number;
  invulnerability = 0;

  onDamage: ((amount: number) => void) | null = null;
  onDeath: (() => void) | null = null;

  constructor(
    public max: number,
    /** Seconds of invulnerability granted after a hit lands. */
    private readonly invulnerabilityWindow = 0.4,
  ) {
    this.current = max;
  }

  get dead(): boolean {
    return this.current <= 0;
  }

  get fraction(): number {
    return Math.max(0, this.current / this.max);
  }

  update(dt: number): void {
    if (this.invulnerability > 0) this.invulnerability = Math.max(0, this.invulnerability - dt);
  }

  /** Returns true when the hit was applied rather than absorbed by i-frames. */
  damage(amount: number, options: { bypassInvulnerability?: boolean } = {}): boolean {
    if (this.dead || amount <= 0) return false;
    if (this.invulnerability > 0 && !options.bypassInvulnerability) return false;

    this.current = Math.max(0, this.current - amount);
    if (!options.bypassInvulnerability) this.invulnerability = this.invulnerabilityWindow;

    this.onDamage?.(amount);
    if (this.dead) this.onDeath?.();
    return true;
  }

  heal(amount: number): void {
    this.current = Math.min(this.max, this.current + amount);
  }

  reset(): void {
    this.current = this.max;
    this.invulnerability = 0;
  }
}
