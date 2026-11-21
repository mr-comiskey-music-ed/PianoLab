import React, { useRef } from 'react';

/** A small volume knob. Drag up/down (or left/right) to turn it, or use the arrow keys. Value is 0 to 1. */
export const Knob: React.FC<{ value: number; onChange: (v: number) => void; label: string; size?: number }> = ({ value, onChange, label, size = 34 }) => {
  const drag = useRef<{ y: number; x: number; v: number } | null>(null);
  const angle = -135 + value * 270;
  const clamp = (v: number) => Math.max(0, Math.min(1, v));
  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value * 100)}
      title={`${label}: ${Math.round(value * 100)}%`}
      data-testid="knob"
      style={{ width: size, height: size, touchAction: 'none' }}
      className="relative shrink-0 cursor-ns-resize rounded-full border border-brass3 bg-[radial-gradient(circle_at_35%_30%,#4d3f31,#2a2118)] shadow-[0_2px_3px_rgba(0,0,0,0.4)]"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { y: e.clientY, x: e.clientX, v: value };
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        // 150 px of drag = the whole range
        onChange(clamp(d.v + ((d.y - e.clientY) + (e.clientX - d.x)) / 150));
      }}
      onPointerUp={() => (drag.current = null)}
      onPointerCancel={() => (drag.current = null)}
      onKeyDown={(e) => {
        if (e.key === 'ArrowUp' || e.key === 'ArrowRight') onChange(clamp(value + 0.05));
        if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') onChange(clamp(value - 0.05));
      }}
    >
      <div className="absolute left-1/2 top-1/2 h-[42%] w-[2px] origin-bottom rounded bg-brass" style={{ transform: `translate(-50%, -100%) rotate(${angle}deg)`, transformOrigin: '50% 100%' }} />
    </div>
  );
};
