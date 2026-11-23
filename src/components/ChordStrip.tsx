import React from 'react';
import { Detected, KEYS, KeyDef, chordName, diatonic } from '../utils/chords';

export { textOn } from '../utils/colors';
import { textOn } from '../utils/colors';

/**
 * The chord strip (SPEC section 14): the key's seven chords in scale-degree colours, with Roman numerals. Click one (or
 * press 1-7) to hear it; one chord sounds at a time. The chord you are playing lights up.
 */
export const ChordStrip: React.FC<{
  keyDef: KeyDef;
  onKey: (id: string) => void;
  active: Detected | null;
  /** The strip chord sounding right now (clicked or 1-7). */
  playing: number | null;
  onPlay: (degree: number) => void;
  onRelease: (degree: number) => void;
}> = ({ keyDef, onKey, active, playing, onPlay, onRelease }) => (
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
    <StripChips keyDef={keyDef} lit={(d) => playing === d || (!!active && diatonic(keyDef)[d].chord.root === active.chord.root && diatonic(keyDef)[d].chord.quality === active.chord.quality)} onPlay={onPlay} onRelease={onRelease} />
  </div>
);

/** The seven coloured chord buttons of a key (used by the chord strip, and on the Stage in Learn). */
export const StripChips: React.FC<{
  keyDef: KeyDef;
  lit: (degree: number) => boolean;
  /** Press: the chord starts. Release (or slide off): it stops. */
  onPlay?: (degree: number) => void;
  onRelease?: (degree: number) => void;
  testid?: string;
}> = ({ keyDef, lit, onPlay, onRelease, testid }) => (
  <div className="flex min-w-0 flex-1 gap-1" data-testid={testid}>
    {diatonic(keyDef).map((d) => {
      const on = lit(d.degree);
      return (
        <button
          key={d.degree}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            onPlay?.(d.degree);
          }}
          onPointerUp={() => onRelease?.(d.degree)}
          onPointerCancel={() => onRelease?.(d.degree)}
          onLostPointerCapture={() => onRelease?.(d.degree)}
          data-testid={`strip-${d.degree}`}
          data-on={on ? 'yes' : undefined}
          title={`${chordName(d.chord)} (${d.numeral}). Hold to hear it${onRelease ? ` (or hold ${d.degree + 1})` : ''}.`}
          className={`h relative flex min-w-0 flex-1 flex-col items-center rounded-md px-1 py-0.5 leading-tight transition-transform ${on ? 'scale-105 ring-2 ring-panel' : 'opacity-90 hover:opacity-100'}`}
          style={{ background: d.color, color: textOn(d.color) }}
        >
          <span className="absolute left-1 top-0.5 text-[9px] opacity-60">{d.degree + 1}</span>
          <span className="truncate text-[15px]">{chordName(d.chord)}</span>
          <span className="truncate text-[12px] opacity-90">{d.numeral}</span>
        </button>
      );
    })}
  </div>
);
