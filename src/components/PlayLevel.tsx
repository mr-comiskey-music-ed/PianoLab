import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Level, ScreenHelp } from '../types';
import { Timeline, beatMs, buildTimeline, chordSummary, hitAlt } from '../utils/patternEngine';
import { HitResult, NotesCheck, TimingJudge, TimingSummary, pitchClassCheck, steadyOffset, summarize } from '../utils/timing';
import { chordPcs, moveDistance, moveSizes, parseChord } from '../utils/chords';
import { GROOVES, Groove, padChords } from '../audio/groove';
import { pc } from '../utils/music';
import { ModeCtx } from './modeTypes';
import { Waterfall } from './Waterfall';
import { MiniKeys } from './MiniKeys';
import { Col, StageBox } from './StageRow';
import { useNoteListener } from './chordInput';

/** Easiest to hardest. A level's `screen` is the most help allowed; students can take less. ("Nothing (memory)" was
 *  removed at his request: it doesn't make sense for a waterfall.) */
export const SCREEN_ORDER: ScreenHelp[] = ['blocks', 'names'];
const SCREEN_LABEL: Record<ScreenHelp, string> = { blocks: 'Falling Note Blocks', names: 'Chord Names Only' };
const COUNT_IN = 4;
const LEAD_MS = 350;
/** The groove's level in timed levels and Learn: Pop 25% louder (his call), the rest as made. */
export const grooveLevel = (id: string) => (id === 'pop' ? Math.sqrt(1.25) : 1);
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
  opts: { minTempo?: number; onFinish: (raw: number, summary: TimingSummary, settings: { tempo: number; screen: ScreenHelp; shapes: boolean }) => void },
) {
  const pattern = level.pattern;
  const floorTempo = Math.max(pattern?.tempo ?? 80, opts.minTempo ?? 0);
  const [tempo, setTempo] = useState(floorTempo);
  const [screen, setScreen] = useState<ScreenHelp>(level.screen ?? 'blocks');
  const [phase, setPhase] = useState<Phase>('idle');
  const [startAt, setStartAt] = useState<number | null>(null);
  const [results, setResults] = useState<(HitResult | undefined)[]>([]);
  const [pop, setPop] = useState<{ text: string; kind: 'perfect' | 'good' | 'off' | 'miss'; id: number } | null>(null);
  const [count, setCount] = useState(0);
  const [litNow, setLitNow] = useState<Set<number> | undefined>(undefined);
  /**
   * The chord shape helper (SPEC section 5): two small keyboards with this chord's keys and the next chord's. Chord
   * patterns only, Chromebooks only (no room on a phone). An assignment can fix it on or hide it; the code records it.
   */
  const shapesRule = ctx.assignment?.shapes ?? 'choose';
  const hasChords = !!pattern && ['block', 'bassChord', 'broken', 'brokenSplit'].includes(pattern.texture);
  // Only with Chord Names Only (the falling blocks already show the shape), and not in Chord rhythms, where inversions
  // are part of the point (his call: the shapes steer students away from them).
  const shapesAllowed = hasChords && !ctx.phone && shapesRule !== 'off' && screen === 'names' && ctx.lesson.id !== 'lesson-rhythm';
  const [shapesPick, setShapesPick] = useState(false);
  const shapes = shapesAllowed && (shapesRule === 'on' || shapesPick);
  const [barNow, setBarNow] = useState(-1);
  /** Levels with a groove: play along with drums and bass (the default), or just the clicks. */
  const [withGroove, setWithGroove] = useState(true);
  const grooveStyle = level.groove ? GROOVES.find((g) => g.id === level.groove) : undefined;
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
    // Everything follows the clicks as they are HEARD (audio clock + the device's output delay), so the blocks land on
    // the line with the click and a key played with the click is on time.
    let firstHeardAt: number;
    const backing = grooveStyle && withGroove ? grooveStyle : level.pad ? GROOVES.find((g) => g.id === 'click') : undefined;
    if (backing) {
      // A groove (drums + bass on each bar's root) with its own bar of clicks to count in. It loops; Stop ends it.
      const g = Groove.get();
      g.setLevel(grooveLevel(backing.id));
      const roots = timeline.bars.map((b) => parseChord(b.symbol)?.root ?? timeline.key.tonic);
      const style = level.grooveBass === false ? { ...backing, bass: [] } : backing;
      // Riff levels: soft chords low under the line, with the groove or the clicks.
      const beat1 = g.startGroove(style, tempo, roots, LEAD_MS / 1000, -COUNT_IN, level.pad ? padChords(timeline.bars.map((b) => b.symbol)) : undefined);
      stopClicks.current = () => g.stop();
      firstHeardAt = beat1 - COUNT_IN * bm;
    } else {
      const clicks = ctx.engine.scheduleBeatClicks(LEAD_MS, COUNT_IN + timeline.beats, tempo);
      stopClicks.current = clicks.cancel;
      firstHeardAt = clicks.firstHeardAt;
    }
    const heard = firstHeardAt - performance.now();
    const t0 = firstHeardAt + COUNT_IN * bm;
    setStartAt(t0);
    setResults(timeline.hits.map(() => undefined));
    setPop(null);
    setPhase(listenOnly ? 'listen' : 'count');
    // Count-in numbers on the Stage: 1, 2, 3, 4 with the clicks, like counting a band in.
    for (let i = 0; i < COUNT_IN; i++) timers.current.push(window.setTimeout(() => setCount(i + 1), heard + i * bm));
    timers.current.push(window.setTimeout(() => setPhase((p) => (p === 'count' ? 'run' : p)), heard + COUNT_IN * bm - 120));
    if (listenOnly) {
      // The app plays it, keys lit, nothing graded. Notes start early by the output delay, so they're heard with the click.
      const out = ctx.engine.outputDelayMs();
      for (const h of timeline.hits) {
        timers.current.push(window.setTimeout(() => {
          h.notes.forEach((n) => ctx.engine.noteOn(n, 0.7));
          setLitNow(new Set(h.notes));
        }, t0 - performance.now() + h.beat * bm - out));
        timers.current.push(window.setTimeout(() => {
          h.notes.forEach((n) => ctx.engine.noteOff(n));
        }, t0 - performance.now() + (h.beat + h.dur * 0.92) * bm - out));
      }
    } else {
      // Root-only hits in a chord pattern (root, then chord) also accept the whole chord in any inversion: with Chord
      // Names Only you can't see it's just the root. Wrong chords can be fixed for half the chord's length (at least 0.4 s).
      const expected = timeline.hits.map((h) => ({
        t: t0 + h.beat * bm,
        pcs: h.pcs,
        ...(pattern && hitAlt(pattern.texture, h) ? { alt: hitAlt(pattern.texture, h) } : {}),
        slideMs: Math.max(400, h.dur * bm * 0.5),
      }));
      // For browser tests: when each hit is due and its keys (no student data).
      (window as unknown as { __play?: unknown }).__play = timeline.hits.map((h, i) => ({ t: expected[i].t, notes: h.notes, dur: h.dur * bm }));
      const results: (HitResult | undefined)[] = timeline.hits.map(() => undefined);
      let id = 0;
      // Smooth levels: the right chord AND a smooth move from the chord the student just played. The smoothest move is
      // full credit for notes, the second-smoothest 0.75 ("Almost smooth"), anything bigger is "Not smooth": the right
      // notes still earn 25% of the chord (his call). So "Chord Names Only" really tests smooth moving. The first chord
      // (or one after a gap) can be any voicing.
      const byNames = pitchClassCheck(expected);
      let prev: number[] | null = null;
      const smooth = pattern?.voicing === 'smoothest';
      const checkNotes: NotesCheck = (i, keys) => {
        const basic = byNames(i, keys);
        if (!smooth || basic.credit === 0) return basic;
        const notes = [...new Set(keys)].sort((a, b) => a - b);
        const chord = parseChord(timeline.bars[timeline.hits[i].bar]?.symbol ?? '');
        let res: { credit: number; why?: string; partial?: number } = { credit: 1 };
        if (prev && chord) {
          const size = chordPcs(chord).length; // 3 for triads, 4 for 7th chords
          const moved = moveDistance(prev, notes.slice(0, size));
          const sizes = moveSizes(prev, chord);
          res =
            notes.length === size && moved <= sizes[0]
              ? { credit: 1 }
              : notes.length === size && moved <= (sizes[1] ?? sizes[0])
                ? { credit: 0.75, why: 'Almost smooth' }
                : { credit: 1, why: 'Not smooth', partial: 0.25 };
        }
        if (res.credit > 0) prev = notes;
        return res;
      };
      judge.current = new TimingJudge(
        expected,
        ctx.latency,
        (i, r) => {
          results[i] = r;
          setResults([...results]);
          if (r.status === 'miss' && r.dt === undefined) prev = null; // not played: the next chord starts fresh
          const when = r.status === 'perfect' ? 'Perfect!' : r.status === 'good' ? 'Good' : (r.dt ?? 0) < 0 ? 'Early' : 'Late';
          const text = !r.notesRight ? (r.dt === undefined ? 'Miss' : (r.why ?? 'Wrong notes')) : r.why ? `${when} · ${r.why}` : when;
          setPop({ text, kind: !r.notesRight ? 'miss' : r.status, id: ++id });
        },
        { checkNotes, getHeld: ctx.getHeld },
      );
    }
    // End: a beat after the last bar, then the result.
    timers.current.push(
      window.setTimeout(() => {
        const j = judge.current;
        if (j) j.tick(Infinity);
        const s = j ? summarize(j.results) : null;
        // Steadily early or late by about the same amount? The latency setting may be wrong (see the result screen).
        if (j && s) {
          const off = steadyOffset(j.presses, timeline.hits.map((h) => t0 + h.beat * bm), bm / 2);
          if (off !== null) s.offset = off;
        }
        const settings = { tempo, screen, shapes };
        stop();
        if (s && !listenOnly) opts.onFinish(s.raw, s, settings);
      }, t0 - performance.now() + (timeline.beats + 1) * bm + 300),
    );
  };

  // Key presses go to the judge (during the count-in too: an early first chord still counts if it's close enough).
  useNoteListener(ctx.subscribe, (midi) => {
    if (phaseRef.current !== 'run' && phaseRef.current !== 'count') return;
    judge.current?.press(performance.now(), midi);
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
      const b = Math.floor((now - startAt) / bm / 4);
      setBarNow((x) => (x === b ? x : b));
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
  // Scales (Lesson 7) and arpeggios fall as note blocks only: "Chord Names Only" has nothing to show for a scale.
  const shownScreens: ScreenHelp[] = pattern && ['scale', 'arpeggio', 'arp3', 'line'].includes(pattern.texture) ? ['blocks'] : SCREEN_ORDER;
  const allowedScreens = shownScreens.filter((s) => SCREEN_ORDER.indexOf(s) >= SCREEN_ORDER.indexOf(level.screen ?? 'blocks'));

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
      {grooveStyle && (
        <span className="flex items-center gap-1.5" role="radiogroup" aria-label="Backing">
          <span className="h text-[12px] uppercase tracking-wider text-brass">Backing</span>
          {([true, false] as const).map((on) => (
            <button key={String(on)} role="radio" aria-checked={withGroove === on} data-testid={`backing-${on ? 'groove' : 'clicks'}`} className={`btn px-2 py-0.5 text-[13px] ${withGroove === on ? 'btn-brass' : 'btn-dark'}`} onClick={() => setWithGroove(on)}>
              {on ? `${grooveStyle.name} groove` : 'Clicks'}
            </button>
          ))}
        </span>
      )}
      {shapesAllowed && shapesRule === 'choose' && (
        <span className="flex items-center gap-1.5" role="radiogroup" aria-label="Chord shapes">
          <span className="h text-[12px] uppercase tracking-wider text-brass">Chord shapes</span>
          {([false, true] as const).map((on) => (
            <button key={String(on)} role="radio" aria-checked={shapesPick === on} data-testid={`shapes-${on ? 'on' : 'off'}`} className={`btn px-2 py-0.5 text-[13px] ${shapesPick === on ? 'btn-brass' : 'btn-dark'}`} onClick={() => setShapesPick(on)}>
              {on ? 'Show' : 'Hide'}
            </button>
          ))}
        </span>
      )}
      <span className="flex items-center gap-1.5" role="radiogroup" aria-label="What shows on the waterfall">
        <span className="h text-[12px] uppercase tracking-wider text-brass">Show</span>
        {shownScreens.map((s) => (
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
        <div className="absolute inset-0 bg-[#1e1710]/80">
        <StageBox phone={ctx.phone} className="gap-3 px-6">
          <Col phone={ctx.phone} className="max-w-[40%]">
          <div className="h text-[14px] tracking-wide text-brass">{level.title}</div>
          <div className="h max-w-[680px] text-[26px] leading-tight text-panel">{level.blurb}</div>
          <div className="flex flex-col gap-0.5 text-[14px] text-line2">
            <span data-testid="play-summary">
              {pattern?.texture === 'scale' ? `${timeline.key.label} scale, up and down` : chordSummary(timeline.bars.map((b) => b.symbol))} · {timeline.bars.length} bars
            </span>
            <span>{level.pass}% to pass, half on timing, half on correct notes</span>
          </div>
          </Col>
          {!ctx.latencySet && !ctx.latencySkipped ? (
            // First timed challenge on this device: check latency first, so the timing grades are fair.
            <div className="flex max-w-[560px] flex-col items-center gap-2 rounded-lg bg-[#f6e3b8] px-4 py-3 text-[15px] text-wal2" data-testid="latency-first">
              <span className="h text-[17px] text-wal3">First, a quick latency check (about 10 seconds).</span>
              <span>It makes your timing grades fair for your keyboard and headphones.</span>
              <div className="mt-1 flex gap-2">
                <button className="btn btn-brass" onClick={ctx.openLatency} data-testid="latency-first-check">
                  Check latency
                </button>
                <button className="btn" onClick={ctx.skipLatency} data-testid="latency-first-skip">
                  Skip for now
                </button>
              </div>
            </div>
          ) : (
            <>
              <Col phone={ctx.phone} className="max-w-[34%]">
              {settingsUI}
              </Col>
              <Col phone={ctx.phone}>
              <div className={`flex gap-2 ${ctx.phone ? 'flex-col' : ''}`}>
                <button className="btn btn-dark text-[16px]" onClick={() => begin(true)} data-testid="listen-first">
                  ▶ Listen first
                </button>
                <button className="btn btn-brass text-[18px]" onClick={() => begin(false)} data-testid="start">
                  Start
                </button>
              </div>
              </Col>
            </>
          )}
        </StageBox>
        </div>
      )}
      {shapes && running && timeline && (
        // This bar's chord and the next one (during the count-in: the first chord, and the one after it).
        <div className="pointer-events-none absolute left-3 top-2 z-10 flex gap-3 rounded-md bg-[#1e1710]/85 px-2 py-1.5" data-testid="chord-shapes">
          {[0, 1].map((k) => {
            const b = Math.max(0, barNow) + k;
            const bar = timeline.bars[b];
            const keys = Array.from(new Set(timeline.hits.filter((h) => h.bar === b).flatMap((h) => h.notes)));
            return bar ? <MiniKeys key={k} start={ctx.viewStart} keys={keys} color={bar.color} faint={k === 1} label={`${k ? 'Next' : 'Now'}: ${bar.symbol}`} testid={`shape-${k ? 'next' : 'now'}`} /> : null;
          })}
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
        <div key={pop.id} className={`pop pointer-events-none absolute -translate-x-1/2 ${shapes ? 'left-3/4' : 'left-1/2'} ${screen === 'names' ? 'top-3' : 'bottom-8'}`} data-testid="hit-pop">
          <span className={`h rounded-lg px-3 py-1 text-[22px] ${pop.kind === 'perfect' ? 'bg-[#cfe3b4] text-good' : pop.kind === 'good' ? 'bg-[#f6e3b8] text-wal2' : pop.kind === 'off' ? 'bg-[#efd6a8] text-wal2' : 'bg-[#f0c4bf] text-[#7a2420]'}`}>{pop.text}</span>
        </div>
      )}
    </div>
  ) : (
    <div className="flex h-full items-center justify-center text-line2">This level has no pattern.</div>
  );

  return { stage, running, lit: phase === 'listen' || screen === 'blocks' ? litNow : undefined, stop, tempo, screen };
}
