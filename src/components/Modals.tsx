import React, { useEffect, useRef, useState } from 'react';
import { AudioEngine } from '../audio/audioEngine';
import { LevelResult } from '../types';
import { encodeSubmission, DEFAULT_ASSIGNMENT } from '../utils/codec';
import { parseBatch, BatchResult, BatchEntry, ALL_LEVELS } from '../utils/batch';
import { floored, passed, bestByLevel } from '../utils/grading';
import { saveLatency } from '../utils/autosave';

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

// ---------------- Get my code ----------------
export const CodeModal: React.FC<{ results: LevelResult[]; learnDone: boolean; onClose: () => void }> = ({ results, learnDone, onClose }) => {
  const [code, setCode] = useState('');
  const [copied, setCopied] = useState(false);
  // The name is typed fresh each time and is never saved by the app. It lives only inside the code.
  const [name, setName] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!name.trim()) return setCode('');
    setCopied(false);
    void encodeSubmission({ name, assignment: DEFAULT_ASSIGNMENT, timestamp: Date.now(), learnDone, results }).then(setCode);
  }, [results, learnDone, name]);
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
    <Shell title="Get my code" onClose={onClose}>
      <p className="text-[15px] text-wal1">Type your name, then copy your code and paste it into Google Classroom to turn in your work. Your name goes inside the code only. This app never saves it.</p>
      <label className="mt-3 block text-[14px]">
        <span className="h text-wal3">Your name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoComplete="off" data-testid="name" placeholder="First and last name" className="mt-0.5 w-full rounded-lg border border-line2 bg-white px-2 py-1.5 text-[15px]" />
      </label>
      <div className="mt-3 rounded-lg border border-line bg-page p-2 text-[14px]">
        <div>Learn: {learnDone ? '✓ finished' : 'not finished yet'}</div>
        {ALL_LEVELS.map((l) => {
          const r = best[l.id];
          return (
            <div key={l.id} className="flex justify-between">
              <span>{l.title}</span>
              <span className={r && passed(r.raw, l) ? 'text-good' : 'text-muted'}>{r ? `${floored(r.raw)}%${passed(r.raw, l) ? ' ✓' : ''}` : '–'}</span>
            </div>
          );
        })}
      </div>
      <textarea ref={ref} readOnly value={code} rows={4} placeholder="Your code shows up here once you type your name." data-testid="code" className="mt-3 w-full rounded-lg border border-line2 bg-white p-2 font-mono text-[12px] break-all" onFocus={(e) => e.currentTarget.select()} />
      <button className="btn btn-brass mt-2 w-full" onClick={copy} disabled={!code}>
        {copied ? 'Copied ✓' : 'Copy code'}
      </button>
    </Shell>
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
  const clicks = useRef<number[]>([]);
  const taps = useRef<number[]>([]);

  useEffect(() => {
    return subscribe(() => {
      if (phase === 'running') taps.current.push(engine.now());
    });
  }, [phase, subscribe, engine]);

  const tap = () => {
    if (phase === 'running') taps.current.push(engine.now());
  };

  const start = async () => {
    await engine.unlock();
    pauseMetro();
    taps.current = [];
    clicks.current = engine.scheduleClicks(BEATS, BPM);
    setPhase('running');
    window.setTimeout(() => {
      // For each tap, how late was it compared with the nearest click? The middle value is the latency.
      const offs = taps.current
        .map((t) => {
          const nearest = clicks.current.reduce((a, c) => (Math.abs(c - t) < Math.abs(a - t) ? c : a), clicks.current[0]);
          return (t - nearest) * 1000;
        })
        .filter((ms) => Math.abs(ms) < 250)
        .slice(2); // skip the first couple of taps while the student finds the beat
      if (offs.length < 4) return setPhase('failed');
      offs.sort((a, b) => a - b);
      const median = offs[Math.floor(offs.length / 2)];
      const ms = Math.max(0, Math.round(median));
      saveLatency(ms);
      setResult(ms);
      setPhase('done');
      onDone(ms);
    }, (BEATS * 60) / BPM * 1000 + 900);
  };

  return (
    <Shell title="Latency check" onClose={onClose}>
      {phase === 'ready' && (
        <>
          <p className="text-[15px] text-wal1">
            Put on your headphones. You will hear {BEATS} clicks. Tap any key along with each click, as steadily as you can. This measures how much delay your keyboard and Chromebook add, so your timing grades stay fair.
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
          <p className="mt-1 text-[14px] text-wal1">Saved in this browser. It will be used for timing grades. You can run this again any time.</p>
          <button className="btn btn-brass mt-3 w-full" onClick={onClose}>
            Done
          </button>
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
export const BatchModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [text, setText] = useState('');
  const [res, setRes] = useState<BatchResult | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const run = async () => {
    setRes(await parseBatch(text));
    setOpen(null);
  };
  return (
    <Shell title="Teacher: batch grading" onClose={onClose} wide>
      <p className="text-[14px] text-wal1">Paste a whole class’s codes (a Classroom page works). Anything next to a code on the same line shows up as that student’s label.</p>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} data-testid="batch-input" placeholder="Paste codes here…" className="mt-2 w-full rounded-lg border border-line2 bg-white p-2 font-mono text-[12px]" />
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
              <Row key={e.id} e={e} open={open === e.id} toggle={() => setOpen(open === e.id ? null : e.id)} />
            ))}
          </div>
        </div>
      )}
    </Shell>
  );
};

const Row: React.FC<{ e: BatchEntry; open: boolean; toggle: () => void }> = ({ e, open, toggle }) => (
  <div className="rounded-lg border border-line bg-panel">
    <button className="flex w-full items-center gap-3 px-3 py-2 text-left" onClick={toggle}>
      <span className="h w-40 truncate text-[14px] text-wal3">{e.label || `Student ${e.id}`}</span>
      <span className="text-[13px] text-muted">{e.submission.learnDone ? 'Learn ✓' : 'Learn –'}</span>
      <span className="flex flex-1 flex-wrap gap-1">
        {ALL_LEVELS.map((l) => {
          const x = e.levels.find((v) => v.levelId === l.id);
          return (
            <span key={l.id} title={l.title} className={`h rounded px-1.5 text-[12px] ${x ? (x.passed ? 'bg-[#cfe3b4] text-good' : 'bg-[#f6e3b8] text-wal1') : 'bg-page text-muted'}`}>
              {x ? `${x.grade}${x.raw !== x.grade ? ` (${x.raw})` : ''}` : '–'}
            </span>
          );
        })}
      </span>
      <span className="h text-[15px] text-wal3">{e.headline !== null ? `${e.headline}%` : '–'}</span>
    </button>
    {open && (
      <div className="border-t border-line px-3 py-2 text-[13px]">
        <div className="text-muted">Made {e.submission.timestamp ? new Date(e.submission.timestamp).toLocaleString() : 'unknown time'}. Numbers in ( ) are the raw score before the 50% floor (teacher only).</div>
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
