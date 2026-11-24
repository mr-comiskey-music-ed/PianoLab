import React, { useEffect, useRef, useState } from 'react';
import { AudioEngine, LoadState, MetroSound, SOUNDS } from '../audio/audioEngine';
import { Knob } from './Knob';

export interface Metro {
  on: boolean;
  bpm: number;
  sound: MetroSound;
  /** 1 = 100% (default), up to METRO_VOL_MAX */
  vol: number;
}

/**
 * A labelled slider. It lives OUTSIDE RightPanel on purpose: when it was defined inside, React rebuilt it on every change,
 * which dropped the mouse grab and made click-and-drag stop working.
 */
const Slider: React.FC<{ label: string; value: number; min: number; max: number; step: number; def: number; left?: string; right?: string; onChange: (v: number) => void }> = ({ label, value, min, max, step, def, left, right, onChange }) => (
  <label className="block text-[13px]" title="Double-click to reset">
    <span className="h text-wal3">{label}</span>
    {/* Double-click puts it back to where it started. */}
    <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} onDoubleClick={() => onChange(def)} className="w-full accent-[#b8862c]" />
    {(left || right) && (
      <span className="flex justify-between text-[11px] text-muted">
        <span>{left}</span>
        <span>{right}</span>
      </span>
    )}
  </label>
);

/** Metronome volume goes up to 150% (1 = 100%, the default). */
export const METRO_VOL_MAX = 1.5;

/** Mixer faders: opens the Mix panel. */
const FadersIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <path d="M6 3v18M12 3v18M18 3v18" strokeWidth="1.4" opacity="0.6" />
    <rect x="3.5" y="13" width="5" height="3" rx="1" fill="currentColor" stroke="none" />
    <rect x="9.5" y="6" width="5" height="3" rx="1" fill="currentColor" stroke="none" />
    <rect x="15.5" y="10" width="5" height="3" rx="1" fill="currentColor" stroke="none" />
  </svg>
);

/**
 * Metronome icon, drawn in the style of Mr. Comiskey's SVG with a separate arm so it can swing. `angle` is the arm's
 * tilt in degrees (0 = straight up).
 */
const MetronomeIcon: React.FC<{ angle: number }> = ({ angle }) => (
  <svg viewBox="0 0 314 314" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="16" strokeLinejoin="round" strokeLinecap="round" aria-hidden="true">
    {/* body */}
    <path d="M112 16 H202 L248 296 H66 Z" />
    {/* base band */}
    <path d="M78 226 Q157 196 236 226 L248 296 H66 Z" fill="currentColor" />
    {/* swinging arm with its weight, pivoting just above the base */}
    <g transform={`rotate(${angle} 157 214)`}>
      <path d="M157 214 V22" strokeWidth="18" />
      <rect x="133" y="62" width="48" height="40" rx="6" fill="currentColor" strokeWidth="8" />
    </g>
  </svg>
);

/** How far the arm swings each way, and where it rests when the metronome is off (leaning, like the original icon). */
const SWING = 28;
const REST = 26;

/** The on/off button. While the beat runs, the arm swings in time with the clicks (one side per beat). */
const MetronomeButton: React.FC<{ engine: AudioEngine; on: boolean; onToggle: () => void }> = ({ engine, on, onToggle }) => {
  const [angle, setAngle] = useState(REST);
  useEffect(() => {
    if (!on) {
      setAngle(REST);
      return;
    }
    let raf = 0;
    const step = () => {
      const pos = engine.metroPosition();
      // At each beat the arm is at one end; halfway between beats it passes the middle.
      if (pos !== null) setAngle(SWING * Math.cos(Math.PI * pos));
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [on, engine]);
  return (
    <button
      onClick={onToggle}
      data-testid="metro"
      aria-pressed={on}
      aria-label={on ? 'Metronome on. Tap to turn off' : 'Metronome off. Tap to turn on'}
      title="Metronome on/off"
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${on ? 'border-wal3 bg-wal2 text-brass' : 'border-line2 bg-panel text-wal1 hover:bg-[#fff8ea]'}`}
    >
      <MetronomeIcon angle={angle} />
    </button>
  );
};

const BPM_MIN = 40;
const BPM_MAX = 200;
const clampBpm = (v: number) => Math.max(BPM_MIN, Math.min(BPM_MAX, Math.round(v)));

/**
 * The BPM number. Drag up/down on it to change the tempo (like a knob), or double-click to type a number.
 * Lives outside RightPanel so dragging isn't broken by re-renders.
 */
const BpmBox: React.FC<{ bpm: number; onChange: (bpm: number) => void }> = ({ bpm, onChange }) => {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const drag = useRef<{ y: number; bpm: number } | null>(null);
  const commit = () => {
    const n = Number(text);
    if (text.trim() && Number.isFinite(n)) onChange(clampBpm(n));
    setEditing(false);
  };
  if (editing)
    return (
      <input
        autoFocus
        inputMode="numeric"
        value={text}
        onChange={(e) => setText(e.target.value.replace(/[^0-9]/g, '').slice(0, 3))}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') setEditing(false);
        }}
        onFocus={(e) => e.currentTarget.select()}
        aria-label="Type beats per minute"
        data-testid="bpm-input"
        className="h w-12 rounded-lg border border-brass2 bg-white px-1 py-1 text-center text-[14px]"
      />
    );
  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label="Beats per minute"
      aria-valuemin={BPM_MIN}
      aria-valuemax={BPM_MAX}
      aria-valuenow={bpm}
      title="Tempo: drag up or down, or double-click to type"
      data-testid="bpm"
      style={{ touchAction: 'none' }}
      className="h w-12 shrink-0 cursor-ns-resize select-none rounded-lg border border-line2 bg-white px-1 py-1 text-center text-[14px]"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { y: e.clientY, bpm };
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        // 1 BPM for every 3 pixels of drag
        const next = clampBpm(d.bpm + (d.y - e.clientY) / 3);
        if (next !== bpm) onChange(next);
      }}
      onPointerUp={() => (drag.current = null)}
      onPointerCancel={() => (drag.current = null)}
      onDoubleClick={() => {
        drag.current = null;
        setText(String(bpm));
        setEditing(true);
      }}
      onKeyDown={(e) => {
        if (e.key === 'ArrowUp' || e.key === 'ArrowRight') onChange(clampBpm(bpm + 1));
        if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') onChange(clampBpm(bpm - 1));
      }}
    >
      {bpm}
    </div>
  );
};

interface Props {
  engine: AudioEngine;
  soundId: string;
  states: Record<string, LoadState>;
  onSelect: (id: string) => void;
  /** A teacher's assignment set the sound: the list can't be changed. */
  soundLocked?: boolean;
  metro: Metro;
  onMetro: (m: Metro) => void;
  onOpenCustom: () => void;
}

const stateText: Record<LoadState, string> = { idle: '', loading: 'loading…', ready: '', error: 'could not load' };
const CATEGORIES = ['Grand Piano', 'Electric Piano', 'Soft Piano', 'Synth Keys'] as const;
const MIX_DEFAULT = { eq: 0, comp: 0, len: 1.8, color: 0.7, wet: 0.12 };

export const RightPanel: React.FC<Props> = ({ engine, soundId, states, onSelect, soundLocked, metro, onMetro, onOpenCustom }) => {
  const [mixOpen, setMixOpen] = useState(false);
  const [mix, setMix] = useState(MIX_DEFAULT);

  const applyMix = (next: typeof mix) => {
    setMix(next);
    engine.setEq(next.eq);
    engine.setComp(next.comp);
    engine.setReverb(next.len, next.color, next.wet);
  };

  return (
    <div className="flex flex-col gap-3" data-testid="right-panel">
      <div className="relative">
        <div className="mb-1 flex items-center justify-between">
          <div className="h text-[11px] uppercase text-muted">Sound{soundLocked ? ' · set by your teacher' : ''}</div>
          <button
            onClick={() => setMixOpen((v) => !v)}
            data-testid="mix-button"
            aria-expanded={mixOpen}
            aria-label="Mix (tone, squash, reverb)"
            title="Mix: tone, squash, reverb"
            className={`flex h-7 w-7 items-center justify-center rounded-md border ${mixOpen ? 'border-brass3 bg-brass text-brasstext' : 'border-transparent text-muted hover:border-line2 hover:bg-panel'}`}
          >
            <FadersIcon />
          </button>
        </div>
        {mixOpen && (
          // Floats over the sound list instead of pushing it down.
          <div className="card absolute inset-x-0 top-8 z-20 flex flex-col gap-2 p-3 shadow-lg" data-testid="mix-panel">
            <Slider label="Tone (EQ)" def={MIX_DEFAULT.eq} value={mix.eq} min={-1} max={1} step={0.05} left="Darker" right="Brighter" onChange={(v) => applyMix({ ...mix, eq: v })} />
            <Slider label="Squash (compressor)" def={MIX_DEFAULT.comp} value={mix.comp} min={0} max={1} step={0.05} left="Off" right="Squashed" onChange={(v) => applyMix({ ...mix, comp: v })} />
            <div className="h text-[12px] text-brass3">Reverb</div>
            <Slider label="Length" def={MIX_DEFAULT.len} value={mix.len} min={0.3} max={6} step={0.1} onChange={(v) => applyMix({ ...mix, len: v })} />
            <Slider label="Color" def={MIX_DEFAULT.color} value={mix.color} min={0} max={1} step={0.05} left="Dark" right="Bright" onChange={(v) => applyMix({ ...mix, color: v })} />
            <Slider label="Mix" def={MIX_DEFAULT.wet} value={mix.wet} min={0} max={1} step={0.02} onChange={(v) => applyMix({ ...mix, wet: v })} />
          </div>
        )}
        {CATEGORIES.map((cat) => (
          <div key={cat} className="mb-1.5">
            {/* A category with one sound of the same name (Grand Piano, Soft Piano) doesn't need a heading. */}
            {!(SOUNDS.filter((s) => s.category === cat).length === 1 && SOUNDS.find((s) => s.category === cat)?.label === cat) && (
              <div className="h text-[12px] text-brass3">{cat}</div>
            )}
            {SOUNDS.filter((s) => s.category === cat).map((s) => {
              const st = states[s.id] ?? 'idle';
              const sel = s.id === soundId;
              return (
                <button
                  key={s.id}
                  data-testid={`sound-${s.id}`}
                  disabled={soundLocked && !sel}
                  onClick={() => (s.id === 'custom' ? onOpenCustom() : onSelect(s.id))}
                  className={`mt-0.5 flex w-full items-center justify-between rounded-lg border px-2 py-1.5 text-left text-[14px] ${sel ? 'border-brass2 bg-[#fbeecb]' : 'border-line bg-panel hover:bg-[#fff8ea]'} disabled:opacity-45 disabled:hover:bg-panel`}
                  title={s.note}
                >
                  <span className="font-semibold text-wal3">{s.label}</span>
                  <span className={`text-[11px] ${st === 'error' ? 'text-bad' : 'text-muted'}`}>{st === 'error' ? 'could not load (offline?)' : s.id === 'custom' ? 'Edit ›' : stateText[st]}</span>
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <div className="card p-2" data-testid="metronome">
        <div className="flex items-center gap-2">
          <MetronomeButton engine={engine} on={metro.on} onToggle={() => onMetro({ ...metro, on: !metro.on })} />
          <BpmBox bpm={metro.bpm} onChange={(bpm) => onMetro({ ...metro, bpm })} />
          <input type="range" min={BPM_MIN} max={BPM_MAX} step={1} value={metro.bpm} onChange={(e) => onMetro({ ...metro, bpm: Number(e.target.value) })} aria-label="Tempo slider" data-testid="bpm-slider" className="min-w-0 flex-1 accent-[#b8862c]" />
          {/* 0-150%, default 100%. Double-click goes back to 100%. */}
          <Knob
            value={metro.vol / METRO_VOL_MAX}
            onChange={(v) => onMetro({ ...metro, vol: Math.round(v * METRO_VOL_MAX * 100) / 100 })}
            onReset={() => onMetro({ ...metro, vol: 1 })}
            display={`${Math.round(metro.vol * 100)}%`}
            label="Metronome volume"
            size={30}
          />
        </div>
      </div>

      <details className="text-[12px] text-muted">
        <summary className="h cursor-pointer text-wal1">Sound credits</summary>
        <ul className="mt-1 list-disc pl-4">
          <li>Grand Piano and Soft Piano: Accurate-Salamander, from the Salamander Grand Piano by Alexander Holm (Yamaha C5), CC BY 3.0. A reduced copy is used here.</li>
          <li>Electric Piano: jRhodes3d (Rhodes Mark I) by Joshua Learman, CC BY-NC 4.0. A reduced copy is used here.</li>
          <li>Synth Keys use the SynthLab synth engine.</li>
          <li>Wood: “Wood 067” from ambientCG, CC0.</li>
          <li>PianoLab is a free, non-commercial classroom app.</li>
        </ul>
      </details>
    </div>
  );
};
