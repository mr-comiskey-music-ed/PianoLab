import React, { useRef } from 'react';
import { KEY_COUNT, isBlack, letterOf, octaveOf } from '../utils/music';

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
  onDown: (midi: number) => void;
  onUp: (midi: number) => void;
}

/** 25 keys, C to C. Mouse and multitouch both work: each finger is tracked by its own pointer id. */
export const Piano: React.FC<Props> = ({ start, pressed, lit, forceLabel, marks, labels, onDown, onUp }) => {
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
    return black ? 'bg-ebony' : 'bg-[#fffaf0]';
  };

  const label = (midi: number) => {
    if (isBlack(midi)) return null;
    const isC = letterOf(midi) === 'C';
    const forced = forceLabel?.has(midi) ?? false;
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
            {txt && (
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
