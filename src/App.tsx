import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AudioEngine, DEFAULT_SOUND, LoadState, MetroSound } from './audio/audioEngine';
import { useInputs } from './input/useInputs';
import { Piano } from './components/Piano';
import { RightPanel } from './components/RightPanel';
import { BatchModal, CodeModal, LatencyModal } from './components/Modals';
import { RestorePrompt, SaveIndicator, SaveStatus } from './components/SaveUI';
import { useLearn } from './components/ModeLearn';
import { usePractice } from './components/ModePractice';
import { useChallenge } from './components/ModeChallenge';
import { ModeCtx } from './components/modeTypes';
import { LevelResult } from './types';
import { DEFAULT_START, KEY_COUNT, clampStart, inView, letterOf, noteName, startFor } from './utils/music';
import { WorkSnapshot, clearSaved, hasWork, loadLatency, loadSaved, writeSaved } from './utils/autosave';

type Mode = 'learn' | 'practice' | 'challenge';
const engine = AudioEngine.get();

export default function App() {
  const [mode, setMode] = useState<Mode>('learn');
  const [viewStart, setViewStart] = useState(DEFAULT_START);
  const [pressed, setPressed] = useState<Set<number>>(new Set());
  const [results, setResults] = useState<LevelResult[]>([]);
  const [learnDone, setLearnDone] = useState(false);
  const [learnStep, setLearnStep] = useState(0);
  const [soundId, setSoundId] = useState(DEFAULT_SOUND);
  const [states, setStates] = useState<Record<string, LoadState>>({});
  const [metro, setMetro] = useState<{ on: boolean; bpm: number; sound: MetroSound }>({ on: false, bpm: 80, sound: 'wood' });
  const [latency, setLatency] = useState<number | null>(() => loadLatency());
  const [modal, setModal] = useState<null | 'code' | 'latency' | 'batch'>(null);
  const [lastNote, setLastNote] = useState<number | null>(null);

  // ---- Autosave: off until the student answers the restore prompt ----
  const [saved] = useState(() => loadSaved());
  const [autosaveOn, setAutosaveOn] = useState(!saved);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const restore = (snap: WorkSnapshot) => {
    setResults(snap.results);
    setLearnDone(snap.learnDone);
    setLearnStep(snap.learnStep);
    if (snap.soundId) void pickSound(snap.soundId);
  };

  useEffect(() => {
    if (!autosaveOn) return;
    const snap: WorkSnapshot = { results, learnDone, learnStep, soundId };
    if (!hasWork(snap)) return;
    const ok = writeSaved(snap);
    setSaveStatus(ok ? 'saved' : 'failed');
    if (ok) setSavedAt(Date.now());
  }, [autosaveOn, results, learnDone, learnStep, soundId]);

  // ---- Sounds ----
  useEffect(() => {
    engine.onState = (id, s) => setStates((p) => ({ ...p, [id]: s }));
    void engine.select(DEFAULT_SOUND);
  }, []);

  const pickSound = useCallback(async (id: string) => {
    setSoundId(id);
    await engine.select(id);
    // If it could not load, the engine fell back to the default; show that.
    if (engine.current !== id) setSoundId(engine.current);
  }, []);

  const onMetro = (m: { on: boolean; bpm: number; sound: MetroSound }) => {
    const soundChanged = m.sound !== metro.sound;
    setMetro(m);
    void engine.unlock().then(() => {
      engine.setMetronome(m.on, m.bpm, m.sound);
      if (soundChanged && !m.on) engine.previewMetro(m.sound);
    });
  };

  // ---- Notes ----
  const listeners = useRef(new Set<(midi: number) => void>());
  const subscribe = useCallback((fn: (midi: number) => void) => {
    listeners.current.add(fn);
    return () => void listeners.current.delete(fn);
  }, []);
  const startRef = useRef(viewStart);
  startRef.current = viewStart;

  const noteOn = useCallback((midi: number, vel: number, source: 'midi' | 'typing' | 'touch') => {
    void engine.unlock();
    engine.noteOn(midi, vel);
    setPressed((p) => new Set(p).add(midi));
    setLastNote(midi);
    // A MIDI note outside the view slides the view so the key is visible (matches the controller's own octave buttons).
    if (source === 'midi' && !inView(midi, startRef.current)) setViewStart(startFor(midi));
    listeners.current.forEach((fn) => fn(midi));
  }, []);
  const noteOff = useCallback((midi: number) => {
    engine.noteOff(midi);
    setPressed((p) => {
      const n = new Set(p);
      n.delete(midi);
      return n;
    });
  }, []);
  const octave = useCallback((d: number) => setViewStart((s) => clampStart(s + d * 12)), []);

  const midiStatus = useInputs({ noteOn: (m, v, s) => noteOn(m, v, s), noteOff: (m) => noteOff(m), octave }, viewStart);

  // ---- Modes ----
  const ctx: ModeCtx = {
    engine,
    subscribe,
    viewStart,
    results,
    setResults,
    learnDone,
    setLearnDone,
    learnStep,
    setLearnStep,
    goTo: setMode,
  };
  const learn = useLearn(ctx);
  const practice = usePractice(ctx);
  const challenge = useChallenge(ctx);
  const parts = mode === 'learn' ? learn : mode === 'practice' ? practice : challenge;

  const tabs: { id: Mode | 'jam'; label: string }[] = [
    { id: 'learn', label: 'Learn' },
    { id: 'practice', label: 'Practice' },
    { id: 'challenge', label: 'Challenge' },
    { id: 'jam', label: 'Jam Room' },
  ];

  const midiChip = useMemo(() => {
    if (midiStatus === 'checking') return { text: 'MIDI: checking…', ok: false };
    if (midiStatus === 'unavailable') return { text: 'MIDI: not available in this browser', ok: false };
    if (midiStatus === 'none') return { text: 'MIDI: no keyboard found (keyboard & touch work)', ok: false };
    return { text: `MIDI: ${midiStatus}`, ok: true };
  }, [midiStatus]);

  return (
    <div className="flex h-full flex-col bg-page">
      {/* Top bar (walnut) */}
      <header className="wood flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-1.5 text-panel shadow-md">
        <div className="h flex items-center gap-2 text-[22px] tracking-wide">
          <img src="/favicon.svg" alt="" className="h-7 w-7" />
          PianoLab
        </div>
        <nav className="flex gap-1" aria-label="Modes">
          {tabs.map((t) =>
            t.id === 'jam' ? (
              <span key={t.id} className="h cursor-default rounded-md px-3 py-1 text-[15px] text-line2/60" title="Coming in a later phase">
                {t.label} <span className="text-[10px]">soon</span>
              </span>
            ) : (
              <button
                key={t.id}
                data-testid={`tab-${t.id}`}
                onClick={() => setMode(t.id as Mode)}
                className={`h rounded-md px-3 py-1 text-[15px] ${mode === t.id ? 'bg-brass text-brasstext' : 'text-panel hover:bg-white/10'}`}
              >
                {t.label}
              </button>
            ),
          )}
        </nav>
        <div className="ml-auto flex flex-wrap items-center gap-2 text-[12px]">
          <SaveIndicator status={saveStatus} savedAt={savedAt} />
          <span className={`h rounded-md border px-2 py-1 ${midiChip.ok ? 'border-[#7aa65a] text-[#cfe3b4]' : 'border-wal1 text-line2'}`} data-testid="midi-status">
            {midiChip.text}
          </span>
          <button className="h rounded-md border border-wal1 px-2 py-1 text-line hover:bg-white/10" onClick={() => setModal('latency')} data-testid="latency-chip">
            {latency === null ? 'Latency: not set. Tap to check' : `Latency: ${latency} ms`}
          </button>
          <button className="h rounded-md border border-wal1 px-2 py-1 text-line2 hover:bg-white/10" onClick={() => setModal('batch')} data-testid="teacher">
            Teacher
          </button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)_250px]">
        {/* Left panel */}
        <aside className="min-h-0 overflow-auto border-r border-line bg-page p-3 order-2 lg:order-none" data-testid="left-panel">
          {parts.left}
          <div className="mt-4 border-t border-line pt-3" data-testid="left-bottom">
            {parts.labelControl && (
              <>
                <div className="h text-[11px] uppercase text-muted">Make it easier or harder</div>
                <div className="mt-1 text-[13px] text-wal1">Note names on the keys</div>
                <div className="mt-1 flex gap-1" role="radiogroup" aria-label="Note names on the keys">
                  {([['all', 'All names'], ['c', 'C only'], ['off', 'Off']] as const).map(([v, t]) => {
                    const ok = parts.labelControl!.allowed.includes(v);
                    return (
                      <button
                        key={v}
                        role="radio"
                        aria-checked={parts.labelControl!.value === v}
                        disabled={!ok || parts.labelControl!.locked}
                        data-testid={`labels-${v}`}
                        onClick={() => parts.labelControl!.set(v)}
                        className={`btn flex-1 px-1 text-[13px] ${parts.labelControl!.value === v ? 'btn-brass' : ''}`}
                      >
                        {t}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-1 text-[11px] text-muted">{parts.labelControl.note ?? 'You can make a level harder, but not easier than it starts.'}</div>
              </>
            )}
            <button className="btn btn-dark mt-3 w-full" onClick={() => setModal('code')} data-testid="get-code">
              Get my code
            </button>
          </div>
        </aside>

        {/* Center: stage, readout bar, piano */}
        <main className="flex min-h-0 min-w-0 flex-col p-2">
          <div className="stage min-h-[150px] flex-1 overflow-hidden rounded-t-lg border-x-[10px] border-t-[10px] border-transparent shadow-inner wood-v" style={{ borderImage: 'none' }}>
            <div className="stage h-full w-full rounded-sm" data-testid="stage">
              {parts.stage}
            </div>
          </div>
          <div className="wood flex flex-wrap items-center gap-2 px-3 py-1.5 text-panel">
            <button className="btn btn-dark px-2" onClick={() => octave(-1)} disabled={viewStart <= 24} data-testid="oct-down" title="Octave down (Z)">
              Oct −
            </button>
            <span className="h w-20 text-center text-[14px]" data-testid="range">
              {noteName(viewStart)}–{noteName(viewStart + KEY_COUNT - 1)}
            </span>
            <button className="btn btn-dark px-2" onClick={() => octave(1)} disabled={viewStart >= 84} data-testid="oct-up" title="Octave up (X)">
              Oct +
            </button>
            <span className="h ml-3 text-[13px] text-line2">
              {lastNote === null ? 'Play a key' : <>Last note: <b className="text-brass">{noteName(lastNote)}</b> ({letterOf(lastNote)})</>}
            </span>
            <span className="ml-auto flex gap-2">
              {parts.restart && (
                <button className="btn btn-dark" onClick={parts.restart.onClick} disabled={parts.restart.disabled}>
                  {parts.restart.label}
                </button>
              )}
              {parts.start && (
                <button className="btn btn-brass" onClick={parts.start.onClick} disabled={parts.start.disabled} data-testid="start-btn">
                  {parts.start.label}
                </button>
              )}
            </span>
          </div>
          <div className="flex h-[clamp(150px,24vh,210px)] shrink-0">
            <div className="wood-v w-3 rounded-bl-lg" />
            <div className="min-w-0 flex-1 bg-[#2a2118] pt-1">
              <Piano
                start={viewStart}
                pressed={pressed}
                lit={parts.lit}
                forceLabel={parts.forceLabel}
                marks={parts.marks}
                labels={parts.labels}
                onDown={(m) => noteOn(m, 0.8, 'touch')}
                onUp={noteOff}
              />
            </div>
            <div className="wood-v w-3 rounded-br-lg" />
          </div>
        </main>

        {/* Right panel */}
        <aside className="order-3 min-h-0 overflow-auto border-l border-line bg-page p-3 lg:order-none">
          <RightPanel engine={engine} soundId={soundId} states={states} onSelect={pickSound} metro={metro} onMetro={onMetro} />
        </aside>
      </div>

      {saved && !autosaveOn && (
        <RestorePrompt
          savedAt={saved.savedAt}
          onRestore={() => {
            restore(saved.snapshot);
            setAutosaveOn(true);
          }}
          onStartFresh={() => {
            clearSaved();
            setAutosaveOn(true);
          }}
        />
      )}
      {modal === 'code' && <CodeModal results={results} learnDone={learnDone} onClose={() => setModal(null)} />}
      {modal === 'latency' && <LatencyModal engine={engine} subscribe={subscribe} onDone={setLatency} onClose={() => setModal(null)} pauseMetro={() => onMetro({ ...metro, on: false })} />}
      {modal === 'batch' && <BatchModal onClose={() => setModal(null)} />}
    </div>
  );
}
