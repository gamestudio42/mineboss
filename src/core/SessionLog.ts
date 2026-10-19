/**
 * Local playtest diary. Independent from the world save: no coordinates,
 * mouse deltas, names or media. Recording starts off.
 */

export const SESSION_VERSION = 1;
export const SESSION_EVENT_CAP = 4000;
export const SESSION_IDLE_SECONDS = 8;
export const SESSION_PERF_INTERVAL = 30;
export const SESSION_STORAGE_KEY = 'mineboss.session';

export type SessionEventType =
  | 'session_start'
  | 'pointer_lock'
  | 'first_move'
  | 'first_look'
  | 'lesson'
  | 'block_placed'
  | 'block_removed'
  | 'craft'
  | 'objective'
  | 'panel'
  | 'practice'
  | 'encounter'
  | 'death'
  | 'victory'
  | 'save'
  | 'loaded'
  | 'idle'
  | 'perf'
  | 'mark'
  | 'session_stop';

export type SessionMarkKind = 'help' | 'cheer' | 'quit';
export type SessionPanelId = 'pause' | 'catalog' | 'recipes' | 'help' | 'boss' | 'home';

export interface SessionContext {
  mode: 'adventure' | 'oneblock';
  creative: boolean;
  gentle: boolean;
  quality: string;
  reducedMotion: boolean;
  pace?: 'classic' | 'quick';
}

export interface SessionEvent {
  t: number;
  type: SessionEventType;
  ok?: boolean;
  block?: string;
  step?: number | 'done';
  id?: string;
  recipe?: string;
  text?: string;
  action?: string;
  boss?: string;
  kind?: SessionMarkKind;
  objective?: string;
  fps?: number;
  active?: boolean;
}

export interface SessionSummary {
  pointerLocked: boolean;
  timeToMove: number | null;
  timeToLook: number | null;
  lessonDone: boolean;
  blocksPlaced: number;
  blocksRemoved: number;
  crafted: boolean;
  practice: boolean;
  encounter: boolean;
  deaths: number;
  saved: boolean;
  reloaded: boolean;
  helpMarks: number;
  cheerMarks: number;
  quitMarks: number;
  longestIdle: number;
  medianFps: number | null;
}

export interface SessionExport {
  version: number;
  startedAt: string | null;
  context: SessionContext | null;
  events: SessionEvent[];
  omitted: number;
  summary: SessionSummary;
}

interface SessionCounts {
  placed: number;
  removed: number;
  deaths: number;
  crafts: number;
  help: number;
  cheer: number;
  quit: number;
}

const EVENT_TYPES = new Set<string>([
  'session_start', 'pointer_lock', 'first_move', 'first_look', 'lesson',
  'block_placed', 'block_removed', 'craft', 'objective', 'panel', 'practice',
  'encounter', 'death', 'victory', 'save', 'loaded', 'idle', 'perf', 'mark',
  'session_stop',
]);

const FORBIDDEN_KEYS = new Set(['x', 'y', 'z', 'mouseDX', 'mouseDY', 'movementX', 'movementY']);

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isContext(value: unknown): value is SessionContext {
  if (!value || typeof value !== 'object') return false;
  const context = value as SessionContext;
  if (context.mode !== 'adventure' && context.mode !== 'oneblock') return false;
  if (typeof context.creative !== 'boolean' || typeof context.gentle !== 'boolean') return false;
  if (typeof context.quality !== 'string' || typeof context.reducedMotion !== 'boolean') return false;
  if (context.pace !== undefined && context.pace !== 'classic' && context.pace !== 'quick') return false;
  return true;
}

function isEvent(value: unknown): value is SessionEvent {
  if (!value || typeof value !== 'object') return false;
  const event = value as Record<string, unknown>;
  for (const key of Object.keys(event)) if (FORBIDDEN_KEYS.has(key)) return false;
  if (!isFiniteNumber(event.t) || event.t < 0) return false;
  if (typeof event.type !== 'string' || !EVENT_TYPES.has(event.type)) return false;
  return true;
}

function emptyCounts(): SessionCounts {
  return { placed: 0, removed: 0, deaths: 0, crafts: 0, help: 0, cheer: 0, quit: 0 };
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function priorityAfterCap(type: SessionEventType, fields: Partial<SessionEvent>): boolean {
  if (type === 'mark') return true;
  if (type === 'pointer_lock' && fields.ok === false) return true;
  if (type === 'save' && fields.ok === false) return true;
  return false;
}

/** Validate a stored or exported diary. Rejects coordinates and mouse deltas. */
export function parseSession(raw: string): SessionExport | null {
  try {
    const parsed = JSON.parse(raw) as Partial<SessionExport> & { enabled?: boolean };
    if (!parsed || typeof parsed !== 'object') return null;
    if (parsed.version !== SESSION_VERSION) return null;
    if (parsed.startedAt !== null && typeof parsed.startedAt !== 'string') return null;
    if (parsed.context !== null && parsed.context !== undefined && !isContext(parsed.context)) return null;
    if (!Array.isArray(parsed.events) || parsed.events.length > SESSION_EVENT_CAP + 64) return null;
    if (!parsed.events.every(isEvent)) return null;
    if (!isFiniteNumber(parsed.omitted) || parsed.omitted < 0) return null;
    return {
      version: SESSION_VERSION,
      startedAt: parsed.startedAt ?? null,
      context: parsed.context ?? null,
      events: parsed.events,
      omitted: parsed.omitted,
      summary: parsed.summary && typeof parsed.summary === 'object'
        ? parsed.summary as SessionSummary
        : {
          pointerLocked: false, timeToMove: null, timeToLook: null, lessonDone: false,
          blocksPlaced: 0, blocksRemoved: 0, crafted: false, practice: false, encounter: false,
          deaths: 0, saved: false, reloaded: false, helpMarks: 0, cheerMarks: 0, quitMarks: 0,
          longestIdle: 0, medianFps: null,
        },
    };
  } catch {
    return null;
  }
}

export class SessionLog {
  enabled = false;
  events: SessionEvent[] = [];
  omitted = 0;
  context: SessionContext | null = null;
  startedAt: number | null = null;

  private counts = emptyCounts();
  private fpsSamples: number[] = [];
  private lastKey = '';
  private sawMove = false;
  private sawLook = false;
  private idleSeconds = 0;
  private idle = false;
  private idleStartedAt: number | null = null;
  private longestIdle = 0;
  private perfSeconds = 0;
  private readonly now: () => number;

  constructor(now: () => number = () => Date.now()) {
    this.now = now;
    this.restore();
  }

  get hasData(): boolean {
    return this.events.length > 0 || this.omitted > 0;
  }

  enable(): void {
    this.enabled = true;
    this.persist(true);
  }

  stop(): void {
    if (this.enabled) this.record('session_stop');
    this.enabled = false;
    this.idle = false;
    this.idleSeconds = 0;
    this.persist(true);
  }

  clear(): void {
    this.enabled = false;
    this.events = [];
    this.omitted = 0;
    this.context = null;
    this.startedAt = null;
    this.counts = emptyCounts();
    this.fpsSamples = [];
    this.lastKey = '';
    this.sawMove = false;
    this.sawLook = false;
    this.idleSeconds = 0;
    this.idle = false;
    this.idleStartedAt = null;
    this.longestIdle = 0;
    this.perfSeconds = 0;
    try { localStorage.removeItem(SESSION_STORAGE_KEY); } catch { /* Quota or private mode. */ }
  }

  begin(context: SessionContext): void {
    if (!this.enabled) return;
    if (this.startedAt === null) this.startedAt = this.now();
    this.context = context;
    this.record('session_start');
  }

  record(type: SessionEventType, fields: Partial<SessionEvent> = {}): void {
    if (!this.enabled) return;
    if (type === 'session_start' && this.events.some(event => event.type === 'session_start')) return;
    if (type === 'first_move' && this.sawMove) return;
    if (type === 'first_look' && this.sawLook) return;

    const key = `${type}:${fields.text ?? fields.id ?? fields.step ?? ''}`;
    if ((type === 'objective' || type === 'panel') && key === this.lastKey) return;

    this.tally(type, fields);
    if (type === 'first_move') this.sawMove = true;
    if (type === 'first_look') this.sawLook = true;

    const urgent = priorityAfterCap(type, fields);
    const keep = this.events.length < SESSION_EVENT_CAP || urgent;
    if (!keep) {
      this.omitted += 1;
      this.persist(this.omitted % 25 === 0);
      return;
    }

    if (this.startedAt === null) this.startedAt = this.now();
    const event: SessionEvent = { t: this.elapsed(), type };
    for (const [name, value] of Object.entries(fields)) {
      if (value === undefined || FORBIDDEN_KEYS.has(name)) continue;
      (event as unknown as Record<string, unknown>)[name] = value;
    }
    this.events.push(event);
    this.lastKey = type === 'objective' || type === 'panel' ? key : '';
    this.persist(urgent || type === 'session_start' || this.events.length % 25 === 0);
  }

  flush(): void {
    this.persist(true);
  }

  observe(state: {
    dt: number;
    playing: boolean;
    locked: boolean;
    moving: boolean;
    looking: boolean;
    fps: number;
  }): void {
    if (!this.enabled) return;
    if (!state.playing || !state.locked) {
      this.endIdle();
      this.idleSeconds = 0;
      return;
    }
    if (state.moving) this.record('first_move');
    if (state.looking) this.record('first_look');

    const active = state.moving || state.looking;
    if (active) {
      this.endIdle();
      this.idleSeconds = 0;
    } else {
      this.idleSeconds += state.dt;
      if (!this.idle && this.idleSeconds >= SESSION_IDLE_SECONDS) {
        this.idle = true;
        this.idleStartedAt = this.elapsed();
        this.record('idle', { active: true });
      }
    }

    this.perfSeconds += state.dt;
    if (this.perfSeconds >= SESSION_PERF_INTERVAL && state.fps > 0) {
      this.perfSeconds = 0;
      this.record('perf', { fps: Math.round(state.fps * 10) / 10 });
    }
  }

  summary(): SessionSummary {
    const timeTo = (type: SessionEventType): number | null =>
      this.events.find(event => event.type === type)?.t ?? null;
    return {
      pointerLocked: this.events.some(event => event.type === 'pointer_lock' && event.ok === true),
      timeToMove: timeTo('first_move'),
      timeToLook: timeTo('first_look'),
      lessonDone: this.events.some(event => event.type === 'lesson' && event.step === 'done'),
      blocksPlaced: this.counts.placed,
      blocksRemoved: this.counts.removed,
      crafted: this.counts.crafts > 0,
      practice: this.events.some(event => event.type === 'practice'),
      encounter: this.events.some(event => event.type === 'encounter'),
      deaths: this.counts.deaths,
      saved: this.events.some(event => event.type === 'save' && event.ok === true),
      reloaded: this.events.some(event => event.type === 'loaded'),
      helpMarks: this.counts.help,
      cheerMarks: this.counts.cheer,
      quitMarks: this.counts.quit,
      longestIdle: Math.max(this.longestIdle, this.idle && this.idleStartedAt !== null ? this.elapsed() - this.idleStartedAt : 0),
      medianFps: median(this.fpsSamples),
    };
  }

  toExport(): SessionExport {
    this.persist(true);
    return {
      version: SESSION_VERSION,
      startedAt: this.startedAt === null ? null : new Date(this.startedAt).toISOString(),
      context: this.context,
      events: this.events,
      omitted: this.omitted,
      summary: this.summary(),
    };
  }

  private elapsed(): number {
    if (this.startedAt === null) this.startedAt = this.now();
    return Math.max(0, (this.now() - this.startedAt) / 1000);
  }

  private tally(type: SessionEventType, fields: Partial<SessionEvent>): void {
    if (type === 'block_placed') this.counts.placed += 1;
    if (type === 'block_removed') this.counts.removed += 1;
    if (type === 'death') this.counts.deaths += 1;
    if (type === 'craft') this.counts.crafts += 1;
    if (type === 'mark' && fields.kind === 'help') this.counts.help += 1;
    if (type === 'mark' && fields.kind === 'cheer') this.counts.cheer += 1;
    if (type === 'mark' && fields.kind === 'quit') this.counts.quit += 1;
    if (type === 'perf' && isFiniteNumber(fields.fps)) this.fpsSamples.push(fields.fps);
  }

  private endIdle(): void {
    if (!this.idle) return;
    if (this.idleStartedAt !== null) {
      this.longestIdle = Math.max(this.longestIdle, this.elapsed() - this.idleStartedAt);
    }
    this.idle = false;
    this.idleStartedAt = null;
    this.record('idle', { active: false });
  }

  private persist(force = false): void {
    if (!force) return;
    try {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({
        version: SESSION_VERSION,
        enabled: this.enabled,
        startedAt: this.startedAt,
        context: this.context,
        events: this.events,
        omitted: this.omitted,
        counts: this.counts,
        fpsSamples: this.fpsSamples.slice(-200),
        longestIdle: this.longestIdle,
        sawMove: this.sawMove,
        sawLook: this.sawLook,
      }));
    } catch {
      /* Keep the in-memory copy when storage is full. */
    }
  }

  private restore(): void {
    try {
      const raw = localStorage.getItem(SESSION_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        version?: number;
        enabled?: boolean;
        startedAt?: number | null;
        context?: SessionContext | null;
        events?: unknown;
        omitted?: number;
        counts?: Partial<SessionCounts>;
        fpsSamples?: unknown;
        longestIdle?: number;
        sawMove?: boolean;
        sawLook?: boolean;
      };
      if (parsed.version !== SESSION_VERSION) return;
      if (!Array.isArray(parsed.events) || !parsed.events.every(isEvent)) return;
      this.enabled = parsed.enabled === true;
      this.startedAt = isFiniteNumber(parsed.startedAt) ? parsed.startedAt : null;
      this.context = parsed.context && isContext(parsed.context) ? parsed.context : null;
      this.events = parsed.events;
      this.omitted = isFiniteNumber(parsed.omitted) && parsed.omitted >= 0 ? parsed.omitted : 0;
      this.counts = { ...emptyCounts(), ...(parsed.counts ?? {}) };
      this.fpsSamples = Array.isArray(parsed.fpsSamples)
        ? parsed.fpsSamples.filter((value): value is number => isFiniteNumber(value))
        : [];
      this.longestIdle = isFiniteNumber(parsed.longestIdle) ? parsed.longestIdle : 0;
      this.sawMove = parsed.sawMove === true;
      this.sawLook = parsed.sawLook === true;
      const last = this.events.at(-1);
      if (last && (last.type === 'objective' || last.type === 'panel')) {
        this.lastKey = `${last.type}:${last.text ?? last.id ?? ''}`;
      }
    } catch {
      /* Ignore a corrupt diary; the world save is separate. */
    }
  }
}
