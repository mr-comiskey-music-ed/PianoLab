import React, { useEffect, useRef, useState } from 'react';
import { AudioEngine } from '../audio/audioEngine';
import { EchoHelp, Lesson, LevelResult, ScreenHelp } from '../types';
import { Assignment, Choice, JamSetup, OpenTab, applyAssignment, assignmentLink, encodeAssignment } from '../utils/assignment';
import { GROOVES, TRACKS } from '../audio/groove';
import { keyById } from '../utils/chords';
import { JAM_KEYS, PROGRESSIONS, VIDEOS, presetNumerals } from './ModeJam';
import { youTubeId } from './YouTubeBox';
import { SOUNDS } from '../audio/audioEngine';
import { Labels } from './modeTypes';
import { encodeSubmission, DEFAULT_ASSIGNMENT } from '../utils/codec';
import { parseBatch, BatchResult, BatchEntry, ALL_LESSONS } from '../utils/batch';
import { floored, passed, bestByLevel } from '../utils/grading';
import { saveLatency } from '../utils/autosave';
import { STEADY_MS, tapSpread } from '../utils/timing';
import { cleanBacking, downloadMidi, formatLength, perfLength, perfLink, unpackPerf } from '../utils/performance';

const Shell: React.FC<{ title: string; onClose: () => void; wide?: boolean; children: React.ReactNode }> = ({ title, onClose, wide, children }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4" role="dialog" aria-modal="true" aria-label={title}>
    <div className={`card flex max-h-[92vh] w-full flex-col shadow-xl ${wide ? 'max-w-3xl' : 'max-w-md'}`}>
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <h2 className="h text-[20px] text-wal3">{title}</h2>
        <button className="btn" onClick={onClose} aria-label="Close">
          Close
        </button>
      </div>
      <div className="overflow-auto p-4">{children}</div>
    </div>
  </div>
);

// ---------------- Get my code (shown on the Grade Report tab) ----------------
export const CodePanel: React.FC<{ results: LevelResult[]; learned: string[]; assignment?: Assignment | null }> = ({ results: allResults, learned, assignment }) => {
  // With an assignment, the code (and the list) has only the assigned levels, and carries the assignment's title.
  const results = assignment ? allResults.filter((r) => assignment.levels.includes(r.levelId)) : allResults;
  const shownLessons = applyAssignment(ALL_LESSONS, assignment ?? null);
  const [code, setCode] = useState('');
  const [copied, setCopied] = useState(false);
  // The name is typed fresh each time and is never saved by the app. It lives only inside the code.
  const [name, setName] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!name.trim()) return setCode('');
    setCopied(false);
    void encodeSubmission({ name, assignment: assignment?.title ?? DEFAULT_ASSIGNMENT, timestamp: Date.now(), learnDone: learned.includes('lesson-1'), learned, results }).then(setCode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allResults, learned, name, assignment]);
  const best = bestByLevel(results);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      ref.current?.select();
      document.execCommand('copy');
    }
    setCopied(true);
  };
  return (
    <div data-testid="code-panel">
      <p className="text-[15px] text-wal1">Type your name, then copy your code and paste it into Google Classroom to turn in your work. Your name goes inside the code only. This app never saves it.</p>
      <label className="mt-3 block text-[14px]">
        <span className="h text-wal3">Your Name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoComplete="off" data-testid="name" placeholder="Your Name" className="mt-0.5 w-full rounded-lg border border-line2 bg-white px-2 py-1.5 text-[15px]" />
      </label>
      {/* The code right under the name (his call: no scrolling down to find it), then the levels it holds. */}
      <textarea ref={ref} readOnly value={code} rows={3} placeholder="Your code shows up here once you type your name." data-testid="code" className="mt-2 w-full rounded-lg border border-line2 bg-white p-2 font-mono text-[12px] break-all" onFocus={(e) => e.currentTarget.select()} />
      <button className="btn btn-brass mt-1 w-full" onClick={copy} disabled={!code} data-testid="copy-code">
        {copied ? 'Copied ✓' : 'Copy code'}
      </button>
      <div className="mt-3 flex flex-col gap-2 rounded-lg border border-line bg-page p-2 text-[14px]" data-testid="report-levels">
        {shownLessons.map((les) => (
          <div key={les.id}>
            <div className="flex justify-between">
              <span className="h text-wal3">
                Lesson {les.number}: {les.title}
              </span>
              <span className={`text-[13px] ${learned.includes(les.id) ? 'text-good' : 'text-muted'}`}>Learn {learned.includes(les.id) ? '✓' : '–'}</span>
            </div>
            {les.levels.map((l) => {
              const r = best[l.id];
              return (
                <div key={l.id} className="flex justify-between pl-3">
                  <span>{l.title}</span>
                  <span className={r && passed(r.raw, l) ? 'text-good' : 'text-muted'}>{r ? `${floored(r.raw)}%${passed(r.raw, l) ? ' ✓' : ''}` : '–'}</span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
};

// ---------------- Latency calibration ----------------
const BPM = 90;
const BEATS = 12;
export const LatencyModal: React.FC<{
  engine: AudioEngine;
  subscribe: (fn: (midi: number) => void) => () => void;
  onDone: (ms: number) => void;
  onClose: () => void;
  /** Turn the metronome off first, so its ticks don't mix with the calibration clicks. */
  pauseMetro: () => void;
}> = ({ engine, subscribe, onDone, onClose, pauseMetro }) => {
  const [phase, setPhase] = useState<'ready' | 'running' | 'done' | 'failed'>('ready');
  const [result, setResult] = useState<number | null>(null);
  /** How much the taps wandered around their own middle (ms). Steadily early or late is fine; back and forth is not. */
  const [spread, setSpread] = useState(0);
  const clicks = useRef<number[]>([]);
  const taps = useRef<number[]>([]);

  useEffect(() => {
    return subscribe(() => {
      if (phase === 'running') taps.current.push(performance.now());
    });
  }, [phase, subscribe, engine]);

  const tap = () => {
    if (phase === 'running') taps.current.push(performance.now());
  };

  const start = async () => {
    await engine.unlock();
    pauseMetro();
    taps.current = [];
    clicks.current = engine.scheduleClicks(BEATS, BPM);
    // For browser tests: when each click is heard (no student data).
    (window as unknown as { __clicks?: number[] }).__clicks = clicks.current;
    setPhase('running');
    window.setTimeout(() => {
      // For each tap, how late was it compared with the nearest click? The middle value is the latency.
      const offs = taps.current
        .map((t) => {
          const nearest = clicks.current.reduce((a, c) => (Math.abs(c - t) < Math.abs(a - t) ? c : a), clicks.current[0]);
          return t - nearest; // both in ms on the performance.now() clock (clicks = when they are heard)
        })
        .filter((ms) => Math.abs(ms) < 250)
        .slice(2); // skip the first couple of taps while the student finds the beat
      if (offs.length < 4) return setPhase('failed');
      offs.sort((a, b) => a - b);
      const median = offs[Math.floor(offs.length / 2)];
      const ms = Math.max(0, Math.round(median));
      saveLatency(ms);
      setResult(ms);
      setSpread(tapSpread(offs));
      setPhase('done');
      onDone(ms);
    }, (BEATS * 60) / BPM * 1000 + 900);
  };

  return (
    <Shell title="Latency check" onClose={onClose}>
      {phase === 'ready' && (
        <>
          <p className="flex flex-col gap-1 text-[15px] text-wal1">
            <span>Put on headphones and play any key with each click.</span>
            <span>It measures your keyboard’s delay, so grades stay fair.</span>
          </p>
          <button className="btn btn-brass mt-3 w-full" onClick={start} data-testid="latency-start">
            Start
          </button>
        </>
      )}
      {phase === 'running' && (
        <>
          <p className="text-[15px] text-wal1">Tap along with the clicks…</p>
          <button className="btn btn-dark mt-3 h-24 w-full text-[20px]" onPointerDown={tap}>
            Tap here (or play any key)
          </button>
        </>
      )}
      {phase === 'done' && (
        <>
          <p className="h text-[22px] text-good" data-testid="latency-result">
            Your latency: {result} ms
          </p>
          {spread <= STEADY_MS ? (
            <p className="h text-[16px] text-good" data-testid="latency-steady" data-steady="yes">
              Steady ✓
            </p>
          ) : (
            <p className="mt-1 flex flex-col rounded-lg bg-[#f6e3b8] px-2 py-1 text-[14px] text-wal2" data-testid="latency-steady" data-steady="no">
              <span>Your taps were uneven, so this number may be off.</span>
              <span>Try once more, tapping right with each click.</span>
            </p>
          )}
          <p className="mt-1 text-[14px] text-wal1">Saved in this browser and used for timing grades.</p>
          <div className="mt-3 flex gap-2">
            {spread > STEADY_MS && (
              <button className="btn btn-brass flex-1" onClick={() => setPhase('ready')} data-testid="latency-again">
                Try once more
              </button>
            )}
            <button className={`btn flex-1 ${spread > STEADY_MS ? '' : 'btn-brass'}`} onClick={onClose}>
              Done
            </button>
          </div>
        </>
      )}
      {phase === 'failed' && (
        <>
          <p className="text-[15px] text-bad">We didn’t hear enough taps. Try again and tap along with every click.</p>
          <button className="btn btn-brass mt-3 w-full" onClick={() => setPhase('ready')}>
            Try again
          </button>
        </>
      )}
    </Shell>
  );
};

// ---------------- Teacher: batch grading ----------------
export const BatchModal: React.FC<{ engine: AudioEngine; onClose: () => void }> = ({ engine, onClose }) => {
  const [text, setText] = useState('');
  const [res, setRes] = useState<BatchResult | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const run = async () => {
    setRes(await parseBatch(text));
    setOpen(null);
  };
  return (
    <Shell title="Teacher: batch grading" onClose={onClose} wide>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} data-testid="batch-input" placeholder="Paste codes here…" className="w-full rounded-lg border border-line2 bg-white p-2 font-mono text-[12px]" />
      <button className="btn btn-brass mt-2" onClick={run} data-testid="batch-run">
        Check codes
      </button>
      {res && (
        <div className="mt-4" data-testid="batch-result">
          <div className="flex flex-wrap gap-3 text-[14px]">
            <span className="card px-3 py-1">Read: <b>{res.entries.length}</b></span>
            <span className="card px-3 py-1">Class top: <b>{res.top ?? '–'}{res.top !== null && '%'}</b></span>
            <span className="card px-3 py-1" title="Obvious failed attempts are left out">Class average: <b>{res.average ?? '–'}{res.average !== null && '%'}</b></span>
            {res.duplicatesRemoved > 0 && <span className="card px-3 py-1">Duplicates removed: {res.duplicatesRemoved}</span>}
          </div>
          {res.unreadable.length > 0 && <p className="mt-2 text-[14px] text-bad">Couldn’t read: {res.unreadable.join(', ')}</p>}
          <div className="mt-3 flex flex-col gap-1">
            {res.entries.map((e) => (
              <Row key={e.id} e={e} engine={engine} open={open === e.id} toggle={() => setOpen(open === e.id ? null : e.id)} />
            ))}
          </div>
        </div>
      )}
    </Shell>
  );
};

/** Plays a Sandbox performance from a code. Stop cuts it off. */
const PerfPlayer: React.FC<{ engine: AudioEngine; perf: number[] }> = ({ engine, perf }) => {
  const notes = React.useMemo(() => unpackPerf(perf), [perf]);
  const timers = useRef<number[]>([]);
  const [playing, setPlaying] = useState(false);
  const stop = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
    notes.forEach((n) => engine.noteOff(n.m));
    setPlaying(false);
  };
  useEffect(() => stop, []); // eslint-disable-line react-hooks/exhaustive-deps
  const play = async () => {
    await engine.unlock();
    stop();
    for (const n of notes) {
      timers.current.push(window.setTimeout(() => engine.noteOn(n.m, n.v / 127), n.t));
      timers.current.push(window.setTimeout(() => engine.noteOff(n.m), n.t + n.d));
    }
    timers.current.push(window.setTimeout(() => setPlaying(false), perfLength(notes) + 500));
    setPlaying(true);
  };
  return (
    <span className="flex items-center gap-2 text-[13px] text-wal1" data-testid="batch-perf">
      Sandbox performance: {notes.length} notes, {formatLength(perfLength(notes))}
      <span role="button" tabIndex={0} className="btn px-2 py-0.5 text-[12px]" onClick={(ev) => { ev.stopPropagation(); if (playing) stop(); else void play(); }}>
        {playing ? '■ Stop' : '▶ Play'}
      </span>
      <span role="button" tabIndex={0} className="btn px-2 py-0.5 text-[12px]" onClick={(ev) => { ev.stopPropagation(); downloadMidi(notes); }}>
        .mid
      </span>
    </span>
  );
};

const Row: React.FC<{ e: BatchEntry; engine: AudioEngine; open: boolean; toggle: () => void }> = ({ e, engine, open, toggle }) => (
  <div className="rounded-lg border border-line bg-panel">
    <button className="flex w-full items-center gap-3 px-3 py-2 text-left" onClick={toggle}>
      <span className="flex w-40 flex-col">
        <span className="h truncate text-[14px] text-wal3">{e.label || `Student ${e.id}`}</span>
        {e.submission.assignment !== DEFAULT_ASSIGNMENT && (
          <span className="truncate text-[11px] text-muted" data-testid="batch-assignment" title={`Assignment: ${e.submission.assignment}`}>
            {e.submission.assignment}
          </span>
        )}
      </span>
      {/* One chip per lesson: the average of the levels done in it (raw before the floor in brackets), and a dot for Learn. */}
      <span className="flex flex-1 flex-wrap gap-1">
        {ALL_LESSONS.map((les) => {
          const done = e.levels.filter((v) => les.levels.some((l) => l.id === v.levelId));
          const learnedIt = e.submission.learned?.includes(les.id) || (les.id === 'lesson-1' && e.submission.learnDone);
          const avg = done.length ? Math.round(done.reduce((a, v) => a + v.grade, 0) / done.length) : null;
          const allPassed = done.length === les.levels.length && done.every((v) => v.passed);
          return (
            <span key={les.id} title={`Lesson ${les.number}: ${les.title}. ${done.length}/${les.levels.length} levels${learnedIt ? ', Learn finished' : ''}`} className={`h rounded px-1.5 text-[12px] ${avg === null ? 'bg-page text-muted' : allPassed ? 'bg-[#cfe3b4] text-good' : 'bg-[#f6e3b8] text-wal1'}`}>
              L{les.number}: {avg === null ? '–' : `${avg}%`}
              {learnedIt ? ' •' : ''}
            </span>
          );
        })}
      </span>
      <span className="h text-[15px] text-wal3">{e.headline !== null ? `${e.headline}%` : '–'}</span>
    </button>
    {e.submission.perf?.length ? (
      <div className="flex flex-wrap items-center gap-2 border-t border-line px-3 py-1.5">
        <PerfPlayer engine={engine} perf={e.submission.perf} />
        {cleanBacking(e.submission.jam).length > 0 && (
          // A Jam Room performance: hear it with the groove / track / video it was played with (opens the Sandbox).
          <button
            className="btn btn-brass px-2 py-0.5 text-[12px]"
            data-testid="batch-with-backing"
            onClick={() => void perfLink(unpackPerf(e.submission.perf), cleanBacking(e.submission.jam)).then((l) => window.open(l, '_blank'))}
          >
            ▶ With backing
          </button>
        )}
      </div>
    ) : null}
    {open && (
      <div className="border-t border-line px-3 py-2 text-[13px]">
        <div className="text-muted">Made {e.submission.timestamp ? new Date(e.submission.timestamp).toLocaleString() : 'unknown time'}. Numbers in ( ) are the raw score before the 50% floor (teacher only).</div>
        <div className="mt-1 text-muted">Learn finished: {ALL_LESSONS.filter((les) => e.submission.learned?.includes(les.id) || (les.id === 'lesson-1' && e.submission.learnDone)).map((les) => les.number).join(', ') || 'none'}. • on a lesson chip = Learn finished.</div>
        {e.levels.map((l) => (
          <div key={l.levelId} className="flex justify-between">
            <span>{l.title}</span>
            <span>
              {l.grade}% shown · raw {l.raw}% · {l.passed ? 'passed' : 'not passed'} · labels: {l.labels}
            </span>
          </div>
        ))}
        {!e.counts && <div className="mt-1 text-bad">Left out of the class average (obvious failed attempt).</div>}
      </div>
    )}
  </div>
);

// ---------------- Assignment link (teacher) ----------------
const LABEL_CHOICES: [Labels, string][] = [
  ['all', 'Each level’s own setting'],
  ['c', 'At most Cs'],
  ['off', 'No note names'],
];
const CHOICE_LABEL: [Choice, string][] = [
  ['choose', 'Student chooses'],
  ['on', 'On'],
  ['off', 'Off'],
];
const OPEN_LABEL: [OpenTab | '', string][] = [
  ['', 'Automatic'],
  ['learn', 'Learn'],
  ['challenge', 'Challenges'],
  ['jam', 'Jam Room'],
  ['sandbox', 'Sandbox'],
];

/**
 * The teacher's assignment builder (SPEC section 8, "everything is assignable"): lessons' Learn and Challenge levels,
 * the most help allowed (note names, Echo, notes on screen for timed levels), the slowest tempo, a sound, a Jam Room
 * set up ahead of time, a Sandbox recording, and a note to the class. It makes a link to post in Google Classroom.
 * Students who open it see only that work, and their codes say which assignment they're for.
 */
export const AssignModal: React.FC<{ lessons: Lesson[]; onClose: () => void }> = ({ lessons, onClose }) => {
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [learn, setLearn] = useState<Set<string>>(new Set());
  const [labels, setLabels] = useState<Labels>('all');
  const [echo, setEcho] = useState<EchoHelp>('watch');
  const [screen, setScreen] = useState<ScreenHelp>('blocks');
  const [tempo, setTempo] = useState('');
  const [sound, setSound] = useState('');
  const [open, setOpen] = useState<OpenTab | ''>('');
  // The Jam Room, set up ahead of time.
  const [jamOn, setJamOn] = useState(false);
  const [jSource, setJSource] = useState<JamSetup['source']>('groove');
  const [jGroove, setJGroove] = useState('pop');
  const [jKey, setJKey] = useState('C');
  const [jProg, setJProg] = useState('pop');
  const [jCustom, setJCustom] = useState('I IV V I');
  const [jBpm, setJBpm] = useState('');
  const [jTrack, setJTrack] = useState(TRACKS[0]?.id ?? '');
  const [jVideo, setJVideo] = useState('');
  const [jSheet, setJSheet] = useState('');
  const [jKeyLock, setJKeyLock] = useState<Choice>('choose');
  const [jMelody, setJMelody] = useState<Choice>('choose');
  const [link, setLink] = useState('');
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const num = (t: string) => Number(t);
  const bpmOk = (t: string) => t === '' || (Number.isFinite(num(t)) && num(t) >= 40 && num(t) <= 200);
  const videoId = youTubeId(jVideo);
  const jamOk = !jamOn || (bpmOk(jBpm) && (jSource !== 'youtube' || !!videoId) && (jSource !== 'track' || !!jTrack));
  const somethingPicked = picked.size > 0 || learn.size > 0 || jamOn || open === 'sandbox';
  const ready = title.trim() !== '' && somethingPicked && bpmOk(tempo) && jamOk;
  const pickedLevels = lessons.flatMap((l) => l.levels).filter((v) => picked.has(v.id));
  const hasEcho = pickedLevels.some((v) => v.type === 'echo');
  const hasTimed = pickedLevels.some((v) => v.type === 'play');

  useEffect(() => {
    setCopied(false);
    if (!ready) return setLink('');
    // Keep the lessons' order, whatever order the boxes were ticked in.
    const levels = lessons.flatMap((l) => l.levels.map((v) => v.id)).filter((id) => picked.has(id));
    const learnIds = lessons.map((l) => l.id).filter((id) => learn.has(id));
    const jam: JamSetup | undefined = jamOn
      ? {
          source: jSource,
          keyLock: jKeyLock,
          melody: jMelody,
          ...(jSource === 'groove' ? { groove: jGroove, key: jKey, prog: jProg, ...(jProg === 'custom' ? { custom: jCustom } : {}), ...(jBpm ? { bpm: num(jBpm) } : {}) } : {}),
          ...(jSource === 'track' ? { track: jTrack } : {}),
          ...(jSource === 'youtube' && videoId ? { video: videoId, key: jKey, ...(jSheet.trim() ? { custom: jSheet.trim() } : {}) } : {}),
        }
      : undefined;
    void encodeAssignment({
      title,
      levels,
      labels,
      ...(tempo ? { tempo: num(tempo) } : {}),
      ...(sound ? { sound } : {}),
      ...(learnIds.length ? { learn: learnIds } : {}),
      ...(hasEcho && echo !== 'watch' ? { echo } : {}),
      ...(hasTimed && screen === 'names' ? { screen } : {}),
      ...(open ? { open } : {}),
      ...(note.trim() ? { note } : {}),
      ...(jam ? { jam } : {}),
    }).then((t) => setLink(assignmentLink(t)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, note, picked, learn, labels, echo, screen, tempo, sound, open, jamOn, jSource, jGroove, jKey, jProg, jCustom, jBpm, jTrack, videoId, jSheet, jKeyLock, jMelody, ready]);

  const toggle = (ids: string[], on: boolean) =>
    setPicked((p) => {
      const n = new Set(p);
      ids.forEach((id) => (on ? n.add(id) : n.delete(id)));
      return n;
    });
  const toggleLearn = (id: string, on: boolean) =>
    setLearn((p) => {
      const n = new Set(p);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      ref.current?.select();
      document.execCommand('copy');
    }
    setCopied(true);
  };
  const box = 'rounded-lg border border-line2 bg-white px-2 py-1 text-[14px]';
  const jamKey = keyById(jKey);
  const field = (label: string, el: React.ReactNode) => (
    <label className="flex flex-col">
      <span className="h text-wal3">{label}</span>
      {el}
    </label>
  );

  return (
    <Shell title="Make an assignment link" onClose={onClose} wide>
      <div className="flex flex-col gap-3 text-[14px] text-wal2" data-testid="assign-modal">
        <p className="text-wal1">Pick anything: a lesson’s Learn, Challenge levels, a Jam Room or a Sandbox recording. Students who open the link see only that work, with your limits. Their codes show the assignment’s name in the batch grader.</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {field('Assignment name', <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} placeholder="e.g. Week 3: Pop progressions" className={box} data-testid="assign-title" />)}
          {field(
            'Opens on',
            <select value={open} onChange={(e) => setOpen(e.target.value as OpenTab | '')} className={box} data-testid="assign-open">
              {OPEN_LABEL.map(([v, t]) => (
                <option key={v} value={v}>
                  {t}
                </option>
              ))}
            </select>,
          )}
        </div>
        {field('Note to the class (optional)', <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="e.g. Play along with the groove and save 1 minute of your best." className={box} data-testid="assign-note" />)}
        <div className="grid gap-2 sm:grid-cols-2">
          {lessons.map((les) => {
            const ids = les.levels.map((v) => v.id);
            const all = ids.every((id) => picked.has(id));
            return (
              <div key={les.id} className="rounded-lg border border-line bg-page p-2">
                <div className="flex items-center justify-between gap-2">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={all} onChange={(e) => toggle(ids, e.target.checked)} data-testid={`assign-lesson-${les.number}`} className="accent-[#b8862c]" />
                    <span className="h text-wal3">
                      Lesson {les.number}: {les.title}
                    </span>
                  </label>
                  <label className="flex shrink-0 items-center gap-1 text-[12px]" title="Assign this lesson’s Learn steps (Practice opens with it)">
                    <input type="checkbox" checked={learn.has(les.id)} onChange={(e) => toggleLearn(les.id, e.target.checked)} data-testid={`assign-learn-${les.number}`} className="accent-[#b8862c]" />
                    Learn
                  </label>
                </div>
                {les.levels.map((v) => (
                  <label key={v.id} className="ml-5 flex items-center gap-2 text-[13px]">
                    <input type="checkbox" checked={picked.has(v.id)} onChange={(e) => toggle([v.id], e.target.checked)} data-testid={`assign-level-${v.id}`} className="accent-[#b8862c]" />
                    {v.title}
                  </label>
                ))}
              </div>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-4">
          {field(
            'Note names on the keys',
            <select value={labels} onChange={(e) => setLabels(e.target.value as Labels)} className={box} data-testid="assign-labels">
              {LABEL_CHOICES.map(([v, t]) => (
                <option key={v} value={v}>
                  {t}
                </option>
              ))}
            </select>,
          )}
          {hasTimed &&
            field(
              'Timed levels show',
              <select value={screen} onChange={(e) => setScreen(e.target.value as ScreenHelp)} className={box} data-testid="assign-screen">
                <option value="blocks">Each level’s own setting</option>
                <option value="names">Chord Names Only</option>
              </select>,
            )}
          {hasTimed &&
            field(
              'Slowest tempo (timed levels)',
              <>
                <input value={tempo} onChange={(e) => setTempo(e.target.value.replace(/\D/g, ''))} placeholder="Level’s own" inputMode="numeric" className={`${box} w-36 ${bpmOk(tempo) ? '' : 'border-bad'}`} data-testid="assign-tempo" />
                {!bpmOk(tempo) && <span className="text-[12px] text-bad">40 to 200 BPM</span>}
              </>,
            )}
          {hasEcho &&
            field(
              'Echo difficulty',
              <select value={echo} onChange={(e) => setEcho(e.target.value as EchoHelp)} className={box} data-testid="assign-echo">
                <option value="watch">Each level’s own setting</option>
                <option value="hint">At most See First Note</option>
                <option value="ear">By Ear only</option>
              </select>,
            )}
          {field(
            'Sound',
            <select value={sound} onChange={(e) => setSound(e.target.value)} className={box} data-testid="assign-sound">
              <option value="">Student’s choice</option>
              {SOUNDS.filter((x) => x.id !== 'custom').map((x) => (
                <option key={x.id} value={x.id}>
                  {x.category === x.label ? x.label : `${x.category}: ${x.label}`}
                </option>
              ))}
            </select>,
          )}
        </div>
        <div className="rounded-lg border border-line bg-page p-2" data-testid="assign-jam">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={jamOn} onChange={(e) => setJamOn(e.target.checked)} data-testid="assign-jam-on" className="accent-[#b8862c]" />
            <span className="h text-wal3">Set up the Jam Room</span>
            <span className="text-[12px] text-muted">Students play along and turn in a saved performance.</span>
          </label>
          {jamOn && (
            <div className="mt-2 flex flex-wrap gap-3">
              {field(
                'Backing',
                <select value={jSource} onChange={(e) => setJSource(e.target.value as JamSetup['source'])} className={box} data-testid="assign-jam-source">
                  <option value="groove">Groove (made by the app)</option>
                  {TRACKS.length > 0 && <option value="track">One of your tracks</option>}
                  <option value="youtube">YouTube video</option>
                </select>,
              )}
              {jSource === 'groove' && (
                <>
                  {field(
                    'Style',
                    <select value={jGroove} onChange={(e) => setJGroove(e.target.value)} className={box} data-testid="assign-jam-groove">
                      {GROOVES.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name}
                        </option>
                      ))}
                    </select>,
                  )}
                  {field(
                    'Key',
                    <select value={jKey} onChange={(e) => setJKey(e.target.value)} className={box} data-testid="assign-jam-key">
                      {JAM_KEYS.map((k) => (
                        <option key={k.id} value={k.id}>
                          {k.label}
                        </option>
                      ))}
                    </select>,
                  )}
                  {field(
                    'Chords',
                    <select value={jProg} onChange={(e) => setJProg(e.target.value)} className={box} data-testid="assign-jam-prog">
                      {PROGRESSIONS.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label}: {presetNumerals(p, jamKey).join(' – ')}
                        </option>
                      ))}
                      <option value="custom">Your own (a song you’re covering)…</option>
                    </select>,
                  )}
                  {jProg === 'custom' && field('Numerals, one per bar', <input value={jCustom} onChange={(e) => setJCustom(e.target.value)} maxLength={80} placeholder="e.g. I V vi IV" className={box} data-testid="assign-jam-custom" />)}
                  {field(
                    'Slowest tempo',
                    <>
                      <input value={jBpm} onChange={(e) => setJBpm(e.target.value.replace(/\D/g, ''))} placeholder="Style’s own" inputMode="numeric" className={`${box} w-32 ${bpmOk(jBpm) ? '' : 'border-bad'}`} data-testid="assign-jam-bpm" />
                      {!bpmOk(jBpm) && <span className="text-[12px] text-bad">40 to 200 BPM</span>}
                    </>,
                  )}
                </>
              )}
              {jSource === 'track' &&
                field(
                  'Track',
                  <select value={jTrack} onChange={(e) => setJTrack(e.target.value)} className={box} data-testid="assign-jam-track">
                    {TRACKS.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title}
                      </option>
                    ))}
                  </select>,
                )}
              {jSource === 'youtube' && (
                <>
                  {VIDEOS.length > 0 &&
                    field(
                      'From your list',
                      <select
                        value=""
                        onChange={(e) => {
                          const v = VIDEOS[Number(e.target.value)];
                          if (!v) return;
                          setJVideo(v.url);
                          setJKey(v.mode === 'minor' ? `${v.key}m` : v.key);
                          setJSheet(v.chords ?? '');
                        }}
                        className={box}
                        data-testid="assign-jam-videos"
                      >
                        <option value="">Pick a video…</option>
                        {VIDEOS.map((v, i) => (
                          <option key={i} value={i}>
                            {v.title}
                          </option>
                        ))}
                      </select>,
                    )}
                  {field(
                    'YouTube link',
                    <>
                      <input value={jVideo} onChange={(e) => setJVideo(e.target.value)} placeholder="Paste a YouTube link" className={`${box} w-64 ${jVideo && !videoId ? 'border-bad' : ''}`} data-testid="assign-jam-video" />
                      {jVideo && !videoId && <span className="text-[12px] text-bad">That isn’t a YouTube link</span>}
                    </>,
                  )}
                  {field('Chords (optional, shown in order)', <input value={jSheet} onChange={(e) => setJSheet(e.target.value)} maxLength={80} placeholder="e.g. Am F C G" className={`${box} w-56`} data-testid="assign-jam-sheet" />)}
                  {field(
                    'Key (for Melody mode / Key lock)',
                    <select value={jKey} onChange={(e) => setJKey(e.target.value)} className={box} data-testid="assign-jam-key">
                      {JAM_KEYS.map((k) => (
                        <option key={k.id} value={k.id}>
                          {k.label}
                        </option>
                      ))}
                    </select>,
                  )}
                </>
              )}
              {field(
                'Key lock',
                <select value={jKeyLock} onChange={(e) => setJKeyLock(e.target.value as Choice)} className={box} data-testid="assign-jam-keylock">
                  {CHOICE_LABEL.map(([v, t]) => (
                    <option key={v} value={v}>
                      {t}
                    </option>
                  ))}
                </select>,
              )}
              {field(
                'Melody mode',
                <select value={jMelody} onChange={(e) => setJMelody(e.target.value as Choice)} className={box} data-testid="assign-jam-melody">
                  {CHOICE_LABEL.map(([v, t]) => (
                    <option key={v} value={v}>
                      {t}
                    </option>
                  ))}
                </select>,
              )}
            </div>
          )}
        </div>
        <textarea ref={ref} readOnly value={link} rows={3} placeholder={ready ? '' : 'Name the assignment and pick something to assign (a Learn, a level, the Jam Room, or Opens on: Sandbox). The link shows up here.'} className="w-full rounded-lg border border-line2 bg-white p-2 font-mono text-[12px] break-all" data-testid="assign-link" onFocus={(e) => e.currentTarget.select()} />
        <div className="flex gap-2">
          <button className="btn btn-brass flex-1" onClick={copy} disabled={!link} data-testid="assign-copy">
            {copied ? 'Copied ✓' : 'Copy link'}
          </button>
          <a className={`btn ${link ? '' : 'pointer-events-none opacity-50'}`} href={link || undefined} target="_blank" rel="noreferrer">
            Try it
          </a>
        </div>
      </div>
    </Shell>
  );
};
