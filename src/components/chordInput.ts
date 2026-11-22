import { useEffect, useRef } from 'react';
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
    dispose: () => window.clearTimeout(timer),
  };
}

/**
 * Listen for chords for as long as the screen is open. The listener is created ONCE (not on every render) and always
 * calls the latest `judge`, so one chord can never be judged twice. (When it was re-created on every render, a real MIDI
 * keyboard's separate note messages could leave an old listener's timer running, and the same chord was judged again
 * against the next question.)
 */
export function useChordWatcher(getHeld: () => number[], subscribeNotes: (fn: (e: NoteEvent) => void) => () => void, judge: (held: number[]) => void) {
  const latest = useRef(judge);
  latest.current = judge;
  useEffect(() => {
    const w = chordWatcher(getHeld, (held) => latest.current(held));
    const off = subscribeNotes(w.handle);
    return () => {
      off();
      w.dispose();
    };
  }, [getHeld, subscribeNotes]);
}

/** Listen for single notes for as long as the screen is open, always calling the latest handler. */
export function useNoteListener(subscribe: (fn: (midi: number) => void) => () => void, fn: (midi: number) => void) {
  const latest = useRef(fn);
  latest.current = fn;
  useEffect(() => subscribe((m) => latest.current(m)), [subscribe]);
}
