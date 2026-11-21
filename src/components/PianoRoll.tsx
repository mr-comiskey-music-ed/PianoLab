import React, { useEffect, useRef } from 'react';
import { KEY_COUNT, isBlack, letterOf } from '../utils/music';
import { PerfNote } from '../utils/performance';

/** Pixels per second the notes rise. */
const SPEED = 110;

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
 * `now()` is the current time on the same clock as the notes (ms); a note with d < 0 is still held.
 */
export const PianoRoll: React.FC<{ notes: PerfNote[]; start: number; now: () => number | null }> = ({ notes, start, now }) => {
  const canvas = useRef<HTMLCanvasElement>(null);
  const live = useRef({ notes, start, now });
  live.current = { notes, start, now };

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
      for (const n of list) {
        if (n.t > t) continue;
        const end = n.d < 0 ? t : n.t + n.d;
        // y grows downward: the start of the note is higher up (older), its end sits lower (newer).
        const yTop = H - ((t - n.t) * SPEED) / 1000;
        const yBottom = H - ((t - end) * SPEED) / 1000;
        if (yBottom < 0) continue; // already floated off the top
        const k = keyBox(n.m, s);
        if (!k) continue;
        const black = isBlack(n.m);
        const x = k.x * W + 1.5;
        const w = Math.max(3, k.w * W - 3);
        const h = Math.max(3, yBottom - yTop);
        const alpha = 0.55 + (n.v / 127) * 0.45; // harder notes look brighter
        g.fillStyle = black ? `rgba(184,134,44,${alpha})` : `rgba(217,164,65,${alpha})`;
        g.beginPath();
        g.roundRect(x, yBottom - h, w, h, 4); // bottom edge at the note's end
        g.fill();
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  return <canvas ref={canvas} className="block h-full w-full" data-testid="piano-roll" aria-label="Piano roll of what you played" />;
};
