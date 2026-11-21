import React, { useEffect, useState } from 'react';

export type SaveStatus = 'idle' | 'saved' | 'failed';

/** Small pop-up near the top bar: appears for a few seconds after each save. "Not saving" stays until resolved. */
export const SaveIndicator: React.FC<{ status: SaveStatus; savedAt: number | null }> = ({ status, savedAt }) => {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (status !== 'saved' || !savedAt) return;
    setShow(true);
    const t = window.setTimeout(() => setShow(false), 4000);
    return () => window.clearTimeout(t);
  }, [status, savedAt]);
  if (status === 'failed')
    return (
      <span className="h rounded-md border border-brass2 bg-wal3 px-2 py-1 text-[12px] text-brass" title="This browser is blocking saving. Make a code with Get my code so you don't lose your work.">
        ⚠ Not saving
      </span>
    );
  if (status !== 'saved' || !show) return null;
  const time = savedAt ? new Date(savedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';
  return (
    <span className="h rounded-md border border-wal1 bg-wal3 px-2 py-1 text-[12px] text-line" title="Your work is saved in this browser on this computer. You still turn in your code.">
      ✓ Saved {time}
    </span>
  );
};

/** Shown on load when this browser has saved work from an earlier visit. */
export const RestorePrompt: React.FC<{ savedAt: number; onRestore: () => void; onStartFresh: () => void }> = ({ savedAt, onRestore, onStartFresh }) => {
  const when = new Date(savedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true">
      <div className="card w-full max-w-sm p-5 shadow-xl">
        <h2 className="h text-[20px] text-wal3">Restore your last session?</h2>
        <p className="mt-2 text-[15px] text-wal1">Your work from {when} is saved in this browser. Restore it to pick up where you left off, or start over.</p>
        <div className="mt-4 flex gap-2">
          <button className="btn btn-brass flex-1" onClick={onRestore} data-testid="restore">
            Restore
          </button>
          <button className="btn flex-1" onClick={onStartFresh} data-testid="start-fresh">
            Start Fresh
          </button>
        </div>
      </div>
    </div>
  );
};
