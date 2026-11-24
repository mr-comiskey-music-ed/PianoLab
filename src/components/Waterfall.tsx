import React, { useEffect, useRef } from 'react';
import { KEY_COUNT, letterOf } from '../utils/music';
import { Timeline, beatMs } from '../utils/patternEngine';
import { HitResult } from '../utils/timing';
import { withAlpha } from '../utils/colors';
import { ScreenHelp } from '../types';
import { keyBox } from './PianoRoll';

/** How many beats of music fit between the top of the waterfall and the hit line. */
const BEATS_VISIBLE = 6;

/**
 * The waterfall (SPEC section 14): blocks in the chord's scale-degree colour fall onto a brass hit line just above the
 * keys, lined up with the keys below. Each bar is labelled with its chord and numeral. `screen` sets how much shows:
 * blocks (easiest), chord names only, or nothing (hardest). `now()` is the time in ms on the same clock as `startAt`
 * (the first downbeat). Results colour the blocks: Perfect and Good glow, Miss fades.
 */
export const Waterfall: React.FC<{
  timeline: Timeline;
  tempo: number;
  startAt: number | null;
  now: () => number;
  viewStart: number;
  screen: ScreenHelp;
  results: (HitResult | undefined)[];
}> = ({ timeline, tempo, startAt, now, viewStart, screen, results }) => {
  const canvas = useRef<HTMLCanvasElement>(null);
  const live = useRef({ timeline, tempo, startAt, now, viewStart, screen, results });
  live.current = { timeline, tempo, startAt, now, viewStart, screen, results };

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
      const L = live.current;
      const lineY = H - 6;
      // Key guides: faint lines between keys, stronger at every C.
      for (let m = L.viewStart; m < L.viewStart + KEY_COUNT; m++) {
        const k = keyBox(m, L.viewStart);
        if (!k || letterOf(m).length > 1) continue;
        g.fillStyle = letterOf(m) === 'C' ? 'rgba(217,164,65,0.16)' : 'rgba(255,255,255,0.04)';
        g.fillRect(Math.round(k.x * W), 0, 1, lineY);
      }
      // The brass hit line.
      g.fillStyle = '#d9a441';
      g.fillRect(0, lineY, W, 3);
      const bm = beatMs(L.tempo);
      const pxPerMs = lineY / (BEATS_VISIBLE * bm);
      // Before the start, the music waits above the line (it falls in during the count-in).
      const t = L.startAt === null ? -BEATS_VISIBLE * bm * 0.5 : L.now() - L.startAt;
      const yOf = (ms: number) => lineY - (ms - t) * pxPerMs;
      // Bars: a faint line where each bar starts, with its chord (and numeral) at the left.
      if (L.screen !== 'off') {
        for (const b of L.timeline.bars) {
          const y = yOf(b.beat * bm);
          if (y < -30 || y > lineY + 2) continue;
          g.fillStyle = 'rgba(255,255,255,0.10)';
          g.fillRect(0, y, W, 1);
          const big = L.screen === 'names';
          g.font = `600 ${big ? 28 : 15}px "Barlow Semi Condensed", sans-serif`;
          const label = `${b.symbol}  ${b.numeral}`;
          const tw = g.measureText(label).width;
          const x = big ? W / 2 - tw / 2 - 10 : 6;
          g.fillStyle = withAlpha(b.color, 0.92);
          g.beginPath();
          g.roundRect(x, y - (big ? 40 : 22), tw + 20, big ? 36 : 20, 6);
          g.fill();
          g.fillStyle = '#1e1710';
          g.fillText(label, x + 10, y - (big ? 13 : 7));
        }
      }
      // Blocks.
      if (L.screen === 'blocks') {
        L.timeline.hits.forEach((h, i) => {
          const bottom = yOf(h.beat * bm);
          const top = yOf((h.beat + h.dur * 0.9) * bm);
          if (bottom < 0 || top > lineY) return;
          const color = L.timeline.bars[h.bar]?.color ?? '#d9a441';
          const r = L.results[i];
          const alpha = r ? (r.status === 'miss' && !r.notesRight ? 0.25 : 0.95) : 0.85;
          for (const n of h.notes) {
            const k = keyBox(n, L.viewStart);
            if (!k) continue;
            g.fillStyle = withAlpha(color, alpha);
            g.beginPath();
            g.roundRect(k.x * W + 2, top, Math.max(4, k.w * W - 4), Math.max(4, Math.min(bottom, lineY) - top), 5);
            g.fill();
            if (r && r.status !== 'miss' && r.notesRight) {
              g.strokeStyle = r.status === 'perfect' ? '#f7f1e6' : 'rgba(247,241,230,0.6)';
              g.lineWidth = 2;
              g.stroke();
            }
          }
        });
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  return <canvas ref={canvas} className="block h-full w-full" data-testid="waterfall" aria-label="Waterfall: the chords to play fall onto the line above the keys" />;
};
