import { ReactNode } from 'react';
import { AudioEngine } from '../audio/audioEngine';
import { LevelResult } from '../types';
import { KeyMark } from './Piano';

export type Labels = 'off' | 'c' | 'all';

/** What App gives every mode. */
export interface ModeCtx {
  engine: AudioEngine;
  /** Hear every note the student plays (from MIDI, keyboard or touch). Returns an unsubscribe. */
  subscribe: (fn: (midi: number) => void) => () => void;
  labels: Labels;
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
  lit?: Set<number>;
  litLetters?: string[];
  marks?: Map<number, KeyMark>;
  /** Show every label no matter what the student picked (Learn). */
  forceLabels?: Labels;
  start?: { label: string; onClick: () => void; disabled?: boolean };
  restart?: { label: string; onClick: () => void; disabled?: boolean };
}
