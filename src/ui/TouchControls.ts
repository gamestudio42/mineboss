import type { Input } from '../core/Input.ts';

/** Stick deflection. Up on the screen is forward. Radius matches a 112 px pad. */
export function stickAxes(dx: number, dy: number, radius = 54): { forward: number; strafe: number } {
  const scale = Math.hypot(dx, dy);
  if (scale < 10) return { forward: 0, strafe: 0 };
  const power = Math.min(1, scale / radius);
  return { strafe: (dx / scale) * power, forward: (-dy / scale) * power };
}

/** Digital keys the walker already understands. */
export function stickKeys(axes: { forward: number; strafe: number }): string[] {
  const keys: string[] = [];
  if (axes.forward > 0.35) keys.push('KeyW');
  if (axes.forward < -0.35) keys.push('KeyS');
  if (axes.strafe > 0.35) keys.push('KeyD');
  if (axes.strafe < -0.35) keys.push('KeyA');
  return keys;
}

/** Phones and tablets, including a device toolbar that reports a coarse pointer. */
export function prefersTouch(): boolean {
  try {
    return window.matchMedia('(pointer: coarse), (hover: none)').matches;
  } catch {
    return false;
  }
}

function capture(element: HTMLElement, pointerId: number): void {
  try { element.setPointerCapture(pointerId); } catch { /* The pointer is already gone. */ }
}

/** On-screen move stick plus the action buttons. Mouse play never needs them. */
export function bindTouchControls(input: Input, root: ParentNode): void {
  const stick = root.querySelector('#touch-stick');
  if (stick instanceof HTMLElement) bindStick(input, stick);
  bindHoldKey(input, root.querySelector('#touch-jump'), 'Space');
  bindHoldKey(input, root.querySelector('#touch-down'), 'ShiftLeft');
  bindMouseButton(input, root.querySelector('#touch-break'), 0);
  bindMouseButton(input, root.querySelector('#touch-place'), 2);
  bindTap(input, root.querySelector('#touch-fly'), 'KeyF');
  bindTap(input, root.querySelector('#touch-blocks'), 'KeyB');
  bindTap(input, root.querySelector('#touch-menu'), 'Escape');
  root.addEventListener('contextmenu', event => event.preventDefault());
}

function bindStick(input: Input, stick: HTMLElement): void {
  const knob = stick.querySelector('.touch-knob');
  let origin: { x: number; y: number } | null = null;
  const place = (dx: number, dy: number): void => {
    input.setStick(stickKeys(stickAxes(dx, dy)));
    if (!(knob instanceof HTMLElement)) return;
    const scale = Math.hypot(dx, dy);
    const limit = 36;
    const gain = scale > limit ? limit / scale : 1;
    knob.style.transform = `translate(${dx * gain}px, ${dy * gain}px)`;
  };
  stick.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    event.stopPropagation();
    capture(stick, event.pointerId);
    origin = { x: event.clientX, y: event.clientY };
    place(0, 0);
  });
  stick.addEventListener('pointermove', (event) => {
    if (!origin) return;
    place(event.clientX - origin.x, event.clientY - origin.y);
  });
  const end = (): void => {
    origin = null;
    input.setStick([]);
    if (knob instanceof HTMLElement) knob.style.transform = '';
  };
  stick.addEventListener('pointerup', end);
  stick.addEventListener('pointercancel', end);
}

function bindHoldKey(input: Input, button: Element | null, code: string): void {
  if (!(button instanceof HTMLButtonElement)) return;
  const down = (event: PointerEvent): void => {
    event.preventDefault();
    event.stopPropagation();
    capture(button, event.pointerId);
    button.classList.add('is-down');
    input.setKey(code, true);
  };
  const up = (): void => {
    button.classList.remove('is-down');
    input.setKey(code, false);
  };
  button.addEventListener('pointerdown', down);
  button.addEventListener('pointerup', up);
  button.addEventListener('pointercancel', up);
}

function bindMouseButton(input: Input, button: Element | null, mouseButton: number): void {
  if (!(button instanceof HTMLButtonElement)) return;
  const down = (event: PointerEvent): void => {
    event.preventDefault();
    event.stopPropagation();
    capture(button, event.pointerId);
    button.classList.add('is-down');
    input.setMouseButton(mouseButton, true);
  };
  const up = (): void => {
    button.classList.remove('is-down');
    input.setMouseButton(mouseButton, false);
  };
  button.addEventListener('pointerdown', down);
  button.addEventListener('pointerup', up);
  button.addEventListener('pointercancel', up);
}

function bindTap(input: Input, button: Element | null, code: string): void {
  if (!(button instanceof HTMLButtonElement)) return;
  button.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    event.stopPropagation();
    button.classList.add('is-down');
    input.tap(code);
  });
  const up = (): void => button.classList.remove('is-down');
  button.addEventListener('pointerup', up);
  button.addEventListener('pointercancel', up);
}
