import { useEffect, useRef, useState } from 'react';
import lessons from '../data/lessons.json';
import { Level, Lesson, Prompt } from '../types';
import { KEY_COUNT, isBlack, letterOf, parseNote } from '../utils/music';
import { accuracy, floored, passed } from '../utils/grading';
import { loadBest, saveBest } from '../utils/autosave';
import { KeyMark } from './Piano';
import { ModeCtx, ModeParts } from './modeTypes';

const LESSON = (lessons.lessons as unknown as Lesson[])[0];
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
  firstTry: number;
  missed: boolean;
}
interface Finished {
  level: Level;
  raw: number;
  best: number;
}

/**
 * Challenge: graded levels that produce a code. A prompt scores when it is right on the FIRST try; a wrong
 * answer just lets the student try again (and that prompt no longer counts). Grade = first-try percent.
 */
export function useChallenge(ctx: ModeCtx): ModeParts {
  const levels = LESSON.levels;
  const [selected, setSelected] = useState<string>(levels[0].id);
  const [run, setRun] = useState<Run | null>(null);
  const [finished, setFinished] = useState<Finished | null>(null);
  const [msg, setMsg] = useState<string>('');
  const [marks, setMarks] = useState<Map<number, KeyMark>>(new Map());
  const [best, setBest] = useState<Record<string, number>>(() => loadBest());
  const runRef = useRef<Run | null>(null);
  runRef.current = run;
  const markTimer = useRef<number | undefined>(undefined);

  const flash = (midi: number, mark: KeyMark) => {
    setMarks(new Map([[midi, mark]]));
    window.clearTimeout(markTimer.current);
    markTimer.current = window.setTimeout(() => setMarks(new Map()), 450);
  };

  const levelById = (id: string) => levels.find((l) => l.id === id)!;
  const bestResult = (id: string) => ctx.results.find((r) => r.levelId === id);

  const start = (id: string) => {
    const level = levelById(id);
    setFinished(null);
    setMsg('');
    setRun({ level, prompts: shuffle(level.prompts), idx: 0, firstTry: 0, missed: false });
  };

  /** Score the current prompt as right or wrong and move on. */
  const answer = (correct: boolean, midi?: number) => {
    const r = runRef.current;
    if (!r) return;
    if (!correct) {
      if (midi !== undefined) flash(midi, 'bad');
      setMsg('Not quite. Try again.');
      setRun({ ...r, missed: true });
      return;
    }
    if (midi !== undefined) flash(midi, 'ok');
    setMsg('');
    const firstTry = r.firstTry + (r.missed ? 0 : 1);
    const idx = r.idx + 1;
    if (idx >= r.prompts.length) {
      const raw = accuracy(firstTry, r.prompts.length);
      setRun(null);
      const prevBest = best[r.level.id] ?? 0;
      saveBest(r.level.id, raw);
      setBest(loadBest());
      ctx.setResults((prev) => {
        const old = prev.find((x) => x.levelId === r.level.id);
        if (old && old.raw >= raw) return prev;
        const rest = prev.filter((x) => x.levelId !== r.level.id);
        return [...rest, { levelId: r.level.id, raw, labels: ctx.labels, at: Date.now() }];
      });
      setFinished({ level: r.level, raw, best: Math.max(prevBest, raw) });
    } else setRun({ ...r, idx, firstTry, missed: false });
  };

  // Playing a key (Find It).
  useEffect(() => {
    return ctx.subscribe((midi) => {
      const r = runRef.current;
      if (!r || r.level.type !== 'findIt') return;
      if (isBlack(midi)) {
        setMsg('That is a black key. This lesson uses white keys.');
        return;
      }
      const p = r.prompts[r.idx];
      const ok = r.level.octave === 'exact' ? midi === parseNote(p.exact ?? '') : p.answer.includes(letterOf(midi));
      answer(ok, midi);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx]);

  // Name It: which key to light. Pick the first or second matching key in view so it isn't always the same place.
  const prompt = run?.prompts[run.idx];
  let lit: Set<number> | undefined;
  if (run && prompt && run.level.type === 'nameIt' && prompt.show) {
    const matches = Array.from({ length: KEY_COUNT }, (_, k) => ctx.viewStart + k).filter((m) => !isBlack(m) && letterOf(m) === prompt.show);
    if (matches.length) lit = new Set([matches[run.idx % matches.length]]);
  }

  const selLevel = levelById(selected);
  const left = (
    <div className="flex flex-col gap-3">
      <div>
        <div className="h text-[11px] uppercase text-muted">Lesson {LESSON.number} · Challenge</div>
        <h2 className="h text-[22px] leading-tight text-wal3">{LESSON.title}</h2>
      </div>
      <div className="flex flex-col gap-1.5">
        {levels.map((l, k) => {
          const r = bestResult(l.id);
          const sel = l.id === selected;
          return (
            <button
              key={l.id}
              data-testid={`level-${l.id}`}
              onClick={() => {
                setSelected(l.id);
                setRun(null);
                setFinished(null);
                setMsg('');
              }}
              className={`flex items-center justify-between gap-2 rounded-lg border px-2.5 py-2 text-left ${sel ? 'border-brass2 bg-[#fbeecb]' : 'border-line bg-panel hover:bg-[#fff8ea]'}`}
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

  let stage;
  if (finished) {
    const ok = passed(finished.raw, finished.level);
    stage = (
      <div className="pop flex h-full flex-col items-center justify-center gap-2 text-center" data-testid="result">
        <div className="h text-[12px] uppercase tracking-wider text-brass">{finished.level.title}</div>
        <div className="h text-[72px] leading-none text-panel" data-testid="result-grade">
          {floored(finished.raw)}%
        </div>
        <div className={`h text-[18px] ${ok ? 'text-[#cfe3b4]' : 'text-brass'}`}>
          {ok ? `Passed! (${finished.level.pass}% needed)` : `Not passed yet. You need ${finished.level.pass}%. Try again!`}
        </div>
        <div className="text-[14px] text-line2">Your best on this device: {floored(finished.best)}%</div>
        <div className="mt-1 flex gap-2">
          <button className="btn btn-brass" onClick={() => start(finished.level.id)}>
            Try again
          </button>
          {levels.findIndex((l) => l.id === finished.level.id) < levels.length - 1 && (
            <button
              className="btn"
              onClick={() => {
                const next = levels[levels.findIndex((l) => l.id === finished.level.id) + 1];
                setSelected(next.id);
                setFinished(null);
              }}
            >
              Next level
            </button>
          )}
        </div>
        <div className="text-[13px] text-line2">Press “Get my code” on the left to turn your work in.</div>
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
        {run.level.type === 'nameIt' && (
          <div className="flex flex-wrap justify-center gap-2">
            {(run.level.choices ?? ALL_LETTERS).map((l) => (
              <button key={l} data-testid={`choice-${l}`} className="btn btn-brass min-w-[52px] text-[20px]" onClick={() => answer(prompt.answer.includes(l))}>
                {l}
              </button>
            ))}
          </div>
        )}
        <div className="min-h-[24px] text-[15px] text-brass">{msg}</div>
        <div className="h-2 w-64 overflow-hidden rounded-full bg-wal2">
          <div className="h-full bg-brass transition-all" style={{ width: `${(run.idx / run.prompts.length) * 100}%` }} />
        </div>
      </div>
    );
  } else {
    stage = (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
        <div className="h text-[12px] uppercase tracking-wider text-brass">Level: {selLevel.title}</div>
        <div className="h text-[30px] text-panel">{selLevel.blurb}</div>
        <div className="text-[15px] text-line2">
          {selLevel.prompts.length} questions · {selLevel.pass}% to pass · right on the first try counts
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
    start: { label: 'Start', onClick: () => start(selected), disabled: !!run },
    restart: { label: 'Restart', onClick: () => start(selected), disabled: !run },
  };
}
