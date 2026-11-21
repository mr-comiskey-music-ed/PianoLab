import React, { useRef, useState } from 'react';

/**
 * A small knob. Drag up/down (or left/right) to turn it, or use the arrow keys. Double-click resets (if onReset is given).
 * `value` is the knob position, 0 to 1. `display` is the text shown on hover and in a bubble while dragging.
 */
export const Knob: React.FC<{ value: number; onChange: (v: number) => void; onReset?: () => void; label: string; display?: string; size?: number }> = ({
  value,
  onChange,
  onReset,
  label,
  display,
  size = 34,
}) => {
  const drag = useRef<{ y: number; x: number; v: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const angle = -135 + value * 270;
  const clamp = (v: number) => Math.max(0, Math.min(1, v));
  const shown = display ?? `${Math.round(value * 100)}%`;
  const end = () => {
    drag.current = null;
    setDragging(false);
  };
  return (
    <div className="relative shrink-0">
      <div
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(value * 100)}
        aria-valuetext={shown}
        title={`${label}: ${shown}${onReset ? ' (double-click to reset)' : ''}`}
        data-testid="knob"
        style={{ width: size, height: size, touchAction: 'none' }}
        className="relative cursor-ns-resize rounded-full border border-brass3 bg-[radial-gradient(circle_at_35%_30%,#4d3f31,#2a2118)] shadow-[0_2px_3px_rgba(0,0,0,0.4)]"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { y: e.clientY, x: e.clientX, v: value };
          setDragging(true);
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          // 150 px of drag = the whole range
          onChange(clamp(d.v + ((d.y - e.clientY) + (e.clientX - d.x)) / 150));
        }}
        onPointerUp={end}
        onPointerCancel={end}
        onDoubleClick={onReset}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp' || e.key === 'ArrowRight') onChange(clamp(value + 0.025));
          if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') onChange(clamp(value - 0.025));
        }}
      >
        <div className="absolute left-1/2 top-1/2 h-[42%] w-[2px] origin-bottom rounded bg-brass" style={{ transform: `translate(-50%, -100%) rotate(${angle}deg)`, transformOrigin: '50% 100%' }} />
      </div>
      {dragging && (
        <div className="h pointer-events-none absolute bottom-full left-1/2 mb-1 -translate-x-1/2 whitespace-nowrap rounded-md bg-wal3 px-1.5 py-0.5 text-[12px] text-brass shadow" data-testid="knob-value">
          {shown}
        </div>
      )}
    </div>
  );
};
