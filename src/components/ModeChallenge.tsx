import { useEffect, useRef, useState } from 'react';
import { EchoHelp, Level, Prompt } from '../types';
import { KEY_COUNT, isBlack, letterOf, parseNote, pc, pcOf, pretty } from '../utils/music';
import { Chord, chordLongName, chordName, chordPcs, detectChord, keyById, matchesChord, pcName, moveDistance, parseChord, smoothestVoicing, voicing } from '../utils/chords';
import { accuracy, credit, floored, passed } from '../utils/grading';
import { shuffleNoRepeats } from '../utils/shuffle';
import { TimingSummary } from '../utils/timing';
import { loadBest, saveBest } from '../utils/autosave';
import { KeyMark } from './Piano';
import { LABEL_ORDER, Labels, ModeCtx, ModeParts } from './modeTypes';
import { useChordWatcher, useNoteListener } from './chordInput';
import { usePlayLevel } from './PlayLevel';
import { Col, StageBox } from './StageRow';
import { MAJOR_SCALE, fingering, scaleStep } from '../utils/scales';
import { ALL_LESSONS } from '../utils/batch';

const ALL_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
/** Echo difficulty, easiest first: See Notes (keys light up), See First Note (only the first key lights up), By Ear (nothing lights up, only 2 replays). */
const ECHO_ORDER: EchoHelp[] = ['watch', 'hint', 'ear'];
const ECHO_LABEL: Record<EchoHelp, string> = { watch: 'See Notes', hint: 'See First Note', ear: 'By Ear' };
const EAR_REPLAYS = 2;

/** Two questions are "the same" when they ask the same thing about the same note or chord. */
const sameQuestion = (p: Prompt) => [p.text, p.chord ?? '', p.show ?? '', p.inv ?? '', p.step ?? '', (p.answer ?? []).join('/'), (p.notes ?? []).join()].join('|');

interface Run {
  level: Level;
  prompts: Prompt[];
  idx: number;
  /** Credit earned so far (1 for a first-try answer, 0.5 for a second try). */
  points: number;
  misses: number;
  /** Smooth Mover: the chord the student is moving from (stays lit), and half steps moved so far vs the best possible. */
  prev?: number[];
  /** Speed Round: when time is up (performance.now() ms), and right answers so far. */
  endsAt?: number;
  count?: number;
  moved?: number;
  bestMoves?: number;
}
interface Finished {
  level: Level;
  raw: number;
  best: number;
  /** Progression Play: the timing breakdown, and the tempo played at. */
  timing?: TimingSummary;
  tempo?: number;
  /** Speed Round: right answers in the time. */
  speedCount?: number;
  /** Smooth Mover: half steps moved, and the fewest possible. */
  moved?: number;
  bestMoves?: number;
}

/** The keys in view, low to high. */
/** Lesson 8 reminder on a wrong 7th chord: how it is built, with the 7th found from the octave. */
const SEVENTH_RECIPE: Partial<Record<string, string>> = {
  maj7: 'major triad + major 7th (a half step below the octave)',
  dom7: 'major triad + minor 7th (a whole step below the octave)',
  min7: 'minor triad + minor 7th (a whole step below the octave)',
};

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
    if (v[0] === floor && v[v.length - 1] < start + KEY_COUNT) fits.push(v);
  }
  // Prefer the middle of the keyboard: pick among the fits near the centre.
  const mid = fits.filter((v) => v[0] >= start + 5 && v[v.length - 1] <= start + 19);
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
  // A teacher's assignment can give a lesson's Learn only (no levels): the hooks below still need levels to point at.
  const none = ctx.lesson.levels.length === 0;
  const levels = none ? (ALL_LESSONS.find((l) => l.id === ctx.lesson.id) ?? ALL_LESSONS[0]).levels : ctx.lesson.levels;
  const [selected, setSelected] = useState<string>(levels[0].id);
  const [run, setRun] = useState<Run | null>(null);
  const [finished, setFinished] = useState<Finished | null>(null);
  /** Feedback under the question: green when right, red when wrong (with a tip). */
  const [fb, setFbState] = useState<{ kind: 'good' | 'bad'; text: string } | null>(null);
  const fbTimer = useRef<number | undefined>(undefined);
  const setFb = (f: { kind: 'good' | 'bad'; text: string } | null, clearAfter?: number) => {
    window.clearTimeout(fbTimer.current);
    setFbState(f);
    if (clearAfter) fbTimer.current = window.setTimeout(() => setFbState(null), clearAfter);
  };
  const setMsg = (text: string) => setFb(text ? { kind: 'bad', text } : null);
  /** Listening levels: answer buttons wait until the chord has played (no answering the next question by double-tapping). */
  const [ready, setReady] = useState(true);
  /** Ear Check: after a right answer, the chord is shown and played again before the next question. */
  const [reveal, setReveal] = useState<number[] | null>(null);
  const busy = useRef(false);
  const [marks, setMarks] = useState<Map<number, KeyMark>>(new Map());
  // Echo: the help setting per level (Watch & Play / Hint / Ear only), keys lit while the app plays, what's been played
  // back so far, and replays used (Ear only allows 2).
  const [echoPick, setEchoPick] = useState<Record<string, EchoHelp>>({});
  const [echoLit, setEchoLit] = useState<Set<number> | null>(null);
  const [echoPlaying, setEchoPlaying] = useState(false);
  const [echoGot, setEchoGot] = useState<number[]>([]);
  const echoBuf = useRef<number[]>([]);
  const [replays, setReplays] = useState(0);
  const echoTimers = useRef<number[]>([]);
  // Scale levels (Lesson 7): the notes played so far in this try.
  const scaleBuf = useRef<number[]>([]);
  const [scaleGot, setScaleGot] = useState(0);
  // Speed Round: a clock that ticks the display.
  const [, setTick] = useState(0);
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
  /** The last question asked in each level, so a new try doesn't open with it. */
  const lastAsked = useRef<Record<string, string>>({});
  const viewRef = useRef(ctx.viewStart);
  viewRef.current = ctx.viewStart;

  // A new lesson picked: start at its first level.
  useEffect(() => {
    setSelected(levels[0].id);
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

  /** The keys a listening question plays: Ear Check in root position around middle C; "Name the chord" = the lit keys. */
  const chordKeys = (level: Level, p: Prompt | undefined, idx: number): number[] => {
    const c = parseChord(p?.chord ?? '');
    if (!c) return [];
    return level.type === 'nameChord' ? litChord(viewRef.current, c, p?.inv ?? 0, idx) : voicing(c, 0, 55);
  };
  /** Play a question's chord. The answer buttons open once it has started sounding. */
  const playChord = (level: Level, p: Prompt | undefined, idx: number) => {
    const notes = chordKeys(level, p, idx);
    if (!notes.length) return;
    setReady(false);
    void ctx.engine.unlock().then(() => {
      notes.forEach((n) => ctx.engine.noteOn(n, 0.75));
      window.setTimeout(() => setReady(true), 400);
      window.setTimeout(() => notes.forEach((n) => ctx.engine.noteOff(n)), 1300);
    });
  };
  const listens = (level: Level) => level.type === 'earCheck' || (level.type === 'nameChord' && !!level.playChord);

  /** Echo help for a level: the student's pick, but never more help than the level allows. */
  const echoHelp = (level: Level): EchoHelp => {
    const min = level.echo ?? 'watch';
    const pick = echoPick[level.id] ?? min;
    return ECHO_ORDER.indexOf(pick) >= ECHO_ORDER.indexOf(min) ? pick : min;
  };
  const stopEcho = () => {
    // Stopped partway through the tune: silence it (its note-off timers are about to be cancelled).
    if (echoTimers.current.length) ctx.engine.allOff();
    echoTimers.current.forEach((t) => window.clearTimeout(t));
    echoTimers.current = [];
    setEchoLit(null);
    setEchoPlaying(false);
  };
  /** Echo: the app plays the melody (keys light up as the help setting allows), then it's the student's turn. */
  const playEcho = (level: Level, p: Prompt | undefined) => {
    const notes = (p?.notes ?? []).map((n) => parseNote(n)).filter((n): n is number => n !== null);
    if (!notes.length) return;
    stopEcho();
    const help = echoHelp(level);
    // For browser tests: the tune being played (no student data).
    (window as unknown as { __echo?: number[] }).__echo = notes;
    busy.current = true;
    setEchoPlaying(true);
    echoBuf.current = [];
    setEchoGot([]);
    const GAP = 560;
    void ctx.engine.unlock().then(() => {
      notes.forEach((n, i) => {
        echoTimers.current.push(
          window.setTimeout(() => {
            ctx.engine.noteOn(n, 0.75);
            setEchoLit(help === 'watch' || (help === 'hint' && i === 0) ? new Set([n]) : null);
          }, i * GAP),
        );
        echoTimers.current.push(window.setTimeout(() => ctx.engine.noteOff(n), i * GAP + GAP * 0.8));
      });
      echoTimers.current.push(
        window.setTimeout(() => {
          echoTimers.current = [];
          setEchoLit(null);
          setEchoPlaying(false);
          busy.current = false;
        }, notes.length * GAP),
      );
    });
  };

  const start = (id: string) => {
    const level = levelById(id);
    stopEcho();
    setReplays(0);
    scaleBuf.current = [];
    setScaleGot(0);
    setFinished(null);
    setMsg('');
    // Never the same question twice in a row (and not a repeat of the one that ended the last try).
    const prompts = shuffleNoRepeats(level.prompts, sameQuestion, lastAsked.current[level.id]);
    // Smooth Mover keeps its order: each chord follows the last one.
    // A level that asks the same thing every time (Lesson 7: play the G major scale three times) keeps it as written.
    const allSame = level.prompts.every((p) => sameQuestion(p) === sameQuestion(level.prompts[0]));
    const ordered = level.type === 'smooth' || allSame ? level.prompts : prompts;
    let prev = level.type === 'smooth' ? (level.start ?? ['C4', 'E4', 'G4']).map((n) => parseNote(n)!).filter((n) => n !== null) : undefined;
    // The starting chord sits on the keys on screen (moved by whole octaves if the view has moved).
    if (prev) {
      const v = viewRef.current;
      while (Math.max(...prev) > v + KEY_COUNT - 1 && Math.min(...prev) - 12 >= v) prev = prev.map((n) => n - 12);
      while (Math.min(...prev) < v && Math.max(...prev) + 12 <= v + KEY_COUNT - 1) prev = prev.map((n) => n + 12);
    }
    if (level.type === 'speed') {
      // As many as you can: plenty of questions, shuffled, never the same twice in a row.
      let many: Prompt[] = [];
      while (many.length < 150) many = [...many, ...shuffleNoRepeats(level.prompts, sameQuestion, many.length ? sameQuestion(many[many.length - 1]) : undefined)];
      busy.current = false;
      setRunNow({ level, prompts: many, idx: 0, points: 0, misses: 0, endsAt: performance.now() + (level.seconds ?? 60) * 1000, count: 0 });
      return;
    }
    setRunNow({ level, prompts: ordered, idx: 0, points: 0, misses: 0, prev, moved: 0, bestMoves: 0 });
    busy.current = false;
    if (level.type === 'echo') {
      // "Listen…" right away; the tune starts a moment later.
      busy.current = true;
      setEchoPlaying(true);
      window.setTimeout(() => playEcho(level, ordered[0]), 400);
    }
    setReveal(null);
    setReady(!listens(level));
    if (listens(level)) window.setTimeout(() => playChord(level, ordered[0], 0), 300);
  };

  /** Score the current prompt as right or wrong and move on. `extra` updates the run (Smooth Mover). */
  const answer = (correct: boolean, keys: number[] = [], why = 'Not quite. Try again.', extra: Partial<Run> = {}) => {
    const r = runRef.current;
    if (!r || busy.current) return;
    if (r.level.type === 'speed') {
      // Speed Round: right = +1 and the next one; wrong = try again (no penalty but the time).
      if (!correct) {
        if (keys.length) flash(keys, 'bad');
        setMsg(why);
        return;
      }
      if (keys.length) flash(keys, 'ok');
      setFb({ kind: 'good', text: '✓ Right!' }, 700);
      setRunNow({ ...r, idx: r.idx + 1, count: (r.count ?? 0) + 1 });
      return;
    }
    if (!correct) {
      if (keys.length) flash(keys, 'bad');
      setMsg(why);
      setRunNow({ ...r, misses: r.misses + 1 });
      return;
    }
    if (keys.length) flash(keys, 'ok');
    if (r.level.type === 'earCheck') {
      // Show and play the answer, then go on.
      const c = parseChord(r.prompts[r.idx].chord ?? '');
      const notes = chordKeys(r.level, r.prompts[r.idx], r.idx);
      busy.current = true;
      setFb({ kind: 'good', text: c ? `✓ Yes! That was ${chordName(c)} (${chordLongName(c)}).` : '✓ Yes!' });
      setReveal(notes);
      void ctx.engine.unlock().then(() => notes.forEach((n) => ctx.engine.noteOn(n, 0.75)));
      window.setTimeout(() => {
        notes.forEach((n) => ctx.engine.noteOff(n));
        setReveal(null);
        busy.current = false;
        setFb(null);
        advance(r, extra);
      }, 1800);
      return;
    }
    setFb({ kind: 'good', text: '✓ Right!' }, 1100);
    advance(r, extra);
  };

  /** Save a finished attempt (best on this device, the result for the code) and show the result screen. */
  const recordResult = (level: Level, raw: number, extra: Partial<Finished> = {}) => {
    setRunNow(null);
    const prevBest = best[level.id] ?? 0;
    saveBest(level.id, raw);
    setBest(loadBest());
    ctx.setResults((prev) => {
      const old = prev.find((x) => x.levelId === level.id);
      if (old && old.raw >= raw) return prev;
      const rest = prev.filter((x) => x.levelId !== level.id);
      return [...rest, { levelId: level.id, raw, labels: effective(level), at: Date.now() }];
    });
    setFinished({ level, raw, best: Math.max(prevBest, raw), ...extra });
  };

  /** Score a right answer and go to the next question (or the result). */
  const advance = (r: Run, extra: Partial<Run>) => {
    const points = r.points + credit(r.misses);
    const idx = r.idx + 1;
    const next = { ...r, ...extra };
    if (idx >= r.prompts.length) {
      lastAsked.current[r.level.id] = sameQuestion(r.prompts[r.idx]);
      recordResult(r.level, accuracy(points, r.prompts.length), { moved: next.moved, bestMoves: next.bestMoves });
    } else {
      setRunNow({ ...next, idx, points, misses: 0 });
      if (listens(r.level)) window.setTimeout(() => playChord(r.level, r.prompts[idx], idx), 400);
      if (r.level.type === 'echo') {
        setReplays(0);
        busy.current = true;
        setEchoPlaying(true);
        window.setTimeout(() => playEcho(r.level, r.prompts[idx]), 900);
      }
    }
  };

  // Playing single keys: Find It and Half Step.
  useNoteListener(ctx.subscribe, (midi) => {
      const r = runRef.current;
      if (!r) return;
      const p = r.prompts[r.idx];
      if (r.level.type === 'echo') {
        // Play it back: the same notes in the same order (any octave). Judged once you've played as many notes.
        if (busy.current) return;
        const want = (p.notes ?? []).map((n) => pc(parseNote(n) ?? 0));
        echoBuf.current = [...echoBuf.current, pc(midi)];
        setEchoGot(echoBuf.current);
        if (echoBuf.current.length < want.length) return;
        const got = echoBuf.current;
        echoBuf.current = [];
        window.setTimeout(() => setEchoGot([]), 600);
        const ok = got.every((x, i) => x === want[i]);
        const names = got.map((x) => pretty(letterOf(x + 60))).join(' – ');
        answer(ok, [midi], `Not quite: you played ${names}. ${echoHelp(r.level) === 'ear' ? 'Try again.' : 'Press ▶ Hear it again, watch the keys, and try.'}`);
        return;
      }
      if (r.level.type === 'scale') {
        // Lesson 7: the scale up one octave, one note at a time. A wrong note starts it over (and counts as a miss).
        if (busy.current) return;
        const k = keyById(p.scale ?? 'C');
        const played = [...scaleBuf.current, midi];
        const res = scaleStep(k.tonic, played);
        const tonic = pcName(k.tonic, k.flats);
        if (res === 'next') {
          scaleBuf.current = played;
          setScaleGot(played.length);
          return;
        }
        scaleBuf.current = [];
        setScaleGot(0);
        if (res === 'done') {
          answer(true, [midi]);
          return;
        }
        const want = res === 'wrong-start' ? tonic : pcName(played[0] + MAJOR_SCALE[played.length - 1], k.flats);
        answer(false, [midi], res === 'wrong-start' ? `Start on ${tonic}.` : `That is ${pcName(midi, k.flats)}; the next note is ${want}. Start again from ${tonic}.`);
        return;
      }
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
        const n = Math.abs(p.step ?? 1);
        const why =
          midi === from
            ? 'That is the lit key itself. Count up from it.'
            : n === 1
              ? 'Not quite. A half step is the very next piano key, black or white.'
              : n >= 10
                ? `${midi === from + 12 ? 'That is the octave.' : 'Not quite.'} Find the octave, then step down ${n === 11 ? 'a half step (one piano key)' : 'a whole step (two piano keys)'}.`
              : `Not quite: that is ${Math.abs(midi - from)} half step${Math.abs(midi - from) === 1 ? '' : 's'} away. Count ${n}, black keys included.`;
        answer(midi === target, [midi], why);
      }
  });

  // Playing chords: Build It and Smooth Mover. One chord (3+ keys held together) = one answer.
  useChordWatcher(ctx.getHeld, ctx.subscribeNotes, (held) => {
      const r = runRef.current;
      if (!r || (r.level.type !== 'buildIt' && r.level.type !== 'smooth' && r.level.type !== 'speed')) return;
      const p = r.prompts[r.idx];
      const c = parseChord(p.chord ?? '');
      if (!c) return;
      const got = detectChord(held);
      // Short and long names together, e.g. "C♯m (C♯ minor)".
      const gotName = got ? `${got.symbol} (${got.longName})` : null;
      const want = (ch: Chord) => `${chordName(ch)} (${chordLongName(ch)})`;
      if (r.level.type === 'buildIt' || r.level.type === 'speed') {
        const ok = matchesChord(held, c, p.inv);
        const right = matchesChord(held, c);
        const why = right && p.inv !== undefined
          ? `That is ${chordLongName(c)}, but the wrong note is on the bottom. Let go and try again.`
          : gotName
            ? `That is ${gotName}, not ${want(c)}. Let go and try again.`
            : 'Those keys don’t make that chord. Let go and try again.';
        answer(ok, held, `${why}${SEVENTH_RECIPE[c.quality] ? ` ${chordName(c)} = ${SEVENTH_RECIPE[c.quality]}.` : ''}`);
        return;
      }
      // Smooth Mover: the right chord AND the fewest half steps from the lit chord.
      const prev = r.prev ?? held;
      // Playing the lit chord itself (to get your hand in place) is fine: no answer, no penalty.
      const prevChord = detectChord(prev);
      if (prevChord && matchesChord(held, prevChord.chord) && !matchesChord(held, c)) {
        setFb({ kind: 'good', text: `That's the chord you're on. Now move to ${want(c)}.` });
        return;
      }
      if (held.length !== 3 || !matchesChord(held, c)) {
        answer(false, held, gotName ? `That is ${gotName}, not ${want(c)}. Let go and try again.` : `Play the three notes of ${want(c)}. Let go and try again.`);
        return;
      }
      const moved = moveDistance(prev, held);
      // The target always fits on the keys on screen (a smooth move never sends you off the keyboard).
      const bestMove = smoothestVoicing(prev, c, [viewRef.current, viewRef.current + KEY_COUNT - 1]).distance;
      if (moved > bestMove) {
        answer(false, held, `That is ${chordLongName(c)}, but you moved ${moved} half steps. You can do it in ${bestMove}. Let go and try again.`);
        return;
      }
      answer(true, held, '', { prev: held, moved: (r.moved ?? 0) + moved, bestMoves: (r.bestMoves ?? 0) + bestMove });
  }, () => {
    // Triads are judged on 3 keys, 7th chords (Lesson 8) on 4.
    const r = runRef.current;
    const c = parseChord(r?.prompts[r.idx]?.chord ?? '');
    return c ? Math.max(3, chordPcs(c).length) : 3;
  });

  // Speed Round: the clock. When time is up, the grade is right answers out of the level's target.
  useEffect(() => {
    if (!run || run.level.type !== 'speed') return;
    const id = window.setInterval(() => {
      const r = runRef.current;
      if (!r || r.level.type !== 'speed' || r.endsAt === undefined) return;
      if (performance.now() >= r.endsAt) {
        const count = r.count ?? 0;
        recordResult(r.level, Math.min(100, Math.round((count / (r.level.target ?? 12)) * 100)), { speedCount: count });
      } else setTick((t) => t + 1);
    }, 200);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run?.level.id, run?.endsAt]);
  // Leaving the screen stops an Echo that's playing.
  useEffect(() => () => stopEcho(), []); // eslint-disable-line react-hooks/exhaustive-deps

  const selLevel = levelById(selected);
  // Progression Play levels run in time (PlayLevel.tsx); the other levels are question by question.
  const play = usePlayLevel(ctx, selLevel, {
    minTempo: ctx.minTempo,
    onFinish: (raw, s, set) => recordResult(selLevel, raw, { timing: s, tempo: set.tempo }),
  });
  const isPlay = selLevel.type === 'play';

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
  if (reveal) lit = new Set(reveal);
  if (run?.level.type === 'echo') lit = echoLit ?? undefined;
  if (isPlay && !finished) lit = play.lit;
  const left = (
    <div className="flex flex-col gap-2">
      <div>
        <div className="h text-[11px] uppercase text-muted">Lesson {ctx.lesson.number} · Challenges</div>
        <h2 className="h text-[19px] leading-tight text-wal3">{ctx.lesson.title}</h2>
      </div>
      <div className="flex flex-col gap-0.5">
        {levels.map((l, k) => {
          const r = bestResult(l.id);
          const sel = l.id === selected;
          return (
            <button
              key={l.id}
              data-testid={`level-${l.id}`}
              onClick={() => {
                setSelected(l.id);
                stopEcho();
                setRunNow(null);
                setFinished(null);
                setMsg('');
              }}
              className={`flex items-center justify-between gap-2 rounded-lg border px-2.5 py-[3px] text-left ${sel ? 'border-brass2 bg-[#fbeecb]' : 'border-line bg-panel hover:bg-[#fff8ea]'}`}
            >
              {/* One line per level ("1 · Name C, F and G"), so a lesson with 6 levels still fits a Chromebook screen. */}
              <span className="min-w-0 text-[14px] font-semibold leading-tight text-wal3">
                <span className="h mr-1 text-[12px] text-muted">{k + 1} ·</span>
                {l.title}
              </span>
              <span className={`h shrink-0 ${r ? 'text-[13px]' : 'text-[11px]'} ${r && passed(r.raw, l) ? 'text-good' : 'text-muted'}`}>
                {r ? `${passed(r.raw, l) ? '✓ ' : ''}${floored(r.raw)}%` : `${l.pass}% to pass`}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );

  const choices = run ? (run.prompts[run.idx]?.choices ?? run.level.choices ?? (run.level.type === 'nameIt' ? ALL_LETTERS : [])) : [];
  let stage;
  if (finished) {
    const ok = passed(finished.raw, finished.level);
    const li = levels.findIndex((l) => l.id === finished.level.id);
    stage = (
      <StageBox phone={ctx.phone} className="pop gap-2" testid="result">
        <Col phone={ctx.phone}>
        <div className="h text-[14px] tracking-wide text-brass">{finished.level.title}</div>
        <div className="h text-[72px] leading-none text-panel" data-testid="result-grade">
          {floored(finished.raw)}%
        </div>
        </Col>
        <Col phone={ctx.phone}>
        <div className={`h text-[18px] ${ok ? 'text-[#cfe3b4]' : 'text-brass'}`}>
          {ok ? `Passed! (${finished.level.pass}% needed)` : `Not passed yet. You need ${finished.level.pass}%. Try again!`}
        </div>
        {finished.level.type === 'smooth' && (
          <div className="text-[15px] text-line2" data-testid="smooth-total">
            Half steps moved: {finished.moved} (the smoothest possible: {finished.bestMoves})
          </div>
        )}
        {finished.timing && (
          <div className="flex flex-col items-center gap-0.5 text-[15px] text-line2" data-testid="timing-total">
            <div>
              <span className="text-[#cfe3b4]">Perfect {finished.timing.perfect}</span> · <span className="text-[#f6e3b8]">Good {finished.timing.good}</span> · <span className="text-[#efd6a8]">Early/Late {finished.timing.off}</span> · <span className="text-[#f0c4bf]">Miss {finished.timing.miss}</span>
            </div>
            <div>
              Timing {finished.timing.timing}% · Right notes {finished.timing.notes}% · {finished.tempo} BPM
            </div>
          </div>
        )}
        {finished.timing?.offset !== undefined && (
          // Steadily early or late by about the same amount: often the latency setting, not the student.
          <div className="flex max-w-[640px] items-center gap-3 rounded-lg bg-[#f6e3b8] px-3 py-1.5 text-left text-[14px] text-wal2" data-testid="latency-hint">
            <span className="flex flex-col">
              <span>
                You were usually about {Math.abs(finished.timing.offset)} ms {finished.timing.offset > 0 ? 'late' : 'early'}.
              </span>
              <span>
                If it felt on time, your latency setting may be off ({ctx.latency ? `it's set to ${ctx.latency} ms` : 'not checked yet'}).
              </span>
            </span>
            <button className="btn btn-dark shrink-0 px-2 py-1 text-[13px]" onClick={ctx.openLatency} data-testid="check-latency">
              Check latency
            </button>
          </div>
        )}
        {finished.speedCount !== undefined && (
          <div className="text-[15px] text-line2" data-testid="speed-total">
            {finished.speedCount} right in {finished.level.seconds ?? 60} seconds (the goal: {finished.level.target ?? 12})
          </div>
        )}
        <div className="text-[14px] text-line2">Your best on this device: {floored(finished.best)}%</div>
        </Col>
        <Col phone={ctx.phone}>
        <div className={`mt-1 flex gap-2 ${ctx.phone ? 'flex-col' : ''}`}>
          <button className="btn btn-brass" onClick={() => (finished.level.type === 'play' ? setFinished(null) : start(finished.level.id))} data-testid="try-again">
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
        {!ctx.phone && <div className="text-[13px] text-line2">Turn your work in from the Grade Report tab.</div>}
        </Col>
      </StageBox>
    );
  } else if (run && prompt) {
    stage = (
      <StageBox phone={ctx.phone} className="gap-3 px-6">
        <Col phone={ctx.phone} className="max-w-[45%]">
        <div className="h text-[14px] tracking-wide text-brass">
          {run.level.type === 'speed' ? `${run.level.title} · ${run.count ?? 0} right` : `${run.level.title} · ${run.idx + 1} of ${run.prompts.length}`}
        </div>
        <div className="h text-[36px] leading-tight text-panel" data-testid="prompt">
          {prompt.text}
        </div>
        {run.level.type === 'smooth' && run.prev && (
          <div className="text-[15px] text-line2">
            From the lit chord ({detectChord(run.prev) ? chordName(detectChord(run.prev)!.chord) : ''}). Half steps moved so far: {run.moved ?? 0}
          </div>
        )}
        </Col>
        <Col phone={ctx.phone}>
        {run.level.type === 'echo' && (
          <div className="flex flex-col items-center gap-2">
            <div className="h text-[15px] text-line2" data-testid="echo-status">
              {echoPlaying ? 'Listen…' : 'Your turn: play it back.'}
            </div>
            {/* One dot per note: filled as you play them. */}
            <div className="flex gap-1.5">
              {(prompt.notes ?? []).map((_, i) => (
                <span key={i} className={`h-3 w-3 rounded-full ${i < echoGot.length ? 'bg-brass' : 'bg-wal2'}`} />
              ))}
            </div>
            {(() => {
              const ear = echoHelp(run.level) === 'ear';
              const left = EAR_REPLAYS - replays;
              return (
                <button
                  className="btn btn-dark"
                  disabled={echoPlaying || (ear && left <= 0)}
                  data-testid="hear-again"
                  onClick={() => {
                    setReplays((x) => x + 1);
                    playEcho(run.level, prompt);
                  }}
                >
                  ▶ Hear it again{ear ? ` (${Math.max(0, left)} left)` : ''}
                </button>
              );
            })()}
          </div>
        )}
        {run.level.type === 'scale' && (
          <div className="flex flex-col items-center gap-1.5">
            <div className="flex gap-1.5" data-testid="scale-dots">
              {MAJOR_SCALE.map((_, k) => (
                <span key={k} className={`h-3.5 w-3.5 rounded-full border border-brass2 ${k < scaleGot ? 'bg-brass' : 'bg-transparent'}`} />
              ))}
            </div>
            {/* Fingering is a hint, never graded (SPEC section 7). */}
            <div className="text-[15px] text-line2" data-testid="fingering">
              Right-hand fingers: {fingering(prompt.scale ?? 'C').join(' ')}
            </div>
          </div>
        )}
        {run.level.type === 'speed' && (
          <button className="btn btn-dark px-3 py-1 text-[13px]" data-testid="skip" onClick={() => setRunNow({ ...run, idx: run.idx + 1 })}>
            Skip
          </button>
        )}
        {listens(run.level) && (
          <button className="btn btn-dark" onClick={() => playChord(run.level, prompt, run.idx)} disabled={!!reveal} data-testid="hear-again">
            ▶ Hear it again
          </button>
        )}
        {choices.length > 0 && (
          <div className="flex flex-wrap justify-center gap-2">
            {choices.map((l) => (
              <button
                key={l}
                data-testid={`choice-${l}`}
                disabled={!ready || !!reveal}
                className="btn btn-brass min-w-[52px] text-[20px] disabled:opacity-50"
                onClick={() => answer((prompt.answer ?? [prompt.show ?? '']).includes(l), [], prompt.tip ? `Not quite. ${prompt.tip}` : undefined)}
              >
                {pretty(l)}
              </button>
            ))}
          </div>
        )}
        </Col>
        <Col phone={ctx.phone} className="max-w-[35%]">
        {/* Green when right; red (with a tip) when wrong. */}
        <div
          className={`min-h-[30px] max-w-[680px] rounded-lg px-3 py-1 text-[16px] ${fb ? (fb.kind === 'good' ? 'pop bg-[#cfe3b4] text-good' : 'bg-[#f0c4bf] text-[#7a2420]') : 'text-transparent'}`}
          data-testid="challenge-msg"
          data-kind={fb?.kind}
        >
          {fb?.text ?? '.'}
        </div>
        <div className={`h-2 overflow-hidden rounded-full bg-wal2 ${ctx.phone ? 'w-40' : 'w-64'}`}>
          {run.level.type === 'speed' && run.endsAt !== undefined ? (
            <div className="h-full bg-brass" data-testid="time-bar" style={{ width: `${Math.max(0, (run.endsAt - performance.now()) / ((run.level.seconds ?? 60) * 10))}%` }} />
          ) : (
            <div className="h-full bg-brass transition-all" style={{ width: `${(run.idx / run.prompts.length) * 100}%` }} />
          )}
        </div>
        {run.level.type === 'speed' && run.endsAt !== undefined && (
          <div className="h text-[14px] text-line2" data-testid="time-left">
            {Math.max(0, Math.ceil((run.endsAt - performance.now()) / 1000))} s left
          </div>
        )}
        <button className="btn btn-dark px-3 py-1 text-[13px]" onClick={() => {
            // Echo: back to the start screen, where the difficulty can be changed. Other levels start over right away.
            if (run.level.type === 'echo') {
              stopEcho();
              busy.current = false;
              setRunNow(null);
              setMsg('');
            } else start(run.level.id);
          }}
          data-testid="restart"
        >
          Restart
        </button>
        </Col>
      </StageBox>
    );
  } else if (isPlay) {
    stage = play.stage;
  } else {
    const minHelp = selLevel.echo ?? 'watch';
    stage = (
      <StageBox phone={ctx.phone} className="gap-2 px-6">
        <Col phone={ctx.phone} className="max-w-[45%]">
        <div className="h text-[14px] tracking-wide text-brass">Level: {selLevel.title}</div>
        <div className="h text-[30px] leading-tight text-panel">{selLevel.blurb}</div>
        </Col>
        <Col phone={ctx.phone} className="max-w-[35%]">
        <div className="text-[15px] text-line2">
          {selLevel.type === 'speed'
            ? `${selLevel.seconds ?? 60} seconds · as many as you can · ${selLevel.target ?? 12} right = 100% · ${selLevel.pass}% to pass`
            : `${selLevel.prompts.length} questions · ${selLevel.pass}% to pass · first try counts full, second try counts half`}
        </div>
        {selLevel.type === 'echo' && (
          <div className="flex items-center gap-1.5" role="radiogroup" aria-label="Echo difficulty">
            <span className="h text-[12px] uppercase tracking-wider text-brass">Difficulty</span>
            {ECHO_ORDER.map((h) => (
              <button
                key={h}
                role="radio"
                aria-checked={echoHelp(selLevel) === h}
                disabled={ECHO_ORDER.indexOf(h) < ECHO_ORDER.indexOf(minHelp)}
                data-testid={`echo-${h}`}
                className={`btn px-2 py-0.5 text-[13px] ${echoHelp(selLevel) === h ? 'btn-brass' : 'btn-dark'} disabled:opacity-40`}
                onClick={() => setEchoPick((x) => ({ ...x, [selLevel.id]: h }))}
              >
                {ECHO_LABEL[h]}
              </button>
            ))}
          </div>
        )}
        </Col>
        <Col phone={ctx.phone}>
        <button className="btn btn-brass mt-2 text-[18px]" data-testid="start" onClick={() => start(selected)}>
          Start
        </button>
        </Col>
      </StageBox>
    );
  }

  if (none)
    return {
      left: (
        <div className="text-[14px] text-wal1" data-testid="no-challenges">
          Your teacher assigned this lesson’s Learn, not its Challenges.
        </div>
      ),
      stage: (
        <div className="flex h-full items-center justify-center px-6 text-center">
          <div className="h text-[22px] text-line2/80">No Challenges in this assignment for Lesson {ctx.lesson.number}. Try Learn or Practice.</div>
        </div>
      ),
      navLabel: 'Challenges',
      labels: 'off',
    };

  return {
    left,
    stage,
    navLabel: `Level ${Math.max(0, levels.findIndex((l) => l.id === selLevel.id)) + 1}`,
    lit,
    marks,
    labels: effective(selLevel),
    labelControl: {
      value: effective(selLevel),
      allowed: LABEL_ORDER.filter((l) => LABEL_ORDER.indexOf(l) >= LABEL_ORDER.indexOf(selLevel.labels)),
      set: (l) => setLabelPick((p) => ({ ...p, [selLevel.id]: l })),
      locked: !!run || play.running,
    },
    start: { label: 'Start', onClick: () => start(selected), disabled: !!run },
    restart: { label: 'Restart', onClick: () => start(selected), disabled: !run },
  };
}
