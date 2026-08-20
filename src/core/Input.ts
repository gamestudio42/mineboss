/**
 * Keyboard/mouse state with pointer lock handling.
 *
 * Edge-triggered state (`wasPressed`, `wheelDelta`) is cleared by `endFrame`,
 * so the game loop must call it exactly once per tick after all consumers ran.
 */
export class Input {
  private readonly held = new Set<string>();
  private readonly pressed = new Set<string>();
  private readonly buttonsHeld = new Set<number>();
  private readonly buttonsPressed = new Set<number>();

  mouseDX = 0;
  mouseDY = 0;
  wheelDelta = 0;
  locked = false;

  onLockChange: ((locked: boolean) => void) | null = null;

  constructor(private readonly canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleBlur);
    document.addEventListener('pointerlockchange', this.handlePointerLockChange);
    canvas.addEventListener('mousedown', this.handleMouseDown);
    window.addEventListener('mouseup', this.handleMouseUp);
    window.addEventListener('mousemove', this.handleMouseMove);
    canvas.addEventListener('wheel', this.handleWheel, { passive: true });
    canvas.addEventListener('contextmenu', this.handleContextMenu);
  }

  requestLock(): void {
    if (this.locked) return;

    // Chrome rejects the request for a moment after Escape releases the lock.
    const request = this.canvas.requestPointerLock() as Promise<void> | undefined;
    request?.catch?.(() => undefined);
  }

  releaseLock(): void {
    if (this.locked) document.exitPointerLock();
  }

  isDown(code: string): boolean {
    return this.held.has(code);
  }

  wasPressed(code: string): boolean {
    return this.pressed.has(code);
  }

  isMouseDown(button: number): boolean {
    return this.buttonsHeld.has(button);
  }

  wasMousePressed(button: number): boolean {
    return this.buttonsPressed.has(button);
  }

  endFrame(): void {
    this.pressed.clear();
    this.buttonsPressed.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheelDelta = 0;
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (event.code === 'F3' || event.code === 'Tab') event.preventDefault();
    if (event.repeat) return;
    this.held.add(event.code);
    this.pressed.add(event.code);
  };

  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    this.held.delete(event.code);
  };

  private readonly handleBlur = (): void => {
    this.held.clear();
    this.buttonsHeld.clear();
  };

  private readonly handleMouseDown = (event: MouseEvent): void => {
    if (!this.locked) return;
    this.buttonsHeld.add(event.button);
    this.buttonsPressed.add(event.button);
  };

  private readonly handleMouseUp = (event: MouseEvent): void => {
    this.buttonsHeld.delete(event.button);
  };

  private readonly handleMouseMove = (event: MouseEvent): void => {
    if (!this.locked) return;
    this.mouseDX += event.movementX;
    this.mouseDY += event.movementY;
  };

  private readonly handleWheel = (event: WheelEvent): void => {
    if (!this.locked) return;
    this.wheelDelta += event.deltaY;
  };

  private readonly handleContextMenu = (event: MouseEvent): void => {
    event.preventDefault();
  };

  private readonly handlePointerLockChange = (): void => {
    this.locked = document.pointerLockElement === this.canvas;
    if (!this.locked) {
      this.buttonsHeld.clear();
      this.held.clear();
    }
    this.onLockChange?.(this.locked);
  };
}
