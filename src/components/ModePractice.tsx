import { useEffect, useRef, useState } from 'react';
import { LABEL_ORDER, Labels } from './modeTypes';
import { letterOf, noteName, pretty } from '../utils/music';
import { Detected, INVERSION_NAMES, KeyDef, detectChord } from '../utils/chords';
import { Col, StageBox } from './StageRow';
import { ModeCtx, ModeParts } from './modeTypes';

/** Practice: free exploration with labels on, the chord detector and (Lesson 2 on) the chord strip. No grading. */
export function usePractice(ctx: ModeCtx): ModeParts {
  const [labels, setLabels] = useState<Labels>('all');
  /**
   * The last thing played: a chord, or a single note. A chord stays "the last thing" while its notes are let go at
   * slightly different times; it only changes when a new chord forms or a new single note starts from silence.
   */
  const [lastThing, setLastThing] = useState<{ chord: Detected } | { note: number } | null>(null);
  const keyRef = useRef(ctx.keyDef);
  keyRef.current = ctx.keyDef;
  useEffect(
    () =>
      ctx.subscribeNotes((e) => {
        if (!e.on) return;
        const held = ctx.getHeld();
        const d = detectChord(held, keyRef.current);
        if (d) setLastThing({ chord: d });
        else if (held.length === 1) setLastThing({ note: e.midi });
      }),
    [ctx.subscribeNotes, ctx.getHeld],
  );
  // Re-name the last chord if the key changes (its numeral may change).
  const shown = lastThing && 'chord' in lastThing ? detectChordAgain(lastThing.chord, ctx.keyDef) : null;
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
    <StageBox phone={ctx.phone} className="gap-2 px-6">
      <Col phone={ctx.phone}>
      <div className="h text-[12px] uppercase tracking-wider text-brass">{shown ? 'Chord' : 'You played'}</div>
      <div className="h text-[64px] leading-none text-panel" data-testid="practice-note">
        {shown ? shown.symbol : lastThing && 'note' in lastThing ? pretty(noteName(lastThing.note)) : '–'}
      </div>
      </Col>
      <Col phone={ctx.phone}>
      <div className="text-[15px] text-line2" data-testid="practice-detail">
        {shown
          ? `${shown.longName}${shown.triad && shown.inversion ? `, ${INVERSION_NAMES[shown.inversion].toLowerCase()}` : ''}${shown.bass && !shown.triad ? `, ${shown.bass} on the bottom` : ''}`
          : lastThing && 'note' in lastThing
            ? `That is the note ${pretty(letterOf(lastThing.note))}.`
            : 'Press a key on your keyboard.'}
      </div>
      {shown?.numeral && (
        // The Roman numeral in the strip's key, in its scale-degree colour.
        <div className="h mt-1 rounded-lg px-4 py-1 text-[34px] leading-none" style={{ background: shown.color, color: '#2a1e08' }} data-testid="practice-numeral">
          {shown.numeral}
          <span className="ml-2 align-middle text-[14px] opacity-75">in {ctx.keyDef.label}</span>
        </div>
      )}
      </Col>
    </StageBox>
  );
  return { left, stage, labels, labelControl: { value: labels, allowed: LABEL_ORDER, set: setLabels } };
}

/** The same chord named again in another key (numerals change with the key; the notes don't). */
function detectChordAgain(d: Detected, k: KeyDef): Detected {
  return d.notes ? (detectChord(d.notes, k) ?? d) : d;
}
