import type { Boss } from './Boss.ts';

export type BossStateName =
  | 'awaken'
  | 'chase'
  | 'slam'
  | 'charge'
  | 'boulder'
  | 'summon'
  | 'pillars'
  | 'stagger'
  | 'phaseShift'
  | 'dying';

export interface BossState {
  enter?(boss: Boss): void;
  /** Returning a name transitions into that state on the next frame. */
  update(boss: Boss, dt: number, time: number): BossStateName | void;
  exit?(boss: Boss): void;
}

/** Minimal named state machine driving the boss behaviour. */
export class BossStateMachine {
  private state: BossState;
  private name: BossStateName;

  time = 0;

  constructor(
    private readonly states: Record<BossStateName, BossState>,
    initial: BossStateName,
    private readonly boss: Boss,
  ) {
    this.name = initial;
    this.state = states[initial];
    this.state.enter?.(boss);
  }

  get current(): BossStateName {
    return this.name;
  }

  change(next: BossStateName): void {
    if (next === this.name) return;
    this.state.exit?.(this.boss);
    this.name = next;
    this.state = this.states[next];
    this.time = 0;
    this.state.enter?.(this.boss);
  }

  update(dt: number): void {
    this.time += dt;
    const next = this.state.update(this.boss, dt, this.time);
    if (next) this.change(next);
  }
}
