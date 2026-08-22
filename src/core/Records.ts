import { HAMMER, HammerTier } from '../player/Hammer.ts';

const STORAGE_KEY = 'mineboss.best-run';

export interface RunRecord {
  elapsed: number;
  deaths: number;
  hammer: HammerTier;
  blocksMined: number;
}

export function formatRunLine(record: RunRecord): string {
  const minutes = Math.floor(record.elapsed / 60);
  const seconds = Math.floor(record.elapsed % 60)
    .toString()
    .padStart(2, '0');
  const deathLabel = record.deaths === 1 ? '1 death' : `${record.deaths} deaths`;
  const blockLabel = record.blocksMined === 1 ? '1 block mined' : `${record.blocksMined} blocks mined`;
  return `${minutes}:${seconds} · ${deathLabel} · ${HAMMER[record.hammer].name} · ${blockLabel}`;
}

/** Faster time wins; fewer deaths then more blocks break ties. */
export function isBetterRun(next: RunRecord, best: RunRecord): boolean {
  if (next.elapsed !== best.elapsed) return next.elapsed < best.elapsed;
  if (next.deaths !== best.deaths) return next.deaths < best.deaths;
  return next.blocksMined > best.blocksMined;
}

export function loadBestRun(): RunRecord | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RunRecord>;
    if (typeof parsed.elapsed !== 'number' || typeof parsed.deaths !== 'number') return null;
    if (typeof parsed.blocksMined !== 'number') return null;
    const hammer = parsed.hammer;
    if (hammer !== HammerTier.Wood && hammer !== HammerTier.Iron && hammer !== HammerTier.Gold) {
      return null;
    }
    return {
      elapsed: Math.max(0, parsed.elapsed),
      deaths: Math.max(0, parsed.deaths),
      hammer,
      blocksMined: Math.max(0, parsed.blocksMined),
    };
  } catch {
    return null;
  }
}

export function saveBestRun(record: RunRecord): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
  } catch {
    // Private mode or a full quota should not break the game.
  }
}

/** Writes the run if it beats the stored best. Returns the best after the check. */
export function recordRun(record: RunRecord): { best: RunRecord; isNewBest: boolean } {
  const previous = loadBestRun();
  if (!previous || isBetterRun(record, previous)) {
    saveBestRun(record);
    return { best: record, isNewBest: true };
  }
  return { best: previous, isNewBest: false };
}
