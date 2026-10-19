export interface Voice {
  speak(text: string, volume: number): void;
  cancel(): void;
}

/** Same line again within this window stays quiet, so walking back and forth does not chatter. */
export const REPEAT_SECONDS = 20;

/** Web Speech voice in pt-BR, or null where the browser has none. */
export function browserVoice(): Voice | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') return null;
  const synth = window.speechSynthesis;
  const pick = (): SpeechSynthesisVoice | undefined => {
    const voices = synth.getVoices();
    const lang = (voice: SpeechSynthesisVoice) => voice.lang.replace('_', '-').toLowerCase();
    return voices.find((voice) => lang(voice) === 'pt-br') ?? voices.find((voice) => lang(voice).startsWith('pt'));
  };
  return {
    speak(text, volume) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'pt-BR';
      utterance.rate = 0.95;
      utterance.volume = volume;
      const voice = pick();
      if (voice) utterance.voice = voice;
      synth.speak(utterance);
    },
    cancel() {
      synth.cancel();
    },
  };
}

/** Text as it should be heard: no icons, separators read as pauses, shouting calmed down. */
export function spokenText(text: string): string {
  const line = text
    .replace(/[\p{Extended_Pictographic}\u2190-\u21ff\u2600-\u27bf\u221e\ufe0f]/gu, '')
    .replace(/\s*·\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .trim();
  const words = line.replace(/[^\p{L}]/gu, '');
  if (words && words === words.toUpperCase()) return line.charAt(0) + line.slice(1).toLowerCase();
  return line;
}

/** Reads objectives, guide hints and fight cues aloud for players who do not read fluently yet. */
export class Narrator {
  enabled = true;
  muted = false;
  volume = 1;

  private readonly spokenAt = new Map<string, number>();

  constructor(
    private readonly voice: Voice | null = browserVoice(),
    private readonly now: () => number = () => performance.now() / 1000,
  ) {}

  get supported(): boolean {
    return this.voice !== null;
  }

  /** Cuts whatever is still being read: the newest line is the one that matters. */
  say(text: string | null | undefined, repeatAfter = REPEAT_SECONDS): boolean {
    if (!text || !this.enabled || this.muted || this.volume <= 0 || !this.voice) return false;
    const line = spokenText(text);
    if (!line) return false;
    const now = this.now();
    const last = this.spokenAt.get(line);
    if (last !== undefined && now - last < repeatAfter) return false;
    this.spokenAt.set(line, now);
    this.voice.cancel();
    this.voice.speak(line, this.volume);
    return true;
  }

  stop(): void {
    this.voice?.cancel();
  }
}
