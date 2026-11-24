import React, { useRef } from 'react';
import { BLACK_NAMES, KEY_COUNT, isBlack, letterOf, octaveOf } from '../utils/music';
import { pitchColor, textOn } from '../utils/colors';

export type KeyMark = 'target' | 'ok' | 'bad';

interface Props {
  start: number;
  pressed: Set<number>;
  /** Keys that glow brass (a prompt, or a demo note). */
  lit?: Set<number>;
  /** Keys that show their label even when labels are off (a note the app is demoing). */
  forceLabel?: Set<number>;
  marks?: Map<number, KeyMark>;
  labels: 'off' | 'c' | 'all';
  /** Words to show on particular keys ("Root", "3rd", "5th"), whatever the note-name setting. */
  keyText?: Map<number, string>;
  /** Black keys get their names too (Lesson 4 on), when names are showing. */
  blackNames?: boolean;
  /** Jam Room Melody mode: the key's notes get a small brass dot. */
  tint?: Set<number>;
  /** Jam Room Key lock: notes outside the key are greyed (and silent). */
  dim?: Set<number>;
  onDown: (midi: number) => void;
  onUp: (midi: number) => void;
}

/** 25 keys, C to C. Mouse and multitouch both work: each finger is tracked by its own pointer id. */
export const Piano: React.FC<Props> = ({ start, pressed, lit, forceLabel, marks, labels, keyText, blackNames, tint, dim, onDown, onUp }) => {
  const held = useRef(new Map<number, number>()); // pointerId -> midi
  const keys = Array.from({ length: KEY_COUNT }, (_, i) => start + i);
  const whites = keys.filter((m) => !isBlack(m));
  const wW = 100 / whites.length;

  const press = (e: React.PointerEvent, midi: number) => {
    e.preventDefault();
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* some browsers can't capture; the key still works */
    }
    held.current.set(e.pointerId, midi);
    onDown(midi);
  };
  const release = (e: React.PointerEvent) => {
    const midi = held.current.get(e.pointerId);
    if (midi === undefined) return;
    held.current.delete(e.pointerId);
    onUp(midi);
  };

  const cls = (midi: number, black: boolean) => {
    const mark = marks?.get(midi);
    const on = pressed.has(midi);
    if (mark === 'ok') return black ? 'bg-[#5b8a3a]' : 'bg-[#cfe3b4]';
    if (mark === 'bad') return black ? 'bg-[#a3453f]' : 'bg-[#f0c4bf]';
    if (on) return black ? 'bg-brass3' : 'bg-[#f1d58f]';
    if (lit?.has(midi)) return (black ? 'bg-brass2' : 'bg-[linear-gradient(to_bottom,#fffaf0,#f6dea0)]') + ' lit';
    if (dim?.has(midi)) return black ? 'bg-[#5a4f44]' : 'bg-[#cfc5b5]';
    return black ? 'bg-ebony' : 'bg-[#fffaf0]';
  };

  const label = (midi: number) => {
    const forced = forceLabel?.has(midi) ?? false;
    if (isBlack(midi)) return blackNames && (labels === 'all' || forced) ? BLACK_NAMES[((midi % 12) + 12) % 12] : null;
    const isC = letterOf(midi) === 'C';
    if (!forced && (labels === 'off' || (labels === 'c' && !isC))) return null;
    return isC ? `C${octaveOf(midi)}` : letterOf(midi);
  };

  let wi = -1;
  return (
    <div className="relative w-full h-full select-none" style={{ touchAction: 'none' }} data-testid="piano">
      {keys.map((midi) => {
        const black = isBlack(midi);
        if (!black) wi++;
        const left = black ? (wi + 1) * wW - wW * 0.3 : wi * wW;
        const tag = keyText?.get(midi);
        const txt = label(midi);
        return (
          <div
            key={midi}
            role="button"
            aria-label={`${letterOf(midi)}${octaveOf(midi)}`}
            data-midi={midi}
            onPointerDown={(e) => press(e, midi)}
            onPointerUp={release}
            onPointerCancel={release}
            className={`absolute top-0 ${black ? 'h-[62%] z-10 rounded-b-md shadow-[0_3px_4px_rgba(0,0,0,0.5)]' : 'h-full rounded-b-lg border border-line2'} ${cls(midi, black)} transition-colors duration-75`}
            style={{ left: `${left}%`, width: `${black ? wW * 0.6 : wW}%` }}
          >
            {tint?.has(midi) && (
              <span className={`pointer-events-none absolute left-1/2 h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-brass ${black ? 'top-2' : 'top-[38%]'}`} data-testid="key-tint" />
            )}
            {tag && (
              // A word on the key (Root / 3rd / 5th) in the note's colour (the same colours as the Sandbox's piano roll),
              // above where the note name goes.
              <span className={`pointer-events-none absolute left-0 right-0 flex justify-center ${black ? 'top-2' : 'bottom-8'}`}>
                <span
                  className={`h rounded-md px-1.5 py-0.5 shadow ${black ? 'text-[10px]' : 'text-[14px]'}`}
                  style={{ background: pitchColor(midi), color: textOn(pitchColor(midi)) }}
                  data-testid="key-tag"
                >
                  {tag}
                </span>
              </span>
            )}
            {txt && black && (
              // Both names, stacked: "C♯" over "D♭".
              <span className="h pointer-events-none absolute bottom-1.5 left-0 right-0 flex flex-col items-center text-[10px] leading-[1.15] text-line">
                {txt.split('/').map((t) => (
                  <span key={t}>{t}</span>
                ))}
              </span>
            )}
            {txt && !black && (
              <span className={`pointer-events-none absolute bottom-2 left-0 right-0 text-center h text-[13px] ${letterOf(midi) === 'C' ? 'text-brass3' : 'text-muted'}`}>
                {txt}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
};
