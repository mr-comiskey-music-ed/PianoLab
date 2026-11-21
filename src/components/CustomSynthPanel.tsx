import React, { useMemo, useState } from 'react';
import { AudioEngine } from '../audio/audioEngine';
import { MinilogueView } from '../synthlab/MinilogueView';
import { SynthParams } from '../types';
import { DEFAULT_SYNTH_PARAMS, SYNTH_KEYS_BRIGHT, SYNTH_KEYS_WARM } from '../data/defaults';
import { MAX_PRESETS, SavedPatch, deletePreset, listPresets, saveCurrentPatch, savePreset } from '../utils/synthPresets';

/**
 * Custom Synth: SynthLab's Modern Synth panel in a pop-up. It sits above the piano so students can keep playing (MIDI,
 * computer keys or the on-screen keys) while they turn knobs. Patches save to this browser only.
 */
export const CustomSynthPanel: React.FC<{ engine: AudioEngine; params: SynthParams; onParams: (p: SynthParams) => void; onClose: () => void }> = ({
  engine,
  params,
  onParams,
  onClose,
}) => {
  const synth = useMemo(() => engine.getSynthEngine(), [engine]);
  const [presets, setPresets] = useState<SavedPatch[]>(() => listPresets());
  const [name, setName] = useState('');
  const [msg, setMsg] = useState('');

  const set = (p: SynthParams) => {
    onParams(p);
    saveCurrentPatch(p);
  };
  const change = (key: keyof SynthParams, val: unknown) => set({ ...params, [key]: val } as SynthParams);

  const save = () => {
    if (!name.trim()) return setMsg('Give your sound a name first.');
    if (!savePreset(name, params)) return setMsg(presets.length >= MAX_PRESETS ? `You can keep up to ${MAX_PRESETS} sounds. Delete one first.` : 'This browser is not letting us save.');
    setPresets(listPresets());
    setMsg(`Saved “${name.trim()}”.`);
  };

  return (
    <div
      className="fixed inset-x-2 top-12 z-40 flex flex-col overflow-hidden rounded-xl border border-wal1 bg-[#0e1014] shadow-2xl"
      // Stop above the piano so it stays playable underneath.
      style={{ bottom: 'calc(clamp(150px, 24vh, 210px) + 14px)' }}
      role="dialog"
      aria-label="Custom Synth"
      data-testid="custom-synth"
    >
      <div className="wood flex flex-wrap items-center gap-2 px-3 py-2 text-panel">
        <span className="h text-[18px]">Custom Synth</span>
        <span className="h text-[12px] text-line2">Start from:</span>
        {(
          [
            ['Warm', SYNTH_KEYS_WARM],
            ['Bright', SYNTH_KEYS_BRIGHT],
            ['Plain saw', DEFAULT_SYNTH_PARAMS],
          ] as const
        ).map(([label, p]) => (
          <button key={label} className="btn btn-dark px-2 py-1 text-[12px]" onClick={() => set(p)}>
            {label}
          </button>
        ))}
        <span className="ml-auto flex items-center gap-1.5">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={40}
            placeholder="Name this sound"
            aria-label="Sound name"
            data-testid="preset-name"
            className="w-40 rounded-md border border-wal1 bg-panel px-2 py-1 text-[13px] text-wal3"
            onKeyDown={(e) => e.key === 'Enter' && save()}
          />
          <button className="btn btn-brass px-2 py-1 text-[13px]" onClick={save} data-testid="preset-save">
            Save
          </button>
          <button className="btn btn-dark px-2 py-1 text-[13px]" onClick={onClose} data-testid="custom-close">
            Close
          </button>
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 border-b border-wal2 bg-wal3 px-3 py-1.5 text-[12px] text-line2">
        <span className="h">My sounds:</span>
        {presets.length === 0 && <span className="text-line2/70">none yet. Saved sounds stay in this browser on this computer.</span>}
        {presets.map((p) => (
          <span key={p.id} className="flex items-center overflow-hidden rounded-md border border-wal1 bg-wal2">
            <button
              className="h px-2 py-0.5 text-panel hover:bg-wal1"
              onClick={() => {
                set(p.params);
                setName(p.name);
                setMsg(`Loaded “${p.name}”.`);
              }}
              data-testid={`preset-${p.name}`}
            >
              {p.name}
            </button>
            <button
              className="border-l border-wal1 px-1.5 text-line2 hover:bg-[#8a2f2a] hover:text-panel"
              aria-label={`Delete ${p.name}`}
              onClick={() => {
                if (!window.confirm(`Delete “${p.name}”?`)) return;
                deletePreset(p.id);
                setPresets(listPresets());
              }}
            >
              ×
            </button>
          </span>
        ))}
        {msg && <span className="ml-auto text-brass">{msg}</span>}
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3 text-slate-100">
        <MinilogueView params={params} engine={synth} onParamChange={change} highlightKey={null} />
      </div>
    </div>
  );
};
