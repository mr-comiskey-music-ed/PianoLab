import React from 'react';

/**
 * A right hand seen from above, as it sits on the keys (fingers pointing up, thumb on the left), with the finger
 * numbers on the fingertips (thumb = 1, pinky = 5). The finger playing now lights up in brass; the next one gets a
 * dashed ring (Major scales Learn, his request).
 */
const FINGERS = [
  // base centre (hidden under the palm), length, width, tilt in degrees (negative leans left): thumb, index … pinky
  { bx: 50, by: 132, len: 54, w: 23, tilt: -50 },
  { bx: 58, by: 100, len: 74, w: 20, tilt: -7 },
  { bx: 81, by: 100, len: 86, w: 21, tilt: -1 },
  { bx: 104, by: 100, len: 80, w: 20, tilt: 5 },
  { bx: 125, by: 102, len: 62, w: 18, tilt: 12 },
];
const rad = (d: number) => (d * Math.PI) / 180;

/** A finger crossing between two notes of a scale: the thumb tucking under (going up) or a finger crossing over the
 *  thumb (coming down). Says which, for the label under the hand. */
export const crossing = (from: number | null | undefined, to: number | null | undefined): 'under' | 'over' | undefined =>
  from && to ? (to === 1 && from > 2 ? 'under' : from === 1 && to > 2 ? 'over' : undefined) : undefined;

export const HandDiagram: React.FC<{ finger: number | null; next?: number | null; tuck?: 'under' | 'over' | boolean; size?: number }> = ({ finger, next, tuck, size = 120 }) => (
  <div className="flex flex-col items-center gap-0.5" data-testid="hand" data-finger={finger ?? ''}>
    <svg viewBox="0 0 150 160" width={size * 0.94} height={size} aria-label={finger ? `Finger ${finger}` : 'Right hand fingers'}>
      <defs>
        <filter id="hand-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3.5" />
        </filter>
      </defs>
      {FINGERS.map((f, k) => {
        const on = k + 1 === finger;
        const tr = `rotate(${f.tilt} ${f.bx} ${f.by})`;
        return (
          <g key={k} transform={tr}>
            {on && <rect x={f.bx - f.w / 2 - 4} y={f.by - f.len - 4} width={f.w + 8} height={f.len + 8} rx={(f.w + 8) / 2} fill="#d9a441" opacity={0.7} filter="url(#hand-glow)" />}
            <rect x={f.bx - f.w / 2} y={f.by - f.len} width={f.w} height={f.len} rx={f.w / 2} fill={on ? '#d9a441' : '#f7f1e6'} stroke={on ? '#8f6620' : '#a8987f'} strokeWidth={1.5} />
          </g>
        );
      })}
      {/* the palm, over the finger bases */}
      <path d="M 44 96 Q 46 86 58 86 L 128 88 Q 141 89 140 102 L 137 138 Q 135 156 118 156 L 70 156 Q 52 156 46 140 Z" fill="#efe6d8" stroke="#a8987f" strokeWidth={1.5} />
      {/* numbers on the fingertips (drawn upright) */}
      {FINGERS.map((f, k) => {
        const n = k + 1;
        const on = n === finger;
        const d = f.len - f.w / 2 - 1;
        const x = f.bx + Math.sin(rad(f.tilt)) * d;
        const y = f.by - Math.cos(rad(f.tilt)) * d;
        return (
          <g key={n}>
            {n === next && !on && <circle cx={x} cy={y} r={f.w / 2 + 3} fill="none" stroke="#b8862c" strokeWidth={1.6} strokeDasharray="3 2.5" />}
            <text x={x} y={y + 5.5} textAnchor="middle" fontFamily="'Barlow Semi Condensed', sans-serif" fontWeight={700} fontSize={16} fill={on ? '#2a1e08' : '#4d3f31'}>
              {n}
            </text>
          </g>
        );
      })}
    </svg>
    <span className="h text-[12px] leading-none text-muted">{tuck === 'over' ? `${finger} over the thumb!` : tuck ? 'Thumb under!' : 'Right hand'}</span>
  </div>
);
