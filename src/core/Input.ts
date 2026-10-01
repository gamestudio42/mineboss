/** Keyboard/mouse state. Clear both held and edge-triggered input across panels. */
export class Input {
  private readonly held = new Set<string>();
  private readonly pressed = new Set<string>();
  private readonly buttonsHeld = new Set<number>();
  private readonly buttonsPressed = new Set<number>();
  private requestId = 0;
  private requesting = false;
  mouseDX = 0;
  mouseDY = 0;
  wheelDelta = 0;
  locked = false;
  onLockChange: ((locked: boolean) => void) | null = null;
  onLockError: (() => void) | null = null;

  constructor(private readonly canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleBlur);
    document.addEventListener('pointerlockchange', this.handlePointerLockChange);
    document.addEventListener('pointerlockerror', this.handleLockError);
    canvas.addEventListener('click', () => { if (!this.locked) this.requestLock(); });
    canvas.addEventListener('mousedown', event => {
      if (!this.locked) return;
      this.buttonsHeld.add(event.button);
      this.buttonsPressed.add(event.button);
    });
    window.addEventListener('mouseup', event => this.buttonsHeld.delete(event.button));
    window.addEventListener('mousemove', event => {
      if (!this.locked) return;
      this.mouseDX += event.movementX;
      this.mouseDY += event.movementY;
    });
    canvas.addEventListener('wheel', event => {
      if (this.locked) this.wheelDelta += event.deltaY;
    }, { passive: true });
    canvas.addEventListener('contextmenu', event => event.preventDefault());
  }

  requestLock(): void {
    if (this.locked || this.requesting) return;
    this.reset();
    this.requesting = true;
    const id = ++this.requestId;
    try {
      const request = this.canvas.requestPointerLock() as Promise<void> | undefined;
      request?.catch(error => {
        if (import.meta.env.DEV) console.warn('Pointer lock:', error?.name, error?.message);
        if (id === this.requestId) this.handleLockError();
      });
    } catch { this.handleLockError(); }
  }

  releaseLock(): void {
    ++this.requestId;
    this.requesting = false;
    this.reset();
    // Also cancel a lock granted after a panel was opened.
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
  }

  reset(): void {
    this.held.clear();
    this.buttonsHeld.clear();
    this.endFrame();
  }
  isDown(code: string): boolean { return this.held.has(code); }
  wasPressed(code: string): boolean { return this.pressed.has(code); }
  isMouseDown(button: number): boolean { return this.buttonsHeld.has(button); }
  wasMousePressed(button: number): boolean { return this.buttonsPressed.has(button); }
  endFrame(): void {
    this.pressed.clear();
    this.buttonsPressed.clear();
    this.mouseDX = this.mouseDY = this.wheelDelta = 0;
  }
  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (event.code === 'F3' || event.code === 'Tab') event.preventDefault();
    if (event.repeat) return;
    this.held.add(event.code);
    this.pressed.add(event.code);
  };
  private readonly handleKeyUp = (event: KeyboardEvent): void => { this.held.delete(event.code); };
  private readonly handleBlur = (): void => {
    this.reset();
    this.onLockChange?.(false);
  };
  private readonly handleLockError = (): void => {
    if (!this.requesting) return;
    this.requesting = false;
    this.reset();
    this.onLockError?.();
  };
  private readonly handlePointerLockChange = (): void => {
    const granted = document.pointerLockElement === this.canvas;
    if (granted && !this.requesting && !this.locked) {
      document.exitPointerLock();
      return;
    }
    this.locked = granted;
    this.requesting = false;
    this.reset();
    this.onLockChange?.(this.locked);
  };
}
