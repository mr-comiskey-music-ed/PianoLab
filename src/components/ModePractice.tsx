import { useEffect, useState } from 'react';
import { letterOf, noteName } from '../utils/music';
import { ModeCtx, ModeParts } from './modeTypes';

/** Practice: free exploration with labels on. No grading. (Recording and the chord detector arrive in later phases.) */
export function usePractice(ctx: ModeCtx): ModeParts {
  const [last, setLast] = useState<number | null>(null);
  useEffect(() => ctx.subscribe((m) => setLast(m)), [ctx]);
  const left = (
    <div className="flex flex-col gap-3">
      <div>
        <div className="h text-[11px] uppercase text-muted">Lesson 1 · Practice</div>
        <h2 className="h text-[22px] leading-tight text-wal3">Explore the keys</h2>
      </div>
      <p className="text-[15px] leading-snug text-wal1">
        Play anything you like. Notice the pattern of 2 and 3 black keys. Try to find every C, then every F, without looking at the labels.
      </p>
      <p className="text-[13px] text-muted">Nothing here is graded. Use “Make it easier or harder” below to hide the labels.</p>
    </div>
  );
  const stage = (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
      <div className="h text-[12px] uppercase tracking-wider text-brass">You played</div>
      <div className="h text-[64px] leading-none text-panel" data-testid="practice-note">
        {last === null ? '–' : noteName(last)}
      </div>
      <div className="text-[15px] text-line2">{last === null ? 'Press a key on your keyboard.' : `That is the note ${letterOf(last)}.`}</div>
    </div>
  );
  return { left, stage };
}
