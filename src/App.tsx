import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AudioEngine, DEFAULT_SOUND, LoadState } from './audio/audioEngine';
import { useInputs } from './input/useInputs';
import { Piano } from './components/Piano';
import { Metro, RightPanel } from './components/RightPanel';
import { CustomSynthPanel } from './components/CustomSynthPanel';
import { SYNTH_KEYS_WARM } from './data/defaults';
import { loadCurrentPatch } from './utils/synthPresets';
import { SynthParams } from './types';
import { AssignModal, BatchModal, LatencyModal } from './components/Modals';
import { Assignment, applyAssignment, decodeAssignment } from './utils/assignment';
import { ALL_LEVELS } from './utils/batch';
import { GradeReport } from './components/GradeReport';
import { LessonPicker } from './components/LessonPicker';
import { ChordStrip } from './components/ChordStrip';
import { INVERSION_NAMES, detectChord, diatonic, keyById, stripVoicing } from './utils/chords';
import { useSandbox } from './components/ModeSandbox';
import { RestorePrompt, SaveIndicator, SaveStatus } from './components/SaveUI';
import { useLearn } from './components/ModeLearn';
import { usePractice } from './components/ModePractice';
import { useChallenge } from './components/ModeChallenge';
import { ModeCtx, NoteEvent } from './components/modeTypes';
import { LevelResult } from './types';
import { DEFAULT_START, KEY_COUNT, clampStart, inView, letterOf, noteName, startFor } from './utils/music';
import { LearnProgress, WorkSnapshot, clearSaved, hasWork, loadLatency, loadSaved, writeSaved } from './utils/autosave';
import lessonsData from './data/lessons.json';
import { Lesson } from './types';
import { levelInfo } from './utils/batch';

/**
 * Like the octave lights on the class MIDI keyboards: the Oct button in the direction you moved turns green (1 octave),
 * yellow (2), then red (3). At home both look plain.
 */
const octColor = (n: number) =>
  n <= 0 ? '' : n === 1 ? 'oct-1' : n === 2 ? 'oct-2' : 'oct-3';

const LESSONS = (lessonsData.lessons as unknown as Lesson[]);

type Mode = 'learn' | 'practice' | 'challenge' | 'sandbox' | 'report';
const engine = AudioEngine.get();

export default function App() {
  // A shared performance link (?perf=...) opens straight into the Sandbox.
  const [mode, setMode] = useState<Mode>(() => (new URLSearchParams(window.location.search).has('perf') ? 'sandbox' : 'learn'));
  const [viewStart, setViewStart] = useState(DEFAULT_START);
  const [pressed, setPressed] = useState<Set<number>>(new Set());
  const [results, setResults] = useState<LevelResult[]>([]);
  // Lessons: the picker in the left panel. Learn progress is kept per lesson.
  const [lessonId, setLessonId] = useState(LESSONS[0].id);
  // A teacher's assignment link (?a=...): only the assigned lessons and levels, with its limits.
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const assignRef = useRef(assignment);
  assignRef.current = assignment;
  const lessons = useMemo(() => applyAssignment(LESSONS, assignment), [assignment]);
  const lesson = lessons.find((l) => l.id === lessonId) ?? lessons[0];
  const [learnMap, setLearnMap] = useState<Record<string, LearnProgress>>({});
  const learnDone = learnMap[lesson.id]?.done ?? false;
  const learnStep = learnMap[lesson.id]?.step ?? 0;
  const setLearnDone = useCallback((v: boolean) => setLearnMap((p) => ({ ...p, [lessonId]: { step: p[lessonId]?.step ?? 0, done: v } })), [lessonId]);
  const setLearnStep = useCallback((n: number) => setLearnMap((p) => ({ ...p, [lessonId]: { done: p[lessonId]?.done ?? false, step: n } })), [lessonId]);
  const learned = Object.entries(learnMap).filter(([, v]) => v.done).map(([k]) => k);
  // Chord strip: its key follows the lesson (and can be changed in the strip). Numerals always show on it.
  const [stripKeyId, setStripKeyId] = useState(lesson.key ?? 'C');
  useEffect(() => {
    setStripKeyId(lesson.key ?? 'C');
  }, [lesson.id, lesson.key]);
  const stripKey = keyById(stripKeyId);

  /**
   * Play a chord from the strip (click, or keys 1-7). One chord at a time: the last one is cut off first, so they don't
   * pile up and get too loud. Voiced from a low I upward (I in octave 3, each chord's root climbing the scale), so going
   * I to vii never jumps down an octave. These go straight to the sound engine, NOT through the piano, so they never count
   * as playing in Learn, Practice or Challenges, and the Sandbox doesn't record them.
   */
  const stripNotes = useRef<number[]>([]);
  const stripDegree = useRef<number | null>(null);
  const stripTimer = useRef<number | undefined>(undefined);
  const [stripLit, setStripLit] = useState<Set<number> | null>(null);
  const [stripActive, setStripActive] = useState<number | null>(null);
  const playStripChord = useCallback(
    (degree: number) => {
      const d = diatonic(stripKey)[degree];
      if (!d) return;
      stripNotes.current.forEach((n) => engine.noteOff(n));
      window.clearTimeout(stripTimer.current);
      const notes = stripVoicing(stripKey, degree);
      stripNotes.current = notes;
      stripDegree.current = degree;
      setStripLit(new Set(notes));
      setStripActive(degree);
      void engine.unlock().then(() => {
        // Only if it is still the chord being held (a very quick tap may already have let go).
        if (stripNotes.current === notes) notes.forEach((n) => engine.noteOn(n, 0.7));
      });
      // A safety net: let go after 20 s even if the release never arrives (window lost focus mid-press, etc.).
      stripTimer.current = window.setTimeout(() => stopStripChord(degree), 20000);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stripKey],
  );
  /** Let go of a strip chord: it sounds only while held (mouse button, finger, or number key down). */
  const stopStripChord = useCallback((degree?: number) => {
    if (degree !== undefined && stripDegree.current !== degree) return; // a different chord is held now
    window.clearTimeout(stripTimer.current);
    stripNotes.current.forEach((n) => engine.noteOff(n));
    stripNotes.current = [];
    stripDegree.current = null;
    setStripLit(null);
    setStripActive(null);
  }, []);
  const [soundId, setSoundId] = useState(DEFAULT_SOUND);
  const [states, setStates] = useState<Record<string, LoadState>>({});
  const [metro, setMetro] = useState<Metro>({ on: false, bpm: 80, sound: 'wood', vol: 1 });
  const [latency, setLatency] = useState<number | null>(() => loadLatency());
  const [latencySkipped, setLatencySkipped] = useState(false);
  const [modal, setModal] = useState<null | 'latency' | 'batch' | 'assign'>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [customParams, setCustomParams] = useState<SynthParams>(() => {
    const p = loadCurrentPatch() ?? SYNTH_KEYS_WARM;
    engine.setCustomParams(p);
    return p;
  });

  // ---- Autosave: off until the student answers the restore prompt ----
  const [saved] = useState(() => loadSaved());
  const [autosaveOn, setAutosaveOn] = useState(!saved);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const restore = (snap: WorkSnapshot) => {
    // Drop results for levels that no longer exist (e.g. the removed octave level), so they don't go into new codes.
    setResults(snap.results.filter((r) => levelInfo(r.levelId)));
    setLearnMap(snap.learn);
    if (applyAssignment(LESSONS, assignRef.current).some((l) => l.id === snap.lessonId)) setLessonId(snap.lessonId);
    // An assignment's sound wins over the saved one.
    if (snap.soundId && !assignRef.current?.sound) void pickSound(snap.soundId);
  };

  useEffect(() => {
    if (!autosaveOn) return;
    const snap: WorkSnapshot = { results, learn: learnMap, lessonId, soundId };
    if (!hasWork(snap)) return;
    const ok = writeSaved(snap);
    setSaveStatus(ok ? 'saved' : 'failed');
    if (ok) setSavedAt(Date.now());
  }, [autosaveOn, results, learnMap, lessonId, soundId]);

  // ---- Sounds ----
  useEffect(() => {
    engine.onState = (id, s) => setStates((p) => ({ ...p, [id]: s }));
    void engine.select(DEFAULT_SOUND);
  }, []);

  // Open an assignment link: decode it, go to its first lesson's Challenges, set its sound.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('a');
    if (!q) return;
    void decodeAssignment(q, ALL_LEVELS.map((l) => l.id)).then((a) => {
      if (!a) return;
      setAssignment(a);
      const first = applyAssignment(LESSONS, a)[0];
      if (first) setLessonId(first.id);
      setMode('challenge');
      if (a.sound) void pickSound(a.sound);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pickSound = useCallback(async (id: string) => {
    setSoundId(id);
    await engine.select(id);
    // If it could not load, the engine fell back to the default; show that.
    if (engine.current !== id) setSoundId(engine.current);
  }, []);

  const metroRef = useRef(metro);
  metroRef.current = metro;
  const onMetroRef = useRef<(m: Metro) => void>(() => {});
  const onMetro = (m: Metro) => {
    const soundChanged = m.sound !== metro.sound;
    setMetro(m);
    engine.setMetroVolume(m.vol);
    void engine.unlock().then(() => {
      // Only restart the beat when it is switched on/off or the sound changes. Tempo and volume change smoothly.
      if (m.on !== metro.on || m.sound !== metro.sound) engine.setMetronome(m.on, m.bpm, m.sound);
      else if (m.bpm !== metro.bpm) engine.setTempo(m.bpm);
      if (soundChanged && !m.on) engine.previewMetro(m.sound);
    });
  };

  onMetroRef.current = onMetro;

  // ---- Notes ----
  const listeners = useRef(new Set<(midi: number) => void>());
  const subscribe = useCallback((fn: (midi: number) => void) => {
    listeners.current.add(fn);
    return () => void listeners.current.delete(fn);
  }, []);
  const noteListeners = useRef(new Set<(e: NoteEvent) => void>());
  const subscribeNotes = useCallback((fn: (e: NoteEvent) => void) => {
    noteListeners.current.add(fn);
    return () => void noteListeners.current.delete(fn);
  }, []);
  const startRef = useRef(viewStart);
  startRef.current = viewStart;

  /** Keys held down right now, kept in step synchronously (state updates arrive a render later). */
  const heldRef = useRef(new Set<number>());
  const getHeld = useCallback(() => [...heldRef.current], []);

  const noteOn = useCallback((midi: number, vel: number, source: 'midi' | 'typing' | 'touch') => {
    void engine.unlock();
    heldRef.current.add(midi);
    engine.noteOn(midi, vel);
    setPressed((p) => new Set(p).add(midi));
    // A MIDI note outside the view slides the view so the key is visible (matches the controller's own octave buttons).
    if (source === 'midi' && !inView(midi, startRef.current)) setViewStart(startFor(midi, startRef.current));
    listeners.current.forEach((fn) => fn(midi));
    noteListeners.current.forEach((fn) => fn({ on: true, midi, vel }));
  }, []);
  const noteOff = useCallback((midi: number) => {
    engine.noteOff(midi);
    heldRef.current.delete(midi);
    noteListeners.current.forEach((fn) => fn({ on: false, midi, vel: 0 }));
    setPressed((p) => {
      const n = new Set(p);
      n.delete(midi);
      return n;
    });
  }, []);
  const octave = useCallback((d: number) => setViewStart((s) => clampStart(s + d * 12)), []);

  /** Octaves away from the home view (C3-C5): + is up, - is down. */
  const octShift = Math.round((viewStart - DEFAULT_START) / 12);

  const midiStatus = useInputs({ noteOn: (m, v, s) => noteOn(m, v, s), noteOff: (m) => noteOff(m), octave }, viewStart);

  // ---- Modes ----
  const ctx: ModeCtx = {
    engine,
    subscribe,
    subscribeNotes,
    viewStart,
    getHeld,
    lesson,
    keyDef: stripKey,
    latency: latency ?? 0,
    stopMetronome: () => metroRef.current.on && onMetroRef.current({ ...metroRef.current, on: false }),
    minTempo: assignment?.tempo,
    openLatency: () => setModal('latency'),
    latencySet: latency !== null,
    latencySkipped,
    skipLatency: () => setLatencySkipped(true),
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
  const sandbox = useSandbox(ctx, mode === 'sandbox');
  const parts = mode === 'learn' ? learn : mode === 'practice' ? practice : mode === 'sandbox' ? sandbox : challenge;

  // Chord detector: on everywhere except Challenges (it would give answers away). Chord strip: Practice and Sandbox,
  // Lessons 2 on (in Learn it would give the answers away too).
  const detectorOn = mode !== 'challenge' && mode !== 'report';
  const detected = detectorOn ? detectChord([...pressed], stripKey) : null;
  const showStrip = (mode === 'practice' && !!lesson.key) || mode === 'sandbox';

  // Number keys 1-7 play the strip's chords (only while the strip is showing; never while typing in a box).
  useEffect(() => {
    if (!showStrip) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'TEXTAREA' || t.isContentEditable || (t.tagName === 'INPUT' && !['range', 'checkbox', 'radio', 'button'].includes((t as HTMLInputElement).type)))) return;
      const n = Number(e.key);
      if (n >= 1 && n <= 7) playStripChord(n - 1);
    };
    const onUp = (e: KeyboardEvent) => {
      const n = Number(e.key);
      if (n >= 1 && n <= 7) stopStripChord(n - 1);
    };
    const onBlur = () => stopStripChord();
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [showStrip, playStripChord, stopStripChord]);

  /** Notes sounding (play back / scrubbing) that are off the 25 keys on screen: flash the Oct button that would show them. */
  const litList = parts.lit ? [...parts.lit] : [];
  const offAbove = litList.some((m) => m >= viewStart + KEY_COUNT);
  const offBelow = litList.some((m) => m < viewStart);


  const tabs: { id: Mode | 'jam'; label: string }[] = [
    { id: 'learn', label: 'Learn' },
    { id: 'practice', label: 'Practice' },
    { id: 'challenge', label: 'Challenges' },
    { id: 'sandbox', label: 'Sandbox' },
    { id: 'jam', label: 'Jam Room' },
    { id: 'report', label: 'Grade Report' },
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
        </div>
      </header>

      {assignment && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 border-b border-brass2 bg-[#fbeecb] px-3 py-1 text-[13px] text-wal3" data-testid="assignment-banner">
          <span className="h text-[14px]">Assignment: {assignment.title}</span>
          <span>Lesson{lessons.length > 1 ? 's' : ''} {lessons.map((l) => l.number).join(', ')}</span>
          {assignment.labels === 'c' && <span>Note names: Cs only</span>}
          {assignment.labels === 'off' && <span>Note names: hidden</span>}
          {assignment.tempo && <span>Timed levels: {assignment.tempo} BPM or faster</span>}
          {assignment.sound && <span>Sound set by your teacher</span>}
          <span className="text-muted">Turn it in from the Grade Report tab.</span>
        </div>
      )}
      {mode === 'report' ? (
        <main className="min-h-0 flex-1 overflow-auto">
          <GradeReport results={results} learned={learned} assignment={assignment} onTeacher={() => setModal('batch')} onAssign={() => setModal('assign')} />
        </main>
      ) : (
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)_250px]">
        {/* Left panel */}
        <aside className="min-h-0 overflow-auto border-r border-line bg-page p-3 order-2 lg:order-none" data-testid="left-panel">
          {(mode === 'learn' || mode === 'practice' || mode === 'challenge') && (
            <LessonPicker lessons={lessons} current={lesson.id} learned={learned} results={results} onPick={setLessonId} />
          )}
          {parts.left}
          <div className="mt-3 border-t border-line pt-2" data-testid="left-bottom">
            {parts.labelControl && (
              <>
                <div className="h text-[11px] uppercase text-muted">{parts.labelControl.title ?? 'Challenge Yourself'}</div>
                <div className="mt-1 flex flex-col gap-1" role="radiogroup" aria-label={`${parts.labelControl.title ?? 'Challenge Yourself'} note names on the keys`}>
                  {([['all', 'Show Note Names'], ['c', 'Show Cs'], ['off', 'Hide Note Names']] as const).map(([v, t]) => {
                    const ok = parts.labelControl!.allowed.includes(v);
                    return (
                      <button
                        key={v}
                        role="radio"
                        aria-checked={parts.labelControl!.value === v}
                        disabled={!ok || parts.labelControl!.locked}
                        data-testid={`labels-${v}`}
                        onClick={() => parts.labelControl!.set(v)}
                        className={`btn px-2 py-1.5 text-[14px] ${parts.labelControl!.value === v ? 'btn-brass' : ''}`}
                      >
                        {t}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </aside>

        {/* Center: stage, readout bar, piano */}
        <main className="flex min-h-0 min-w-0 flex-col p-2">
          {showStrip && (
            <ChordStrip
              keyDef={stripKey}
              onKey={setStripKeyId}
              active={detected}
              playing={stripActive}
              onPlay={playStripChord}
              onRelease={stopStripChord}
            />
          )}
          <div className={`stage min-h-[150px] flex-1 overflow-hidden border-x-[10px] border-t-[10px] border-transparent shadow-inner wood-v ${showStrip ? '' : 'rounded-t-lg'}`} style={{ borderImage: 'none' }}>
            <div className="stage h-full w-full rounded-sm" data-testid="stage">
              {parts.stage}
            </div>
          </div>
          <div className="wood flex flex-wrap items-center gap-2 px-3 py-1.5 text-panel">
            <button className={`btn btn-dark px-2 ${octColor(octShift < 0 ? -octShift : 0)} ${offBelow ? 'oct-alert' : ''}`} onClick={() => octave(-1)} disabled={viewStart <= 24} data-testid="oct-down" title="Octave down (Z)">
              Oct −
            </button>
            <span className="h w-20 text-center text-[14px]" data-testid="range">
              {noteName(viewStart)}–{noteName(viewStart + KEY_COUNT - 1)}
            </span>
            <button className={`btn btn-dark px-2 ${octColor(octShift > 0 ? octShift : 0)} ${offAbove ? 'oct-alert' : ''}`} onClick={() => octave(1)} disabled={viewStart >= 84} data-testid="oct-up" title="Octave up (X)">
              Oct +
            </button>
            {(offAbove || offBelow) && (
              <span className="h oct-alert-label rounded-md px-2 py-0.5 text-[13px]" data-testid="oct-alert" role="status">
                {offBelow && offAbove ? '♪ Notes playing above and below: use Oct − / Oct +' : offAbove ? '♪ Notes playing higher up: press Oct +' : '♪ Notes playing lower down: press Oct −'}
              </span>
            )}
            {mode === 'sandbox' && detected && (
              // The Sandbox's centre is the piano roll, so the chord name goes here. (Practice shows it big in the centre.)
              <span className="h ml-3 text-[13px] text-line2" data-testid="detector">
                Chord: <b className="text-brass">{detected.symbol}</b> ({detected.longName}
                {detected.triad && detected.inversion > 0 ? `, ${INVERSION_NAMES[detected.inversion].toLowerCase()}` : ''})
                {detected.numeral && (
                  <>
                    {' '}
                    <b className="rounded px-1" style={{ background: detected.color, color: '#2a1e08' }}>
                      {detected.numeral}
                    </b>
                  </>
                )}
              </span>
            )}

          </div>
          <div className="flex h-[clamp(150px,24vh,210px)] shrink-0">
            <div className="wood-v w-3 rounded-bl-lg" />
            <div className="min-w-0 flex-1 bg-[#2a2118] pt-1">
              <Piano
                start={viewStart}
                pressed={pressed}
                lit={stripLit && !parts.lit ? stripLit : parts.lit}
                forceLabel={parts.forceLabel}
                marks={parts.marks}
                keyText={parts.keyText}
                labels={parts.labels}
                blackNames={!!lesson.blackKeys || mode === 'sandbox'}
                onDown={(m) => noteOn(m, 0.8, 'touch')}
                onUp={noteOff}
              />
            </div>
            <div className="wood-v w-3 rounded-br-lg" />
          </div>
        </main>

        {/* Right panel */}
        <aside className="order-3 min-h-0 overflow-auto border-l border-line bg-page p-3 lg:order-none">
          <RightPanel
            engine={engine}
            soundId={soundId}
            states={states}
            onSelect={pickSound}
            soundLocked={!!assignment?.sound}
            metro={metro}
            onMetro={onMetro}
            onOpenCustom={() => {
              void pickSound('custom');
              setCustomOpen(true);
            }}
          />
        </aside>
      </div>
      )}

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
      {customOpen && (
        <CustomSynthPanel
          engine={engine}
          params={customParams}
          onParams={(p) => {
            setCustomParams(p);
            engine.setCustomParams(p);
          }}
          onClose={() => setCustomOpen(false)}
        />
      )}
      {parts.overlay}
      {modal === 'latency' && <LatencyModal engine={engine} subscribe={subscribe} onDone={setLatency} onClose={() => setModal(null)} pauseMetro={() => onMetro({ ...metro, on: false })} />}
      {modal === 'batch' && <BatchModal engine={engine} onClose={() => setModal(null)} />}
      {modal === 'assign' && <AssignModal lessons={LESSONS} onClose={() => setModal(null)} />}
    </div>
  );
}
