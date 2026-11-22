import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AudioEngine } from '../audio/audioEngine';
import { MinilogueView } from '../synthlab/MinilogueView';
import { SynthParams } from '../types';
import { DEFAULT_SYNTH_PARAMS, SYNTH_KEYS_BRIGHT, SYNTH_KEYS_WARM, SYNTH_PAD } from '../data/defaults';
import { MAX_PRESETS, SavedPatch, deletePreset, listPresets, saveCurrentPatch, savePreset } from '../utils/synthPresets';

const STARTERS: [string, SynthParams][] = [
  ['Warm', SYNTH_KEYS_WARM],
  ['Bright', SYNTH_KEYS_BRIGHT],
  ['Pad', SYNTH_PAD],
  ['Plain saw', DEFAULT_SYNTH_PARAMS],
];

/** Never shrink the synth below this; past it, scrolling is better than unreadable knobs. */
const MIN_SCALE = 0.5;

/**
 * Custom Synth: SynthLab's Modern Synth panel in a pop-up. It sits above the piano so students can keep playing (MIDI,
 * computer keys or the on-screen keys) while they turn knobs. Patches save to this browser only.
 * The synth is shrunk to fit the space (no scrolling) on short screens.
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
  const [deleting, setDeleting] = useState<string | null>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [shownH, setShownH] = useState<number | undefined>(undefined);

  // Fit the synth to the box: find the biggest scale where it is not taller than the box. Narrower layouts are taller,
  // so we lay it out at (box width / scale) and shrink it back, which fills the width exactly.
  useLayoutEffect(() => {
    const area = areaRef.current;
    const head = headRef.current;
    const inner = innerRef.current;
    if (!area || !head || !inner) return;
    const fit = () => {
      // The space between the top bar and the piano, minus the pop-up's own header row.
      const W = area.clientWidth - 2;
      const H = area.clientHeight - head.offsetHeight - 2;
      const fits = (s: number) => {
        inner.style.width = `${W / s}px`;
        return inner.offsetHeight * s <= H;
      };
      let s = 1;
      if (!fits(1)) {
        let lo = MIN_SCALE;
        let hi = 1;
        for (let k = 0; k < 8; k++) {
          const mid = (lo + hi) / 2;
          if (fits(mid)) lo = mid;
          else hi = mid;
        }
        s = lo;
      }
      inner.style.width = `${W / s}px`;
      setScale(s);
      setShownH(inner.offsetHeight * s);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(area);
    // Fonts arriving late can change the height a little.
    const t = window.setTimeout(fit, 400);
    return () => {
      ro.disconnect();
      window.clearTimeout(t);
    };
  }, []);

  const set = (p: SynthParams) => {
    onParams(p);
    saveCurrentPatch(p);
  };
  const change = (key: keyof SynthParams, val: unknown) => set({ ...params, [key]: val } as SynthParams);

  const save = () => {
    if (!name.trim()) return setMsg('Name it first.');
    if (!savePreset(name, params)) return setMsg(presets.length >= MAX_PRESETS ? `Up to ${MAX_PRESETS} sounds. Delete one first.` : 'This browser is not letting us save.');
    setPresets(listPresets());
    setMsg(`Saved “${name.trim()}”.`);
  };

  return (
    // The fixed area runs from below the top bar to just above the piano; the pop-up inside is only as tall as it needs.
    <div
      ref={areaRef}
      className="pointer-events-none fixed inset-x-2 top-12 z-40 flex flex-col"
      style={{ bottom: 'calc(clamp(150px, 24vh, 210px) + 14px)' }}
    >
    <div
      className="pointer-events-auto flex max-h-full flex-col overflow-hidden rounded-xl border border-wal1 bg-[#0e1014] shadow-2xl"
      role="dialog"
      aria-label="Custom Synth"
      data-testid="custom-synth"
    >
      <div ref={headRef} className="wood flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-1.5 text-panel">
        <span className="h text-[17px]">Custom Synth</span>
        <span className="h ml-1 text-[12px] text-line2">Start from:</span>
        {STARTERS.map(([label, p]) => (
          <button key={label} className="btn btn-dark px-2 py-0.5 text-[12px]" onClick={() => set(p)} data-testid={`starter-${label}`}>
            {label}
          </button>
        ))}
        <span className="h ml-2 text-[12px] text-line2">My sounds:</span>
        {presets.length === 0 && <span className="text-[12px] text-line2/70">none yet</span>}
        {presets.map((p) => (
          <span key={p.id} className="flex items-center overflow-hidden rounded-md border border-wal1 bg-wal2 text-[12px]">
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
            {/* Two clicks to delete (no browser pop-up): × turns into a red "Delete?" for a few seconds. */}
            <button
              className={`border-l border-wal1 px-1.5 ${deleting === p.id ? 'bg-[#8a2f2a] text-panel' : 'text-line2 hover:bg-[#8a2f2a] hover:text-panel'}`}
              aria-label={deleting === p.id ? `Click again to delete ${p.name}` : `Delete ${p.name}`}
              data-testid={`preset-delete-${p.name}`}
              onClick={() => {
                if (deleting !== p.id) {
                  setDeleting(p.id);
                  window.setTimeout(() => setDeleting((d) => (d === p.id ? null : d)), 3000);
                  return;
                }
                setDeleting(null);
                deletePreset(p.id);
                setPresets(listPresets());
              }}
            >
              {deleting === p.id ? 'Delete?' : '×'}
            </button>
          </span>
        ))}
        <span className="ml-auto flex items-center gap-1.5">
          {msg && <span className="text-[12px] text-brass">{msg}</span>}
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={40}
            placeholder="Name this sound"
            aria-label="Sound name"
            title="Saved sounds stay in this browser on this computer."
            data-testid="preset-name"
            className="w-36 rounded-md border border-wal1 bg-panel px-2 py-0.5 text-[13px] text-wal3"
            onKeyDown={(e) => e.key === 'Enter' && save()}
          />
          <button className="btn btn-brass px-2 py-0.5 text-[13px]" onClick={save} data-testid="preset-save">
            Save
          </button>
          <button className="btn btn-dark px-2 py-0.5 text-[13px]" onClick={onClose} data-testid="custom-close">
            Close
          </button>
        </span>
      </div>
      <div className={`relative min-h-0 text-slate-100 ${scale <= MIN_SCALE ? 'overflow-y-auto' : 'overflow-hidden'}`} data-testid="synth-box">
        {/* The outer div takes the shrunk height, so scrolling (only on very small screens) matches what you see. */}
        <div style={{ height: shownH, overflow: 'hidden' }}>
          <div ref={innerRef} style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }}>
            <MinilogueView params={params} engine={synth} onParamChange={change} highlightKey={null} compact />
          </div>
        </div>
      </div>
    </div>
    </div>
  );
};
