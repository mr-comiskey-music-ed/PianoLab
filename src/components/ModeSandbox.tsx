import React, { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_ASSIGNMENT, encodeSubmission } from '../utils/codec';
import { MAX_PERF_MS, MAX_PERF_NOTES, PerfNote, downloadMidi, formatLength, packPerf, perfLength, perfLink, readPerfParam } from '../utils/performance';
import { Labels, LABEL_ORDER, ModeCtx, ModeParts } from './modeTypes';
import { PianoRoll } from './PianoRoll';

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
  const [full, setFull] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [playLit, setPlayLit] = useState<Set<number>>(new Set());
  const [saveOpen, setSaveOpen] = useState(false);
  const [loadedMsg, setLoadedMsg] = useState('');

  // Recording clock: t0 is when the first note was played (performance.now()).
  const t0 = useRef<number | null>(null);
  const lastAt = useRef(0);
  const held = useRef(new Map<number, number>()); // midi -> index in notes
  const notesRef = useRef(notes);
  notesRef.current = notes;
  const playRef = useRef<{ start: number; timers: number[] } | null>(null);
  // Only record while the Sandbox tab is open.
  const activeRef = useRef(active);
  activeRef.current = active;

  // A link with ?perf= opens the Sandbox with that performance loaded.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get('perf');
    if (!p) return;
    void readPerfParam(p).then((loaded) => {
      if (loaded) {
        setNotes(loaded);
        t0.current = null;
        setLoadedMsg(`Loaded a performance from a link: ${loaded.length} notes, ${formatLength(perfLength(loaded))}. Press Play back.`);
      } else setLoadedMsg('That performance link is damaged or cut off.');
    });
  }, []);

  useEffect(() => {
    return ctx.subscribeNotes((e) => {
      if (playRef.current) return; // don't record while playing back
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
  }, [ctx]);

  const stop = useCallback(() => {
    const p = playRef.current;
    if (!p) return;
    p.timers.forEach((id) => window.clearTimeout(id));
    playRef.current = null;
    setPlaying(false);
    setPlayLit((lit) => {
      lit.forEach((m) => ctx.engine.noteOff(m));
      return new Set();
    });
    t0.current = null; // the next note you play continues after the recording
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx.engine]);

  const play = async () => {
    if (!notes.length) return;
    stop();
    await ctx.engine.unlock();
    const done = notes.filter((n) => n.d > 0);
    const startAt = performance.now() + 50;
    const timers: number[] = [];
    for (const n of done) {
      timers.push(
        window.setTimeout(() => {
          ctx.engine.noteOn(n.m, n.v / 127);
          setPlayLit((s) => new Set(s).add(n.m));
        }, 50 + n.t),
      );
      timers.push(
        window.setTimeout(() => {
          ctx.engine.noteOff(n.m);
          setPlayLit((s) => {
            const x = new Set(s);
            x.delete(n.m);
            return x;
          });
        }, 50 + n.t + n.d),
      );
    }
    timers.push(window.setTimeout(stop, 50 + perfLength(done) + 1500));
    playRef.current = { start: startAt, timers };
    setPlaying(true);
  };

  const clear = () => {
    if (notes.length && !window.confirm('Clear your performance? Save it first if you want to keep it.')) return;
    stop();
    setNotes([]);
    held.current.clear();
    t0.current = null;
    setFull(false);
    setLoadedMsg('');
  };

  useEffect(() => () => stop(), [stop]);

  // The roll's clock: playback time while playing back, otherwise recording time.
  const now = useCallback(() => {
    if (playRef.current) return performance.now() - playRef.current.start;
    return t0.current === null ? null : performance.now() - t0.current;
  }, []);

  const finished = notes.filter((n) => n.d > 0);
  const length = perfLength(finished);

  const left = (
    <div className="flex flex-col gap-3">
      <div>
        <div className="h text-[11px] uppercase text-muted">Sandbox</div>
        <h2 className="h text-[22px] leading-tight text-wal3">Play anything</h2>
      </div>
      <p className="text-[15px] leading-snug text-wal1">Everything you play is recorded and shows up on the piano roll. Save it to turn it in, share it, or open it in another music app.</p>
      <div className="card p-2.5 text-[14px]" data-testid="perf-stats">
        <div className="h text-[11px] uppercase text-muted">Your performance</div>
        <div className="h text-[18px] text-wal3">
          {finished.length} notes · {formatLength(length)}
        </div>
        {full && <div className="mt-1 text-[13px] text-bad">Recording is full ({formatLength(MAX_PERF_MS)} or {MAX_PERF_NOTES} notes). Save it, or Clear to start again.</div>}
        {loadedMsg && <div className="mt-1 text-[13px] text-wal1">{loadedMsg}</div>}
      </div>
      <button className="btn" onClick={() => (playing ? stop() : void play())} disabled={!finished.length} data-testid="perf-play">
        {playing ? '■ Stop' : '▶ Play back'}
      </button>
      <button className="btn btn-brass" onClick={() => setSaveOpen(true)} disabled={!finished.length} data-testid="perf-save">
        Save performance
      </button>
      <button className="btn" onClick={clear} disabled={!notes.length} data-testid="perf-clear">
        Clear
      </button>
    </div>
  );

  const stage = (
    <div className="relative h-full w-full">
      {/* Matches the piano below: the stage's wood border is 10px, the piano's cheeks 12px. */}
      <div className="absolute inset-y-0 left-[2px] right-[2px]">
        <PianoRoll notes={notes} start={ctx.viewStart} now={now} />
      </div>
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
    lit: playing ? playLit : undefined,
    overlay: saveOpen ? <SavePerformance notes={finished} onClose={() => setSaveOpen(false)} /> : undefined,
  };
}

/** Save performance: a code for Classroom, a link, or a MIDI file. */
const SavePerformance: React.FC<{ notes: PerfNote[]; onClose: () => void }> = ({ notes, onClose }) => {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [copied, setCopied] = useState<'' | 'code' | 'link'>('');
  useEffect(() => {
    if (!name.trim()) return setCode('');
    setCopied('');
    // The name lives only inside the code, never in the browser.
    void encodeSubmission({ name, assignment: DEFAULT_ASSIGNMENT, timestamp: Date.now(), learnDone: false, results: [], perf: packPerf(notes) }).then(setCode);
  }, [name, notes]);
  const copy = async (text: string, what: 'code' | 'link') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
    } catch {
      window.prompt('Copy this:', text);
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
            {notes.length} notes · {formatLength(perfLength(notes))}
          </div>
          <section>
            <div className="h text-[15px] text-wal3">Turn it in (code)</div>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoComplete="off" placeholder="Your first and last name" data-testid="perf-name" className="mt-1 w-full rounded-lg border border-line2 bg-white px-2 py-1.5 text-[15px]" />
            <textarea readOnly value={code} rows={3} placeholder="Your code shows up here once you type your name." data-testid="perf-code" className="mt-2 w-full rounded-lg border border-line2 bg-white p-2 font-mono text-[11px] break-all" onFocus={(e) => e.currentTarget.select()} />
            <button className="btn btn-brass mt-1 w-full" disabled={!code} onClick={() => void copy(code, 'code')}>
              {copied === 'code' ? 'Copied ✓' : 'Copy code'}
            </button>
          </section>
          <section>
            <div className="h text-[15px] text-wal3">Share a link</div>
            <div className="text-[13px] text-muted">Anyone with the link can play it back in PianoLab. No name is in it.</div>
            <button className="btn mt-1 w-full" data-testid="perf-link" onClick={() => void perfLink(notes).then((l) => copy(l, 'link'))}>
              {copied === 'link' ? 'Link copied ✓' : 'Copy link'}
            </button>
          </section>
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
