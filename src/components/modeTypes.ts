import { ReactNode } from 'react';
import { AudioEngine } from '../audio/audioEngine';
import { Lesson, LevelResult } from '../types';
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
  results: LevelResult[];
  setResults: (fn: (prev: LevelResult[]) => LevelResult[]) => void;
  /** Learn progress for the current lesson. */
  learnDone: boolean;
  setLearnDone: (v: boolean) => void;
  learnStep: number;
  setLearnStep: (n: number) => void;
  goTo: (mode: 'learn' | 'practice' | 'challenge' | 'sandbox' | 'report') => void;
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
  start?: { label: string; onClick: () => void; disabled?: boolean };
  restart?: { label: string; onClick: () => void; disabled?: boolean };
  /** A pop-up the mode wants shown (e.g. Save performance). */
  overlay?: ReactNode;
}
