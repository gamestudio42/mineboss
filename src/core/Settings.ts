const STORAGE_KEY = 'mineboss.settings';

/** Default look speed, matching the original hardcoded mouse scale. */
export const BASE_LOOK_SENSITIVITY = 0.0022;
const DEFAULT_VOLUME = 0.45;

export interface StoredSettings {
  volume: number;
  muted: boolean;
  /** Multiplier around `BASE_LOOK_SENSITIVITY`, typically 0.4–2.2. */
  sensitivity: number;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/** Loads volume, mute and look speed from localStorage, with safe defaults. */
export function loadSettings(): StoredSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { volume: DEFAULT_VOLUME, muted: false, sensitivity: 1 };

    const parsed = JSON.parse(raw) as Partial<StoredSettings>;
    return {
      volume: clamp01(typeof parsed.volume === 'number' ? parsed.volume : DEFAULT_VOLUME),
      muted: parsed.muted === true,
      sensitivity: Math.max(0.4, Math.min(2.2, typeof parsed.sensitivity === 'number' ? parsed.sensitivity : 1)),
    };
  } catch {
    return { volume: DEFAULT_VOLUME, muted: false, sensitivity: 1 };
  }
}

export function saveSettings(settings: StoredSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Private mode or a full quota should not break the game.
  }
}
