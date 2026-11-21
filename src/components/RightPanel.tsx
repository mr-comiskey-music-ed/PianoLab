import React, { useState } from 'react';
import { AudioEngine, LoadState, METRO_SOUNDS, MetroSound, SOUNDS } from '../audio/audioEngine';

interface Props {
  engine: AudioEngine;
  soundId: string;
  states: Record<string, LoadState>;
  onSelect: (id: string) => void;
  metro: { on: boolean; bpm: number; sound: MetroSound };
  onMetro: (m: { on: boolean; bpm: number; sound: MetroSound }) => void;
}

const stateText: Record<LoadState, string> = { idle: '', loading: 'loading…', ready: '', error: 'could not load' };
const CATEGORIES = ['Grand Piano', 'Electric Piano', 'Felt Piano', 'Synth Keys'] as const;

export const RightPanel: React.FC<Props> = ({ engine, soundId, states, onSelect, metro, onMetro }) => {
  const [mixOpen, setMixOpen] = useState(false);
  const [mix, setMix] = useState({ eq: 0, comp: 0, len: 1.8, color: 0.7, wet: 0.12 });

  const applyMix = (next: typeof mix) => {
    setMix(next);
    engine.setEq(next.eq);
    engine.setComp(next.comp);
    engine.setReverb(next.len, next.color, next.wet);
  };

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
                  onClick={() => onSelect(s.id)}
                  className={`mt-0.5 flex w-full items-center justify-between rounded-lg border px-2 py-1.5 text-left text-[14px] ${sel ? 'border-brass2 bg-[#fbeecb]' : 'border-line bg-panel hover:bg-[#fff8ea]'}`}
                  title={s.note}
                >
                  <span className="font-semibold text-wal3">{s.label}</span>
                  <span className={`text-[11px] ${st === 'error' ? 'text-bad' : 'text-muted'}`}>{st === 'error' ? 'could not load (offline?)' : stateText[st]}</span>
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

      <div className="card p-2.5">
        <label className="flex items-center justify-between text-[14px]">
          <span className="h text-wal3">Metronome</span>
          <input type="checkbox" checked={metro.on} onChange={(e) => onMetro({ ...metro, on: e.target.checked })} data-testid="metro" className="h-5 w-5 accent-[#b8862c]" />
        </label>
        <label className="mt-1 block text-[13px]">
          <span className="h text-wal3">Sound</span>
          <select
            value={metro.sound}
            onChange={(e) => onMetro({ ...metro, sound: e.target.value as MetroSound })}
            className="mt-0.5 w-full rounded-lg border border-line2 bg-white px-2 py-1 text-[14px]"
            data-testid="metro-sound"
          >
            {METRO_SOUNDS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <Slider label={`${metro.bpm} BPM`} value={metro.bpm} min={40} max={160} step={1} onChange={(v) => onMetro({ ...metro, bpm: v })} />
      </div>

      <div className="rounded-lg border-2 border-dashed border-line2 p-2.5" data-testid="compare">
        <div className="h text-[12px] uppercase text-muted">Compare versions</div>
        <div className="text-[11px] text-muted">For teacher testing only. This box goes away once a version is chosen for each category.</div>
        <div className="mt-1.5 flex flex-col gap-1">
          {SOUNDS.map((s) => (
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
