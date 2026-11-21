import React, { useState } from 'react';
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

/** Metronome volume goes up to 200% (1 = 100%, the default). */
export const METRO_VOL_MAX = 2;

/** Mixer faders: opens the Mix panel. */
const FadersIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <path d="M6 3v18M12 3v18M18 3v18" strokeWidth="1.4" opacity="0.6" />
    <rect x="3.5" y="13" width="5" height="3" rx="1" fill="currentColor" stroke="none" />
    <rect x="9.5" y="6" width="5" height="3" rx="1" fill="currentColor" stroke="none" />
    <rect x="15.5" y="10" width="5" height="3" rx="1" fill="currentColor" stroke="none" />
  </svg>
);

/** Metronome (from SVG Repo, recoloured to follow the button's text colour). */
const MetronomeIcon = () => (
  <svg viewBox="0 0 314 314" width="22" height="22" fill="currentColor" stroke="currentColor" strokeWidth="4.71" aria-hidden="true">
    <path d="M281.853,46.631c-0.39-2.035-1.66-3.794-3.47-4.802l-11.257-6.271l5.297-9.511c1.881-3.378,0.668-7.641-2.709-9.521 c-3.38-1.881-7.641-0.667-9.521,2.709l-5.297,9.511l-11.257-6.269c-1.81-1.008-3.975-1.162-5.908-0.422 c-1.936,0.74-3.442,2.3-4.117,4.259l-13.806,40.109c-1.103,3.207,0.25,6.743,3.213,8.394l4.741,2.642l-23.115,41.501L184.592,17.11 C182.703,7.516,173.563,0,163.783,0h-56.052c-9.778,0-18.918,7.516-20.809,17.11L46.102,224.425 c-0.002,0.012-0.004,0.023-0.006,0.035l-13.729,69.725c-0.998,5.067,0.205,10.132,3.3,13.895C38.76,311.842,43.496,314,48.66,314 h174.195c5.163,0,9.898-2.158,12.993-5.92c3.095-3.763,4.298-8.827,3.301-13.896l-13.732-69.741 c-0.001-0.002-0.001-0.004-0.001-0.004l-16.584-84.225l31.16-55.944l4.742,2.642c1.072,0.598,2.243,0.885,3.402,0.885 c2.046,0,4.056-0.896,5.425-2.571l26.836-32.853C281.708,50.769,282.241,48.665,281.853,46.631z M100.659,19.816 c0.6-3.044,3.971-5.816,7.072-5.816h56.052c3.103,0,6.473,2.771,7.072,5.815l23.249,118.069L164,191.933 c-6.17-2.645-13.121-4.627-21.242-5.363v-14.92h10.96c3.866,0,7-3.134,7-7s-3.134-7-7-7h-10.96v-41.211h10.96c3.866,0,7-3.134,7-7 c0-3.866-3.134-7-7-7h-10.96v-41.21h10.96c3.866,0,7-3.134,7-7s-3.134-7-7-7h-10.96V34.938c0-3.866-3.134-7-7-7 c-3.866,0-7,3.134-7,7v12.291h-10.96c-3.866,0-7,3.134-7,7s3.134,7,7,7h10.96v41.21h-10.96c-3.866,0-7,3.134-7,7 c0,3.866,3.134,7,7,7h10.96v41.211h-10.96c-3.866,0-7,3.134-7,7s3.134,7,7,7h10.96v14.92c-19.447,1.763-32.189,10.688-43.564,18.666 c-7.894,5.536-14.975,10.493-23.52,12.573L100.659,19.816z M225.036,299.188c-0.432,0.523-1.206,0.813-2.181,0.813H48.66 c-0.976,0-1.75-0.289-2.181-0.814c-0.432-0.524-0.565-1.34-0.377-2.297l12.675-64.372c14.147-1.593,24.455-8.807,34.455-15.82 c12.059-8.457,23.448-16.444,42.525-16.444c19.077,0,30.466,7.987,42.524,16.444c10.001,7.014,20.308,14.228,34.456,15.82 l12.675,64.371C225.602,297.846,225.468,298.662,225.036,299.188z M209.842,217.809c-8.545-2.08-15.627-7.037-23.521-12.574 c-3.175-2.227-6.456-4.527-9.959-6.726l21.928-39.367L209.842,217.809z M246.427,71.829l-11.474-6.392l9.177-26.662l20.136,11.216 L246.427,71.829z" />
  </svg>
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
        <div className="mb-1 flex items-center justify-between">
          <div className="h text-[11px] uppercase text-muted">Sound</div>
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
          <div className="card mb-2 flex flex-col gap-2 p-3" data-testid="mix-panel">
            <Slider label="Tone (EQ)" value={mix.eq} min={-1} max={1} step={0.05} left="Darker" right="Brighter" onChange={(v) => applyMix({ ...mix, eq: v })} />
            <Slider label="Squash (compressor)" value={mix.comp} min={0} max={1} step={0.05} left="Off" right="Squashed" onChange={(v) => applyMix({ ...mix, comp: v })} />
            <div className="h text-[12px] text-brass3">Reverb</div>
            <Slider label="Length" value={mix.len} min={0.3} max={6} step={0.1} onChange={(v) => applyMix({ ...mix, len: v })} />
            <Slider label="Color" value={mix.color} min={0} max={1} step={0.05} left="Dark" right="Bright" onChange={(v) => applyMix({ ...mix, color: v })} />
            <Slider label="Mix" value={mix.wet} min={0} max={1} step={0.02} onChange={(v) => applyMix({ ...mix, wet: v })} />
          </div>
        )}
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
            <MetronomeIcon />
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
          {/* 0-200%, 100% in the middle (straight up). Double-click goes back to 100%. */}
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
