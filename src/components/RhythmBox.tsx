import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Waterfall } from './Waterfall';
import { GROOVES, Groove, padChords } from '../audio/groove';
import { grooveLevel } from './PlayLevel';
import { parseChord } from '../utils/chords';
import { Pattern } from '../data/pattern';
import { Timeline, beatMs, buildTimeline, hitAlt } from '../utils/patternEngine';
import { HitResult, TimingJudge } from '../utils/timing';
import { letterOf, pretty } from '../utils/music';
import { ModeCtx } from './modeTypes';
import { useNoteListener } from './chordInput';
import { textOn } from './ChordStrip';

/**
 * Learn's rhythm steps (the Chord rhythms lesson): a counting grid ("1 + 2 + 3 + 4 +") with each hit drawn where it
 * falls and as long as it lasts. ▶ Listen plays it with the clicks while a line moves along the grid. On try steps,
 * ▶ Play along counts in and listens: the keys of each hit light up, and it passes when most hits are right and close
 * to the beat (Good, or Early/Late: Learn is for getting the feel; Challenges grade it properly).
 */
const COUNT_IN = 4;
const LEAD_MS = 350;
/** Share of hits that must be right (notes, and Early/Late or better) to pass a Learn try. */
export const RHYTHM_PASS = 0.75;
const COUNTS = ['1', '+', '2', '+', '3', '+', '4', '+'];
/** Notes at different heights (broken chords, arpeggios, bass lines, riffs): while it plays, the Stage shows the
 *  falling-note waterfall over the keys, like Challenges (his call: much clearer than blocks on the grid). */
const FALLS = ['broken', 'brokenSplit', 'arpeggio', 'arp3', 'line', 'bassChord'];

export const RhythmBox: React.FC<{
  ctx: ModeCtx;
  pattern: Pattern;
  /** A try step: show ▶ Play along and call onPass when it's good enough. */
  tryIt?: boolean;
  onPass?: () => void;
  /** Keys to light on the piano (the hit sounding / due now). */
  onLit: (keys: Set<number> | null) => void;
  /** A groove to play along with (style id) instead of clicks; `grooveBass: false` leaves its bass out. */
  groove?: string;
  grooveBass?: boolean;
  /** Soft chords low under the line (riffs). */
  pad?: boolean;
}> = ({ ctx, pattern, tryIt, onPass, onLit, groove, grooveBass, pad }) => {
  const tl: Timeline = useMemo(() => buildTimeline(pattern), [pattern]);
  const bm = beatMs(tl.tempo);
  const [phase, setPhase] = useState<'idle' | 'listen' | 'play'>('idle');
  const [pos, setPos] = useState(-1); // beats since the first downbeat (negative in the count-in)
  const [result, setResult] = useState<{ right: number; total: number } | null>(null);
  const [startAt, setStartAt] = useState<number | null>(null);
  const [hitResults, setHitResults] = useState<(HitResult | undefined)[]>([]);
  const fall = FALLS.includes(pattern.texture);
  const timers = useRef<number[]>([]);
  const stopClicks = useRef<() => void>(() => {});
  const judge = useRef<TimingJudge | null>(null);
  const raf = useRef(0);

  const stop = () => {
    stopClicks.current();
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
    cancelAnimationFrame(raf.current);
    judge.current = null;
    ctx.engine.allOff();
    setPhase('idle');
    setPos(-1);
    onLit(null);
  };
  useEffect(() => () => stop(), []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    stop();
    setResult(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pattern.id]);

  const run = (listen: boolean) => {
    stop();
    setResult(null);
    ctx.stopMetronome();
    void ctx.engine.unlock();
    let firstHeardAt: number;
    // Chords under a riff ride along with the groove (or with the clicks, through the groove's click style).
    const style = GROOVES.find((g) => g.id === (groove ?? (pad ? 'click' : '')));
    if (style) {
      // The groove counts in with its own bar of clicks, then loops under the example until it ends.
      const g = Groove.get();
      g.setLevel(grooveLevel(style.id));
      const roots = tl.bars.map((b) => parseChord(b.symbol)?.root ?? tl.key.tonic);
      const beat1 = g.startGroove(grooveBass === false ? { ...style, bass: [] } : style, tl.tempo, roots, LEAD_MS / 1000, -COUNT_IN, pad ? padChords(tl.bars.map((b) => b.symbol)) : undefined);
      stopClicks.current = () => g.stop();
      firstHeardAt = beat1 - COUNT_IN * bm;
    } else {
      const clicks = ctx.engine.scheduleBeatClicks(LEAD_MS, COUNT_IN + tl.beats, tl.tempo);
      stopClicks.current = clicks.cancel;
      firstHeardAt = clicks.firstHeardAt;
    }
    const t0 = firstHeardAt + COUNT_IN * bm;
    setStartAt(t0);
    setHitResults([]);
    setPhase(listen ? 'listen' : 'play');
    const out = ctx.engine.outputDelayMs();
    for (const h of tl.hits) {
      const at = t0 - performance.now() + h.beat * bm;
      timers.current.push(
        window.setTimeout(() => {
          if (listen) h.notes.forEach((n) => ctx.engine.noteOn(n, 0.7));
          onLit(new Set(h.notes));
        }, at - (listen ? out : 60)),
      );
      if (listen) timers.current.push(window.setTimeout(() => h.notes.forEach((n) => ctx.engine.noteOff(n)), at + h.dur * 0.9 * bm - out));
    }
    if (!listen) {
      const results: (HitResult | undefined)[] = tl.hits.map(() => undefined);
      const expected = tl.hits.map((h) => ({
        t: t0 + h.beat * bm,
        pcs: h.pcs,
        ...(hitAlt(pattern.texture, h) ? { alt: hitAlt(pattern.texture, h) } : {}),
        slideMs: Math.max(300, h.dur * bm * 0.5),
      }));
      judge.current = new TimingJudge(
        expected,
        ctx.latency,
        (i, r) => {
          results[i] = r;
          setHitResults([...results]);
        },
        { getHeld: ctx.getHeld },
      );
      // For browser tests: when each hit is due and its keys (no student data).
      (window as unknown as { __play?: unknown }).__play = tl.hits.map((h, i) => ({ t: expected[i].t, notes: h.notes, dur: h.dur * bm }));
      timers.current.push(
        window.setTimeout(() => {
          judge.current?.tick(Infinity);
          const right = results.filter((r) => r && r.notesRight && r.status !== 'miss').length;
          const total = tl.hits.length;
          setResult({ right, total });
          stop();
          if (right / total >= RHYTHM_PASS) onPass?.();
        }, t0 - performance.now() + (tl.beats + 0.6) * bm),
      );
    } else timers.current.push(window.setTimeout(stop, t0 - performance.now() + (tl.beats + 0.3) * bm));
    const loop = () => {
      const now = performance.now();
      judge.current?.tick(now);
      setPos((now - t0) / bm);
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
  };

  useNoteListener(ctx.subscribe, (midi) => {
    if (judge.current) judge.current.press(performance.now(), midi);
  });

  // The grid: every bar of the pattern, 8 counts each. Counts, lines and blocks are all placed by the same percentages,
  // so each count sits exactly where its beat starts (a half note on 3 starts right under the 3).
  const slots = (tl.beats / 4) * 8;
  const counting = phase !== 'idle' && pos < 0 && pos >= -COUNT_IN ? Math.floor(pos + COUNT_IN) + 1 : 0;
  const slotNow = phase !== 'idle' && pos >= 0 ? Math.floor(pos * 2) : -1;
  const at = (beat: number) => `${(beat / tl.beats) * 100}%`;
  const showFall = fall && phase !== 'idle';
  const stageEl = typeof document !== 'undefined' ? document.querySelector('[data-testid=stage]') : null;
  return (
    <div className="flex w-full max-w-[760px] flex-col items-center gap-1.5" data-testid="rhythm-box">
      <div className={`w-full rounded-lg bg-[#2a2118] ${ctx.phone ? 'px-1.5 pb-1 pt-0.5' : 'px-2 pb-1.5 pt-1'}`} data-testid="rhythm-grid">
        <div className="relative">
          {/* Lines: bar lines strong, beats medium, the +s faint. */}
          {Array.from({ length: slots }, (_, k) => (
            <div key={k} className={`absolute bottom-0 top-0 ${k % 8 === 0 ? 'w-[2px] bg-wal1' : k % 2 === 0 ? 'w-px bg-wal2/70' : 'w-px bg-wal2/30'}`} style={{ left: at(k / 2) }} />
          ))}
          <div className={`relative ${ctx.phone ? 'h-5' : 'h-6'}`}>
            {Array.from({ length: slots }, (_, k) => {
              const c = COUNTS[k % 8];
              return (
                <span key={k} className={`h absolute top-0 pl-1.5 leading-none ${ctx.phone ? 'pt-1 text-[12px]' : 'pt-1 text-[15px]'} ${k === slotNow ? 'text-brass' : c === '+' ? 'text-line2/50' : 'text-line2'}`} style={{ left: at(k / 2) }}>
                  {c}
                </span>
              );
            })}
          </div>
          <div className={`relative ${ctx.phone ? 'h-6' : 'h-8'}`} data-testid="rhythm-hits">
            {tl.hits.map((h, k) => {
              const color = tl.bars[h.bar]?.color ?? '#d9a441';
              const label = h.kind === 'chord' ? tl.bars[h.bar]?.symbol : (h.name ?? pretty(letterOf(h.notes[0])));
              return (
                <div
                  key={k}
                  className="absolute top-0 flex h-full items-center overflow-hidden rounded-r-md pl-1.5 text-[13px] font-semibold"
                  style={{ left: at(h.beat), width: `calc(${(h.dur / tl.beats) * 100}% - 2px)`, background: color, color: textOn(color), opacity: h.kind === 'chord' ? 1 : 0.85 }}
                >
                  {label}
                </div>
              );
            })}
          </div>
          {phase !== 'idle' && pos >= 0 && <div className="absolute bottom-0 top-0 w-0.5 bg-panel" style={{ left: at(Math.min(tl.beats, pos)) }} />}
          {counting > 0 && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-[#2a2118]/70">
              <span className="h text-[32px] text-brass" data-testid="rhythm-count">
                {counting}
              </span>
            </div>
          )}
        </div>
      </div>
      {showFall &&
        stageEl &&
        createPortal(
          <div className="absolute inset-0 z-30 bg-[#1e1710]" data-testid="rhythm-fall">
            <div className="absolute inset-y-0 left-[2px] right-[2px]">
              <Waterfall timeline={tl} tempo={tl.tempo} startAt={startAt} now={() => performance.now()} viewStart={ctx.viewStart} screen="blocks" results={hitResults} />
            </div>
            {counting > 0 && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <span className="h text-[96px] leading-none text-brass">{counting}</span>
              </div>
            )}
            <div className="absolute right-3 top-2 flex items-center gap-2">
              <span className="h text-[12px] uppercase tracking-wider text-brass">{phase === 'listen' ? 'Listening' : 'Play along'} · {tl.tempo} BPM</span>
              <button className="btn btn-dark px-3 py-1 text-[13px]" onClick={stop}>
                Stop
              </button>
            </div>
          </div>,
          stageEl,
        )}
      <div className="flex items-center gap-2">
        <button className="btn btn-dark text-[15px]" disabled={phase !== 'idle'} onClick={() => run(true)} data-testid="rhythm-listen">
          ▶ Listen
        </button>
        {tryIt && (
          <button className="btn btn-brass text-[15px]" disabled={phase !== 'idle'} onClick={() => run(false)} data-testid="rhythm-play">
            ▶ Play along
          </button>
        )}
        {phase !== 'idle' && (
          <button className="btn btn-dark text-[14px]" onClick={stop}>
            Stop
          </button>
        )}
        <span className="h text-[12px] uppercase tracking-wider text-brass">{tl.tempo} BPM</span>
      </div>
      {result && !(tryIt && result.right / result.total >= RHYTHM_PASS) && (
        <div className={`rounded-lg px-3 py-1 text-[15px] ${result.right / result.total >= RHYTHM_PASS ? 'bg-[#cfe3b4] text-good' : 'bg-[#f6e3b8] text-wal1'}`} data-testid="rhythm-result">
          {result.right} of {result.total} on time with the right notes.{' '}
          {result.right / result.total >= RHYTHM_PASS ? 'Nice!' : 'Listen once more, then try again. Count out loud.'}
        </div>
      )}
    </div>
  );
};
