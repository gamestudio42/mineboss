/** Boss bar with a trailing white chip that shows damage just taken. */
export class BossHealthBar {
  private readonly root: HTMLElement;
  private readonly nameLabel: HTMLElement;
  private readonly phaseLabel: HTMLElement;
  private readonly vulnerableLabel: HTMLElement;
  private readonly fill: HTMLElement;
  private readonly chip: HTMLElement;

  private fraction = 1;
  private vulnerable = false;

  constructor(root: HTMLElement) {
    this.root = root;
    this.nameLabel = root.querySelector('.boss-bar-name') as HTMLElement;
    this.phaseLabel = root.querySelector('.boss-bar-phase') as HTMLElement;
    this.vulnerableLabel = root.querySelector('.boss-bar-vulnerable') as HTMLElement;
    this.fill = root.querySelector('.boss-bar-fill') as HTMLElement;
    this.chip = root.querySelector('.boss-bar-chip') as HTMLElement;
  }

  show(name: string): void {
    this.nameLabel.textContent = name;
    this.root.classList.remove('hidden');
  }

  hide(): void {
    this.root.classList.add('hidden');
    this.setVulnerable(false);
  }

  setPhase(label: string): void {
    if (this.phaseLabel.textContent !== label) this.phaseLabel.textContent = label;
  }

  setVulnerable(vulnerable: boolean): void {
    if (vulnerable === this.vulnerable) return;
    this.vulnerable = vulnerable;
    this.root.classList.toggle('vulnerable', vulnerable);
    this.vulnerableLabel.classList.toggle('hidden', !vulnerable);
  }

  update(fraction: number): void {
    const clamped = Math.max(0, Math.min(1, fraction));
    if (clamped === this.fraction) return;

    this.fraction = clamped;
    this.fill.style.transform = `scaleX(${clamped})`;
    // The chip carries a CSS transition, so it trails the fill on a big hit.
    this.chip.style.transform = `scaleX(${clamped})`;
  }
}
