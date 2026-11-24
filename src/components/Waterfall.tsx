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
 * blocks (easiest), or chord names only (full-width bands). `now()` is the time in ms on the same clock as `startAt`
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
      // Beat lines across the Stage (all modes; they show the beat, not the answer): beat 1 (the bar line) thickest,
      // beat 3 (the half-bar) medium, beats 2 and 4 thin. The count-in beats get lines too, so the grid is steady.
      for (let beat = -4; beat <= L.timeline.beats; beat++) {
        const y = yOf(beat * bm);
        if (y < -4 || y > lineY) continue;
        const pos = ((beat % 4) + 4) % 4;
        const [h, a] = pos === 0 ? [4, 0.32] : pos === 2 ? [2, 0.2] : [1, 0.11];
        g.fillStyle = `rgba(247,241,230,${a})`;
        g.fillRect(0, Math.round(y - h / 2), W, h);
      }
      // Bars: each bar's chord (and numeral) at the left (blocks mode).
      if (L.screen === 'blocks') {
        for (const b of L.timeline.bars) {
          const y = yOf(b.beat * bm);
          if (y < -30 || y > lineY + 2) continue;
          g.font = '600 15px "Barlow Semi Condensed", sans-serif';
          const label = `${b.symbol}  ${b.numeral}`;
          const tw = g.measureText(label).width;
          g.fillStyle = withAlpha(b.color, 0.92);
          g.beginPath();
          g.roundRect(6, y - 22, tw + 20, 20, 6);
          g.fill();
          g.fillStyle = '#1e1710';
          g.fillText(label, 16, y - 7);
        }
      }
      // Chord names only: each chord is a band across the whole Stage (not over any one piano key), named in the middle,
      // and it lands on the line when it's time to play.
      if (L.screen === 'names') {
        L.timeline.hits.forEach((h, i) => {
          const bottom = yOf(h.beat * bm);
          const top = yOf((h.beat + h.dur * 0.9) * bm);
          if (bottom < 0 || top > lineY) return;
          const bar = L.timeline.bars[h.bar];
          const r = L.results[i];
          const y2 = Math.min(bottom, lineY);
          g.fillStyle = withAlpha(bar?.color ?? '#d9a441', r ? (r.status === 'miss' && !r.notesRight ? 0.25 : 0.95) : 0.85);
          g.beginPath();
          g.roundRect(8, top, W - 16, Math.max(6, y2 - top), 8);
          g.fill();
          if (r && r.status !== 'miss' && r.notesRight) {
            g.strokeStyle = r.status === 'perfect' ? '#f7f1e6' : 'rgba(247,241,230,0.6)';
            g.lineWidth = 2;
            g.stroke();
          }
          if (!bar || y2 - top < 22) return;
          // The name sits near the band's bottom edge (the part that reaches the line first), kept on screen.
          const label = `${bar.symbol}   ${bar.numeral}`;
          const size = Math.min(34, Math.max(18, (y2 - top) * 0.5));
          g.font = `600 ${size}px "Barlow Semi Condensed", sans-serif`;
          g.fillStyle = '#1e1710';
          g.textAlign = 'center';
          g.fillText(label, W / 2, Math.max(top + size, y2 - Math.max(8, Math.min(18, (y2 - top) * 0.25))));
          g.textAlign = 'left';
        });
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
