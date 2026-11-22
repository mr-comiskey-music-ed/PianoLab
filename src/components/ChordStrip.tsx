import React from 'react';
import { Detected, KEYS, KeyDef, chordName, diatonic } from '../utils/chords';

/** Dark text on the light colours (yellow, lime, orange), light text on the rest. */
const textOn = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  const lum = 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return lum > 150 ? '#2a1e08' : '#fff8ea';
};

/**
 * The chord strip (SPEC section 14): the key's seven chords in scale-degree colours. Click one to hear it. The chord you
 * are playing lights up. Roman numerals and Home/Away/Tension show when `numerals` is on (Lesson 3 on; a toggle here).
 */
export const ChordStrip: React.FC<{
  keyDef: KeyDef;
  onKey: (id: string) => void;
  numerals: boolean;
  onNumerals: (v: boolean) => void;
  active: Detected | null;
  onPlay: (degree: number) => void;
}> = ({ keyDef, onKey, numerals, onNumerals, active, onPlay }) => (
  <div className="wood flex items-center gap-1.5 rounded-t-lg px-2 py-1.5" data-testid="chord-strip">
    <select
      value={keyDef.id}
      onChange={(e) => onKey(e.target.value)}
      aria-label="Key"
      title="Key"
      data-testid="strip-key"
      className="h shrink-0 rounded-md border border-wal1 bg-wal3 px-1.5 py-1 text-[13px] text-panel"
    >
      {KEYS.map((k) => (
        <option key={k.id} value={k.id}>
          {k.label}
        </option>
      ))}
    </select>
    <div className="flex min-w-0 flex-1 gap-1">
      {diatonic(keyDef).map((d) => {
        const on = !!active && active.chord.root === d.chord.root && active.chord.quality === d.chord.quality;
        return (
          <button
            key={d.degree}
            onClick={() => onPlay(d.degree)}
            data-testid={`strip-${d.degree}`}
            title={`${chordName(d.chord)}${numerals ? ` · ${d.numeral} · ${d.fn}` : ''}. Click to hear it.`}
            className={`h flex min-w-0 flex-1 flex-col items-center rounded-md px-1 py-0.5 leading-tight transition-transform ${on ? 'scale-105 ring-2 ring-panel' : 'opacity-90 hover:opacity-100'}`}
            style={{ background: d.color, color: textOn(d.color) }}
          >
            <span className="truncate text-[15px]">{chordName(d.chord)}</span>
            {numerals && (
              <span className="truncate text-[11px] opacity-90">
                {d.numeral} · {d.fn}
              </span>
            )}
          </button>
        );
      })}
    </div>
    <label className="h flex shrink-0 cursor-pointer items-center gap-1 text-[12px] text-line" title="Show Roman numerals and Home / Away / Tension">
      <input type="checkbox" checked={numerals} onChange={(e) => onNumerals(e.target.checked)} data-testid="strip-numerals" className="accent-[#d9a441]" />
      Numerals
    </label>
  </div>
);
