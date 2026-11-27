import React, { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_ASSIGNMENT, encodeSubmission } from '../utils/codec';
import { MAX_PERF_MS, MAX_PERF_NOTES, PerfNote, downloadMidi, formatLength, packPerf, perfLength, perfLink, readPerfParam } from '../utils/performance';
import { Labels, LABEL_ORDER, ModeCtx, ModeParts } from './modeTypes';
import { PianoRoll, makeRollMap } from './PianoRoll';
import { MidiTrack, readMidiFile } from '../utils/midiImport';
import { BackingSeg } from '../utils/performance';
import { backingEnd, playBacking } from '../audio/backing';
import { YouTubeBox, YTControl } from './YouTubeBox';
import lessonsData from '../data/lessons.json';
import { Lesson } from '../types';

/** Lessons with a practice tip, in lesson order (shown in the Practice Room). */
const TIP_LESSONS = ([...(lessonsData as { lessons: Lesson[] }).lessons] as Lesson[]).filter((l) => l.practice).sort((a, b) => a.number - b.number);

/** A pause longer than this is shortened to SHORT_GAP, so stepping away doesn't fill the recording with silence. */
const LONG_GAP = 8000;
const SHORT_GAP = 2000;

/**
 * Sandbox: play anything. Everything is recorded as you go and shown on a scrolling piano roll. Save performance turns
 * it into a code (for Classroom), a link, or a MIDI file. Clear starts over. Nothing is graded.
 */
export function useSandbox(ctx: ModeCtx, active: boolean): ModeParts {
  const [notes, setNotes] = useState<PerfNote[]>([]);
  const [labels, setLabels] = useState<Labels>('c');
  /** Which lesson's practice tip shows (starts on the lesson the student is in). */
  const [tipLesson, setTipLesson] = useState(ctx.lesson.id);
  const [full, setFull] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [playLit, setPlayLit] = useState<Set<number>>(new Set());
  const [saveOpen, setSaveOpen] = useState(false);
  const saveOpenRef = useRef(false);
  saveOpenRef.current = saveOpen;
  const [loadedMsg, setLoadedMsg] = useState('');
  // Play-along with an imported song (SPEC section 10): slower play back (the roll slows too), one track at a time,
  // and Mute to hear nothing but still see the notes come up, so you play the part yourself.
  const [speed, setSpeed] = useState(1);
  const speedRef = useRef(1);
  speedRef.current = speed;
  const [mute, setMute] = useState(false);
  const muteRef = useRef(false);
  muteRef.current = mute;
  // A Jam Room performance's backing (from a link): played along with the notes. While there is one, speed stays 100%.
  const [backing, setBacking] = useState<BackingSeg[]>([]);
  const backingRef = useRef<BackingSeg[]>([]);
  backingRef.current = backing;
  const stopBacking = useRef<(() => void) | null>(null);
  const ytControl = useRef<YTControl | null>(null);
  const [imported, setImported] = useState<null | { all: PerfNote[]; trackOf: number[]; tracks: MidiTrack[] }>(null);
  const [trackPick, setTrackPick] = useState(-1);

  // Recording clock: t0 is when the first note was played (performance.now()).
  const t0 = useRef<number | null>(null);
  const lastAt = useRef(0);
  const held = useRef(new Map<number, number>()); // midi -> index in notes
  const notesRef = useRef(notes);
  notesRef.current = notes;
  const playRef = useRef<{ start: number; timers: number[] } | null>(null);
  /** How far back the roll is scrolled (roll ms; 0 = live). Play back starts from there. */
  const rollOffset = useRef(0);
  // Only record while the Sandbox tab is open.
  const activeRef = useRef(active);
  activeRef.current = active;

  // A link with ?perf= opens the Sandbox with that performance loaded.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get('perf');
    if (!p) return;
    void readPerfParam(p).then((loaded) => {
      if (loaded) {
        setNotes(loaded.notes);
        setBacking(loaded.backing);
        t0.current = null;
        setLoadedMsg(loaded.backing.length ? 'A Jam Room performance, with its backing. Press Play back.' : 'Loaded from a link. Press Play back.');
      } else setLoadedMsg('That performance link is damaged or cut off.');
    });
  }, []);

  useEffect(() => {
    return ctx.subscribeNotes((e) => {
      if (playRef.current) return; // don't record while playing back
      if (e.on && activeRef.current && pausedAt.current !== null) stop(); // playing again ends a paused play back
      if (e.on && !activeRef.current) return; // (a note-off still finishes a note started in the Sandbox)
      const now = performance.now();
      if (e.on) {
        if (notesRef.current.length >= MAX_PERF_NOTES) return setFull(true);
        if (t0.current === null) {
          // First note: start the clock right after anything already recorded (e.g. after a playback or a link).
          const end = perfLength(notesRef.current);
          t0.current = now - (end ? end + SHORT_GAP : 0);
        } else if (now - lastAt.current > LONG_GAP) t0.current += now - lastAt.current - SHORT_GAP;
        const t = now - t0.current;
        if (t > MAX_PERF_MS) return setFull(true);
        lastAt.current = now;
        setImported(null); // recording on top: the track picker goes (switching tracks would drop what you played)
        setNotes((prev) => {
          held.current.set(e.midi, prev.length);
          return [...prev, { t, d: -1, m: e.midi, v: Math.max(1, Math.round(e.vel * 127)) }];
        });
      } else {
        const i = held.current.get(e.midi);
        if (i === undefined || t0.current === null) return;
        held.current.delete(e.midi);
        lastAt.current = now;
        const end = now - t0.current;
        setNotes((prev) => prev.map((n, k) => (k === i ? { ...n, d: Math.max(20, end - n.t) } : n)));
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx]);

  /** Paused play back: the moment (real ms on the performance's clock) to resume from. */
  const pausedAt = useRef<number | null>(null);
  const [paused, setPaused] = useState(false);

  /** Stop the sound and the timers (used by pause and stop). */
  const halt = useCallback(() => {
    const p = playRef.current;
    if (p) p.timers.forEach((id) => window.clearTimeout(id));
    playRef.current = null;
    stopBacking.current?.();
    stopBacking.current = null;
    setPlaying(false);
    setPlayLit((lit) => {
      lit.forEach((m) => ctx.engine.noteOff(m));
      return new Set();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx.engine]);

  /** Stop play back for good (finished, cleared, or you started playing again). */
  const stop = useCallback(() => {
    halt();
    pausedAt.current = null;
    setPaused(false);
    setAtStart(false);
    t0.current = null; // the next note you play continues after the recording
  }, [halt]);

  /** Just imported: waiting at the start of the piece. */
  const [atStart, setAtStart] = useState(false);

  const pause = useCallback(() => {
    const p = playRef.current;
    if (!p) return;
    const at = (performance.now() - p.start) * speedRef.current;
    halt();
    pausedAt.current = Math.max(0, at);
    setPaused(true);
  }, [halt]);

  const play = async () => {
    const done = notesRef.current.filter((n) => n.d > 0);
    if (!done.length) return;
    // Where to start: the scrolled-to spot if you scrolled, else where you paused, else the beginning.
    let from = 0;
    if (rollOffset.current > 0) {
      const { rollAt } = makeRollMap(done);
      const bottom = rollAt(pausedAt.current ?? restingNow(done)) - rollOffset.current;
      const next = done.filter((n) => rollAt(n.t) >= bottom - 1);
      from = next.length ? Math.min(...next.map((n) => n.t)) : 0;
    } else if (pausedAt.current !== null) from = pausedAt.current;
    halt();
    pausedAt.current = null;
    setPaused(false);
    setAtStart(false);
    await ctx.engine.unlock();
    const LEAD = 50;
    const sp = backingRef.current.length ? 1 : speedRef.current;
    const timers: number[] = [];
    for (const n of done) {
      const end = n.t + n.d;
      if (end <= from) continue;
      // A note that was already sounding at the resume point starts right away for the rest of its length.
      const on = Math.max(0, n.t - from);
      timers.push(
        window.setTimeout(() => {
          if (!muteRef.current) ctx.engine.noteOn(n.m, n.v / 127);
          setPlayLit((s) => new Set(s).add(n.m));
        }, LEAD + on / sp),
      );
      timers.push(
        window.setTimeout(() => {
          ctx.engine.noteOff(n.m);
          setPlayLit((s) => {
            const x = new Set(s);
            x.delete(n.m);
            return x;
          });
        }, LEAD + (end - from) / sp),
      );
    }
    const endAt = Math.max(perfLength(done), backingEnd(backingRef.current));
    timers.push(window.setTimeout(stop, LEAD + (endAt - from) / sp + 1500));
    // The roll's clock reads the performance's own time (slowed by the speed), so it scrolls the notes in as they play.
    const start = performance.now() + LEAD - from / sp;
    playRef.current = { start, timers };
    // The backing it was played with (Jam Room), lined up with the notes.
    if (backingRef.current.length) stopBacking.current = playBacking(backingRef.current, () => performance.now() - start, ytControl.current);
    setPlaying(true);
  };
  const playRefFn = useRef(play);
  playRefFn.current = play;

  const toggle = useCallback(() => {
    if (playRef.current) pause();
    else void playRefFn.current();
  }, [pause]);

  // Space bar plays / pauses (Sandbox tab only, and not while typing in a box).
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat || saveOpenRef.current) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'TEXTAREA' || (t.tagName === 'INPUT' && !['range', 'checkbox', 'radio', 'button'].includes((t as HTMLInputElement).type)) || t.isContentEditable)) return;
      e.preventDefault();
      e.stopPropagation();
      toggle();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [active, toggle]);

  // ---- Scrubbing: scrolling the roll plays the keys under the keyboard line, like play back does ----
  const scrub = useRef(new Map<number, number>()); // midi -> velocity, sounding now
  const scrubIdle = useRef<number | null>(null);
  const releaseScrub = useCallback(() => {
    scrub.current.forEach((_, m) => ctx.engine.noteOff(m));
    scrub.current = new Map();
    if (!playRef.current) setPlayLit(new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx.engine]);
  const onScrub = useCallback(
    (under: Map<number, number>, passed: Map<number, number>) => {
      if (playRef.current) return;
      void ctx.engine.unlock();
      // Notes the scroll jumped right over: a short blip each, so fast scrolling still sounds every note.
      passed.forEach((v, m) => {
        if (under.has(m) || scrub.current.has(m)) return;
        ctx.engine.noteOn(m, v / 127);
        window.setTimeout(() => {
          if (!scrub.current.has(m)) ctx.engine.noteOff(m);
        }, 140);
      });
      scrub.current.forEach((_, m) => {
        if (!under.has(m)) ctx.engine.noteOff(m);
      });
      under.forEach((v, m) => {
        if (!scrub.current.has(m)) ctx.engine.noteOn(m, v / 127);
      });
      scrub.current = new Map(under);
      setPlayLit(new Set([...under.keys(), ...passed.keys()]));
      // Stop scrolling and the held notes let go, so nothing rings forever.
      if (scrubIdle.current !== null) window.clearTimeout(scrubIdle.current);
      scrubIdle.current = window.setTimeout(releaseScrub, 500);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ctx.engine, releaseScrub],
  );

  // ---- MIDI import: a .mid file replaces the performance, ready to play back, scroll through, or play along with ----
  const fileInput = useRef<HTMLInputElement>(null);
  /**
   * "Are you sure?" questions are asked in the panel, not with the browser's pop-up (the pop-up froze the page while it
   * was open, which Vercel's speed check reported as a slow button).
   */
  const [asking, setAsking] = useState<null | { kind: 'clear' } | { kind: 'import'; got: ReturnType<typeof readMidiFile>; name: string }>(null);
  const importMidi = async (file: File) => {
    try {
      const got = readMidiFile(await file.arrayBuffer());
      if (!got.notes.length) return setLoadedMsg('That MIDI file has no notes to show (drums are left out).');
      const name = got.title || file.name.replace(/\.midi?$/i, '');
      if (notesRef.current.length) return setAsking({ kind: 'import', got, name });
      applyImport(got, name);
    } catch (e) {
      setLoadedMsg(e instanceof Error ? e.message : 'That file could not be read.');
    }
  };
  const applyImport = (got: ReturnType<typeof readMidiFile>, name: string) => {
      stop();
      held.current.clear();
      setFull(false);
      setNotes(got.notes);
      setBacking([]);
      setImported(got.tracks.length > 1 ? { all: got.notes, trackOf: got.trackOf, tracks: got.tracks } : null);
      setTrackPick(-1);
      // Wait at the very start, so Play back (or the space bar) brings the notes up out of the keys from the beginning.
      pausedAt.current = 0;
      setAtStart(true);
      setLoadedMsg(
        `Imported “${name}”.` +
          (got.skippedDrums ? ' Drums were left out.' : '') +
          (got.cutOff ? ` Only the first ${formatLength(MAX_PERF_MS)} came in.` : ''),
      );
  };

  const clear = () => {
    setAsking(null);
    stop();
    setImported(null);
    setBacking([]);
    setNotes([]);
    held.current.clear();
    t0.current = null;
    setFull(false);
    setLoadedMsg('');
  };

  useEffect(() => () => stop(), [stop]);

  // The roll's clock: playback time while playing back, recording time while recording, otherwise "after the end"
  // (the roll has glided to a stop there).
  const now = useCallback(() => {
    if (playRef.current) return (performance.now() - playRef.current.start) * speedRef.current;
    if (pausedAt.current !== null) return pausedAt.current;
    if (t0.current !== null) return performance.now() - t0.current;
    return notesRef.current.length ? restingNow(notesRef.current) : null;
  }, []);

  const finished = notes.filter((n) => n.d > 0);
  const length = perfLength(finished);

  const left = (
    <div className="flex flex-col gap-2">
      <h2 className="h text-[22px] leading-tight text-wal3">Practice Room</h2>
      <p className="text-[14px] leading-snug text-wal1">Play anything. It records as you go.</p>
      <div className="card px-2.5 py-1.5 text-[14px]" data-testid="perf-stats">
        <div className="flex items-baseline justify-between">
          <span className="h text-[11px] uppercase text-muted">Your performance</span>
          <span className="h text-[17px] text-wal3">{formatLength(length)}</span>
        </div>
        {full && <div className="text-[12px] text-bad">Recording is full ({formatLength(MAX_PERF_MS)}). Save it, or Clear to start again.</div>}
        {loadedMsg && <div className="text-[12px] leading-snug text-wal1">{loadedMsg}</div>}
      </div>
      <button className="btn py-1.5" onClick={toggle} disabled={!finished.length} data-testid="perf-play" title="Space bar: play / pause">
        {playing ? '❚❚ Pause' : paused ? '▶ Resume' : '▶ Play back'}
      </button>
      {finished.length > 0 && (
        <div className="flex items-center gap-1 text-[13px]" data-testid="perf-speed">
          <span className="h w-12 shrink-0 text-wal3">Speed</span>
          {[0.5, 0.75, 1].map((v) => (
            <button key={v} disabled={backing.length > 0 && v !== 1} title={backing.length ? 'A performance with a backing plays at 100%' : undefined} className={`btn min-w-0 flex-1 px-1 py-0.5 text-[13px] ${(backing.length ? 1 : speed) === v ? 'btn-brass' : ''}`} aria-pressed={speed === v} data-testid={`perf-speed-${v * 100}`} onClick={() => { if (playRef.current) pause(); setSpeed(v); }}>
              {v * 100}%
            </button>
          ))}
          <button className={`btn shrink-0 px-1.5 py-0.5 text-[13px] ${mute ? 'btn-brass' : ''}`} aria-pressed={mute} data-testid="perf-mute" title="Mute the play back and play the part yourself" onClick={() => setMute((m) => !m)}>
            {mute ? 'Muted' : 'Mute'}
          </button>
        </div>
      )}
      {imported && (
        <label className="flex items-center gap-1 text-[13px]">
          <span className="h w-12 shrink-0 text-wal3">Track</span>
          <select
            className="w-full rounded-md border border-line2 bg-white px-1.5 py-0.5 text-[13px]"
            value={trackPick}
            data-testid="perf-track"
            onChange={(e) => {
              const t = Number(e.target.value);
              e.currentTarget.blur();
              stop();
              setTrackPick(t);
              setNotes(t < 0 ? imported.all : imported.all.filter((_, k) => imported.trackOf[k] === t));
              pausedAt.current = 0;
              setAtStart(true);
            }}
          >
            <option value={-1}>All tracks</option>
            {imported.tracks.map((t) => (
              <option key={t.index} value={t.index}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <button className="btn btn-brass py-1.5" onClick={() => setSaveOpen(true)} disabled={!finished.length} data-testid="perf-save">
        Save performance
      </button>
      {asking ? (
        <div className="card flex flex-col gap-1.5 border-brass2 p-2 text-[13px]" role="alertdialog" data-testid="perf-confirm">
          <span className="text-wal2">
            {asking.kind === 'clear' ? 'Clear your performance? Save it first if you want to keep it.' : `Replace your performance with “${asking.name}”? Save yours first if you want to keep it.`}
          </span>
          <span className="flex gap-1.5">
            <button
              className="btn btn-brass flex-1 py-1"
              data-testid="perf-confirm-yes"
              onClick={() => {
                if (asking.kind === 'clear') clear();
                else {
                  setAsking(null);
                  applyImport(asking.got, asking.name);
                }
              }}
            >
              {asking.kind === 'clear' ? 'Clear' : 'Replace'}
            </button>
            <button className="btn flex-1 py-1" data-testid="perf-confirm-no" onClick={() => setAsking(null)}>
              Keep it
            </button>
          </span>
        </div>
      ) : null}
      {/* Clear and Import side by side, to leave room for the Practice tips below. */}
      <span className="flex gap-1.5">
        {!asking && (
          <button className="btn flex-1 py-1.5" onClick={() => setAsking({ kind: 'clear' })} disabled={!notes.length} data-testid="perf-clear">
            Clear
          </button>
        )}
        <button className="btn flex-1 py-1.5" onClick={() => fileInput.current?.click()} data-testid="perf-import" title="Open a .mid file from GarageBand, Soundtrap, BandLab, MuseScore…">
          Import MIDI…
        </button>
      </span>
      <input
        ref={fileInput}
        type="file"
        accept=".mid,.midi,audio/midi,audio/x-midi"
        className="hidden"
        data-testid="perf-import-file"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void importMidi(f);
        }}
      />
    </div>
  );

  const video = backing.find((x): x is Extract<BackingSeg, { k: 'y' }> => x.k === 'y');
  const stage = (
    <div className="relative h-full w-full">
      {video && (
        // A Jam Room performance played with a YouTube video: the video, half see-through, under the roll.
        <div className={`absolute inset-0 flex items-center justify-center opacity-50 ${ctx.phone ? '' : 'p-3'}`} data-testid="perf-video">
          <YouTubeBox videoId={video.v} volume={1} control={ytControl} cover={ctx.phone} />
        </div>
      )}
      {/* Matches the piano below: the stage's wood border is 10px, the piano's cheeks 12px. */}
      <div className="absolute inset-y-0 left-[2px] right-[2px]">
        <PianoRoll notes={notes} start={ctx.viewStart} now={now} offset={rollOffset} canScroll={!playing} onScrub={onScrub} />
      </div>
      {ctx.phone && finished.length > 0 && (
        // Phones: Save and Play back on the Stage too (the Options drawer is closed while playing).
        <div className="absolute right-3 top-2 z-20 flex flex-col items-end gap-1.5" data-testid="perf-stage-bar">
          <button className="btn btn-brass px-2.5 py-1 text-[13px]" onClick={() => setSaveOpen(true)} data-testid="perf-save-stage">
            Save performance
          </button>
          <button className="btn btn-dark px-3 py-1 text-[14px]" onClick={toggle} data-testid="perf-play-stage">
            {playing ? '❚❚ Pause' : paused ? '▶ Resume' : '▶ Play back'}
          </button>
        </div>
      )}
      {atStart && !playing && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-center">
          <div className="h text-[22px] text-line2/80">Ready. Press Play back or the space bar.</div>
        </div>
      )}
      {!notes.length && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-center">
          <div className="h text-[24px] text-line2/80">Play something. It records as you go.</div>
        </div>
      )}
    </div>
  );

  return {
    left,
    stage,
    labels,
    labelControl: { value: labels, allowed: LABEL_ORDER, set: setLabels },
    leftBottom: (
      // Practice tips from each lesson (the old Practice tab's one job, his call), under Note Names.
      <div className="mt-3 flex flex-col gap-2 rounded-lg border-2 border-brass bg-[#fbeecb] p-2.5 shadow-sm" data-testid="practice-tips">
        <div className="h text-[18px] leading-none text-wal3">Practice tips</div>
        <select
          className="w-full rounded-md border border-brass2 bg-panel px-2 py-1 text-[15px] font-semibold text-wal3"
          value={TIP_LESSONS.some((l) => l.id === tipLesson) ? tipLesson : TIP_LESSONS[0]?.id}
          data-testid="tips-select"
          aria-label="Practice tips for a lesson"
          onChange={(e) => {
            setTipLesson(e.target.value);
            e.currentTarget.blur(); // the typing keyboard goes back to the piano
          }}
        >
          {TIP_LESSONS.map((l) => (
            <option key={l.id} value={l.id}>
              Lesson {l.number}: {l.title}
            </option>
          ))}
        </select>
        {/* One sentence per line, big and dark, so it reads at a glance. */}
        <p className="whitespace-pre-line text-[16px] leading-snug text-wal3" data-testid="tips-text">
          {(TIP_LESSONS.find((l) => l.id === tipLesson) ?? TIP_LESSONS[0])?.practice?.replace(/([.!?]) +/g, '$1\n')}
        </p>
      </div>
    ),
    lit: playLit.size ? playLit : undefined,
    overlay: saveOpen ? <SavePerformance notes={finished} assignment={ctx.assignment?.title} onClose={() => setSaveOpen(false)} /> : undefined,
  };
}

/** A moment well after the last note, when the roll has come to rest. */
const restingNow = (notes: PerfNote[]) => perfLength(notes) + 60_000;

/** Save performance: a code for Classroom, a link, or a MIDI file. */
export const SavePerformance: React.FC<{ notes: PerfNote[]; backing?: BackingSeg[]; onClose: () => void; /** The teacher's assignment name, carried in the code. */ assignment?: string }> = ({ notes, backing = [], onClose, assignment }) => {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [copied, setCopied] = useState<'' | 'code' | 'link'>('');
  useEffect(() => {
    if (!name.trim()) return setCode('');
    setCopied('');
    // The name lives only inside the code, never in the browser.
    void encodeSubmission({ name, assignment: assignment ?? DEFAULT_ASSIGNMENT, timestamp: Date.now(), learnDone: false, results: [], perf: packPerf(notes), ...(backing.length ? { jam: backing } : {}) }).then(setCode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, notes]);
  /** If copying is blocked, the text shows in a box to copy by hand (no browser pop-ups: they freeze the page). */
  const [manual, setManual] = useState('');
  const copy = async (text: string, what: 'code' | 'link') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setManual('');
    } catch {
      setManual(text);
    }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4" role="dialog" aria-modal="true" aria-label="Save performance">
      <div className="card flex max-h-[92vh] w-full max-w-md flex-col shadow-xl">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="h text-[20px] text-wal3">Save performance</h2>
          <button className="btn" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="flex flex-col gap-4 overflow-auto p-4 text-[14px]">
          <div className="text-muted">
            Length: {formatLength(perfLength(notes))}
          </div>
          <section>
            <div className="h text-[15px] text-wal3">Turn it in (code)</div>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoComplete="off" placeholder="Your Name" data-testid="perf-name" className="mt-1 w-full rounded-lg border border-line2 bg-white px-2 py-1.5 text-[15px]" />
            <textarea readOnly value={code} rows={3} placeholder="Your code shows up here once you type your name." data-testid="perf-code" className="mt-2 w-full rounded-lg border border-line2 bg-white p-2 font-mono text-[11px] break-all" onFocus={(e) => e.currentTarget.select()} />
            <button className="btn btn-brass mt-1 w-full" disabled={!code} onClick={() => void copy(code, 'code')}>
              {copied === 'code' ? 'Copied ✓' : 'Copy code'}
            </button>
          </section>
          <section>
            <div className="h text-[15px] text-wal3">Share a link</div>
            <div className="text-[13px] text-muted">Anyone with the link can play it back in PianoLab. No name is in it.</div>
            <button className="btn mt-1 w-full" data-testid="perf-link" onClick={() => void perfLink(notes, backing).then((l) => copy(l, 'link'))}>
              {copied === 'link' ? 'Link copied ✓' : 'Copy link'}
            </button>
          </section>
          {manual && (
            <textarea readOnly value={manual} rows={3} autoFocus onFocus={(e) => e.currentTarget.select()} aria-label="Copy this" className="w-full rounded-lg border border-brass2 bg-white p-2 font-mono text-[11px] break-all" />
          )}
          <section>
            <div className="h text-[15px] text-wal3">MIDI file</div>
            <div className="text-[13px] text-muted">Opens in Soundtrap, BandLab, GarageBand and other music apps.</div>
            <button className="btn mt-1 w-full" data-testid="perf-midi" onClick={() => downloadMidi(notes)}>
              Download .mid
            </button>
          </section>
        </div>
      </div>
    </div>
  );
};
