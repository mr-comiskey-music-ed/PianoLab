import React from 'react';

/**
 * Stage layouts that work on phones too. On a Chromebook a Stage screen is one centred column. On a phone held sideways
 * the Stage is a short, wide strip, so the same parts sit side by side in columns (`Col`) instead of being shrunk
 * (his call: "spread out horizontally").
 */
export const StageBox: React.FC<{ phone?: boolean; className?: string; testid?: string; children: React.ReactNode }> = ({ phone, className = '', testid, children }) => (
  <div
    className={phone ? `flex h-full flex-row items-center justify-center gap-6 overflow-hidden px-4 text-center ${className}` : `flex h-full flex-col items-center justify-center text-center ${className}`}
    data-testid={testid}
  >
    {children}
  </div>
);

/** One column of a Stage screen on a phone; on a Chromebook its parts simply stack with the rest. */
export const Col: React.FC<{ phone?: boolean; className?: string; children: React.ReactNode }> = ({ phone, className = '', children }) =>
  // Centred with auto margins (not justify-center), so a column taller than the short phone Stage scrolls from its top
  // instead of losing its first lines above the edge.
  phone ? (
    <div className={`flex max-h-full min-w-0 flex-col items-center gap-1.5 overflow-y-auto [&>:first-child]:mt-auto [&>:last-child]:mb-auto ${className}`}>{children}</div>
  ) : (
    <>{children}</>
  );
