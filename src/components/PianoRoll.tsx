import React, { MutableRefObject, useEffect, useRef, useState } from 'react';
import { KEY_COUNT, isBlack, letterOf } from '../utils/music';
import { PerfNote } from '../utils/performance';
import { pitchColor, withAlpha } from '../utils/colors';

/** Pixels per second the notes rise. */
export const ROLL_SPEED = 110;
/** After the last key is let go, the roll keeps moving this long at full speed… */
const TAIL = 1200;
/** …then glides to a stop over this long (like Chrome Music Lab's Shared Piano), so silence doesn't scroll forever. */
const GLIDE = 1600;
const glide = (gap: number) => (gap >= GLIDE ? GLIDE / 2 : gap - (gap * gap) / (2 * GLIDE));

/**
 * The roll's own clock ("roll time"): it runs with real time while you play, glides to a stop when you stop, and picks up
 * again with the next note. Notes keep their real timing (for play back and MIDI); only the picture uses roll time.
 */
export function makeRollMap(notes: PerfNote[]) {
  const spans = notes
    .map((n) => [n.t, n.d < 0 ? Infinity : n.t + n.d + TAIL] as [number, number])
    .sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const sp of spans) {
    const last = merged[merged.length - 1];
    if (last && sp[0] <= last[1]) last[1] = Math.max(last[1], sp[1]);
    else merged.push([sp[0], sp[1]]);
  }
  const startRoll: number[] = [];
  let acc = 0;
  merged.forEach(([s, e], i) => {
    startRoll.push(acc);
    const next = merged[i + 1];
    if (next) acc += e - s + glide(next[0] - e);
  });
  /** Real time (ms) -> roll time (ms). */
  const rollAt = (t: number) => {
    if (!merged.length || t <= merged[0][0]) return 0;
    let lo = 0;
    let hi = merged.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (merged[mid][0] <= t) lo = mid;
      else hi = mid - 1;
    }
    const [s, e] = merged[lo];
    return t <= e ? startRoll[lo] + (t - s) : startRoll[lo] + (e - s) + glide(t - e);
  };
  return { rollAt };
}

/** Left edge and width (0-1 of the piano's width) of a key, laid out exactly like Piano.tsx. */
function keyBox(midi: number, start: number): { x: number; w: number } | null {
  if (midi < start || midi >= start + KEY_COUNT) return null;
  let whites = 0;
  for (let m = start; m < start + KEY_COUNT; m++) if (!isBlack(m)) whites++;
  const wW = 1 / whites;
  let wi = -1;
  for (let m = start; m <= midi; m++) if (!isBlack(m)) wi++;
  return isBlack(midi) ? { x: (wi + 1) * wW - wW * 0.3, w: wW * 0.6 } : { x: wi * wW, w: wW };
}

/**
 * The scrolling piano roll: each note is a bar that grows up out of its key while held, then floats upward.
 * `now()` is the current real time on the notes' clock (ms); a note with d < 0 is still held.
 * Scroll (wheel or drag) to look back; `offset` is how far back you are, in roll ms (0 = live).
 */
export const PianoRoll: React.FC<{
  notes: PerfNote[];
  start: number;
  now: () => number | null;
  offset: MutableRefObject<number>;
  /** False while playing back: the roll then follows the music. */
  canScroll: boolean;
  /** While you scroll: the notes sitting on the keyboard line right now (midi -> velocity), so they can sound. */
  onScrub?: (under: Map<number, number>, passed: Map<number, number>) => void;
}> = ({ notes, start, now, offset, canScroll, onScrub }) => {
  const canvas = useRef<HTMLCanvasElement>(null);
  const live = useRef({ notes, start, now, canScroll });
  live.current = { notes, start, now, canScroll };
  const map = useRef<{ notes: PerfNote[] | null; rollAt: (t: number) => number }>({ notes: null, rollAt: () => 0 });
  const rollNow = useRef(0);
  const [atLive, setAtLive] = useState(true);
  const tween = useRef<number | null>(null);

  /**
   * Notes on the keyboard line now (`under`), and notes the line jumped right over since the last position (`passed`, so a
   * quick scroll still sounds short notes, like play back).
   */
  const scrubNotes = (prevBottom: number) => {
    const under = new Map<number, number>();
    const passed = new Map<number, number>();
    if (offset.current < 1) return { under, passed };
    const { rollAt } = map.current;
    const bottom = rollNow.current - offset.current;
    const lo = Math.min(prevBottom, bottom);
    const hi = Math.max(prevBottom, bottom);
    for (const n of live.current.notes) {
      if (n.d <= 0) continue;
      const rs = rollAt(n.t);
      const re = rollAt(n.t + n.d);
      if (rs <= bottom && bottom < re) under.set(n.m, n.v);
      else if (rs < hi && re > lo) passed.set(n.m, n.v);
    }
    return { under, passed };
  };

  const setOffset = (v: number) => {
    const prevBottom = rollNow.current - offset.current;
    offset.current = Math.max(0, Math.min(rollNow.current, v));
    setAtLive(offset.current < 1);
    const { under, passed } = scrubNotes(prevBottom);
    onScrub?.(under, passed);
  };

  // Any new note (or play back) jumps back to live.
  useEffect(() => {
    offset.current = 0;
    setAtLive(true);
  }, [notes.length, canScroll, offset]);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const dpr = window.devicePixelRatio || 1;
      const W = c.clientWidth;
      const H = c.clientHeight;
      if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) {
        c.width = Math.round(W * dpr);
        c.height = Math.round(H * dpr);
      }
      const g = c.getContext('2d');
      if (!g) return;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, W, H);
      const { notes: list, start: s, now: clock } = live.current;
      // Faint lines at every C (left edge of the key), so bars are easy to match to keys.
      g.fillStyle = 'rgba(217,164,65,0.10)';
      for (let m = s; m < s + KEY_COUNT; m++) {
        if (letterOf(m) !== 'C') continue;
        const k = keyBox(m, s);
        if (k) g.fillRect(Math.round(k.x * W), 0, 1, H);
      }
      const t = clock();
      if (t === null) return;
      if (map.current.notes !== list) map.current = { notes: list, ...makeRollMap(list) };
      const { rollAt } = map.current;
      rollNow.current = rollAt(t);
      // The bottom edge of the roll (where it meets the keys) shows this moment in roll time.
      const bottom = rollNow.current - offset.current;
      for (const n of list) {
        const rs = rollAt(n.t);
        if (rs > bottom) continue;
        const re = n.d < 0 ? rollNow.current : rollAt(n.t + n.d);
        // y grows downward: the start of the note is higher up (older), its end sits lower (newer).
        const yTop = H - ((bottom - rs) * ROLL_SPEED) / 1000;
        const yBottom = H - ((bottom - re) * ROLL_SPEED) / 1000;
        if (yBottom < 0) continue; // above the top of the view
        const h = Math.max(3, yBottom - yTop);
        const alpha = 0.6 + (n.v / 127) * 0.4; // harder notes look brighter
        const k = keyBox(n.m, s);
        if (!k) {
          // Outside the 25 keys on screen: a thin bar at the left edge (lower) or right edge (higher), so it isn't invisible.
          g.fillStyle = withAlpha(pitchColor(n.m), 0.85);
          g.beginPath();
          g.roundRect(n.m < s ? 0 : W - 5, yBottom - h, 5, h, 2);
          g.fill();
          continue;
        }
        const x = k.x * W + 1.5;
        const w = Math.max(3, k.w * W - 3);
        g.fillStyle = withAlpha(pitchColor(n.m), alpha);
        g.beginPath();
        g.roundRect(x, yBottom - h, w, h, 4);
        g.fill();
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  // ---- Scrolling back through what you played ----
  const drag = useRef<{ y: number; o: number } | null>(null);
  const pxToMs = (px: number) => (px * 1000) / ROLL_SPEED;
  const stopTween = () => {
    if (tween.current !== null) cancelAnimationFrame(tween.current);
    tween.current = null;
  };
  const backToLive = () => {
    stopTween();
    const from = offset.current;
    const t0 = performance.now();
    const step = () => {
      const k = Math.min(1, (performance.now() - t0) / 250);
      setOffset(from * (1 - k * (2 - k)));
      tween.current = k < 1 ? requestAnimationFrame(step) : null;
    };
    tween.current = requestAnimationFrame(step);
  };

  return (
    <div className="relative h-full w-full">
      <canvas
        ref={canvas}
        className={`block h-full w-full ${canScroll ? 'cursor-grab active:cursor-grabbing' : ''}`}
        style={{ touchAction: 'none' }}
        data-testid="piano-roll"
        aria-label="Piano roll of what you played. Scroll or drag to look back."
        onWheel={(e) => {
          if (!live.current.canScroll) return;
          stopTween();
          // Wheel up (or two-finger swipe up) looks further back.
          setOffset(offset.current - pxToMs(e.deltaY));
        }}
        onPointerDown={(e) => {
          if (!live.current.canScroll) return;
          stopTween();
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { y: e.clientY, o: offset.current };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          // Dragging down pulls older notes back into view.
          setOffset(d.o + pxToMs(e.clientY - d.y));
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
      />
      {!atLive && (
        <button className="btn btn-brass absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full px-4 shadow-lg" onClick={backToLive} data-testid="back-to-live">
          ↓ Back to live
        </button>
      )}
    </div>
  );
};
