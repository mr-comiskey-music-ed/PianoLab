import { ReactNode } from 'react';
import { AudioEngine } from '../audio/audioEngine';
import { LevelResult } from '../types';
import { KeyMark } from './Piano';

export type Labels = 'off' | 'c' | 'all';

/** Easiest to hardest. */
export const LABEL_ORDER: Labels[] = ['all', 'c', 'off'];

/** What App gives every mode. */
export interface ModeCtx {
  engine: AudioEngine;
  /** Hear every note the student plays (from MIDI, keyboard or touch). Returns an unsubscribe. */
  subscribe: (fn: (midi: number) => void) => () => void;
  viewStart: number;
  results: LevelResult[];
  setResults: (fn: (prev: LevelResult[]) => LevelResult[]) => void;
  learnDone: boolean;
  setLearnDone: (v: boolean) => void;
  learnStep: number;
  setLearnStep: (n: number) => void;
  goTo: (mode: 'learn' | 'practice' | 'challenge') => void;
}

/** What a mode gives back to App: a left panel, a stage, and what to light on the piano. */
export interface ModeParts {
  left: ReactNode;
  stage: ReactNode;
  /** Which note labels the piano shows right now. */
  labels: Labels;
  /** Show the "easier or harder" control. Leave out where labels aren't a choice (Learn). */
  labelControl?: { value: Labels; allowed: Labels[]; set: (l: Labels) => void; locked?: boolean; note?: string };
  lit?: Set<number>;
  /** Keys that get a label even when labels are off (the note the app is demoing). */
  forceLabel?: Set<number>;
  marks?: Map<number, KeyMark>;
  start?: { label: string; onClick: () => void; disabled?: boolean };
  restart?: { label: string; onClick: () => void; disabled?: boolean };
}
