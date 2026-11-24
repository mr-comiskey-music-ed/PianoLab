import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Level, ScreenHelp } from '../types';
import { Timeline, beatMs, buildTimeline } from '../utils/patternEngine';
import { HitResult, TimingJudge, TimingSummary, summarize } from '../utils/timing';
import { pc } from '../utils/music';
import { ModeCtx } from './modeTypes';
import { Waterfall } from './Waterfall';
import { useNoteListener } from './chordInput';

/** Easiest to hardest. A level's `screen` is the most help allowed; students can take less. */
export const SCREEN_ORDER: ScreenHelp[] = ['blocks', 'names', 'off'];
const SCREEN_LABEL: Record<ScreenHelp, string> = { blocks: 'Falling blocks', names: 'Chord names only', off: 'Nothing (memory)' };
const COUNT_IN = 4;
const LEAD_MS = 350;
/** The fastest a student may push a level's tempo. */
const MAX_TEMPO_UP = 60;

type Phase = 'idle' | 'count' | 'run' | 'listen';

/**
 * Progression Play (SPEC section 5): play a pattern in time with the waterfall. A count-in of 4 wood-block clicks,
 * then the clicks keep the beat. Each hit is graded for timing (Perfect / Good / Miss) and notes; the grade is half of
 * each (`utils/timing.ts`). "Listen first" plays it through without grading.
 */
export function usePlayLevel(
  ctx: ModeCtx,
  level: Level,
  opts: { minTempo?: number; onFinish: (raw: number, summary: TimingSummary, settings: { tempo: number; screen: ScreenHelp }) => void },
) {
  const pattern = level.pattern;
  const floorTempo = Math.max(pattern?.tempo ?? 80, opts.minTempo ?? 0);
  const [tempo, setTempo] = useState(floorTempo);
  const [screen, setScreen] = useState<ScreenHelp>(level.screen ?? 'blocks');
  const [phase, setPhase] = useState<Phase>('idle');
  const [startAt, setStartAt] = useState<number | null>(null);
  const [results, setResults] = useState<(HitResult | undefined)[]>([]);
  const [pop, setPop] = useState<{ text: string; kind: 'perfect' | 'good' | 'miss'; id: number } | null>(null);
  const [count, setCount] = useState(0);
  const [litNow, setLitNow] = useState<Set<number> | undefined>(undefined);
  const judge = useRef<TimingJudge | null>(null);
  const stopClicks = useRef<() => void>(() => {});
  const timers = useRef<number[]>([]);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  // A new level: back to its own starting settings.
  useEffect(() => {
    setTempo(floorTempo);
    setScreen(level.screen ?? 'blocks');
    stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level.id, floorTempo]);

  const timeline: Timeline | null = useMemo(() => (pattern ? buildTimeline(pattern, tempo) : null), [pattern, tempo]);

  const stop = () => {
    stopClicks.current();
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
    judge.current = null;
    ctx.engine.allOff();
    setPhase('idle');
    setStartAt(null);
    setLitNow(undefined);
  };
  useEffect(() => () => stop(), []); // eslint-disable-line react-hooks/exhaustive-deps

  const begin = (listenOnly: boolean) => {
    if (!timeline) return;
    stop();
    ctx.stopMetronome();
    void ctx.engine.unlock();
    const bm = beatMs(tempo);
    const t0 = performance.now() + LEAD_MS + COUNT_IN * bm;
    setStartAt(t0);
    setResults(timeline.hits.map(() => undefined));
    setPop(null);
    setPhase(listenOnly ? 'listen' : 'count');
    stopClicks.current = ctx.engine.scheduleBeatClicks(LEAD_MS, COUNT_IN + timeline.beats, tempo);
    // Count-in numbers on the Stage: 1, 2, 3, 4 with the clicks, like counting a band in.
    for (let i = 0; i < COUNT_IN; i++) timers.current.push(window.setTimeout(() => setCount(i + 1), LEAD_MS + i * bm));
    timers.current.push(window.setTimeout(() => setPhase((p) => (p === 'count' ? 'run' : p)), LEAD_MS + COUNT_IN * bm - 120));
    if (listenOnly) {
      // The app plays it, keys lit, nothing graded.
      for (const h of timeline.hits) {
        timers.current.push(window.setTimeout(() => {
          h.notes.forEach((n) => ctx.engine.noteOn(n, 0.7));
          setLitNow(new Set(h.notes));
        }, t0 - performance.now() + h.beat * bm));
        timers.current.push(window.setTimeout(() => {
          h.notes.forEach((n) => ctx.engine.noteOff(n));
        }, t0 - performance.now() + (h.beat + h.dur * 0.92) * bm));
      }
    } else {
      const expected = timeline.hits.map((h) => ({ t: t0 + h.beat * bm, pcs: h.pcs }));
      // For browser tests: when each hit is due and its keys (no student data).
      (window as unknown as { __play?: unknown }).__play = timeline.hits.map((h, i) => ({ t: expected[i].t, notes: h.notes, dur: h.dur * bm }));
      const results: (HitResult | undefined)[] = timeline.hits.map(() => undefined);
      let id = 0;
      judge.current = new TimingJudge(expected, ctx.latency, (i, r) => {
        results[i] = r;
        setResults([...results]);
        const text = !r.notesRight && r.dt !== undefined ? 'Wrong notes' : r.status === 'perfect' ? 'Perfect!' : r.status === 'good' ? 'Good' : r.dt !== undefined ? (r.dt < 0 ? 'Early' : 'Late') : 'Miss';
        setPop({ text, kind: !r.notesRight ? 'miss' : r.status, id: ++id });
      });
    }
    // End: a beat after the last bar, then the result.
    timers.current.push(
      window.setTimeout(() => {
        const j = judge.current;
        if (j) j.tick(Infinity);
        const s = j ? summarize(j.results) : null;
        const settings = { tempo, screen };
        stop();
        if (s && !listenOnly) opts.onFinish(s.raw, s, settings);
      }, t0 - performance.now() + (timeline.beats + 1) * bm + 300),
    );
  };

  // Key presses go to the judge (during the count-in too: an early first chord still counts if it's close enough).
  useNoteListener(ctx.subscribe, (midi) => {
    if (phaseRef.current !== 'run' && phaseRef.current !== 'count') return;
    judge.current?.press(performance.now(), pc(midi));
  });

  // While it runs: hits that went by unplayed become misses; with blocks showing, the keys of the current hit light up.
  useEffect(() => {
    if ((phase !== 'run' && phase !== 'count') || !timeline || startAt === null) return;
    const bm = beatMs(tempo);
    let raf = 0;
    let lastKey = '';
    const loop = () => {
      const now = performance.now();
      judge.current?.tick(now);
      if (screen === 'blocks') {
        const t = now - startAt;
        const h = timeline.hits.find((x) => t >= x.beat * bm - 60 && t < (x.beat + x.dur * 0.9) * bm);
        const key = h ? h.notes.join() : '';
        if (key !== lastKey) {
          lastKey = key;
          setLitNow(h ? new Set(h.notes) : undefined);
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [phase, timeline, startAt, tempo, screen]);

  const running = phase !== 'idle';
  const allowedScreens = SCREEN_ORDER.filter((s) => SCREEN_ORDER.indexOf(s) >= SCREEN_ORDER.indexOf(level.screen ?? 'blocks'));

  const settingsUI = (
    <div className="flex flex-wrap items-center justify-center gap-3 text-[14px] text-line">
      <span className="flex items-center gap-1.5" data-testid="tempo-setting">
        <span className="h text-[12px] uppercase tracking-wider text-brass">Tempo</span>
        <button className="btn btn-dark px-2 py-0.5" disabled={tempo <= floorTempo} onClick={() => setTempo((t) => Math.max(floorTempo, t - 5))} aria-label="Slower">
          −
        </button>
        <span className="h w-16 text-center text-[16px]" data-testid="tempo-value">
          {tempo} BPM
        </span>
        <button className="btn btn-dark px-2 py-0.5" disabled={tempo >= floorTempo + MAX_TEMPO_UP} onClick={() => setTempo((t) => Math.min(floorTempo + MAX_TEMPO_UP, t + 5))} aria-label="Faster">
          +
        </button>
      </span>
      <span className="flex items-center gap-1.5" role="radiogroup" aria-label="What shows on the waterfall">
        <span className="h text-[12px] uppercase tracking-wider text-brass">Show</span>
        {SCREEN_ORDER.map((s) => (
          <button
            key={s}
            role="radio"
            aria-checked={screen === s}
            disabled={!allowedScreens.includes(s)}
            data-testid={`screen-${s}`}
            className={`btn px-2 py-0.5 text-[13px] ${screen === s ? 'btn-brass' : 'btn-dark'} disabled:opacity-40`}
            onClick={() => setScreen(s)}
          >
            {SCREEN_LABEL[s]}
          </button>
        ))}
      </span>
    </div>
  );

  const stage = timeline ? (
    <div className="relative h-full w-full" data-testid="play-stage">
      <div className="absolute inset-y-0 left-[2px] right-[2px]">
        <Waterfall timeline={timeline} tempo={tempo} startAt={startAt} now={() => performance.now()} viewStart={ctx.viewStart} screen={running ? screen : 'blocks'} results={results} />
      </div>
      {!running && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#1e1710]/80 px-6 text-center">
          <div className="h text-[14px] tracking-wide text-brass">{level.title}</div>
          <div className="h max-w-[680px] text-[26px] leading-tight text-panel">{level.blurb}</div>
          <div className="text-[14px] text-line2">
            {timeline.bars.map((b) => b.symbol).join(' – ')} · {pattern?.bars} bars · {level.pass}% to pass · half the grade is timing, half is the right notes
          </div>
          {settingsUI}
          <div className="flex gap-2">
            <button className="btn btn-dark text-[16px]" onClick={() => begin(true)} data-testid="listen-first">
              ▶ Listen first
            </button>
            <button className="btn btn-brass text-[18px]" onClick={() => begin(false)} data-testid="start">
              Start
            </button>
          </div>
        </div>
      )}
      {phase === 'count' && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h text-[96px] leading-none text-brass" data-testid="count-in">
            {count || ''}
          </div>
        </div>
      )}
      {running && (
        <div className="absolute right-3 top-2 flex items-center gap-2">
          <span className="h text-[12px] uppercase tracking-wider text-brass">{phase === 'listen' ? 'Listening' : `${tempo} BPM`}</span>
          <button className="btn btn-dark px-3 py-1 text-[13px]" onClick={stop} data-testid="restart">
            Stop
          </button>
        </div>
      )}
      {pop && phase === 'run' && (
        <div key={pop.id} className="pop pointer-events-none absolute bottom-8 left-1/2 -translate-x-1/2" data-testid="hit-pop">
          <span className={`h rounded-lg px-3 py-1 text-[22px] ${pop.kind === 'perfect' ? 'bg-[#cfe3b4] text-good' : pop.kind === 'good' ? 'bg-[#f6e3b8] text-wal2' : 'bg-[#f0c4bf] text-[#7a2420]'}`}>{pop.text}</span>
        </div>
      )}
    </div>
  ) : (
    <div className="flex h-full items-center justify-center text-line2">This level has no pattern.</div>
  );

  return { stage, running, lit: phase === 'listen' || screen === 'blocks' ? litNow : undefined, stop, tempo, screen };
}
