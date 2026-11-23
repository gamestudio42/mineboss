/** Codes the page keeps while playing, so arrows and Tab do not scroll or move focus. */
const CAPTURED_KEYS = new Set(['F3', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

/** Fires once after a key has been held long enough; a shorter press reports a tap on release. */
export class HoldTrigger {
  private held = 0;

  constructor(private readonly seconds: number) {}

  update(down: boolean, dt: number): 'fire' | 'tap' | null {
    if (down) {
      const before = this.held;
      this.held += dt;
      return before < this.seconds && this.held >= this.seconds ? 'fire' : null;
    }
    const released = this.held;
    this.held = 0;
    return released > 0 && released < this.seconds ? 'tap' : null;
  }
}

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
  /** Touch play runs without pointer lock. Set from a coarse-pointer media query. */
  coarse = false;
  onLockChange: ((locked: boolean) => void) | null = null;
  onLockError: (() => void) | null = null;
  private readonly touchPoints = new Map<number, { x: number; y: number }>();
  private stickKeys = new Set<string>();
  private virtualKeys = new Set<string>();
  /** A finger just ended, so the compatibility mouse click must not mine or place. */
  private suppressMouse = false;

  constructor(private readonly canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleBlur);
    document.addEventListener('pointerlockchange', this.handlePointerLockChange);
    document.addEventListener('pointerlockerror', this.handleLockError);
    canvas.addEventListener('click', () => { if (!this.locked && !this.coarse) this.requestLock(); });
    canvas.addEventListener('pointerdown', this.handlePointerDown);
    canvas.addEventListener('pointermove', this.handlePointerMove);
    canvas.addEventListener('pointerup', this.handlePointerEnd);
    canvas.addEventListener('pointercancel', this.handlePointerEnd);
    canvas.addEventListener('mousedown', event => {
      if (this.suppressMouse) return;
      if (!this.locked && !this.coarse) return;
      this.buttonsHeld.add(event.button);
      this.buttonsPressed.add(event.button);
    });
    window.addEventListener('mouseup', event => {
      if (this.suppressMouse) return;
      this.buttonsHeld.delete(event.button);
    });
    window.addEventListener('mousemove', event => {
      if (!this.locked) return;
      this.mouseDX += event.movementX;
      this.mouseDY += event.movementY;
    });
    canvas.addEventListener('wheel', event => {
      if (this.locked) this.wheelDelta += event.deltaY;
    }, { passive: true });
    canvas.addEventListener('contextmenu', event => event.preventDefault());
    canvas.addEventListener('touchmove', event => event.preventDefault(), { passive: false });
  }

  requestLock(): void {
    if (this.locked || this.requesting || this.coarse) return;
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
    this.stickKeys.clear();
    this.virtualKeys.clear();
    this.endFrame();
  }

  /** Keys held by the on-screen stick. They stack with the keyboard. */
  setStick(codes: readonly string[]): void {
    this.stickKeys = new Set(codes);
  }

  /** Hold or release a virtual key such as jump or descend. */
  setKey(code: string, down: boolean): void {
    if (down) {
      if (!this.virtualKeys.has(code) && !this.held.has(code)) this.pressed.add(code);
      this.virtualKeys.add(code);
    } else this.virtualKeys.delete(code);
  }

  /** One-frame press for toggles and menus. */
  tap(code: string): void {
    this.pressed.add(code);
  }

  /** Virtual left (0) or right (2) mouse button for the touch buttons. */
  setMouseButton(button: number, down: boolean): void {
    if (down) {
      if (!this.buttonsHeld.has(button)) this.buttonsPressed.add(button);
      this.buttonsHeld.add(button);
    } else this.buttonsHeld.delete(button);
  }

  isDown(code: string): boolean {
    return this.held.has(code) || this.stickKeys.has(code) || this.virtualKeys.has(code);
  }
  wasPressed(code: string): boolean { return this.pressed.has(code); }
  isMouseDown(button: number): boolean { return this.buttonsHeld.has(button); }
  wasMousePressed(button: number): boolean { return this.buttonsPressed.has(button); }
  endFrame(): void {
    this.pressed.clear();
    this.buttonsPressed.clear();
    this.mouseDX = this.mouseDY = this.wheelDelta = 0;
  }

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (event.pointerType === 'mouse') {
      this.suppressMouse = false;
      return;
    }
    this.suppressMouse = true;
    this.touchPoints.set(event.pointerId, { x: event.clientX, y: event.clientY });
    try { this.canvas.setPointerCapture(event.pointerId); } catch { /* already released */ }
    event.preventDefault();
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    const prev = this.touchPoints.get(event.pointerId);
    if (!prev) return;
    this.mouseDX += event.clientX - prev.x;
    this.mouseDY += event.clientY - prev.y;
    prev.x = event.clientX;
    prev.y = event.clientY;
  };

  private readonly handlePointerEnd = (event: PointerEvent): void => {
    this.touchPoints.delete(event.pointerId);
  };

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (this.locked && CAPTURED_KEYS.has(event.code)) event.preventDefault();
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
