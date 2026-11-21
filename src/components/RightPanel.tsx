import React, { useState } from 'react';
import { AudioEngine, LoadState, MetroSound, SOUNDS } from '../audio/audioEngine';
import { Knob } from './Knob';

export interface Metro {
  on: boolean;
  bpm: number;
  sound: MetroSound;
  /** 0 to 1 */
  vol: number;
}

/**
 * A labelled slider. It lives OUTSIDE RightPanel on purpose: when it was defined inside, React rebuilt it on every change,
 * which dropped the mouse grab and made click-and-drag stop working.
 */
const Slider: React.FC<{ label: string; value: number; min: number; max: number; step: number; left?: string; right?: string; onChange: (v: number) => void }> = ({ label, value, min, max, step, left, right, onChange }) => (
  <label className="block text-[13px]">
    <span className="h text-wal3">{label}</span>
    <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-[#b8862c]" />
    {(left || right) && (
      <span className="flex justify-between text-[11px] text-muted">
        <span>{left}</span>
        <span>{right}</span>
      </span>
    )}
  </label>
);

interface Props {
  engine: AudioEngine;
  soundId: string;
  states: Record<string, LoadState>;
  onSelect: (id: string) => void;
  metro: Metro;
  onMetro: (m: Metro) => void;
  onOpenCustom: () => void;
}

const stateText: Record<LoadState, string> = { idle: '', loading: 'loading…', ready: '', error: 'could not load' };
const CATEGORIES = ['Grand Piano', 'Electric Piano', 'Felt Piano', 'Synth Keys'] as const;

export const RightPanel: React.FC<Props> = ({ engine, soundId, states, onSelect, metro, onMetro, onOpenCustom }) => {
  const [mixOpen, setMixOpen] = useState(false);
  const [mix, setMix] = useState({ eq: 0, comp: 0, len: 1.8, color: 0.7, wet: 0.12 });

  const applyMix = (next: typeof mix) => {
    setMix(next);
    engine.setEq(next.eq);
    engine.setComp(next.comp);
    engine.setReverb(next.len, next.color, next.wet);
  };

  return (
    <div className="flex flex-col gap-3" data-testid="right-panel">
      <div>
        <div className="h mb-1 text-[11px] uppercase text-muted">Sound</div>
        {CATEGORIES.map((cat) => (
          <div key={cat} className="mb-1.5">
            <div className="h text-[12px] text-brass3">{cat}</div>
            {SOUNDS.filter((s) => s.category === cat).map((s) => {
              const st = states[s.id] ?? 'idle';
              const sel = s.id === soundId;
              return (
                <button
                  key={s.id}
                  data-testid={`sound-${s.id}`}
                  onClick={() => (s.id === 'custom' ? onOpenCustom() : onSelect(s.id))}
                  className={`mt-0.5 flex w-full items-center justify-between rounded-lg border px-2 py-1.5 text-left text-[14px] ${sel ? 'border-brass2 bg-[#fbeecb]' : 'border-line bg-panel hover:bg-[#fff8ea]'}`}
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

      <div className="relative">
        <button className="btn btn-dark w-full" onClick={() => setMixOpen((v) => !v)} data-testid="mix-button" aria-expanded={mixOpen}>
          Mix {mixOpen ? '▴' : '▾'}
        </button>
        {mixOpen && (
          <div className="card mt-1.5 flex flex-col gap-2 p-3" data-testid="mix-panel">
            <Slider label="Tone (EQ)" value={mix.eq} min={-1} max={1} step={0.05} left="Darker" right="Brighter" onChange={(v) => applyMix({ ...mix, eq: v })} />
            <Slider label="Squash (compressor)" value={mix.comp} min={0} max={1} step={0.05} left="Off" right="Squashed" onChange={(v) => applyMix({ ...mix, comp: v })} />
            <div className="h text-[12px] text-brass3">Reverb</div>
            <Slider label="Length" value={mix.len} min={0.3} max={6} step={0.1} onChange={(v) => applyMix({ ...mix, len: v })} />
            <Slider label="Color" value={mix.color} min={0} max={1} step={0.05} left="Dark" right="Bright" onChange={(v) => applyMix({ ...mix, color: v })} />
            <Slider label="Mix" value={mix.wet} min={0} max={1} step={0.02} onChange={(v) => applyMix({ ...mix, wet: v })} />
          </div>
        )}
      </div>

      <div className="card p-2" data-testid="metronome">
        <div className="flex items-center gap-2">
          <button
            onClick={() => onMetro({ ...metro, on: !metro.on })}
            data-testid="metro"
            aria-pressed={metro.on}
            aria-label={metro.on ? 'Metronome on. Tap to turn off' : 'Metronome off. Tap to turn on'}
            title="Metronome on/off"
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${metro.on ? 'border-brass3 bg-brass text-brasstext' : 'border-line2 bg-panel text-wal1 hover:bg-[#fff8ea]'}`}
          >
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M8 21 10.2 4h3.6L16 21Z" />
              <path d="M7 21h10" />
              <path d="M12 17 15.5 7" />
              <circle cx="14.6" cy="9.4" r="1.2" fill="currentColor" />
            </svg>
          </button>
          <input
            type="number"
            min={40}
            max={160}
            value={metro.bpm}
            onChange={(e) => onMetro({ ...metro, bpm: Math.max(40, Math.min(160, Math.round(Number(e.target.value) || 80))) })}
            aria-label="Beats per minute"
            data-testid="bpm"
            className="h w-14 rounded-lg border border-line2 bg-white px-1 py-1 text-center text-[14px]"
          />
          <input type="range" min={40} max={160} step={1} value={metro.bpm} onChange={(e) => onMetro({ ...metro, bpm: Number(e.target.value) })} aria-label="Tempo slider" data-testid="bpm-slider" className="min-w-0 flex-1 accent-[#b8862c]" />
          <Knob value={metro.vol} onChange={(v) => onMetro({ ...metro, vol: v })} label="Metronome volume" size={30} />
        </div>
      </div>

      <div className="rounded-lg border-2 border-dashed border-line2 p-2.5" data-testid="compare">
        <div className="h text-[12px] uppercase text-muted">Compare versions</div>
        <div className="text-[11px] text-muted">For teacher testing only. This box goes away once a version is chosen for each category.</div>
        <div className="mt-1.5 flex flex-col gap-1">
          {SOUNDS.filter((s) => s.id !== 'custom').map((s) => (
            <button
              key={s.id}
              className="btn text-left text-[13px]"
              onClick={async () => {
                onSelect(s.id);
                await engine.unlock();
                // A little C major chord then a short run, so versions are easy to compare back to back.
                window.setTimeout(() => void engine.playDemo([60, 64, 67, 72, 67, 64, 60], 260), 250);
              }}
            >
              ▶ {s.label}
            </button>
          ))}
        </div>
      </div>
      <details className="text-[12px] text-muted">
        <summary className="h cursor-pointer text-wal1">Sound credits</summary>
        <ul className="mt-1 list-disc pl-4">
          <li>Salamander Grand Piano by Alexander Holm (Yamaha C5), CC-BY 3.0.</li>
          <li>jRhodes3d (Rhodes Mark I) by Joshua Learman, CC BY-NC 4.0. A reduced copy is used here.</li>
          <li>Synth Keys use the SynthLab synth engine.</li>
          <li>PianoLab is a free, non-commercial classroom app.</li>
        </ul>
      </details>
    </div>
  );
};
