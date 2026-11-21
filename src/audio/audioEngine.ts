import * as Tone from 'tone';
import { SubtractiveEngine } from './synthEngine';
import { SynthParams } from '../types';
import { SYNTH_KEYS_BRIGHT, SYNTH_KEYS_WARM } from '../data/defaults';
import { noteName } from '../utils/music';

/**
 * PianoLab's sound engine. One instrument is "current"; each sound loads ONLY when picked (SPEC section 13),
 * and only the range a 25-key view needs, so the app stays light on a Chromebook.
 *
 * Signal path:  instrument -> bus -> EQ -> compressor -> reverb mix -> master -> speakers
 * The metronome goes straight to master so the Mix panel never changes its level.
 */

export type SoundKind = 'accurate' | 'salamander' | 'splendid' | 'felt' | 'rhodes' | 'synthWarm' | 'synthBright';
export type LoadState = 'idle' | 'loading' | 'ready' | 'error';

export interface SoundDef {
  id: string;
  kind: SoundKind;
  category: 'Grand Piano' | 'Electric Piano' | 'Felt Piano' | 'Synth Keys';
  label: string;
  note?: string;
}

export const SOUNDS: SoundDef[] = [
  { id: 'accurate', kind: 'accurate', category: 'Grand Piano', label: 'Accurate-Salamander', note: 'Remastered Salamander Grand, CC-BY 3.0' },
  { id: 'salamander', kind: 'salamander', category: 'Grand Piano', label: 'Salamander Grand', note: 'Yamaha C5, CC-BY 3.0 (Tone.js version)' },
  { id: 'splendid', kind: 'splendid', category: 'Grand Piano', label: 'Splendid Grand', note: 'Steinway, via smplr' },
  { id: 'rhodes', kind: 'rhodes', category: 'Electric Piano', label: 'Rhodes (jRhodes3d)', note: 'Rhodes Mark I, CC BY-NC 4.0' },
  { id: 'felt', kind: 'felt', category: 'Felt Piano', label: 'Felt Piano', note: 'Accurate-Salamander, soft layer, through a low-pass' },
  { id: 'synth-warm', kind: 'synthWarm', category: 'Synth Keys', label: 'Synth Keys: Warm', note: 'SynthLab engine' },
  { id: 'synth-bright', kind: 'synthBright', category: 'Synth Keys', label: 'Synth Keys: Bright', note: 'SynthLab engine' },
];

export type MetroSound = 'wood' | 'windup' | 'click';
export const METRO_SOUNDS: { id: MetroSound; label: string }[] = [
  { id: 'wood', label: 'Wood block' },
  { id: 'windup', label: 'Wind-up (tick-tock)' },
  { id: 'click', label: 'Plain click' },
];

export const DEFAULT_SOUND = 'synth-warm';

const SALAMANDER_URL = 'https://tonejs.github.io/audio/salamander/';
/** Every minor third from C2 to C6: covers a 25-key view shifted two octaves either way, with one velocity layer. */
const SALAMANDER_FILES: Record<string, string> = {};
for (const oct of [2, 3, 4, 5]) {
  for (const [n, f] of [['C', 'C'], ['D#', 'Ds'], ['F#', 'Fs'], ['A', 'A']] as const) SALAMANDER_FILES[`${n}${oct}`] = `${f}${oct}.mp3`;
}
SALAMANDER_FILES['C6'] = 'C6.mp3';

/** The Rhodes files live in /public/samples/jrhodes3d (a reduced copy of jRhodes3d, ~0.8 MB), so they load from our own site. */
const RHODES_URL = `${import.meta.env.BASE_URL}samples/jrhodes3d/`;
const RHODES_ROOTS = [40, 45, 50, 55, 59, 62, 65, 71, 76, 81, 86];
/** Accurate-Salamander: a reduced copy (C2-C6 every minor third, 5 velocity layers, ~8.5 MB) hosted with the app. */
const ACCURATE_URL = `${import.meta.env.BASE_URL}samples/accurate-salamander/`;
const ACCURATE_LAYERS = [5, 7, 9, 12, 15]; // of the original 16, softest to hardest
const ACCURATE_ROOTS = [...Array.from({ length: 16 }, (_, i) => 36 + i * 3), 84];

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
  // Wood-block style metronome: a short pitched "tok" plus a tiny filtered noise tick.
  private wood = new Tone.MembraneSynth({ pitchDecay: 0.004, octaves: 1.2, envelope: { attack: 0.0005, decay: 0.07, sustain: 0, release: 0.02 } });
  private woodNoise = new Tone.NoiseSynth({ noise: { type: 'pink' }, envelope: { attack: 0.0005, decay: 0.025, sustain: 0, release: 0.01 } });
  private woodFilter = new Tone.Filter(2400, 'bandpass');
  private metroKind: MetroSound = 'wood';
  /** Metronome volume, separate from the Mix panel. */
  private metroGain = new Tone.Gain(0.8);
  private click = new Tone.MembraneSynth({ pitchDecay: 0.008, octaves: 2, envelope: { attack: 0.001, decay: 0.08, sustain: 0, release: 0.05 } });
  /** A separate click for latency calibration, so it never collides with the metronome's schedule. */
  private calClick = new Tone.MembraneSynth({ pitchDecay: 0.008, octaves: 2, envelope: { attack: 0.001, decay: 0.08, sustain: 0, release: 0.05 } });

  private voices = new Map<string, Voice>();
  private loading = new Map<string, Promise<void>>();
  private synthEngine: SubtractiveEngine | null = null;
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
    this.metroGain.connect(this.master);
    this.click.connect(this.metroGain);
    this.calClick.volume.value = -8;
    this.calClick.connect(this.master);
    this.wood.volume.value = -4;
    this.wood.connect(this.metroGain);
    this.woodNoise.volume.value = -14;
    this.woodNoise.chain(this.woodFilter, this.metroGain);
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
        return this.buildSampler(false);
      case 'felt':
        return this.buildFelt();
      case 'rhodes':
        return this.buildLayered(RHODES_URL, RHODES_ROOTS, [2, 4], 0.8, this.bus);
      case 'accurate':
        return this.buildLayered(ACCURATE_URL, ACCURATE_ROOTS, ACCURATE_LAYERS, 1.2, this.bus);
      case 'splendid':
        return this.buildSplendid();
      case 'synthWarm':
        return this.buildSynth(SYNTH_KEYS_WARM);
      case 'synthBright':
        return this.buildSynth(SYNTH_KEYS_BRIGHT);
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

  /** A sampler with several velocity layers (softest first). Files are `<midi>_<layer>.mp3`. Harder playing picks a louder layer. */
  private async buildLayered(url: string, roots: number[], layers: number[], release: number, out: Tone.ToneAudioNode): Promise<Voice> {
    const make = (layer: number) =>
      new Promise<Tone.Sampler>((resolve, reject) => {
        const urls: Record<string, string> = {};
        for (const m of roots) urls[noteName(m)] = `${m}_${layer}.mp3`;
        const sampler = new Tone.Sampler({
          urls,
          baseUrl: url,
          release,
          onload: () => resolve(sampler),
          onerror: (e) => reject(e instanceof Error ? e : new Error('sample files did not load')),
        }).connect(out);
      });
    const samplers = await Promise.all(layers.map(make));
    const used = new Map<number, Tone.Sampler>();
    return {
      on: (midi, vel) => {
        // Split the 0-1 velocity range evenly across the layers.
        const s = samplers[Math.min(samplers.length - 1, Math.floor(Math.max(0, vel) * samplers.length))];
        used.set(midi, s);
        s.triggerAttack(noteName(midi), Tone.now(), vel);
      },
      off: (midi) => {
        used.get(midi)?.triggerRelease(noteName(midi), Tone.now());
        used.delete(midi);
      },
      allOff: () => {
        samplers.forEach((x) => x.releaseAll());
        used.clear();
      },
      dispose: () => samplers.forEach((x) => x.dispose()),
    };
  }

  /** Felt: Accurate-Salamander's soft layer through a low-pass, a little quieter. */
  private buildFelt(): Promise<Voice> {
    const lp = new Tone.Filter(1400, 'lowpass');
    const level = new Tone.Gain(0.85);
    lp.chain(level, this.bus);
    return this.buildLayered(ACCURATE_URL, ACCURATE_ROOTS, [7], 1.4, lp);
  }

  /** Splendid Grand (Steinway) from smplr. smplr is loaded only when this sound is picked. */
  private async buildSplendid(): Promise<Voice> {
    const { SplendidGrandPiano } = await import('smplr');
    const ctx = Tone.getContext().rawContext as unknown as BaseAudioContext;
    const destination = (this.bus as unknown as { input: AudioNode }).input;
    const inst = SplendidGrandPiano(ctx, { destination, notesToLoad: { notes: Array.from({ length: 61 }, (_, i) => 36 + i), velocityRange: [1, 127] } });
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
        stops.forEach((x) => x());
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

  // ---------- Playing ----------
  /** Synth voices share one engine; re-apply the right patch before a note if the sound changed. */
  private prepareSynth() {
    const kind = SOUNDS.find((s) => s.id === this.currentId)?.kind;
    if (!this.synthEngine) return;
    if (kind === 'synthWarm') this.synthEngine.applyParams(SYNTH_KEYS_WARM);
    else if (kind === 'synthBright') this.synthEngine.applyParams(SYNTH_KEYS_BRIGHT);
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
  setMetronome(on: boolean, bpm = 80, kind: MetroSound = this.metroKind) {
    this.metroKind = kind;
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
      this.tick(this.metroKind, beat, time);
      beat++;
    }, '4n');
    t.start();
  }

  /** Change tempo without restarting the beat. */
  setTempo(bpm: number) {
    Tone.getTransport().bpm.value = bpm;
  }

  /** 0 (silent) to 1 (full). */
  setMetroVolume(v: number) {
    this.metroGain.gain.value = Math.max(0, Math.min(1, v));
  }

  /** One metronome beat. Beat 0 of each bar is accented. */
  private tick(kind: MetroSound, beat: number, time: number) {
    try {
      if (kind === 'click') {
        this.click.triggerAttackRelease(beat % 4 === 0 ? 'G5' : 'C5', '32n', time);
        return;
      }
      const accent = beat % 4 === 0;
      if (kind === 'wood') this.wood.triggerAttackRelease(accent ? 1500 : 1050, '64n', time, accent ? 1 : 0.7);
      else this.wood.triggerAttackRelease(beat % 2 === 0 ? 880 : 600, '32n', time, 0.9); // wind-up: high "tick", lower "tock"
      this.woodNoise.triggerAttackRelease('64n', time, accent ? 0.9 : 0.5);
    } catch {
      /* a preview and the running metronome can overlap for a moment; skip that one tick */
    }
  }

  /** Let the student hear a metronome sound without starting the metronome. */
  previewMetro(kind: MetroSound) {
    const now = Tone.now();
    this.tick(kind, 0, now + 0.02);
    this.tick(kind, 1, now + 0.42);
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
