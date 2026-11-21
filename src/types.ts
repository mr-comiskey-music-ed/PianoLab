// Synth types are copied from SynthLab (src/types.ts) so SynthLab patch codes load here unchanged.
export type WaveformType = 'sine' | 'triangle' | 'sawtooth' | 'square' | 'noise';
export type VoiceMode = 'poly' | 'mono';
export type LfoDestination = 'pitch' | 'cutoff' | 'pwm';
export type FilterRolloff = -12 | -24;
export type ArpDivision = '16n' | '8n' | '4n';
export type ArpDirection = 'up' | 'down' | 'upDown' | 'random';

export interface ArpConfig {
  enabled: boolean;
  bpm: number;
  division: ArpDivision;
  direction: ArpDirection;
  octaves: number;
}

export interface SynthParams {
  masterVolume: number;
  vco1Waveform: WaveformType; vco1Octave: number; vco1Semi: number; vco1Fine: number; vco1Level: number; vco1PulseWidth: number;
  vco2Waveform: WaveformType; vco2Octave: number; vco2Semi: number; vco2Fine: number; vco2Level: number; vco2PulseWidth: number;
  noiseLevel: number; oscBalance: number;
  filterCutoff: number; filterResonance: number; filterEnvAmount: number; filterKeyTracking: number; filterRolloff: FilterRolloff;
  ampAttack: number; ampDecay: number; ampSustain: number; ampRelease: number;
  modAttack: number; modDecay: number; modSustain: number; modRelease: number;
  lfoRate: number; lfoWaveform: 'sine' | 'triangle' | 'sawtooth' | 'square'; lfoDepth: number; lfoDestination: LfoDestination;
  voiceMode: VoiceMode; glide: number;
}

/** Where a piece of work came from, for the Lesson levels. */
export type AssessmentType = 'findIt' | 'nameIt';

export interface Prompt {
  /** What the app asks, e.g. "Play every F". */
  text: string;
  /** Note letters that are correct, e.g. ["F"]. For nameIt, the single right letter. */
  answer: string[];
  /** For findIt with `octave`: the exact note, e.g. "C4". */
  exact?: string;
  /** For nameIt: the key that lights up. */
  show?: string;
}

export interface Level {
  id: string;
  title: string;
  blurb: string;
  type: AssessmentType;
  /** Any octave counts, or a specific octave is required. */
  octave: 'any' | 'exact';
  /** Percent needed to pass. */
  pass: number;
  /** Name It: letters offered as answers (default: all seven). */
  choices?: string[];
  prompts: Prompt[];
}

export interface LearnStep {
  id: string;
  /** The touch point this step belongs to. */
  section: string;
  title: string;
  /** What the app says. */
  say: string;
  /** Keys the app highlights while demoing. */
  show: string[];
  /** Notes (with octave) the app plays as the demo. */
  demo?: string[];
  /** "Now you try" prompt. */
  tryText: string;
  /** Letters that count as right. `any: true` means any key counts (just play something). */
  tryAnswer: string[];
  /** How many correct notes finish the step. */
  need: number;
  hint: string;
}

export interface Lesson {
  id: string;
  number: number;
  title: string;
  learn: LearnStep[];
  levels: Level[];
}

/** One finished attempt at a level. Raw is what the student really scored. */
export interface LevelResult {
  levelId: string;
  /** Raw percent, 0-100. */
  raw: number;
  /** Settings the student actually used. */
  labels: 'off' | 'c' | 'all';
  /** Epoch ms. */
  at: number;
}

export interface Submission {
  assignment: string;
  timestamp: number;
  learnDone: boolean;
  results: LevelResult[];
  /** Compressed MIDI take (Play Along, later phases). Reserved so v1 codes can carry it. */
  take?: string;
}
