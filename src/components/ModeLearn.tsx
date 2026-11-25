import React, { useCallback, useEffect, useRef, useState } from 'react';
import { pitchColor } from '../utils/colors';
import { KEY_COUNT, isBlack, letterOf, parseNote, pc, pcOf, pretty } from '../utils/music';
import { Chord, INVERSION_NAMES, chordName, chordPcs, degreeOf, detectChord, diatonic, diatonicSevenths, keyById, matchesChord, parseChord, pcName, stripVoicing, KeyDef } from '../utils/chords';
import { StripChips, textOn } from './ChordStrip';
import { ModeCtx, ModeParts } from './modeTypes';
import { useChordWatcher, useNoteListener } from './chordInput';
import { Col, StageBox } from './StageRow';
import { RhythmBox } from './RhythmBox';
import { MAJOR_SCALE, scaleStep } from '../utils/scales';

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

/** Split an explanation into sentences (and at any line break in the text), so each shows on its own line. */
export const sentences = (text: string) =>
  text
    .split(/\n|(?<=[.!?])\s+(?=[A-Z0-9"“(])/)
    .map((t) => t.trim())
    .filter(Boolean);

/** A demo entry: "C4" is one note, "C4+E4+G4" a chord, "E4*2" held twice as long. */
const entryNotes = (e: string) => e.replace(/\*\d+(\.\d+)?$/, '').split('+').map(parseNote).filter((n): n is number => n !== null);
const entryLength = (e: string) => Number(e.match(/\*(\d+(\.\d+)?)$/)?.[1] ?? 1);

/**
 * How many half steps to move a step's demo (and its key tags) so it stays on the keys on screen: whole octaves, and only
 * when it would run off either end.
 */
function demoShift(demo: string[] | undefined, start: number): number {
  const all = (demo ?? []).flatMap(entryNotes);
  if (!all.length) return 0;
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  if (lo >= start && hi <= start + KEY_COUNT - 1) return 0;
  const shift = 12 * Math.ceil((start - lo) / 12);
  return hi + shift <= start + KEY_COUNT - 1 ? shift : 0;
}
/** How a demo entry is shown on the stage: a letter, or a chord name. */
const entryBase = (e: string) => e.replace(/\*\d+(\.\d+)?$/, '');
const isRest = (e: string) => entryBase(e) === '_';
/** A note name without its octave, for the Stage ("C♯", not "C#4"). */
const letter = (n: string) => pretty(n.replace(/-?\d+$/, ''));

/**
 * The row of demo labels on the Stage. Single notes show as letters; a two-note entry as "C + E"; a chord as its short
 * name with the full name under it ("C" / "C major"). A chord or interval that follows counted notes, and any rest ("_"),
 * gets a wide gap so the counting and the result read as separate things. Notes that have a tag (Root / 3rd / 5th) are
 * shown in their pitch colour, like the Sandbox's piano roll. The entry playing now is full brightness and a bit bigger.
 */
const DemoRow: React.FC<{ demo: string[]; current: number; tags?: Record<string, string> }> = ({ demo, current, tags }) => {
  const tagged = (n: string) => (tags && n in tags ? pitchColor(parseNote(n) ?? 0) : undefined);
  return (
    <div className="h flex flex-wrap items-end justify-center gap-x-3 gap-y-1 text-[26px] tracking-wide text-line2" aria-hidden="true" data-testid="demo-row">
      {demo.map((e, k) => {
        const on = k === current;
        const cls = `inline-flex flex-col items-center leading-none transition-transform ${on ? 'scale-110 text-panel' : current >= 0 ? 'opacity-70' : ''}`;
        if (isRest(e)) return <span key={k} className="w-10" />;
        const notes = entryBase(e).split('+');
        const prevSingle = k > 0 && !isRest(demo[k - 1]) && entryBase(demo[k - 1]).split('+').length === 1;
        const gap = notes.length > 1 && prevSingle ? 'ml-12' : '';
        if (notes.length === 1)
          return (
            <span key={k} className={cls} style={{ color: tagged(notes[0]) }}>
              {letter(notes[0])}
            </span>
          );
        if (notes.length === 2)
          return (
            <span key={k} className={`${cls} ${gap}`} data-testid="demo-interval">
              <span>
                <span style={{ color: tagged(notes[0]) }}>{letter(notes[0])}</span>
                <span className="mx-1 text-[20px] opacity-70">+</span>
                <span style={{ color: tagged(notes[1]) }}>{letter(notes[1])}</span>
              </span>
            </span>
          );
        const d = detectChord(entryNotes(e));
        return (
          <span key={k} className={`${cls} ${gap}`} data-testid="demo-chord">
            <span>{d ? d.symbol : notes.map(letter).join(' ')}</span>
            {d && (
              <span className="mt-1 text-[13px] tracking-normal opacity-80">
                {d.longName}
                {d.triad && d.inversion > 0 ? `, ${INVERSION_NAMES[d.inversion].toLowerCase()}` : ''}
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
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
  /** Progression tries: how many chords of the progression have been played so far. */
  const [progIdx, setProgIdx] = useState(0);
  const progRef = useRef(0);
  /** Scale tries (Lesson 7): the notes played so far. */
  const scaleRef = useRef<number[]>([]);
  const [scaleCount, setScaleCount] = useState(0);
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
    // Keep the demo on the keys you can see: move it by whole octaves if it would run off either end.
    const shift = demoShift(s.demo, viewRef.current);
    // Rests ("_") stay in the list (as empty entries) so the Stage's labels line up with what is playing.
    const entries = (s.demo ?? []).map((e) => ({ notes: isRest(e) ? [] : entryNotes(e).map((n) => n + shift), len: entryLength(e) }));
    if (!entries.some((e) => e.notes.length)) return;
    const run = ++demoRun.current;
    const stopped = () => demoRun.current !== run;
    setDemoing(true);
    await ctx.engine.unlock();
    // Chords get time to ring; single notes move along (a little quicker in long runs). "*2" holds an entry twice as long.
    const singles = entries.filter((e) => e.notes.length === 1).length;
    const wait = (ms: number) => new Promise((r) => window.setTimeout(r, ms));
    for (let k = 0; k < entries.length; k++) {
      if (stopped()) return;
      const { notes, len } = entries[k];
      if (!notes.length) {
        // A rest: a pause between groups.
        setDemoLit(null);
        setDemoIdx(k);
        await wait(450 * len);
        continue;
      }
      const gap = (notes.length > 1 ? 950 : singles > 8 ? 420 : 560) * len;
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

  /** Holding a chord on a Stage strip plays it (and lights its keys) until it is let go. */
  const stripHeld = useRef<number[]>([]);
  const playStrip = (k: KeyDef, degree: number) => {
    demoRun.current++;
    stripHeld.current.forEach((n) => ctx.engine.noteOff(n));
    const notes = stripVoicing(k, degree);
    stripHeld.current = notes;
    void ctx.engine.unlock().then(() => stripHeld.current === notes && notes.forEach((n) => ctx.engine.noteOn(n, 0.7)));
    setDemoLit(new Set(notes));
    setDemoing(false);
  };
  const releaseStrip = () => {
    stripHeld.current.forEach((n) => ctx.engine.noteOff(n));
    stripHeld.current = [];
    setDemoLit(null);
  };

  const goStep = (n: number, demo: boolean) => {
    const next = Math.max(0, Math.min(steps.length - 1, n));
    setI(next);
    setCount(0);
    setProgIdx(0);
    progRef.current = 0;
    scaleRef.current = [];
    setScaleCount(0);
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
    setProgIdx(0);
    progRef.current = 0;
    scaleRef.current = [];
    setScaleCount(0);
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
      if (!doneRef.current && !s.show && s.tryScale) {
        // Lesson 7: the scale up, one note at a time. A wrong note starts it over.
        const k = keyById(s.tryScale);
        const played = [...scaleRef.current, midi];
        const res = scaleStep(k.tonic, played);
        const tonic = pcName(k.tonic, k.flats);
        if (res === 'wrong-start') {
          scaleRef.current = [];
          setScaleCount(0);
          setMsg({ kind: 'hint', text: `Start on ${tonic}. ${s.hint ?? ''}` });
        } else if (res === 'wrong') {
          const want = played[0] + MAJOR_SCALE[played.length - 1];
          scaleRef.current = [];
          setScaleCount(0);
          setMsg({ kind: 'hint', text: `That is ${pcName(midi, k.flats)}. The next note is ${pcName(want, k.flats)}. Start again from ${tonic}.` });
        } else if (res === 'done') {
          scaleRef.current = [];
          setScaleCount(MAJOR_SCALE.length);
          setCount(s.need);
          setMsg({ kind: 'good', text: `Yes! That's the ${k.label} scale.` });
        } else {
          scaleRef.current = played;
          setScaleCount(played.length);
          setMsg(null);
        }
        return;
      }
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
      if (s.tryInterval !== undefined) {
        // An interval: two piano keys held together, the right number of half steps apart, each on a new bottom note.
        if (held.length !== 2) {
          setMsg({ kind: 'hint', text: `Play just two piano keys together. ${s.hint ?? ''}` });
          return;
        }
        const gap = held[1] - held[0];
        if (gap !== s.tryInterval) {
          setMsg({ kind: 'hint', text: `${gap === 12 ? 'That is the octave: good start!' : `Those are ${gap} half step${gap === 1 ? '' : 's'} apart.`} ${s.hint ?? ''} Let go and try again.` });
          return;
        }
        if (usedKeys.current.has(pc(held[0]))) {
          setMsg({ kind: 'hint', text: `You already started on ${pretty(letterOf(held[0]))}. Try a different bottom note.` });
          return;
        }
        usedKeys.current.add(pc(held[0]));
        setCount((c) => {
          const n = c + 1;
          setMsg({ kind: 'good', text: n >= s.need ? `Yes! ${pretty(letterOf(held[0]))} up to ${pretty(letterOf(held[1]))}: ${gap} half steps. Nice work.` : `Yes! ${pretty(letterOf(held[0]))} up to ${pretty(letterOf(held[1]))} is ${gap} half steps. Now start on a different piano key.` });
          return n;
        });
        return;
      }
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
      if (s.tryProgression) {
        // A progression: each chord in turn, one after another.
        const at = progRef.current;
        const want = parseChord(s.tryProgression[at] ?? '');
        if (!want) return;
        const key = keyById(s.tryKey ?? 'C');
        const num = s.tryNames ? chordName(want) : ([...diatonic(key), ...diatonicSevenths(key)].find((x) => x.chord.root === want.root && x.chord.quality === want.quality)?.numeral ?? '');
        if (matchesChord(held, want)) {
          const next = at + 1;
          progRef.current = next;
          setProgIdx(next);
          if (next >= s.tryProgression.length) {
            setCount(s.need);
            setMsg({ kind: 'good', text: s.tryNames ? 'Yes! All three. Nice work.' : 'Yes! The whole progression. Nice work.' });
          } else setMsg({ kind: 'good', text: `Yes, ${num}. Now the next one.` });
          return;
        }
        const got = detectChord(held, key);
        setMsg({ kind: 'hint', text: `${got ? `That is ${got.longName}${got.numeral && !s.tryNames ? ` (${got.numeral})` : ''}. ` : ''}The next chord is ${num}${s.tryNames ? '' : ` in ${key.label}`}. Let go and try again.` });
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
  }, () => {
    // Intervals are judged on 2 keys, triads on 3, 7th chords (Lesson 8) on 4.
    const s = stepRef.current;
    if (s.tryInterval !== undefined) return 2;
    const wanted = [...(s.tryChord ?? []), s.tryProgression?.[progRef.current] ?? ''].map((c) => parseChord(c)).filter((c): c is Chord => !!c);
    return Math.max(3, ...wanted.map((c) => chordPcs(c).length));
  });

  // Finishing the last step marks Learn done (this goes in the code).
  useEffect(() => {
    if (stepDone && last && !ctx.learnDone) ctx.setLearnDone(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepDone, last]);

  // Words on the keys for this step (Root / 3rd / 5th), moved with the demo if it shifted octave.
  const keyText = step.tags
    ? new Map(
        Object.entries(step.tags)
          .map(([n, word]) => [(parseNote(n) ?? -99) + demoShift(step.demo, ctx.viewStart), word] as [number, string])
          .filter(([m]) => m >= 0),
      )
    : undefined;

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
      {/* One sentence per line, so each idea stands on its own. */}
      <div className="mt-1 flex flex-col gap-1 text-[18px] leading-snug text-line">
        {sentences(step.say).map((line, k) => (
          <p key={k}>{line}</p>
        ))}
      </div>
    </div>
  );

  const stage = step.show ? (
    <StageBox phone={ctx.phone} className="gap-3 overflow-auto px-6 py-3">
      <Col phone={ctx.phone} className="max-h-full max-w-[48%] overflow-auto">
      {explain}
      </Col>
      <Col phone={ctx.phone} className="max-w-[48%]">
      <div className="h text-[12px] uppercase tracking-wider text-brass" data-testid="learn-prompt">
        Watch and listen
      </div>
      {step.strip?.length ? (
        // The chord strip on the Stage: the chord being played lights up.
        <div className="flex w-full max-w-[820px] flex-col gap-1.5" data-testid="learn-strips">
          {step.strip.map((id) => {
            const k = keyById(id);
            const mine = !step.demoKeys || step.demoKeys[demoIdx] === id;
            const deg = demoLit && mine ? degreeOf(k, [...demoLit]) : -1;
            return (
              <div key={id} className="wood flex items-center gap-2 rounded-lg px-2 py-1.5">
                <span className="h w-[86px] shrink-0 text-left text-[13px] text-line">{k.label}</span>
                <StripChips keyDef={k} lit={(d) => d === deg} onPlay={(d) => playStrip(k, d)} onRelease={releaseStrip} testid={`learn-strip-${id}`} />
              </div>
            );
          })}
        </div>
      ) : step.rhythm ? (
        // A rhythm, on a counting grid, played in time with the clicks (Chord rhythms lesson).
        <RhythmBox ctx={ctx} pattern={step.rhythm} onLit={setDemoLit} />
      ) : (
        <DemoRow demo={step.demo ?? []} current={demoIdx} tags={step.tags} />
      )}
      <div className="flex gap-2">
        {!step.rhythm && (
          <button className="btn btn-dark text-[16px]" onClick={() => void showMe()} disabled={demoing}>
            {demoing ? 'Playing…' : '▶ Play example'}
          </button>
        )}
        {nextBtn}
      </div>
      </Col>
    </StageBox>
  ) : (
    <StageBox phone={ctx.phone} className="gap-2.5 overflow-auto px-6 py-3">
      <Col phone={ctx.phone} className="max-h-full max-w-[34%] overflow-auto">
      {explain}
      </Col>
      <Col phone={ctx.phone} className="max-w-[46%]">
      <div className={`w-full max-w-[720px] pt-2.5 ${ctx.phone ? '' : 'border-t border-wal1'}`}>
        <div className="h text-[12px] uppercase tracking-wider text-brass">Now you try</div>
        <div className={`h leading-tight text-panel ${ctx.phone || step.rhythm ? 'text-[22px]' : 'text-[28px]'}`} data-testid="learn-prompt">
          {step.tryText}
        </div>
      </div>
      {step.tryProgression && (
        // The progression as numerals; each lights up once it has been played.
        <div className="flex gap-1.5" data-testid="prog-chips">
          {step.tryProgression.map((c, k) => {
            const key = keyById(step.tryKey ?? 'C');
            const ch = parseChord(c);
            const d = ch && !step.tryNames ? [...diatonic(key), ...diatonicSevenths(key)].find((x) => x.chord.root === ch.root && x.chord.quality === ch.quality) : undefined;
            const done = k < progIdx || stepDone;
            return (
              <span key={k} className={`h rounded-md px-3 py-1 text-[22px] ${done ? '' : 'opacity-40'} ${k === progIdx && !stepDone ? 'ring-2 ring-panel' : ''}`} style={{ background: d?.color ?? '#66584a', color: textOn(d?.color ?? '#66584a') }}>
                {d?.numeral ?? (ch ? chordName(ch) : c)}
              </span>
            );
          })}
        </div>
      )}
      {step.rhythm && (
        <RhythmBox
          ctx={ctx}
          pattern={step.rhythm}
          tryIt
          onLit={setDemoLit}
          onPass={() => {
            setCount(step.need);
            setMsg({ kind: 'good', text: 'Yes! That’s the rhythm. Nice work.' });
          }}
        />
      )}
      {step.tryScale && (
        // The scale: one dot per note, filled as they're played.
        <div className="flex gap-1.5" data-testid="scale-dots" aria-label={`${stepDone ? 8 : scaleCount} of 8 notes`}>
          {MAJOR_SCALE.map((_, k) => (
            <span key={k} className={`h-3.5 w-3.5 rounded-full border border-brass2 ${k < (stepDone ? 8 : scaleCount) ? 'bg-brass' : 'bg-transparent'}`} />
          ))}
        </div>
      )}
      <div className={`flex gap-1.5 ${step.tryProgression || step.tryScale || step.rhythm ? 'hidden' : ''}`} aria-label={`${count} of ${step.need} done`}>
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
      </Col>
      <Col phone={ctx.phone}>
      {stepDone ? (
        nextBtn
      ) : step.demo?.length ? (
        // A demo that teaches something before you try (Start / Restart no longer sit above the piano).
        <button className="btn btn-dark text-[15px]" onClick={() => void showMe()} disabled={demoing} data-testid="show-me">
          {demoing ? 'Playing…' : '▶ Show me'}
        </button>
      ) : null}
      {ctx.learnDone && last && stepDone && <div className="h text-[16px] text-brass">Learn complete. Your code will say so.</div>}
      </Col>
    </StageBox>
  );

  return {
    left,
    stage,
    navLabel: `Step ${i + 1}`,
    // Nothing is lit or labelled while the student is working it out. Only the note the app is playing shows.
    // Show-and-tell steps put the names on every key (step.labels).
    labels: step.labels ?? 'off',
    lit: demoLit ?? undefined,
    forceLabel: demoLit ?? undefined,
    keyText,
  };
}
