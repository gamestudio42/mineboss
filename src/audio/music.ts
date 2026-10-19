export type MusicTheme = 'build' | 'boss';

export interface MusicNote {
  frequency: number;
  duration: number;
  gain: number;
  wave: OscillatorType;
  /** Pitch multiplier reached at the end of the note; 1 keeps it steady. */
  bend: number;
}

/** Eighth notes: 84 BPM to build, 132 BPM in a fight. */
export const MUSIC_STEP_SECONDS: Record<MusicTheme, number> = {
  build: 60 / 84 / 2,
  boss: 60 / 132 / 2,
};

const REST = null;

/** C major pentatonic only, so no two notes ever clash. Two four-bar phrases. */
const BUILD_MELODY: Array<number | null> = [
  64, REST, 67, REST, 69, 67, REST, REST,
  72, REST, 69, REST, 67, REST, 64, REST,
  69, REST, 67, 64, REST, 62, REST, REST,
  62, REST, 67, REST, 64, REST, REST, REST,
  60, REST, 64, REST, 67, REST, 69, REST,
  67, REST, 64, REST, 62, REST, REST, REST,
  64, REST, 62, 60, REST, 62, REST, 64,
  60, REST, REST, REST, REST, REST, REST, REST,
];
/** C, A minor, F and G roots, one per bar. */
const BUILD_BASS = [48, 45, 41, 43];

/** A minor: a steady pulse with a short call on top. */
const BOSS_LEAD: Array<number | null> = [
  69, REST, REST, 72, REST, REST, 71, REST,
  69, REST, REST, REST, 64, REST, REST, REST,
  69, REST, REST, 72, REST, REST, 74, REST,
  76, REST, 74, REST, 72, REST, 71, REST,
];
const BOSS_BASS = [45, 41, 43, 40];

export const MUSIC_LOOP_STEPS: Record<MusicTheme, number> = {
  build: BUILD_MELODY.length,
  boss: BOSS_LEAD.length,
};

function hz(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

function note(midi: number, duration: number, gain: number, wave: OscillatorType, bend = 1): MusicNote {
  return { frequency: hz(midi), duration, gain, wave, bend };
}

/** Everything that starts on one eighth-note step of a looping theme. */
export function musicNotes(theme: MusicTheme, step: number): MusicNote[] {
  const loop = MUSIC_LOOP_STEPS[theme];
  const at = ((step % loop) + loop) % loop;
  const bar = Math.floor(at / 8) % 4;
  const beat = at % 8;
  const notes: MusicNote[] = [];

  if (theme === 'build') {
    if (beat === 0 || beat === 4) notes.push(note(BUILD_BASS[bar], 1.3, 0.05, 'sine'));
    const melody = BUILD_MELODY[at];
    if (melody !== null) notes.push(note(melody, 0.55, 0.035, 'triangle'));
    return notes;
  }

  notes.push(note(BOSS_BASS[bar], 0.18, 0.03, 'square'));
  if (beat === 0 || beat === 4) notes.push(note(40, 0.3, 0.07, 'sine', 0.45));
  const lead = BOSS_LEAD[at];
  if (lead !== null) notes.push(note(lead, 0.2, 0.022, 'square'));
  return notes;
}

/** Calm music while playing, a faster theme in a fight, silence in menus. */
export function musicTheme(playing: boolean, fighting: boolean): MusicTheme | null {
  if (!playing) return null;
  return fighting ? 'boss' : 'build';
}
