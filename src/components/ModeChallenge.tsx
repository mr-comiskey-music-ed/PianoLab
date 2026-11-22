import { useEffect, useRef, useState } from 'react';
import { Level, Prompt } from '../types';
import { KEY_COUNT, isBlack, parseNote, pc, pcOf, pretty } from '../utils/music';
import { Chord, chordLongName, chordName, detectChord, matchesChord, moveDistance, parseChord, smoothestVoicing, voicing } from '../utils/chords';
import { accuracy, credit, floored, passed } from '../utils/grading';
import { loadBest, saveBest } from '../utils/autosave';
import { KeyMark } from './Piano';
import { LABEL_ORDER, Labels, ModeCtx, ModeParts } from './modeTypes';
import { chordWatcher } from './chordInput';

const ALL_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];

const shuffle = <T,>(xs: T[]) => {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

interface Run {
  level: Level;
  prompts: Prompt[];
  idx: number;
  /** Credit earned so far (1 for a first-try answer, 0.5 for a second try). */
  points: number;
  misses: number;
  /** Smooth Mover: the chord the student is moving from (stays lit), and half steps moved so far vs the best possible. */
  prev?: number[];
  moved?: number;
  bestMoves?: number;
}
interface Finished {
  level: Level;
  raw: number;
  best: number;
  /** Smooth Mover: half steps moved, and the fewest possible. */
  moved?: number;
  bestMoves?: number;
}

/** The keys in view, low to high. */
const viewKeys = (start: number) => Array.from({ length: KEY_COUNT }, (_, k) => start + k);

/**
 * The key a prompt lights (nameIt, halfStep): a key with that name somewhere in view, a different one from prompt to
 * prompt so it isn't always the same place. For halfStep, the answer key must also be in view.
 */
function litKey(start: number, show: string, idx: number, step = 0): number | null {
  const want = pcOf(show);
  const keys = viewKeys(start).filter((m) => pc(m) === want && m + step >= start && m + step < start + KEY_COUNT);
  return keys.length ? keys[idx % keys.length] : null;
}

/** The keys a nameChord prompt lights: the chord (in its inversion) placed in view, moving around from prompt to prompt. */
function litChord(start: number, c: Chord, inv: number, idx: number): number[] {
  const fits = [];
  for (let floor = start; floor < start + KEY_COUNT; floor++) {
    const v = voicing(c, inv, floor);
    if (v[0] === floor && v[2] < start + KEY_COUNT) fits.push(v);
  }
  // Prefer the middle of the keyboard: pick among the fits near the centre.
  const mid = fits.filter((v) => v[0] >= start + 5 && v[2] <= start + 19);
  const pool = mid.length ? mid : fits;
  return pool.length ? pool[idx % pool.length] : voicing(c, inv, start + 12);
}

/**
 * Challenges: graded levels that produce a code. A prompt earns full credit when it is right on the first try and half
 * credit on the second; a wrong answer just lets the student try again. Grade = credit earned as a percent.
 * Note labels: each level has an easiest setting (the starting one). Students can go harder, never easier.
 * The chord detector is OFF here (it would give answers away).
 */
export function useChallenge(ctx: ModeCtx): ModeParts {
  const levels = ctx.lesson.levels;
  const [selected, setSelected] = useState<string>(levels[0].id);
  const [run, setRun] = useState<Run | null>(null);
  const [finished, setFinished] = useState<Finished | null>(null);
  const [msg, setMsg] = useState<string>('');
  const [marks, setMarks] = useState<Map<number, KeyMark>>(new Map());
  const [best, setBest] = useState<Record<string, number>>(() => loadBest());
  const [labelPick, setLabelPick] = useState<Record<string, Labels>>({});
  const runRef = useRef<Run | null>(null);
  runRef.current = run;
  /** Update the run AND the ref right away, so two keys arriving at the same instant (a chord) see each other's result. */
  const setRunNow = (r: Run | null) => {
    runRef.current = r;
    setRun(r);
  };
  const markTimer = useRef<number | undefined>(undefined);
  const viewRef = useRef(ctx.viewStart);
  viewRef.current = ctx.viewStart;

  // A new lesson picked: start at its first level.
  useEffect(() => {
    setSelected(ctx.lesson.levels[0].id);
    setRunNow(null);
    setFinished(null);
    setMsg('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx.lesson.id]);

  const flash = (midis: number[], mark: KeyMark) => {
    setMarks(new Map(midis.map((m) => [m, mark])));
    window.clearTimeout(markTimer.current);
    markTimer.current = window.setTimeout(() => setMarks(new Map()), 500);
  };

  /** Labels for a level: the student's pick, but never easier than the level allows. */
  const effective = (level: Level): Labels => {
    const pick = labelPick[level.id] ?? level.labels;
    return LABEL_ORDER.indexOf(pick) >= LABEL_ORDER.indexOf(level.labels) ? pick : level.labels;
  };
  const levelById = (id: string) => levels.find((l) => l.id === id) ?? levels[0];
  const bestResult = (id: string) => ctx.results.find((r) => r.levelId === id);

  /** Ear Check: play the prompt's chord (root position, around middle C). */
  const playChord = (p?: Prompt) => {
    const c = parseChord(p?.chord ?? '');
    if (!c) return;
    void ctx.engine.unlock().then(() => {
      const notes = voicing(c, 0, 55);
      notes.forEach((n) => ctx.engine.noteOn(n, 0.75));
      window.setTimeout(() => notes.forEach((n) => ctx.engine.noteOff(n)), 1100);
    });
  };

  const start = (id: string) => {
    const level = levelById(id);
    setFinished(null);
    setMsg('');
    const prompts = shuffle(level.prompts);
    // Smooth Mover keeps its order: each chord follows the last one.
    const ordered = level.type === 'smooth' ? level.prompts : prompts;
    const prev = level.type === 'smooth' ? (level.start ?? ['C4', 'E4', 'G4']).map((n) => parseNote(n)!).filter((n) => n !== null) : undefined;
    setRunNow({ level, prompts: ordered, idx: 0, points: 0, misses: 0, prev, moved: 0, bestMoves: 0 });
    if (level.type === 'earCheck') window.setTimeout(() => playChord(ordered[0]), 300);
  };

  /** Score the current prompt as right or wrong and move on. `extra` updates the run (Smooth Mover). */
  const answer = (correct: boolean, keys: number[] = [], why = 'Not quite. Try again.', extra: Partial<Run> = {}) => {
    const r = runRef.current;
    if (!r) return;
    if (!correct) {
      if (keys.length) flash(keys, 'bad');
      setMsg(why);
      setRunNow({ ...r, misses: r.misses + 1 });
      return;
    }
    if (keys.length) flash(keys, 'ok');
    setMsg('');
    const points = r.points + credit(r.misses);
    const idx = r.idx + 1;
    const next = { ...r, ...extra };
    if (idx >= r.prompts.length) {
      const raw = accuracy(points, r.prompts.length);
      setRunNow(null);
      const prevBest = best[r.level.id] ?? 0;
      saveBest(r.level.id, raw);
      setBest(loadBest());
      ctx.setResults((prev) => {
        const old = prev.find((x) => x.levelId === r.level.id);
        if (old && old.raw >= raw) return prev;
        const rest = prev.filter((x) => x.levelId !== r.level.id);
        return [...rest, { levelId: r.level.id, raw, labels: effective(r.level), at: Date.now() }];
      });
      setFinished({ level: r.level, raw, best: Math.max(prevBest, raw), moved: next.moved, bestMoves: next.bestMoves });
    } else {
      setRunNow({ ...next, idx, points, misses: 0 });
      if (r.level.type === 'earCheck') window.setTimeout(() => playChord(r.prompts[idx]), 500);
    }
  };

  // Playing single keys: Find It and Half Step.
  useEffect(() => {
    return ctx.subscribe((midi) => {
      const r = runRef.current;
      if (!r) return;
      const p = r.prompts[r.idx];
      if (r.level.type === 'findIt') {
        const answers = (p.answer ?? []).map(pcOf);
        if (isBlack(midi) && !ctx.lesson.blackKeys && !answers.some((a) => a !== null && [1, 3, 6, 8, 10].includes(a))) {
          setMsg('That is a black key. This lesson uses white keys.');
          return;
        }
        const ok = r.level.octave === 'exact' ? midi === parseNote(p.exact ?? '') : answers.includes(pc(midi));
        answer(ok, [midi]);
      } else if (r.level.type === 'halfStep') {
        const from = litKey(viewRef.current, p.show ?? 'C', r.idx, p.step ?? 1);
        if (from === null) return;
        const target = from + (p.step ?? 1);
        answer(midi === target, [midi], midi === from ? 'That is the lit key itself. Move one key.' : 'Not quite. A half step is the very next key, black or white.');
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx]);

  // Playing chords: Build It and Smooth Mover. One chord (3+ keys held together) = one answer.
  useEffect(() => {
    const w = chordWatcher(ctx.getHeld, (held) => {
      const r = runRef.current;
      if (!r || (r.level.type !== 'buildIt' && r.level.type !== 'smooth')) return;
      const p = r.prompts[r.idx];
      const c = parseChord(p.chord ?? '');
      if (!c) return;
      const got = detectChord(held);
      const gotName = got ? chordLongName(got.chord) : null;
      if (r.level.type === 'buildIt') {
        const ok = matchesChord(held, c, p.inv);
        const right = matchesChord(held, c);
        const why = right && p.inv !== undefined
          ? `That is ${chordLongName(c)}, but the wrong note is on the bottom. Let go and try again.`
          : gotName
            ? `That is ${gotName}, not ${chordLongName(c)}. Let go and try again.`
            : 'Those keys don’t make that chord. Let go and try again.';
        answer(ok, held, why);
        return;
      }
      // Smooth Mover: the right chord AND the fewest half steps from the lit chord.
      const prev = r.prev ?? held;
      if (held.length !== 3 || !matchesChord(held, c)) {
        answer(false, held, gotName ? `That is ${gotName}, not ${chordLongName(c)}. Let go and try again.` : `Play the three notes of ${chordLongName(c)}. Let go and try again.`);
        return;
      }
      const moved = moveDistance(prev, held);
      const bestMove = smoothestVoicing(prev, c).distance;
      if (moved > bestMove) {
        answer(false, held, `That is ${chordLongName(c)}, but you moved ${moved} half steps. You can do it in ${bestMove}. Let go and try again.`);
        return;
      }
      answer(true, held, '', { prev: held, moved: (r.moved ?? 0) + moved, bestMoves: (r.bestMoves ?? 0) + bestMove });
    });
    return ctx.subscribeNotes(w.handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx]);

  // What to light for the current prompt.
  const prompt = run?.prompts[run.idx];
  let lit: Set<number> | undefined;
  if (run && prompt) {
    const t = run.level.type;
    if ((t === 'nameIt' || t === 'halfStep') && prompt.show) {
      const k = litKey(ctx.viewStart, prompt.show, run.idx, t === 'halfStep' ? (prompt.step ?? 1) : 0);
      if (k !== null) lit = new Set([k]);
    } else if (t === 'nameChord') {
      const c = parseChord(prompt.chord ?? '');
      if (c) lit = new Set(litChord(ctx.viewStart, c, prompt.inv ?? 0, run.idx));
    } else if (t === 'smooth' && run.prev) lit = new Set(run.prev);
  }

  const selLevel = levelById(selected);
  const left = (
    <div className="flex flex-col gap-2">
      <div>
        <div className="h text-[11px] uppercase text-muted">Lesson {ctx.lesson.number} · Challenges</div>
        <h2 className="h text-[22px] leading-tight text-wal3">{ctx.lesson.title}</h2>
      </div>
      <div className="flex flex-col gap-1">
        {levels.map((l, k) => {
          const r = bestResult(l.id);
          const sel = l.id === selected;
          return (
            <button
              key={l.id}
              data-testid={`level-${l.id}`}
              onClick={() => {
                setSelected(l.id);
                setRunNow(null);
                setFinished(null);
                setMsg('');
              }}
              className={`flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-left ${sel ? 'border-brass2 bg-[#fbeecb]' : 'border-line bg-panel hover:bg-[#fff8ea]'}`}
            >
              <span>
                <span className="h text-[11px] text-muted">Level {k + 1}</span>
                <span className="block text-[14px] font-semibold leading-tight text-wal3">{l.title}</span>
              </span>
              <span className={`h text-[13px] ${r && passed(r.raw, l) ? 'text-good' : 'text-muted'}`}>
                {r ? `${passed(r.raw, l) ? '✓ ' : ''}${floored(r.raw)}%` : `${l.pass}% to pass`}
              </span>
            </button>
          );
        })}
      </div>
      <p className="text-[13px] text-muted">{selLevel.blurb}</p>
    </div>
  );

  const choices = run ? (run.level.choices ?? (run.level.type === 'nameIt' ? ALL_LETTERS : [])) : [];
  let stage;
  if (finished) {
    const ok = passed(finished.raw, finished.level);
    const li = levels.findIndex((l) => l.id === finished.level.id);
    stage = (
      <div className="pop flex h-full flex-col items-center justify-center gap-2 text-center" data-testid="result">
        <div className="h text-[12px] uppercase tracking-wider text-brass">{finished.level.title}</div>
        <div className="h text-[72px] leading-none text-panel" data-testid="result-grade">
          {floored(finished.raw)}%
        </div>
        <div className={`h text-[18px] ${ok ? 'text-[#cfe3b4]' : 'text-brass'}`}>
          {ok ? `Passed! (${finished.level.pass}% needed)` : `Not passed yet. You need ${finished.level.pass}%. Try again!`}
        </div>
        {finished.level.type === 'smooth' && (
          <div className="text-[15px] text-line2" data-testid="smooth-total">
            Half steps moved: {finished.moved} (the smoothest possible: {finished.bestMoves})
          </div>
        )}
        <div className="text-[14px] text-line2">Your best on this device: {floored(finished.best)}%</div>
        <div className="mt-1 flex gap-2">
          <button className="btn btn-brass" onClick={() => start(finished.level.id)}>
            Try again
          </button>
          {li < levels.length - 1 && (
            <button
              className="btn"
              onClick={() => {
                setSelected(levels[li + 1].id);
                setFinished(null);
              }}
            >
              Next level
            </button>
          )}
        </div>
        <div className="text-[13px] text-line2">Turn your work in from the Grade Report tab.</div>
      </div>
    );
  } else if (run && prompt) {
    stage = (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <div className="h text-[12px] uppercase tracking-wider text-brass">
          {run.level.title} · {run.idx + 1} of {run.prompts.length}
        </div>
        <div className="h text-[36px] leading-tight text-panel" data-testid="prompt">
          {prompt.text}
        </div>
        {run.level.type === 'smooth' && run.prev && (
          <div className="text-[15px] text-line2">
            From the lit chord ({detectChord(run.prev) ? chordName(detectChord(run.prev)!.chord) : ''}). Half steps moved so far: {run.moved ?? 0}
          </div>
        )}
        {run.level.type === 'earCheck' && (
          <button className="btn btn-dark" onClick={() => playChord(prompt)} data-testid="hear-again">
            ▶ Hear it again
          </button>
        )}
        {choices.length > 0 && (
          <div className="flex flex-wrap justify-center gap-2">
            {choices.map((l) => (
              <button key={l} data-testid={`choice-${l}`} className="btn btn-brass min-w-[52px] text-[20px]" onClick={() => answer((prompt.answer ?? [prompt.show ?? '']).includes(l))}>
                {pretty(l)}
              </button>
            ))}
          </div>
        )}
        <div className="min-h-[24px] max-w-[640px] text-[15px] text-brass" data-testid="challenge-msg">
          {msg}
        </div>
        <div className="h-2 w-64 overflow-hidden rounded-full bg-wal2">
          <div className="h-full bg-brass transition-all" style={{ width: `${(run.idx / run.prompts.length) * 100}%` }} />
        </div>
      </div>
    );
  } else {
    stage = (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
        <div className="h text-[12px] uppercase tracking-wider text-brass">Level: {selLevel.title}</div>
        <div className="h text-[30px] text-panel">{selLevel.blurb}</div>
        <div className="text-[15px] text-line2">
          {selLevel.prompts.length} questions · {selLevel.pass}% to pass · first try counts full, second try counts half
        </div>
        <button className="btn btn-brass mt-2 text-[18px]" data-testid="start" onClick={() => start(selected)}>
          Start
        </button>
      </div>
    );
  }

  return {
    left,
    stage,
    lit,
    marks,
    labels: effective(selLevel),
    labelControl: {
      value: effective(selLevel),
      allowed: LABEL_ORDER.filter((l) => LABEL_ORDER.indexOf(l) >= LABEL_ORDER.indexOf(selLevel.labels)),
      set: (l) => setLabelPick((p) => ({ ...p, [selLevel.id]: l })),
      locked: !!run,
    },
    start: { label: 'Start', onClick: () => start(selected), disabled: !!run },
    restart: { label: 'Restart', onClick: () => start(selected), disabled: !run },
  };
}
