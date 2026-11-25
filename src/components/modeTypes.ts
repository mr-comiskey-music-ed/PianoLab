import { ReactNode } from 'react';
import { AudioEngine } from '../audio/audioEngine';
import { Lesson, LevelResult } from '../types';
import { KeyDef } from '../utils/chords';
import { Assignment } from '../utils/assignment';
import { KeyMark } from './Piano';

export type Labels = 'off' | 'c' | 'all';

export interface NoteEvent {
  on: boolean;
  midi: number;
  /** 0-1 */
  vel: number;
}

/** Easiest to hardest. */
export const LABEL_ORDER: Labels[] = ['all', 'c', 'off'];

/** What App gives every mode. */
export interface ModeCtx {
  engine: AudioEngine;
  /** Hear every note the student plays (from MIDI, keyboard or touch). Returns an unsubscribe. */
  subscribe: (fn: (midi: number) => void) => () => void;
  /** Every note-on AND note-off, with velocity (0-1). For recording (Sandbox). Returns an unsubscribe. */
  subscribeNotes: (fn: (e: NoteEvent) => void) => () => void;
  viewStart: number;
  /** The keys held down right now (MIDI numbers), up to date even inside a note event. */
  getHeld: () => number[];
  /** The lesson picked in the lesson picker. Learn, Practice and Challenges all follow it. */
  lesson: Lesson;
  /** The chord strip's key (for Roman numerals). */
  keyDef: KeyDef;
  /** The student's latency from the latency check (ms), taken off timing grades. 0 if not checked. */
  latency: number;
  /** Turn the metronome off (timed levels bring their own clicks). */
  stopMetronome: () => void;
  /** A phone held sideways: the Stage is a short, wide strip, so lay things out left to right. */
  phone?: boolean;
  /** Open the latency check (offered when timing is steadily off). */
  openLatency: () => void;
  /** The latency check has been done on this device. */
  latencySet: boolean;
  /** The student chose "Skip for now" at the first timed challenge (this visit only, not saved). */
  latencySkipped: boolean;
  skipLatency: () => void;
  /** The teacher's assignment, if the app was opened from one (the Jam Room reads its setup). */
  assignment?: Assignment | null;
  /** A teacher's assignment can set the slowest tempo allowed for timed levels. */
  minTempo?: number;
  results: LevelResult[];
  setResults: (fn: (prev: LevelResult[]) => LevelResult[]) => void;
  /** Learn progress for the current lesson. */
  learnDone: boolean;
  setLearnDone: (v: boolean) => void;
  learnStep: number;
  /** The furthest Learn step reached in this lesson: steps before it count as done. */
  learnMax: number;
  setLearnStep: (n: number) => void;
  goTo: (mode: 'learn' | 'practice' | 'challenge' | 'sandbox' | 'jam' | 'report') => void;
}

/** What a mode gives back to App: a left panel, a stage, and what to light on the piano. */
export interface ModeParts {
  left: ReactNode;
  stage: ReactNode;
  /** Which note labels the piano shows right now. */
  labels: Labels;
  /** Show the "Challenge Yourself" control. Leave out where labels aren't a choice (Learn). */
  labelControl?: { value: Labels; allowed: Labels[]; set: (l: Labels) => void; locked?: boolean; /** Heading over the buttons (default "Challenge Yourself"). */ title?: string };
  lit?: Set<number>;
  /** Show the live chord name in the readout bar (off in Challenges, where it would give answers away). */
  detector?: boolean;
  /** Show the chord strip above the stage (Lessons 2+; never in Challenges). */
  strip?: boolean;
  /** Keys that get a label even when labels are off (the note the app is demoing). */
  forceLabel?: Set<number>;
  marks?: Map<number, KeyMark>;
  /** Words on particular keys (Learn: Root / 3rd / 5th). */
  keyText?: Map<number, string>;
  start?: { label: string; onClick: () => void; disabled?: boolean };
  restart?: { label: string; onClick: () => void; disabled?: boolean };
  /** A pop-up the mode wants shown (e.g. Save performance). */
  overlay?: ReactNode;
  /** A sound this screen wants (a Bass lines step or level); App switches to it, and back when it's gone. */
  sound?: string;
  /** Phones: where you are, for the lesson-menu button ("Step 2", "Level 3"). */
  navLabel?: string;
  /** Jam Room Melody mode: keys to mark with a brass dot (the key's notes). */
  tint?: Set<number>;
  /** Jam Room Key lock: keys greyed out, and `silence` says which notes make no sound (and don't count). */
  dim?: Set<number>;
  silence?: (midi: number) => boolean;
}
