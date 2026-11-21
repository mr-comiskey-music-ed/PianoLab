import * as Tone from 'tone';
import { SubtractiveEngine } from './synthEngine';
import { SynthParams } from '../types';
import { SYNTH_KEYS_BRIGHT, SYNTH_KEYS_WARM, SYNTH_PAD } from '../data/defaults';
import { noteName } from '../utils/music';

/**
 * PianoLab's sound engine. One instrument is "current"; each sound loads ONLY when picked (SPEC section 13),
 * and only the range a 25-key view needs, so the app stays light on a Chromebook.
 *
 * Signal path:  instrument -> bus -> EQ -> compressor -> reverb mix -> master -> speakers
 * The metronome goes straight to master so the Mix panel never changes its level.
 */

export type SoundKind = 'accurate' | 'soft' | 'rhodes' | 'synthWarm' | 'synthBright' | 'synthPad' | 'synthCustom';
export type LoadState = 'idle' | 'loading' | 'ready' | 'error';

export interface SoundDef {
  id: string;
  kind: SoundKind;
  category: 'Grand Piano' | 'Electric Piano' | 'Soft Piano' | 'Synth Keys';
  label: string;
  note?: string;
}

// Ids are saved in autosaves, so keep them (the Soft Piano's id is still 'felt').
export const SOUNDS: SoundDef[] = [
  { id: 'accurate', kind: 'accurate', category: 'Grand Piano', label: 'Grand Piano', note: 'Accurate-Salamander (Yamaha C5), CC BY 3.0' },
  { id: 'rhodes', kind: 'rhodes', category: 'Electric Piano', label: 'Electric Piano', note: 'Rhodes Mark I (jRhodes3d), CC BY-NC 4.0' },
  { id: 'felt', kind: 'soft', category: 'Soft Piano', label: 'Soft Piano', note: 'Grand Piano, soft and warm, with a little tape hiss and reverb' },
  { id: 'synth-warm', kind: 'synthWarm', category: 'Synth Keys', label: 'Warm', note: 'SynthLab engine' },
  { id: 'synth-bright', kind: 'synthBright', category: 'Synth Keys', label: 'Bright', note: 'SynthLab engine' },
  { id: 'synth-pad', kind: 'synthPad', category: 'Synth Keys', label: 'Pad', note: 'SynthLab engine' },
  { id: 'custom', kind: 'synthCustom', category: 'Synth Keys', label: 'Custom Synth', note: 'Build your own sound with the Modern Synth panel' },
];

export type MetroSound = 'wood' | 'windup' | 'click';

export const DEFAULT_SOUND = 'synth-warm';

/** The Rhodes files live in /public/samples/jrhodes3d (a reduced copy of jRhodes3d, ~0.8 MB), so they load from our own site. */
const RHODES_URL = `${import.meta.env.BASE_URL}samples/jrhodes3d/`;
const RHODES_ROOTS = [40, 45, 50, 55, 59, 62, 65, 71, 76, 81, 86];
const RHODES_LAYERS = [1, 2, 3, 4, 5];
/** The original set is missing some layers on the top notes; those borrow the nearest layer of the SAME note. */
const RHODES_HAS: Record<number, number[]> = { 71: [1, 2, 4, 5], 76: [1, 2, 4, 5], 81: [2, 4, 5], 86: [2, 4, 5] };
const rhodesLayerFor = (midi: number, layer: number) =>
  (RHODES_HAS[midi] ?? RHODES_LAYERS).reduce((a, b) => (Math.abs(b - layer) < Math.abs(a - layer) ? b : a));
/** Accurate-Salamander: a reduced copy (C2-C6 every minor third, 5 velocity layers, ~8.5 MB) hosted with the app. */
const ACCURATE_URL = `${import.meta.env.BASE_URL}samples/accurate-salamander/`;
const ACCURATE_LAYERS = [5, 7, 9, 12, 15]; // of the original 16, softest to hardest
const ACCURATE_ROOTS = [...Array.from({ length: 16 }, (_, i) => 36 + i * 3), 84];

/**
 * Four seconds of very quiet tape hiss with a few soft vinyl crackles, made in code (no file to download). Looped under
 * the Soft Piano. Mostly hiss (about -50 dB), with only a few faint crackles.
 */
function makeHissBuffer(sampleRate: number): Tone.ToneAudioBuffer {
  const n = Math.round(sampleRate * 4);
  const data = new Float32Array(n);
  let lp = 0;
  for (let i = 0; i < n; i++) {
    // White noise through a gentle low-pass: soft "tape" hiss rather than a sharp fizz.
    lp += 0.25 * ((Math.random() * 2 - 1) - lp);
    data[i] = lp * 0.007;
  }
  // Mostly hiss: just a few faint crackles (about 1.5 a second), each a tiny decaying click.
  const crackles = 6;
  for (let c = 0; c < crackles; c++) {
    const at = Math.floor(Math.random() * (n - 400));
    const amp = (0.002 + Math.random() * 0.004) * (Math.random() < 0.5 ? -1 : 1);
    const len = 40 + Math.floor(Math.random() * 160);
    for (let k = 0; k < len; k++) data[at + k] += amp * Math.exp(-k / (len / 5)) * (Math.random() * 2 - 1);
  }
  // Fade the ends together so the loop has no click.
  const edge = Math.round(sampleRate * 0.05);
  for (let i = 0; i < edge; i++) {
    const g = i / edge;
    data[i] *= g;
    data[n - 1 - i] *= g;
  }
  return Tone.ToneAudioBuffer.fromArray(data);
}

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
  /** The student's Custom Synth patch (built in the Modern Synth panel). */
  private customParams: SynthParams = SYNTH_KEYS_WARM;
  private currentId = '';
  /** The sound most recently picked (may still be loading). */
  private wantedId = '';
  /** Which voice started each sounding note, so its release goes to the same instrument. */
  private noteVoice = new Map<number, Voice>();
  /** The synth patch last applied to the shared synth engine. */
  private appliedSynth: string | null = null;
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

  /**
   * Pick a sound. Loads it the first time. The old sound keeps playing until the new one is ready, then held notes are
   * let go and the switch happens (no stuck or mixed-up notes while loading). If it can't load (offline), it stays on
   * the old sound (or Warm, at start-up).
   */
  async select(id: string): Promise<void> {
    const def = SOUNDS.find((s) => s.id === id) ?? SOUNDS.find((s) => s.id === DEFAULT_SOUND)!;
    this.wantedId = def.id;
    try {
      await this.load(def);
    } catch (e) {
      this.setState(def.id, 'error', e instanceof Error ? e.message : 'could not load');
      if (!this.currentId) {
        this.currentId = DEFAULT_SOUND;
        await this.load(SOUNDS.find((s) => s.id === DEFAULT_SOUND)!);
      }
      return;
    }
    // Another sound may have been picked while this one loaded; the last pick wins.
    if (this.wantedId !== def.id) return;
    if (this.currentId !== def.id) {
      this.allOff();
      this.currentId = def.id;
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
      case 'soft':
        return this.buildSoft();
      case 'rhodes':
        return this.buildRhodes();
      case 'accurate':
        return this.buildLayered(ACCURATE_URL, ACCURATE_ROOTS, ACCURATE_LAYERS, 1.2, this.bus);
      case 'synthWarm':
        return this.buildSynth(SYNTH_KEYS_WARM);
      case 'synthBright':
        return this.buildSynth(SYNTH_KEYS_BRIGHT);
      case 'synthPad':
        return this.buildSynth(SYNTH_PAD);
      case 'synthCustom':
        return this.buildSynth(this.customParams);
    }
  }

  /** A sampler with several velocity layers (softest first). Files are `<midi>_<layer>.mp3`. Harder playing picks a louder layer. */
  private async buildLayered(
    url: string,
    roots: number[],
    layers: number[],
    release: number,
    out: Tone.ToneAudioNode,
    fileLayer: (midi: number, layer: number) => number = (_m, l) => l,
  ): Promise<Voice> {
    const make = (layer: number) =>
      new Promise<Tone.Sampler>((resolve, reject) => {
        const urls: Record<string, string> = {};
        for (const m of roots) urls[noteName(m)] = `${m}_${fileLayer(m, layer)}.mp3`;
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

  /**
   * Rhodes, slightly tamed: the bell-like attack of the tines is softened with a gentle dip around 2.5 kHz and a soft
   * roll-off above 6 kHz.
   */
  private buildRhodes(): Promise<Voice> {
    const bell = new Tone.Filter({ type: 'peaking', frequency: 2500, Q: 0.9, gain: -4 });
    const top = new Tone.Filter({ type: 'lowpass', frequency: 6000, rolloff: -12, Q: 0.5 });
    bell.chain(top, this.bus);
    return this.buildLayered(RHODES_URL, RHODES_ROOTS, RHODES_LAYERS, 0.8, bell, rhodesLayerFor);
  }

  /**
   * Soft Piano: the Grand Piano's soft layer through a low-pass, a dip at 550 Hz (less boxy), its own reverb, and a
   * very quiet tape hiss + vinyl crackle that fades in while you play and fades out a few seconds after you stop.
   */
  private async buildSoft(): Promise<Voice> {
    const lp = new Tone.Filter(1400, 'lowpass');
    const box = new Tone.Filter({ type: 'peaking', frequency: 550, Q: 1.1, gain: -5 });
    const level = new Tone.Gain(0.85);
    const room = new Tone.Reverb({ decay: 2.6, preDelay: 0.02, wet: 0.32 });
    await room.ready;
    lp.chain(box, level, room, this.bus);
    // Hiss and crackle: a few seconds of generated noise, looped.
    const hiss = new Tone.Player(makeHissBuffer(Tone.getContext().sampleRate));
    hiss.loop = true;
    const hissGain = new Tone.Gain(0);
    hiss.chain(hissGain, this.bus);
    const HISS_LEVEL = 1;
    let held = 0;
    let fadeTimer: number | null = null;
    const piano = await this.buildLayered(ACCURATE_URL, ACCURATE_ROOTS, [7], 1.4, lp);
    return {
      on: (midi, vel) => {
        if (hiss.state !== 'started') hiss.start();
        if (fadeTimer !== null) window.clearTimeout(fadeTimer);
        fadeTimer = null;
        hissGain.gain.rampTo(HISS_LEVEL, 0.4);
        held++;
        piano.on(midi, vel);
      },
      off: (midi) => {
        piano.off(midi);
        held = Math.max(0, held - 1);
        if (held === 0) {
          if (fadeTimer !== null) window.clearTimeout(fadeTimer);
          fadeTimer = window.setTimeout(() => hissGain.gain.rampTo(0, 1.5), 3000);
        }
      },
      allOff: () => {
        piano.allOff();
        held = 0;
        hissGain.gain.rampTo(0, 0.5);
      },
      dispose: () => {
        piano.dispose();
        hiss.dispose();
      },
    };
  }

  private async buildSynth(params: SynthParams): Promise<Voice> {
    const eng = (this.synthEngine ??= SubtractiveEngine.getInstance(params));
    eng.setOutput(this.bus);
    eng.applyParams(params);
    this.appliedSynth = null; // the next note applies the right patch
    return {
      on: (midi, vel) => eng.noteOn(noteName(midi), vel),
      off: (midi) => eng.noteOff(noteName(midi)),
      allOff: () => eng.allNotesOff(),
      dispose: () => {},
    };
  }

  /** The SynthLab engine itself, for the Custom Synth panel (its scope, filter and envelope displays read from it). */
  getSynthEngine(): SubtractiveEngine {
    const eng = (this.synthEngine ??= SubtractiveEngine.getInstance(this.customParams));
    eng.setOutput(this.bus);
    return eng;
  }

  /** Update the Custom Synth patch. If it's the sound being played, you hear the change right away. */
  setCustomParams(p: SynthParams) {
    this.customParams = p;
    if (this.currentId === 'custom') {
      this.synthEngine?.applyParams(p);
      this.appliedSynth = 'synthCustom';
    } else if (this.appliedSynth === 'synthCustom') this.appliedSynth = null;
  }

  // ---------- Playing ----------
  /** Synth voices share one engine; apply the right patch only when the synth sound changes (not on every note). */
  private prepareSynth() {
    if (!this.synthEngine) return;
    const kind = SOUNDS.find((s) => s.id === this.currentId)?.kind;
    if (!kind?.startsWith('synth') || kind === this.appliedSynth) return;
    this.appliedSynth = kind;
    if (kind === 'synthWarm') this.synthEngine.applyParams(SYNTH_KEYS_WARM);
    else if (kind === 'synthBright') this.synthEngine.applyParams(SYNTH_KEYS_BRIGHT);
    else if (kind === 'synthPad') this.synthEngine.applyParams(SYNTH_PAD);
    else if (kind === 'synthCustom') this.synthEngine.applyParams(this.customParams);
  }

  noteOn(midi: number, velocity = 0.8) {
    const v = this.voices.get(this.currentId);
    if (!v) return;
    this.prepareSynth();
    // Same key again while it still sounds: let the old one go first.
    this.noteVoice.get(midi)?.off(midi);
    v.on(midi, velocity);
    this.noteVoice.set(midi, v);
  }

  noteOff(midi: number) {
    const v = this.noteVoice.get(midi) ?? this.voices.get(this.currentId);
    this.noteVoice.delete(midi);
    v?.off(midi);
  }

  allOff() {
    this.noteVoice.clear();
    this.voices.forEach((v) => v.allOff());
  }

  /** The app plays notes for the student (Learn demos). */
  /** Play notes one by one. `stopped` is checked before each note so a demo can be cut short (e.g. leaving the step). */
  async playDemo(notes: number[], gapMs = 520, onStep?: (midi: number | null) => void, stopped?: () => boolean) {
    await this.unlock();
    for (const n of notes) {
      if (stopped?.()) return;
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
    this.beats = [];
    if (!on) {
      t.stop();
      return;
    }
    t.bpm.value = bpm;
    let beat = 0;
    this.metroEvent = t.scheduleRepeat((time) => {
      this.tick(this.metroKind, beat, time);
      // Remember when each beat sounds, so the metronome icon can swing in time.
      this.beats.push({ n: beat, time });
      if (this.beats.length > 6) this.beats.shift();
      beat++;
    }, '4n');
    t.start();
  }

  /** Recent beats (audio-clock time), for metroPosition(). */
  private beats: { n: number; time: number }[] = [];

  /**
   * Where the metronome is right now, in beats (2.5 = halfway between beats 2 and 3), or null when it is off.
   * Uses the audio clock, so the swinging icon lines up with what you hear.
   */
  metroPosition(): number | null {
    if (this.metroEvent === null) return null;
    const now = Tone.getContext().currentTime;
    const past = this.beats.filter((b) => b.time <= now);
    const last = past[past.length - 1];
    if (!last) return null;
    const beatLen = 60 / Tone.getTransport().bpm.value;
    return last.n + Math.min(1, (now - last.time) / beatLen);
  }

  /** Change tempo without restarting the beat. */
  setTempo(bpm: number) {
    Tone.getTransport().bpm.value = bpm;
  }

  /**
   * 1 = 100% (the default level), up to 1.5 = 150%. Squared so the knob feels even to the ear
   * (150% is about 7 dB louder, which sounds roughly half again as loud).
   */
  setMetroVolume(v: number) {
    const x = Math.max(0, Math.min(1.5, v));
    this.metroGain.gain.value = 0.8 * x * x;
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
