export type SfxName =
  | 'break'
  | 'place'
  | 'hit'
  | 'hurt'
  | 'step'
  | 'slam'
  | 'roar'
  | 'summon'
  | 'explode'
  | 'stagger'
  | 'victory'
  | 'death'
  | 'eat'
  | 'splash';

/**
 * Tiny synthesised sound bank. Everything is generated with oscillators and
 * filtered noise so the project ships without audio files.
 */
export class Sfx {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private ambient: {
    surface: GainNode;
    cave: GainNode;
    boss: GainNode;
  } | null = null;

  muted = false;
  /** Linear master level, 0–1. The previous hardcoded gain was 0.45. */
  volume = 0.45;

  /** Must be called from a user gesture before the first sound. */
  resume(): void {
    if (!this.context) {
      const AudioContextClass =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return;

      this.context = new AudioContextClass();
      this.master = this.context.createGain();
      this.master.connect(this.context.destination);
      this.noiseBuffer = this.createNoiseBuffer(this.context);
      this.applyGain();
      this.startAmbient(this.context, this.master);
    }

    if (this.context.state === 'suspended') void this.context.resume();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.applyGain();
  }

  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    this.applyGain();
  }

  private applyGain(): void {
    if (this.master) this.master.gain.value = this.muted ? 0 : this.volume;
  }

  /**
   * Crossfades looping beds. `surface` / `cave` / `boss` are 0–1 weights;
   * they sit under the one-shot bank so a slam still cuts through.
   */
  setAmbience(surface: number, cave: number, boss: number): void {
    if (!this.ambient) return;
    this.ambient.surface.gain.value = Math.max(0, surface) * 0.045;
    this.ambient.cave.gain.value = Math.max(0, cave) * 0.07;
    this.ambient.boss.gain.value = Math.max(0, boss) * 0.09;
  }

  play(name: SfxName): void {
    if (this.muted || !this.context || !this.master) return;
    const now = this.context.currentTime;

    switch (name) {
      case 'break':
        this.noise(now, 0.18, 0.5, 1800, 400);
        break;
      case 'place':
        this.tone(now, 'square', 220, 160, 0.1, 0.2);
        break;
      case 'hit':
        this.tone(now, 'square', 340, 120, 0.09, 0.28);
        this.noise(now, 0.1, 0.25, 2400, 900);
        break;
      case 'hurt':
        this.tone(now, 'sawtooth', 200, 90, 0.28, 0.3);
        break;
      case 'step':
        this.noise(now, 0.07, 0.12, 900, 300);
        break;
      case 'slam':
        this.tone(now, 'sine', 110, 32, 0.7, 0.75);
        this.noise(now, 0.5, 0.5, 700, 120);
        break;
      case 'roar':
        this.tone(now, 'sawtooth', 90, 55, 1.4, 0.5);
        this.tone(now + 0.05, 'square', 60, 40, 1.2, 0.3);
        break;
      case 'summon':
        this.tone(now, 'triangle', 300, 900, 0.7, 0.35);
        break;
      case 'explode':
        this.noise(now, 0.7, 0.6, 500, 80);
        this.tone(now, 'sine', 140, 40, 0.5, 0.5);
        break;
      case 'stagger':
        this.tone(now, 'triangle', 520, 180, 0.5, 0.3);
        break;
      case 'victory':
        this.tone(now, 'triangle', 392, 392, 0.35, 0.32);
        this.tone(now + 0.18, 'triangle', 523, 523, 0.35, 0.32);
        this.tone(now + 0.36, 'triangle', 659, 659, 0.7, 0.32);
        break;
      case 'death':
        this.tone(now, 'sawtooth', 240, 60, 1.1, 0.35);
        break;
      case 'eat':
        this.noise(now, 0.12, 0.18, 1400, 500);
        this.tone(now, 'triangle', 220, 340, 0.16, 0.22);
        break;
      case 'splash':
        this.noise(now, 0.26, 0.32, 1600, 280);
        this.tone(now, 'sine', 210, 80, 0.18, 0.14);
        break;
    }
  }

  private tone(
    start: number,
    type: OscillatorType,
    from: number,
    to: number,
    duration: number,
    gain: number,
  ): void {
    const context = this.context;
    const master = this.master;
    if (!context || !master) return;

    const oscillator = context.createOscillator();
    const envelope = context.createGain();

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(from, start);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, to), start + duration);

    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(gain, start + 0.012);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    oscillator.connect(envelope).connect(master);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.05);
  }

  private noise(
    start: number,
    duration: number,
    gain: number,
    filterFrom: number,
    filterTo: number,
  ): void {
    const context = this.context;
    const master = this.master;
    if (!context || !master || !this.noiseBuffer) return;

    const source = context.createBufferSource();
    source.buffer = this.noiseBuffer;

    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(filterFrom, start);
    filter.frequency.exponentialRampToValueAtTime(Math.max(60, filterTo), start + duration);

    const envelope = context.createGain();
    envelope.gain.setValueAtTime(gain, start);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    source.connect(filter).connect(envelope).connect(master);
    source.start(start);
    source.stop(start + duration + 0.05);
  }

  private createNoiseBuffer(context: AudioContext): AudioBuffer {
    const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  private startAmbient(context: AudioContext, master: GainNode): void {
    if (this.ambient || !this.noiseBuffer) return;

    const surface = context.createGain();
    const cave = context.createGain();
    const boss = context.createGain();
    surface.gain.value = 0;
    cave.gain.value = 0;
    boss.gain.value = 0;
    surface.connect(master);
    cave.connect(master);
    boss.connect(master);

    this.loopNoise(context, surface, 900, 280);
    this.loopTone(context, surface, 'triangle', 196, 0.18);
    this.loopTone(context, cave, 'sine', 48, 0.55);
    this.loopTone(context, cave, 'sine', 72, 0.28);
    this.loopNoise(context, cave, 220, 70);
    this.loopTone(context, boss, 'sawtooth', 36, 0.45);
    this.loopTone(context, boss, 'triangle', 55, 0.35);
    this.loopTone(context, boss, 'sine', 82, 0.2);

    this.ambient = { surface, cave, boss };
  }

  private loopNoise(context: AudioContext, dest: GainNode, from: number, to: number): void {
    if (!this.noiseBuffer) return;
    const source = context.createBufferSource();
    source.buffer = this.noiseBuffer;
    source.loop = true;

    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = from;
    filter.Q.value = 0.7;

    const lfo = context.createOscillator();
    const lfoGain = context.createGain();
    lfo.type = 'sine';
    lfo.frequency.value = 0.07;
    lfoGain.gain.value = Math.abs(from - to) * 0.5;
    lfo.connect(lfoGain).connect(filter.frequency);
    filter.frequency.value = (from + to) * 0.5;

    source.connect(filter).connect(dest);
    source.start();
    lfo.start();
  }

  private loopTone(
    context: AudioContext,
    dest: GainNode,
    type: OscillatorType,
    frequency: number,
    gain: number,
  ): void {
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    envelope.gain.value = gain;
    oscillator.connect(envelope).connect(dest);
    oscillator.start();
  }
}
