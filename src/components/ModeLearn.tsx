import { useCallback, useEffect, useRef, useState } from 'react';
import { KEY_COUNT, isBlack, letterOf, parseNote, pc, pcOf, pretty } from '../utils/music';
import { chordLongName, chordName, detectChord, matchesChord, parseChord } from '../utils/chords';
import { ModeCtx, ModeParts } from './modeTypes';
import { useChordWatcher, useNoteListener } from './chordInput';

/** Position of a white key counting only white keys (C0 = 0, D0 = 1 ...). Black keys: null. */
const WHITE_INDEX = [0, null, 1, null, 2, 3, null, 4, null, 5, null, 6];
const whiteIndex = (m: number) => {
  const w = WHITE_INDEX[pc(m)];
  return w === null ? null : Math.floor(m / 12) * 7 + w;
};
/** Three white keys, each two white keys above the last (root, skip one, 3rd, skip one, 5th). `held` is sorted low to high. */
export function isWhiteTriad(held: number[]): boolean {
  if (held.length !== 3) return false;
  const w = held.map(whiteIndex);
  if (w.some((x) => x === null)) return false;
  return (w[1] as number) - (w[0] as number) === 2 && (w[2] as number) - (w[1] as number) === 2;
}

/** A demo entry: "C4" is one note, "C4+E4+G4" a chord. */
const entryNotes = (e: string) => e.split('+').map(parseNote).filter((n): n is number => n !== null);
/** How a demo entry is shown on the stage: a letter, or a chord name. */
const entryLabel = (e: string) => {
  const notes = entryNotes(e);
  if (notes.length >= 3) {
    const d = detectChord(notes);
    return d ? chordName(d.chord) : e;
  }
  return pretty(e.replace(/-?\d+$/, ''));
};

/**
 * Learn: the app demos (plays and lights keys), then a "now you try" prompt. Not graded. The code only notes
 * whether Learn was finished. Three touch points: finding F and C, the musical alphabet (show and tell, with note names on
 * the keys), all white keys.
 */
export function useLearn(ctx: ModeCtx): ModeParts {
  const steps = ctx.lesson.learn;
  const [i, setI] = useState(() => Math.min(ctx.learnStep, steps.length - 1));
  const [count, setCount] = useState(0);
  const [msg, setMsg] = useState<{ kind: 'good' | 'hint'; text: string } | null>(null);
  /** The keys the demo is playing right now, and which demo entry that is. */
  const [demoLit, setDemoLit] = useState<Set<number> | null>(null);
  const [demoIdx, setDemoIdx] = useState(-1);
  const [demoing, setDemoing] = useState(false);
  const step = steps[Math.min(i, steps.length - 1)];
  const stepDone = !!step.show || count >= step.need;
  const last = i === steps.length - 1;
  const stepRef = useRef(step);
  stepRef.current = step;
  const doneRef = useRef(stepDone);
  doneRef.current = stepDone;

  /** Bumped on every step change, so a demo from the step you just left stops. */
  const demoRun = useRef(0);
  const viewRef = useRef(ctx.viewStart);
  viewRef.current = ctx.viewStart;
  /** Keys already counted in this step (each right answer must be a different key). */
  const usedKeys = useRef(new Set<number>());
  const showMe = useCallback(async () => {
    const s = stepRef.current;
    let entries = (s.demo ?? []).map(entryNotes).filter((e) => e.length);
    if (!entries.length) return;
    // Keep the demo on the keys you can see: move it by whole octaves if it would run off either end.
    const all = entries.flat();
    const lo = Math.min(...all);
    const hi = Math.max(...all);
    const start = viewRef.current;
    if (lo < start || hi > start + KEY_COUNT - 1) {
      const shift = 12 * Math.ceil((start - lo) / 12);
      if (hi + shift <= start + KEY_COUNT - 1) entries = entries.map((e) => e.map((n) => n + shift));
    }
    const run = ++demoRun.current;
    const stopped = () => demoRun.current !== run;
    setDemoing(true);
    await ctx.engine.unlock();
    // Long runs of single notes go a little quicker; chords get time to ring.
    const gap = entries.some((e) => e.length > 1) ? 950 : entries.length > 8 ? 420 : 560;
    const wait = (ms: number) => new Promise((r) => window.setTimeout(r, ms));
    for (let k = 0; k < entries.length; k++) {
      if (stopped()) return;
      const notes = entries[k];
      setDemoLit(new Set(notes));
      setDemoIdx(k);
      notes.forEach((n) => ctx.engine.noteOn(n, 0.75));
      await wait(gap * 0.8);
      notes.forEach((n) => ctx.engine.noteOff(n));
      await wait(gap * 0.2);
    }
    if (stopped()) return;
    setDemoLit(null);
    setDemoIdx(-1);
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
    setDemoIdx(-1);
    setDemoing(false);
    ctx.setLearnStep(next);
    // Show-and-tell steps always start their demo; other steps only when arriving with Next.
    if ((demo || steps[next].show) && steps[next].demo?.length) {
      const run = demoRun.current;
      window.setTimeout(() => demoRun.current === run && void showMe(), 350);
    }
  };

  // A new lesson picked: go to where the student was in it.
  useEffect(() => {
    setI(Math.min(ctx.learnStep, steps.length - 1));
    setCount(0);
    usedKeys.current = new Set();
    setMsg(null);
    demoRun.current++;
    setDemoLit(null);
    setDemoIdx(-1);
    setDemoing(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx.lesson.id]);

  const lessonRef = useRef(ctx.lesson);
  lessonRef.current = ctx.lesson;

  // Single-note tries ("Play an F♯").
  useNoteListener(ctx.subscribe, (midi) => {
      const s = stepRef.current;
      if (doneRef.current || s.show || !s.tryAnswer) return;
      const answers = s.tryAnswer.map(pcOf);
      if (isBlack(midi) && !lessonRef.current.blackKeys && !answers.includes(pc(midi))) {
        setMsg({ kind: 'hint', text: 'That is a black key. Right now we only use white keys.' });
        return;
      }
      const letter = pretty(letterOf(midi));
      if (answers.includes(pc(midi))) {
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

  // Chord tries ("Play an F chord"): one chord (3+ keys together) = one answer.
  useChordWatcher(ctx.getHeld, ctx.subscribeNotes, (held) => {
      const s = stepRef.current;
      if (doneRef.current || s.show) return;
      if (s.tryTriad) {
        // Any white-key triad: root, skip a white key, 3rd, skip a white key, 5th. Each on a different root.
        const triad = isWhiteTriad(held);
        if (!triad) {
          setMsg({ kind: 'hint', text: `Not a stacked triad yet. ${s.hint ?? ''} Let go and try again.` });
          return;
        }
        const rootPc = pc(held[0]);
        if (usedKeys.current.has(rootPc)) {
          setMsg({ kind: 'hint', text: `You already built a triad on ${pretty(letterOf(held[0]))}. Start on a different white key.` });
          return;
        }
        usedKeys.current.add(rootPc);
        const name = detectChord(held)?.symbol ?? '';
        setCount((c) => {
          const n = c + 1;
          setMsg({ kind: 'good', text: n >= s.need ? `Yes! ${name}. That's four triads. Nice work.` : `Yes! That's a ${name} triad: ${pretty(letterOf(held[0]))} is the root. Now start on a different key.` });
          return n;
        });
        return;
      }
      if (!s.tryChord) return;
      const ok = s.tryChord.some((c) => {
        const ch = parseChord(c);
        return ch && matchesChord(held, ch, s.tryInversion);
      });
      if (ok) {
        setCount((c) => {
          const n = c + 1;
          setMsg({ kind: 'good', text: n >= s.need ? 'Yes! Nice work.' : 'Yes! Now play it somewhere else.' });
          return n;
        });
        return;
      }
      const got = detectChord(held);
      const rightChord = s.tryChord.some((c) => {
        const ch = parseChord(c);
        return ch && matchesChord(held, ch);
      });
      const why = rightChord && s.tryInversion !== undefined ? 'Right chord, but check which note is on the bottom.' : got ? `That is ${got.longName}.` : 'Those keys don’t make that chord yet.';
      setMsg({ kind: 'hint', text: `${why} ${s.hint ?? ''} Let go and try again.` });
  });

  // Finishing the last step marks Learn done (this goes in the code).
  useEffect(() => {
    if (stepDone && last && !ctx.learnDone) ctx.setLearnDone(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepDone, last]);

  const sections = Array.from(new Set(steps.map((s) => s.section)));

  const left = (
    <div className="flex flex-col gap-3">
      <div>
        <div className="h text-[11px] uppercase text-muted">Lesson {ctx.lesson.number} · Learn</div>
        <h2 className="h text-[22px] leading-tight text-wal3">{ctx.lesson.title}</h2>
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
            Go to Challenges
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
      Go to Challenges ›
    </button>
  );

  // The explanation sits right above what to do with it, in the big centre area (not in a small side box).
  const explain = (
    <div className="max-w-[720px]" data-testid="learn-say">
      <div className="h text-[12px] uppercase tracking-wider text-brass">
        {step.section === step.title ? step.title : `${step.section} · ${step.title}`}
      </div>
      <p className="mt-1 text-[18px] leading-snug text-line">{step.say}</p>
    </div>
  );

  const stage = step.show ? (
    <div className="flex h-full flex-col items-center justify-center gap-3 overflow-auto px-6 py-3 text-center">
      {explain}
      <div className="h text-[12px] uppercase tracking-wider text-brass" data-testid="learn-prompt">
        Watch and listen
      </div>
      <div className="h flex flex-wrap justify-center gap-x-3 gap-y-1 text-[26px] tracking-wide text-line2" aria-hidden="true">
        {(step.demo ?? []).map((n, k) => (
          <span key={k} className={k === demoIdx ? 'text-brass' : ''}>
            {entryLabel(n)}
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <button className="btn btn-dark text-[16px]" onClick={() => void showMe()} disabled={demoing}>
          {demoing ? 'Playing…' : '▶ Play it again'}
        </button>
        {nextBtn}
      </div>
    </div>
  ) : (
    <div className="flex h-full flex-col items-center justify-center gap-2.5 overflow-auto px-6 py-3 text-center">
      {explain}
      <div className="w-full max-w-[720px] border-t border-wal1 pt-2.5">
        <div className="h text-[12px] uppercase tracking-wider text-brass">Now you try</div>
        <div className="h text-[28px] leading-tight text-panel" data-testid="learn-prompt">
          {step.tryText}
        </div>
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
    lit: demoLit ?? undefined,
    forceLabel: demoLit ?? undefined,
    start: step.demo?.length && !step.show ? { label: demoing ? 'Playing…' : 'Show me', onClick: () => void showMe(), disabled: demoing } : undefined,
    restart: { label: 'Restart step', onClick: () => goStep(i, false), disabled: demoing },
  };
}
