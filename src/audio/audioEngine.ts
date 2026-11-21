import * as Tone from 'tone';
import { SubtractiveEngine } from './synthEngine';
import { SynthParams } from '../types';
import { DEFAULT_SYNTH_PARAMS, SYNTH_KEYS_BRIGHT, SYNTH_KEYS_WARM } from '../data/defaults';
import { noteName } from '../utils/music';

/**
 * PianoLab's sound engine. One instrument is "current"; each sound loads ONLY when picked (SPEC section 13),
 * and only the range a 25-key view needs, so the app stays light on a Chromebook.
 *
 * Signal path:  instrument -> bus -> EQ -> compressor -> reverb mix -> master -> speakers
 * The metronome goes straight to master so the Mix panel never changes its level.
 */

export type SoundKind = 'salamander' | 'felt' | 'splendid' | 'smplrEP' | 'synthWarm' | 'synthBright' | 'synthlab';
export type LoadState = 'idle' | 'loading' | 'ready' | 'error';

export interface SoundDef {
  id: string;
  kind: SoundKind;
  category: 'Grand Piano' | 'Electric Piano' | 'Felt Piano' | 'Synth Keys' | 'SynthLab patch';
  label: string;
  note?: string;
  /** Shown only in the teacher "Compare versions" box. */
  compareOnly?: boolean;
}

export const SOUNDS: SoundDef[] = [
  { id: 'salamander', kind: 'salamander', category: 'Grand Piano', label: 'Salamander Grand', note: 'Yamaha C5, CC-BY 3.0' },
  { id: 'splendid', kind: 'splendid', category: 'Grand Piano', label: 'Splendid Grand', note: 'Steinway, via smplr' },
  { id: 'smplr-ep', kind: 'smplrEP', category: 'Electric Piano', label: 'Electric Piano (smplr)', note: 'Rhodes-style, via smplr' },
  { id: 'felt', kind: 'felt', category: 'Felt Piano', label: 'Felt Piano', note: 'Salamander through a soft low-pass' },
  { id: 'synth-warm', kind: 'synthWarm', category: 'Synth Keys', label: 'Synth Keys: Warm', note: 'SynthLab engine' },
  { id: 'synth-bright', kind: 'synthBright', category: 'Synth Keys', label: 'Synth Keys: Bright', note: 'SynthLab engine' },
  { id: 'synthlab', kind: 'synthlab', category: 'SynthLab patch', label: 'My SynthLab patch', note: 'Paste a patch code' },
];

/** Versions in the SPEC that are not wired up yet because they need sample files hosted somewhere. */
export const NOT_WIRED_YET = [
  { label: 'Accurate-Salamander (remastered)', why: 'needs the remastered samples hosted' },
  { label: 'jRhodes3d (Rhodes Mark I, CC-BY-NC)', why: 'needs the samples hosted' },
];

export const DEFAULT_SOUND = 'synth-warm';

const SALAMANDER_URL = 'https://tonejs.github.io/audio/salamander/';
/** Every minor third from C2 to C6: covers a 25-key view shifted two octaves either way, with one velocity layer. */
const SALAMANDER_FILES: Record<string, string> = {};
for (const oct of [2, 3, 4, 5]) {
  for (const [n, f] of [['C', 'C'], ['D#', 'Ds'], ['F#', 'Fs'], ['A', 'A']] as const) SALAMANDER_FILES[`${n}${oct}`] = `${f}${oct}.mp3`;
}
SALAMANDER_FILES['C6'] = 'C6.mp3';

interface Voice {
  on(midi: number, velocity: number): void;
  off(midi: number): void;
  allOff(): void;
  dispose(): void;
}

export class AudioEngine {
  private static inst: AudioEngine | null = null;
  static get(): AudioEngine {
    return (AudioEngine.inst ??= new AudioEngine());
  }

  readonly bus = new Tone.Gain(1);
  private eq = new Tone.EQ3({ low: 0, mid: 0, high: 0, lowFrequency: 250, highFrequency: 3000 });
  private comp = new Tone.Compressor({ threshold: 0, ratio: 1, attack: 0.01, release: 0.2 });
  private reverb = new Tone.Reverb({ decay: 1.5, preDelay: 0.01, wet: 1 });
  private reverbTone = new Tone.Filter(8000, 'lowpass');
  private dry = new Tone.Gain(1);
  private wet = new Tone.Gain(0);
  private master = new Tone.Gain(0.9);
  private click = new Tone.MembraneSynth({ pitchDecay: 0.008, octaves: 2, envelope: { attack: 0.001, decay: 0.08, sustain: 0, release: 0.05 } });
  /** A separate click for latency calibration, so it never collides with the metronome's schedule. */
  private calClick = new Tone.MembraneSynth({ pitchDecay: 0.008, octaves: 2, envelope: { attack: 0.001, decay: 0.08, sustain: 0, release: 0.05 } });

  private voices = new Map<string, Voice>();
  private loading = new Map<string, Promise<void>>();
  private synthEngine: SubtractiveEngine | null = null;
  private synthlabParams: SynthParams | null = null;
  private currentId = '';
  private metroEvent: number | null = null;

  onState?: (id: string, state: LoadState, message?: string) => void;
  states: Record<string, LoadState> = {};

  private constructor() {
    this.bus.chain(this.eq, this.comp);
    this.comp.connect(this.dry);
    this.comp.connect(this.reverb);
    this.reverb.chain(this.reverbTone, this.wet);
    this.dry.connect(this.master);
    this.wet.connect(this.master);
    this.master.toDestination();
    this.click.volume.value = -8;
    this.click.connect(this.master);
    this.calClick.volume.value = -8;
    this.calClick.connect(this.master);
  }

  get current() {
    return this.currentId;
  }

  /** Must run from a click or key press (browsers block audio until the student interacts). */
  async unlock() {
    if (Tone.getContext().state !== 'running') await Tone.start();
  }

  private setState(id: string, s: LoadState, msg?: string) {
    this.states[id] = s;
    this.onState?.(id, s, msg);
  }

  /** Pick a sound. Loads it the first time. If it can't load (offline), falls back to Synth Keys: Warm. */
  async select(id: string): Promise<void> {
    const def = SOUNDS.find((s) => s.id === id);
    if (!def) return;
    this.allOff();
    this.currentId = id;
    try {
      await this.load(def);
    } catch (e) {
      this.setState(id, 'error', e instanceof Error ? e.message : 'could not load');
      if (id !== DEFAULT_SOUND) {
        this.currentId = DEFAULT_SOUND;
        await this.load(SOUNDS.find((s) => s.id === DEFAULT_SOUND)!);
      }
    }
  }

  private load(def: SoundDef): Promise<void> {
    if (this.voices.has(def.id)) return Promise.resolve();
    const pending = this.loading.get(def.id);
    if (pending) return pending;
    this.setState(def.id, 'loading');
    const p = this.build(def)
      .then((v) => {
        this.voices.set(def.id, v);
        this.setState(def.id, 'ready');
      })
      .finally(() => this.loading.delete(def.id));
    this.loading.set(def.id, p);
    return p;
  }

  private async build(def: SoundDef): Promise<Voice> {
    switch (def.kind) {
      case 'salamander':
      case 'felt':
        return this.buildSampler(def.kind === 'felt');
      case 'splendid':
      case 'smplrEP':
        return this.buildSmplr(def.kind);
      case 'synthWarm':
        return this.buildSynth(SYNTH_KEYS_WARM);
      case 'synthBright':
        return this.buildSynth(SYNTH_KEYS_BRIGHT);
      case 'synthlab':
        return this.buildSynth(this.synthlabParams ?? DEFAULT_SYNTH_PARAMS);
    }
  }

  private buildSampler(felt: boolean): Promise<Voice> {
    return new Promise((resolve, reject) => {
      const out = new Tone.Gain(felt ? 0.8 : 1);
      let tail: Tone.ToneAudioNode = out;
      if (felt) {
        // A darker, softer tone: low-pass plus a little taken off the highs.
        const lp = new Tone.Filter(1400, 'lowpass');
        out.chain(lp, this.bus);
        tail = lp;
      } else out.connect(this.bus);
      void tail;
      const sampler = new Tone.Sampler({
        urls: SALAMANDER_FILES,
        baseUrl: SALAMANDER_URL,
        release: felt ? 1.2 : 1,
        onload: () => resolve(samplerVoice(sampler)),
        onerror: (e) => reject(e instanceof Error ? e : new Error('sample files did not load')),
      }).connect(out);
    });
  }

  private async buildSmplr(kind: 'splendid' | 'smplrEP'): Promise<Voice> {
    // smplr is loaded only when one of its sounds is picked, so it never slows the first page load.
    const { SplendidGrandPiano, ElectricPiano } = await import('smplr');
    const ctx = Tone.getContext().rawContext as unknown as BaseAudioContext;
    const destination = (this.bus as unknown as { input: AudioNode }).input;
    const inst =
      kind === 'splendid'
        ? SplendidGrandPiano(ctx, { destination, notesToLoad: { notes: Array.from({ length: 61 }, (_, i) => 36 + i), velocityRange: [1, 127] } })
        : ElectricPiano(ctx, { instrument: 'CP80', destination });
    await inst.ready;
    const stops = new Map<number, () => void>();
    return {
      on: (midi, vel) => {
        stops.get(midi)?.();
        stops.set(midi, inst.start({ note: midi, velocity: Math.max(1, Math.round(vel * 127)) }) as () => void);
      },
      off: (midi) => {
        stops.get(midi)?.();
        stops.delete(midi);
      },
      allOff: () => {
        stops.forEach((s) => s());
        stops.clear();
      },
      dispose: () => inst.dispose(),
    };
  }

  private async buildSynth(params: SynthParams): Promise<Voice> {
    const eng = (this.synthEngine ??= SubtractiveEngine.getInstance(params));
    eng.setOutput(this.bus);
    eng.applyParams(params);
    return {
      on: (midi, vel) => eng.noteOn(noteName(midi), vel),
      off: (midi) => eng.noteOff(noteName(midi)),
      allOff: () => eng.allNotesOff(),
      dispose: () => {},
    };
  }

  /** Load a SynthLab patch and make it the current sound. */
  async useSynthlabPatch(params: SynthParams) {
    this.synthlabParams = params;
    this.voices.delete('synthlab');
    await this.select('synthlab');
  }

  // ---------- Playing ----------
  /** Synth voices share one engine; re-apply the right patch before a note if the sound changed. */
  private prepareSynth() {
    const kind = SOUNDS.find((s) => s.id === this.currentId)?.kind;
    if (!this.synthEngine) return;
    if (kind === 'synthWarm') this.synthEngine.applyParams(SYNTH_KEYS_WARM);
    else if (kind === 'synthBright') this.synthEngine.applyParams(SYNTH_KEYS_BRIGHT);
    else if (kind === 'synthlab') this.synthEngine.applyParams(this.synthlabParams ?? DEFAULT_SYNTH_PARAMS);
  }

  noteOn(midi: number, velocity = 0.8) {
    const v = this.voices.get(this.currentId) ?? this.voices.get(DEFAULT_SOUND);
    if (!v) return;
    this.prepareSynth();
    v.on(midi, velocity);
  }

  noteOff(midi: number) {
    (this.voices.get(this.currentId) ?? this.voices.get(DEFAULT_SOUND))?.off(midi);
  }

  allOff() {
    this.voices.forEach((v) => v.allOff());
  }

  /** The app plays notes for the student (Learn demos). */
  async playDemo(notes: number[], gapMs = 520, onStep?: (midi: number | null) => void) {
    await this.unlock();
    for (const n of notes) {
      onStep?.(n);
      this.noteOn(n, 0.75);
      await new Promise((r) => setTimeout(r, gapMs * 0.8));
      this.noteOff(n);
      await new Promise((r) => setTimeout(r, gapMs * 0.2));
    }
    onStep?.(null);
  }

  // ---------- Mix panel (one-knob EQ, one-knob compressor, reverb) ----------
  /** -1 (darker) .. +1 (brighter). */
  setEq(v: number) {
    this.eq.low.value = -v * 6;
    this.eq.high.value = v * 8;
  }
  /** 0 (off) .. 1 (squashed). */
  setComp(v: number) {
    this.comp.threshold.value = -v * 30;
    this.comp.ratio.value = 1 + v * 7;
    this.master.gain.value = 0.9 * (1 + v * 0.35); // a little make-up gain so it doesn't just get quieter
  }
  /** Length in seconds (0.3 - 6), Color 0 (dark) - 1 (bright), Mix 0 - 1. */
  setReverb(length: number, color: number, mix: number) {
    this.reverb.decay = Math.max(0.3, length);
    void this.reverb.generate();
    this.reverbTone.frequency.value = 800 * Math.pow(20, color); // 800 Hz .. 16 kHz
    this.wet.gain.value = mix;
    this.dry.gain.value = 1 - mix * 0.4;
  }

  // ---------- Metronome ----------
  setMetronome(on: boolean, bpm = 80) {
    const t = Tone.getTransport();
    if (this.metroEvent !== null) {
      t.clear(this.metroEvent);
      this.metroEvent = null;
    }
    if (!on) {
      t.stop();
      return;
    }
    t.bpm.value = bpm;
    let beat = 0;
    this.metroEvent = t.scheduleRepeat((time) => {
      this.click.triggerAttackRelease(beat % 4 === 0 ? 'G5' : 'C5', '32n', time);
      beat++;
    }, '4n');
    t.start();
  }

  /** Schedule clicks for latency calibration. Returns the audio-clock time of each click. */
  scheduleClicks(count: number, bpm: number, lead = 0.6): number[] {
    const start = Tone.now() + lead;
    const gap = 60 / bpm;
    const times = Array.from({ length: count }, (_, i) => start + i * gap);
    times.forEach((t, i) => this.calClick.triggerAttackRelease(i % 4 === 0 ? 'G5' : 'C5', '32n', t));
    return times;
  }

  now() {
    return Tone.now();
  }
}

function samplerVoice(s: Tone.Sampler): Voice {
  return {
    on: (midi, vel) => s.triggerAttack(noteName(midi), Tone.now(), vel),
    off: (midi) => s.triggerRelease(noteName(midi), Tone.now()),
    allOff: () => s.releaseAll(),
    dispose: () => s.dispose(),
  };
}
