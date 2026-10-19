const STORAGE_KEY = 'mineboss.settings';
export const BASE_LOOK_SENSITIVITY = 0.0022;
export const QUALITY = {
  light: { label: 'Leve', distance: 4, pixelRatio: 1, particles: 0.35, lights: 4 },
  balanced: { label: 'Equilibrada', distance: 6, pixelRatio: 1.5, particles: 0.7, lights: 8 },
  high: { label: 'Caprichada', distance: 8, pixelRatio: 2, particles: 1, lights: 12 },
} as const;
export interface StoredSettings {
  volume: number;
  muted: boolean;
  sensitivity: number;
  reducedMotion: boolean;
  reducedEffects: boolean;
  quality: keyof typeof QUALITY;
  narrator: boolean;
  music: boolean;
}
export const DEFAULT_SETTINGS: StoredSettings = {
  volume: 0.45, muted: false, sensitivity: 1,
  reducedMotion: false, reducedEffects: false, quality: 'balanced', narrator: true, music: true,
};
function numberIn(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
}
export function loadSettings(): StoredSettings {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<StoredSettings> | null;
    if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_SETTINGS };
    return {
      volume: numberIn(parsed.volume, .45, 0, 1),
      muted: parsed.muted === true,
      sensitivity: numberIn(parsed.sensitivity, 1, .4, 2.2),
      reducedMotion: parsed.reducedMotion === true,
      reducedEffects: parsed.reducedEffects === true,
      quality: parsed.quality === 'light' || parsed.quality === 'high' ? parsed.quality : 'balanced',
      narrator: parsed.narrator !== false,
      music: parsed.music !== false,
    };
  } catch { return { ...DEFAULT_SETTINGS }; }
}
export function saveSettings(settings: StoredSettings): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); }
  catch { /* Settings must not prevent playing when browser storage is full. */ }
}
