import { NoteEvent } from './modeTypes';

/** How long the held keys must stay the same before a chord is judged (lets a rolled chord on a MIDI keyboard land). */
const SETTLE_MS = 90;

/**
 * Watches the keys held down and calls `judge` once per chord attempt: when 3 or more keys have been held steady for a
 * moment. After a judgement it waits until every key is let go before judging again, so one chord = one answer.
 * Returns a note-event handler to pass to ctx.subscribeNotes, plus a reset.
 */
export function chordWatcher(getHeld: () => number[], judge: (held: number[]) => void) {
  let timer: number | undefined;
  let armed = true;
  const handle = (e: NoteEvent) => {
    window.clearTimeout(timer);
    const held = getHeld();
    if (held.length === 0) {
      armed = true;
      return;
    }
    if (!armed || !e.on) return;
    timer = window.setTimeout(() => {
      const now = getHeld();
      if (!armed || now.length < 3) return;
      armed = false;
      judge([...now].sort((a, b) => a - b));
    }, SETTLE_MS);
  };
  return {
    handle,
    reset: () => {
      window.clearTimeout(timer);
      armed = getHeld().length === 0;
    },
  };
}
