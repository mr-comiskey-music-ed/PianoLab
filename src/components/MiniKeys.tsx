import React from 'react';
import { isBlack } from '../utils/music';

/**
 * A small keyboard (the 25 keys on screen) with some keys filled in: the chord shape helper on timed levels (SPEC
 * section 5, "chord chart toggle"). `color` fills the keys; `faint` draws them lighter (the next chord).
 */
export const MiniKeys: React.FC<{ start: number; keys: number[]; color: string; faint?: boolean; label: string; testid?: string }> = ({ start, keys, color, faint, label, testid }) => {
  const notes = Array.from({ length: 25 }, (_, i) => start + i);
  const whites = notes.filter((n) => !isBlack(n));
  const W = 14; // white key width (px)
  const on = new Set(keys);
  return (
    <div className={`flex flex-col items-start gap-0.5 ${faint ? 'opacity-70' : ''}`} data-testid={testid}>
      <span className="h text-[11px] uppercase tracking-wider text-brass">{label}</span>
      <div className="relative h-[44px] rounded-sm bg-[#140f0a] p-[2px]" style={{ width: whites.length * W + 4 }}>
        {whites.map((n, i) => (
          <div key={n} className="absolute bottom-[2px] top-[2px] rounded-b-[2px] border-r border-[#c4b49b]" style={{ left: 2 + i * W, width: W, background: on.has(n) ? color : '#fbf6ec' }} />
        ))}
        {notes.filter(isBlack).map((n) => {
          const i = whites.filter((w) => w < n).length;
          return <div key={n} className="absolute top-[2px] h-[25px] rounded-b-[2px]" style={{ left: 2 + i * W - 4.5, width: 9, background: on.has(n) ? color : '#2a2118', outline: on.has(n) ? '1px solid #140f0a' : undefined }} />;
        })}
      </div>
    </div>
  );
};
