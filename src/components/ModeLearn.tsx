import { useCallback, useEffect, useRef, useState } from 'react';
import lessons from '../data/lessons.json';
import { Lesson } from '../types';
import { isBlack, letterOf, parseNote } from '../utils/music';
import { ModeCtx, ModeParts } from './modeTypes';

const LESSON = (lessons.lessons as unknown as Lesson[])[0];

/**
 * Learn: the app demos (plays and lights keys), then a "now you try" prompt. Not graded. The code only notes
 * whether Learn was finished. Three touch points: finding F and C, the musical alphabet (show and tell, with note names on
 * the keys), all white keys.
 */
export function useLearn(ctx: ModeCtx): ModeParts {
  const steps = LESSON.learn;
  const [i, setI] = useState(() => Math.min(ctx.learnStep, steps.length - 1));
  const [count, setCount] = useState(0);
  const [msg, setMsg] = useState<{ kind: 'good' | 'hint'; text: string } | null>(null);
  const [demoLit, setDemoLit] = useState<number | null>(null);
  const [demoing, setDemoing] = useState(false);
  const step = steps[i];
  const stepDone = !!step.show || count >= step.need;
  const last = i === steps.length - 1;
  const stepRef = useRef(step);
  stepRef.current = step;
  const doneRef = useRef(stepDone);
  doneRef.current = stepDone;

  /** Bumped on every step change, so a demo from the step you just left stops. */
  const demoRun = useRef(0);
  /** Keys already counted in this step (each right answer must be a different key). */
  const usedKeys = useRef(new Set<number>());
  const showMe = useCallback(async () => {
    const s = stepRef.current;
    const notes = (s.demo ?? []).map(parseNote).filter((n): n is number => n !== null);
    if (!notes.length) return;
    const run = ++demoRun.current;
    const stopped = () => demoRun.current !== run;
    setDemoing(true);
    // Long show-and-tell runs (a whole octave or two) go a little quicker.
    await ctx.engine.playDemo(notes, notes.length > 8 ? 420 : 560, (m) => !stopped() && setDemoLit(m), stopped);
    if (stopped()) return;
    setDemoing(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx.engine]);

  const goStep = (n: number, demo: boolean) => {
    const next = Math.max(0, Math.min(steps.length - 1, n));
    setI(next);
    setCount(0);
    usedKeys.current = new Set();
    setMsg(null);
    demoRun.current++;
    setDemoLit(null);
    setDemoing(false);
    ctx.setLearnStep(next);
    // Show-and-tell steps always start their demo; other steps only when arriving with Next.
    if ((demo || steps[next].show) && steps[next].demo?.length) {
      const run = demoRun.current;
      window.setTimeout(() => demoRun.current === run && void showMe(), 350);
    }
  };

  useEffect(() => {
    return ctx.subscribe((midi) => {
      const s = stepRef.current;
      if (doneRef.current || s.show || !s.tryAnswer) return;
      if (isBlack(midi)) {
        setMsg({ kind: 'hint', text: 'That is a black key. Right now we only use white keys.' });
        return;
      }
      const letter = letterOf(midi);
      if (s.tryAnswer!.includes(letter)) {
        // "In a different place" means a different key: playing the same key again doesn't count.
        if (usedKeys.current.has(midi)) {
          setMsg({ kind: 'hint', text: `That is the same ${letter} again. Find a ${letter} in a different place on the keyboard.` });
          return;
        }
        usedKeys.current.add(midi);
        setCount((c) => {
          const n = c + 1;
          if (n >= s.need) {
            setMsg({ kind: 'good', text: `Yes! That is ${letter}. Nice work.` });
          } else setMsg({ kind: 'good', text: `Yes! That is ${letter}. Find another ${letter} in a different place.` });
          return n;
        });
      } else {
        setMsg({ kind: 'hint', text: `That one is ${letter}. ${s.hint}` });
      }
    });
  }, [ctx]);

  // Finishing the last step marks Learn done (this goes in the code).
  useEffect(() => {
    if (stepDone && last && !ctx.learnDone) ctx.setLearnDone(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepDone, last]);

  const sections = Array.from(new Set(steps.map((s) => s.section)));

  const left = (
    <div className="flex flex-col gap-3">
      <div>
        <div className="h text-[11px] uppercase text-muted">Lesson {LESSON.number} · Learn</div>
        <h2 className="h text-[22px] leading-tight text-wal3">{LESSON.title}</h2>
      </div>
      <div className="card p-3">
        <div className="h text-[11px] uppercase text-brass3">{step.section}</div>
        <div className="h text-[17px] text-wal3">{step.title}</div>
        <p className="mt-1 text-[15px] leading-snug text-wal1">{step.say}</p>
      </div>
      <div className="flex flex-col gap-1.5">
        {sections.map((sec) => {
          const own = steps.map((s, k) => ({ s, k })).filter((x) => x.s.section === sec);
          return (
            <div key={sec} className="text-[13px]">
              <div className="h text-muted uppercase text-[11px]">{sec}</div>
              <div className="mt-0.5 flex flex-wrap gap-1">
                {own.map(({ s, k }) => {
                  const reached = k < i || (k === i && stepDone) || ctx.learnDone;
                  return (
                    <button
                      key={s.id}
                      disabled={!(ctx.learnDone || k <= i)}
                      onClick={() => goStep(k, false)}
                      className={`h rounded-md border px-2 py-0.5 text-[12px] ${k === i ? 'border-brass2 bg-brass text-brasstext' : reached ? 'border-line2 bg-panel text-good' : 'border-line bg-page text-muted'}`}
                    >
                      {reached ? '✓ ' : ''}
                      {k + 1}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex gap-2">
        <button className="btn" disabled={i === 0} onClick={() => goStep(i - 1, false)}>
          Back
        </button>
        {!last && (
          <button className="btn btn-brass flex-1" disabled={!stepDone && !ctx.learnDone} onClick={() => goStep(i + 1, true)}>
            Next step
          </button>
        )}
        {last && stepDone && (
          <button className="btn btn-brass flex-1" onClick={() => ctx.goTo('challenge')}>
            Go to Challenge
          </button>
        )}
      </div>
    </div>
  );

  const nextBtn = !last ? (
    <button className="btn btn-brass text-[18px]" data-testid="stage-next" onClick={() => goStep(i + 1, true)}>
      Next step ›
    </button>
  ) : (
    <button className="btn btn-brass text-[18px]" data-testid="stage-next" onClick={() => ctx.goTo('challenge')}>
      Go to Challenge ›
    </button>
  );

  const stage = step.show ? (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="h text-[12px] uppercase tracking-wider text-brass">Watch and listen</div>
      <div className="h text-[34px] leading-tight text-panel" data-testid="learn-prompt">
        {step.title}
      </div>
      <div className="h flex gap-2 text-[26px] tracking-wide text-line2" aria-hidden="true">
        {(step.demo ?? []).map((n, k) => {
          const m = parseNote(n);
          return (
            <span key={k} className={m !== null && m === demoLit ? 'text-brass' : ''}>
              {n.replace(/\d+$/, '')}
            </span>
          );
        })}
      </div>
      <div className="flex gap-2">
        <button className="btn btn-dark text-[16px]" onClick={() => void showMe()} disabled={demoing}>
          {demoing ? 'Playing…' : '▶ Play it again'}
        </button>
        {nextBtn}
      </div>
    </div>
  ) : (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="h text-[12px] uppercase tracking-wider text-brass">Now you try</div>
      <div className="h text-[34px] leading-tight text-panel" data-testid="learn-prompt">
        {step.tryText}
      </div>
      <div className="flex gap-1.5" aria-label={`${count} of ${step.need} done`}>
        {Array.from({ length: step.need }, (_, k) => (
          <span key={k} className={`h-3 w-3 rounded-full border border-brass2 ${k < count ? 'bg-brass' : 'bg-transparent'}`} />
        ))}
      </div>
      <div
        className={`min-h-[28px] max-w-[640px] rounded-lg px-3 py-1 text-[16px] ${msg ? (msg.kind === 'good' ? 'bg-[#cfe3b4] text-good' : 'bg-[#f6e3b8] text-wal1') : 'text-transparent'}`}
        data-testid="learn-msg"
      >
        {msg?.text ?? '.'}
      </div>
      {stepDone && nextBtn}
      {ctx.learnDone && last && stepDone && <div className="h text-[16px] text-brass">Learn complete. Your code will say so.</div>}
    </div>
  );

  return {
    left,
    stage,
    // Nothing is lit or labelled while the student is working it out. Only the note the app is playing shows.
    // Show-and-tell steps put the names on every key (step.labels).
    labels: step.labels ?? 'off',
    lit: demoLit !== null ? new Set([demoLit]) : undefined,
    forceLabel: demoLit !== null ? new Set([demoLit]) : undefined,
    start: step.demo?.length && !step.show ? { label: demoing ? 'Playing…' : 'Show me', onClick: () => void showMe(), disabled: demoing } : undefined,
    restart: { label: 'Restart step', onClick: () => goStep(i, false), disabled: demoing },
  };
}
