function requireElement(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing UI element #${id}`);
  return element;
}

/** Persistent heading widget: an arrow that points at the current guide target. */
export class Compass {
  private readonly root = requireElement('compass');
  private readonly arrow = requireElement('compass-arrow');
  private readonly label = requireElement('compass-label');

  update(visible: boolean, relativeYaw: number, text: string): void {
    this.root.classList.toggle('hidden', !visible);
    if (!visible) return;

    this.arrow.style.transform = `rotate(${relativeYaw}rad)`;
    if (this.label.textContent !== text) this.label.textContent = text;
  }
}
