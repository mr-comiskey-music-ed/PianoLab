import { useEffect, useState } from 'react';
import { LABEL_ORDER, Labels } from './modeTypes';
import { letterOf, noteName, pretty } from '../utils/music';
import { Detected, INVERSION_NAMES, chordLongName, chordName, detectChord } from '../utils/chords';
import { ModeCtx, ModeParts } from './modeTypes';

/** Practice: free exploration with labels on, the chord detector and (Lesson 2 on) the chord strip. No grading. */
export function usePractice(ctx: ModeCtx): ModeParts {
  const [last, setLast] = useState<number | null>(null);
  const [labels, setLabels] = useState<Labels>('all');
  // The chord being held (if any), so the big display can show its name.
  const [chord, setChord] = useState<Detected | null>(null);
  useEffect(() => ctx.subscribe((m) => setLast(m)), [ctx]);
  useEffect(() => ctx.subscribeNotes(() => {
    const d = detectChord(ctx.getHeld());
    if (d) setChord(d);
    else if (ctx.getHeld().length === 0) window.setTimeout(() => ctx.getHeld().length === 0 && setChord(null), 1500);
  }), [ctx]);
  const left = (
    <div className="flex flex-col gap-3">
      <div>
        <div className="h text-[11px] uppercase text-muted">Lesson {ctx.lesson.number} · Practice</div>
        <h2 className="h text-[22px] leading-tight text-wal3">{ctx.lesson.title}</h2>
      </div>
      <p className="text-[15px] leading-snug text-wal1">{ctx.lesson.practice ?? 'Play anything you like.'}</p>
      <p className="text-[13px] text-muted">Nothing here is graded. Use “Challenge Yourself” below to hide the note names.</p>
    </div>
  );
  const stage = (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
      <div className="h text-[12px] uppercase tracking-wider text-brass">{chord ? 'Chord' : 'You played'}</div>
      <div className="h text-[64px] leading-none text-panel" data-testid="practice-note">
        {chord ? chordName(chord.chord) : last === null ? '–' : pretty(noteName(last))}
      </div>
      <div className="text-[15px] text-line2">
        {chord
          ? `${chordLongName(chord.chord)}${chord.inversion ? `, ${INVERSION_NAMES[chord.inversion].toLowerCase()}` : ''}`
          : last === null
            ? 'Press a key on your keyboard.'
            : `That is the note ${pretty(letterOf(last))}.`}
      </div>
    </div>
  );
  return { left, stage, labels, labelControl: { value: labels, allowed: LABEL_ORDER, set: setLabels } };
}
