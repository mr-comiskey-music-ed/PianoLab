import { Pattern } from './data/pattern';
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
export type NoteLabels = 'off' | 'c' | 'all';

/**
 * findIt: play a note (letter, any octave). nameIt: a key lights up, pick its name.
 * buildIt: play a chord (any octave/inversion unless `inv` is given). nameChord: a chord lights up, pick an answer
 * (its name, numeral, function or inversion). halfStep: a key lights up, play the key `step` half steps away.
 * earCheck: listen, pick (e.g. Major / Minor). smooth: Smooth Mover, move to the next chord as little as possible.
 */
export type AssessmentType =
  | 'findIt' | 'nameIt' | 'buildIt' | 'nameChord' | 'halfStep' | 'earCheck' | 'smooth' | 'play' | 'echo' | 'speed'
  /** Lesson 7: play a major scale up, one octave, note by note (prompt `scale` = the key). */
  | 'scale'
  /** A question with answer buttons and nothing lit (Lesson 7: sharps and flats, the circle of 5ths). */
  | 'quiz';

/** Progression Play: what scrolls down the waterfall. Falling blocks is easiest; nothing is hardest. */
export type ScreenHelp = 'blocks' | 'names';
/** Echo: how much help while the app plays. Watch & Play (keys light) is easiest; Ear only is hardest. */
export type EchoHelp = 'watch' | 'hint' | 'ear';

export interface Prompt {
  /** scale: the major key to play ("G", "B♭"). */
  scale?: string;
  /** What the app asks, e.g. "Play every F". */
  text: string;
  /** Correct answers: note letters for findIt/nameIt ("F", "C#"), choice labels for nameChord/earCheck. */
  answer?: string[];
  /** For findIt with `octave`: the exact note, e.g. "C4". */
  exact?: string;
  /** nameIt / halfStep: the key (letter) that lights up. */
  show?: string;
  /** buildIt / nameChord / earCheck / smooth: the chord, e.g. "Dm", "F#", "Bb". */
  chord?: string;
  /** buildIt / nameChord: the inversion (0 root position, 1 first, 2 second). */
  inv?: number;
  /** halfStep: how many half steps from the lit key (+1 up, -1 down). */
  step?: number;
  /** A tip shown when a button answer is wrong (quiz). */
  tip?: string;
  /** This question's own answer buttons (overrides the level's `choices`). */
  choices?: string[];
  /** echo: the notes the app plays, to be played back in order (any octave), e.g. ["C4","D4","E4"]. */
  notes?: string[];
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
  /** Easiest note-label setting allowed, and the starting one. Students can go harder, not easier. */
  labels: 'all' | 'c' | 'off';
  /** nameIt / nameChord / earCheck: the answer buttons (nameIt default: the seven letters). */
  choices?: string[];
  /** play (Progression Play): the pattern to play in time (SPEC section 6). Its tempo is the slowest allowed. */
  pattern?: Pattern;
  /** play: the most help allowed on screen (and the starting setting). Students can take less, never more. */
  screen?: ScreenHelp;
  /** echo: the most help allowed (and the starting setting). */
  echo?: EchoHelp;
  /** speed (Speed Round): seconds on the clock, and how many right answers make 100%. */
  seconds?: number;
  target?: number;
  /** play: an app-made groove (Jam Room style id, e.g. "pop") plays along instead of plain clicks (students can switch). */
  groove?: string;
  /** play with a groove: false = the groove leaves out its bass (bass-line levels: the student is the bass player). */
  grooveBass?: boolean;
  /** nameChord: also play the chord out loud (with "Hear it again"). */
  playChord?: boolean;
  /** smooth: the first chord's keys, e.g. ["C4","E4","G4"]. */
  start?: string[];
  prompts: Prompt[];
}

export interface LearnStep {
  id: string;
  /** The touch point this step belongs to. */
  section: string;
  title: string;
  /** What the app says. */
  say: string;
  /**
   * Notes the app plays as a demo, one after another. "C4" is one note; "C4+E4+G4" is a chord (played together);
   * "E4*2" is held twice as long (a note the counting stops on); "_" is a short silence ("_*2" a longer one).
   * Leave out when a demo would not teach anything.
   */
  demo?: string[];
  /** Show-and-tell step: the app demos with note names on the keys, no "now you try". Next is open right away. */
  show?: boolean;
  /** Note labels on the piano during this step (default: off). */
  labels?: NoteLabels;
  /** "Now you try" prompt (try steps only). */
  tryText?: string;
  /** Letters that count as right ("F", "C#"; flats are read as sharps). */
  tryAnswer?: string[];
  /** Lesson 7: play this major scale up one octave ("G"), note by note. */
  tryScale?: string;
  /** Or: any white-key triad built by stacking thirds (root, skip, 3rd, skip, 5th), each on a different root. */
  tryTriad?: boolean;
  /** Or: chords that count as right ("F", "Dm"). Any octave/inversion unless `tryInversion` is set. */
  tryChord?: string[];
  tryInversion?: number;
  /** Or: an interval, two piano keys held together this many half steps apart (4 = major 3rd), each on a different bottom note. */
  tryInterval?: number;
  /** Words shown on piano keys during the step, by note ("C4": "Root", "E4": "3rd"). Moves with the demo if it shifts octave. */
  tags?: Record<string, string>;
  /** Or: a progression, played one chord after another ("C", "G", "Am", "F"), in the key `tryKey` (for the numerals shown). */
  tryProgression?: string[];
  tryKey?: string;
  /** A rhythm on a counting grid (Chord rhythms lesson): ▶ Listen on show steps; on try steps, ▶ Play along in time. */
  rhythm?: Pattern;
  /** With tryProgression: show chord names (Cmaj7, Fmaj7...) instead of numerals; the chords need not be in one key. */
  tryNames?: boolean;
  /** Show-and-tell: chord strips on the Stage (key ids, e.g. ["C"] or ["C", "G"]) in place of the chord names. */
  strip?: string[];
  /** With two strips: which strip each demo entry belongs to (key id per entry), so only that strip lights up. */
  demoKeys?: string[];
  /** How many correct answers finish the step (0 for show-and-tell). Notes must be in different places. */
  need: number;
  hint?: string;
}

export interface Lesson {
  id: string;
  number: number;
  title: string;
  /** Default key for the chord strip and the detector's numerals (e.g. "C"). Lessons 2+ show the chord strip. */
  key?: string;
  /** Show roman numerals and Home/Away/Tension (Lesson 3 on). */
  numerals?: boolean;
  /** Black keys are part of the lesson (Lesson 4 on): they get names and count as answers. */
  blackKeys?: boolean;
  /** Practice: what to try, in a sentence or two. */
  practice?: string;
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
  /** A timed level played with the chord shape helper showing (code: a 1 after the label setting). */
  shapes?: boolean;
}

export interface Submission {
  /** The student's name. It lives ONLY inside the code; the app never saves it. */
  name?: string;
  assignment: string;
  timestamp: number;
  /** Lesson 1's Learn is finished (code key `l`, from Phase 1). */
  learnDone: boolean;
  /** Every lesson whose Learn is finished, by lesson id (code key `L`, Phase 2). */
  learned?: string[];
  results: LevelResult[];
  /** Compressed MIDI take (Play Along, later phases). Reserved so v1 codes can carry it. */
  take?: string;
  /** A Sandbox performance, packed by packPerf() in utils/performance.ts (code key `p`). */
  perf?: number[];
  /** A Jam Room performance's backing (code key `j`): see BackingSeg in utils/performance.ts. */
  jam?: unknown[];
}

/** SynthLab's two synth looks (only 'hardware-bench', the Modern Synth, is used here). Copied so the SynthLab panel compiles. */
export type ThemeMode = 'studio-retro' | 'hardware-bench';
