import * as Tone from 'tone';
import { AudioEngine } from './audioEngine';

/**
 * Jam Room backing (SPEC section 10): grooves the app makes from the chosen progression (drums + bass, no downloads,
 * any key or tempo), and the teacher's own audio tracks (`src/data/tracks.json`, loaded only when picked). Everything
 * goes through one Backing fader (and meter), separate from the piano. Nothing is created until the Jam Room starts one.
 */

/** One bar of a groove in 16th notes (0-15). Bass steps say which note: R = root, 5 = fifth, O = root an octave up. */
export interface GrooveStyle {
  id: string;
  name: string;
  bpm: number;
  kick: number[];
  snare: number[];
  hat: number[];
  bass: [number, 'R' | '5' | 'O'][];
  /** Push every second 8th note late (0 = straight, 0.33 = a lazy lo-fi swing), in parts of a 16th. */
  swing?: number;
}

export const GROOVES: GrooveStyle[] = [
  { id: 'pop', name: 'Pop', bpm: 96, kick: [0, 6, 8], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14], bass: [[0, 'R'], [6, 'R'], [8, 'R'], [14, '5']] },
  { id: 'rock', name: 'Rock', bpm: 110, kick: [0, 8, 10], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14], bass: [[0, 'R'], [2, 'R'], [4, 'R'], [6, 'R'], [8, 'R'], [10, 'R'], [12, 'R'], [14, 'R']] },
  { id: 'ballad', name: 'Ballad', bpm: 70, kick: [0, 10], snare: [8], hat: [0, 4, 8, 12], bass: [[0, 'R'], [8, '5']] },
  { id: 'funk', name: 'Funk', bpm: 100, kick: [0, 3, 10], snare: [4, 12], hat: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], bass: [[0, 'R'], [3, 'O'], [6, 'R'], [10, '5'], [14, 'R']] },
  { id: 'lofi', name: 'Lo-fi', bpm: 80, kick: [0, 7, 10], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14], bass: [[0, 'R'], [10, 'R']], swing: 0.33 },
  { id: 'click', name: 'Just the beat (clicks)', bpm: 80, kick: [], snare: [], hat: [], bass: [] },
];

/** A teacher's audio track (`src/data/tracks.json`). The file lives in `public/tracks/`. */
export interface BackingTrack {
  id: string;
  title: string;
  /** e.g. "/tracks/pop-in-c.mp3" */
  url: string;
  bpm: number;
  key: string;
  mode: 'major' | 'minor';
  /** Numerals, one per bar, repeating (e.g. ["I","V","vi","IV"]). */
  progression: string[];
  /** Seconds from the start of the file to the first downbeat. */
  offset?: number;
}

export class Groove {
  private static inst: Groove | null = null;
  static get() {
    return (Groove.inst ??= new Groove());
  }
  /** Made yet? (Only when the Jam Room first plays something.) */
  static isMade() {
    return Groove.inst !== null;
  }

  readonly out = new Tone.Gain(0.8);
  readonly meter = new Tone.Meter({ smoothing: 0.85 });
  private kick = new Tone.MembraneSynth({ pitchDecay: 0.04, octaves: 6, envelope: { attack: 0.001, decay: 0.35, sustain: 0 } });
  private snare = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.16, sustain: 0 } });
  private snareFilter = new Tone.Filter(1400, 'highpass');
  private hat = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.035, sustain: 0 } });
  private hatFilter = new Tone.Filter(8000, 'highpass');
  private bass = new Tone.MonoSynth({
    oscillator: { type: 'sawtooth' },
    filter: { Q: 1, type: 'lowpass' },
    envelope: { attack: 0.005, decay: 0.2, sustain: 0.6, release: 0.15 },
    filterEnvelope: { attack: 0.005, decay: 0.15, sustain: 0.3, release: 0.2, baseFrequency: 120, octaves: 2.5 },
  });
  private player: Tone.Player | null = null;
  private playerUrl = '';
  private timer = 0;
  private running = false;
  /** Audio-clock time of the first downbeat, and seconds per beat. */
  private t0 = 0;
  private spb = 0.75;

  private constructor() {
    this.kick.volume.value = -4;
    this.snare.volume.value = -12;
    this.hat.volume.value = -24;
    this.bass.volume.value = -10;
    this.kick.connect(this.out);
    this.snare.chain(this.snareFilter, this.out);
    this.hat.chain(this.hatFilter, this.out);
    this.bass.connect(this.out);
    this.out.connect(this.meter);
    this.out.toDestination();
  }

  /** Backing fader, 0-1.5 (squared, like the metronome's volume). */
  setLevel(v: number) {
    this.out.gain.value = 0.8 * v * v;
  }
  /** Backing level for the meter, 0-1. */
  level(): number {
    const db = this.meter.getValue() as number;
    return Math.max(0, Math.min(1, (db + 48) / 48));
  }

  /**
   * Start an app-made groove: `roots` = each bar's chord root (pitch class), repeating. Starts `lead` seconds from now
   * (a 1-bar count-in of clicks first). Returns when beat 1 of bar 1 will be heard (performance.now() ms).
   */
  startGroove(style: GrooveStyle, bpm: number, roots: number[], lead = 0.3): number {
    this.stop();
    const engine = AudioEngine.get();
    this.spb = 60 / bpm;
    const now = Tone.getContext().currentTime;
    // A bar of clicks to count in, then the groove from beat 1.
    this.t0 = now + lead + 4 * this.spb;
    for (let i = 0; i < 4; i++) engine.clickAt(now + lead + i * this.spb, i);
    this.running = true;
    const sixteenth = this.spb / 4;
    let step = 0; // 16ths scheduled so far
    const pump = () => {
      if (!this.running) return;
      const horizon = Tone.getContext().currentTime + 0.3;
      for (;;) {
        const bar = Math.floor(step / 16);
        const s = step % 16;
        let t = this.t0 + step * sixteenth;
        if (style.swing && s % 4 === 2) t += style.swing * sixteenth;
        if (t > horizon) break;
        if (style.id === 'click') {
          if (s % 4 === 0) engine.clickAt(t, s / 4);
        } else {
          try {
            if (style.kick.includes(s)) this.kick.triggerAttackRelease('C1', '8n', t, 0.9);
            if (style.snare.includes(s)) this.snare.triggerAttackRelease('16n', t, 0.8);
            if (style.hat.includes(s)) this.hat.triggerAttackRelease('32n', t, s % 4 === 0 ? 0.7 : 0.45);
            const b = style.bass.find(([at]) => at === s);
            if (b) {
              const root = roots[bar % roots.length];
              const midi = 36 + root + (b[1] === '5' ? 7 : b[1] === 'O' ? 12 : 0);
              this.bass.triggerAttackRelease(Tone.Frequency(midi, 'midi').toFrequency(), sixteenth * 1.6, t, 0.8);
            }
          } catch {
            /* a note scheduled just as the groove stops: skip it */
          }
        }
        step++;
      }
      this.timer = window.setTimeout(pump, 60);
    };
    pump();
    return engine.audioToPerf(this.t0);
  }

  /** Play one of the teacher's tracks (loaded the first time it's picked). Returns when its first downbeat is heard. */
  async startTrack(track: BackingTrack, lead = 0.3): Promise<number> {
    this.stop();
    if (!this.player || this.playerUrl !== track.url) {
      this.player?.dispose();
      this.player = new Tone.Player().connect(this.out);
      await this.player.load(track.url);
      this.playerUrl = track.url;
    }
    this.spb = 60 / track.bpm;
    const start = Tone.getContext().currentTime + lead;
    this.player.start(start);
    this.running = true;
    this.t0 = start + (track.offset ?? 0);
    return AudioEngine.get().audioToPerf(this.t0);
  }

  stop() {
    this.running = false;
    window.clearTimeout(this.timer);
    try {
      this.player?.stop();
    } catch {
      /* not playing */
    }
    this.bass.triggerRelease();
  }

  /** Where the music is now: beats since beat 1 of bar 1 (negative during the count-in), on the audio clock as heard. */
  beatsNow(): number {
    if (!this.running) return -Infinity;
    const heard = Tone.getContext().currentTime - AudioEngine.get().outputDelayMs() / 1000;
    return (heard - this.t0) / this.spb;
  }

  get isRunning() {
    return this.running;
  }
}
