import React, { useState } from 'react';

/**
 * A quick walkthrough of the app (his request), shown on a first visit and from the "?" button in the top bar.
 * Five short cards. The only thing remembered is that it was seen (`pianolab:v1:welcomed`, never anything about the
 * student), so it doesn't pop up every class.
 */
const KEY = 'pianolab:v1:welcomed';

export function welcomeSeen(): boolean {
  try {
    return window.localStorage.getItem(KEY) === '1';
  } catch {
    return true; // storage blocked: don't nag every visit
  }
}
function markSeen() {
  try {
    window.localStorage.setItem(KEY, '1');
  } catch {
    /* storage blocked */
  }
}

const Chip: React.FC<{ children: React.ReactNode; on?: boolean }> = ({ children, on }) => (
  <span className={`h inline-block w-fit rounded-md px-2 py-0.5 text-[14px] ${on ? 'bg-brass text-brasstext' : 'bg-wal3 text-panel'}`}>{children}</span>
);

interface Card {
  title: string;
  body: React.ReactNode;
}

export const Welcome: React.FC<{ phone?: boolean; onClose: () => void }> = ({ phone, onClose }) => {
  const [i, setI] = useState(0);
  const cards: Card[] = [
    {
      title: 'Welcome to PianoLab',
      body: (
        <>
          <p>Learn piano by playing it: notes, chords, progressions, and then your own music.</p>
          {phone ? (
            <p>Tap the keys to play (slide your finger for a glissando). A USB or Bluetooth MIDI keyboard works too on Android.</p>
          ) : (
            <>
              <p>Plug in your MIDI keyboard and just play: PianoLab finds it by itself.</p>
              <p>
                No keyboard? Use the computer keys: <b>A S D F G H J K L</b> are white keys, <b>W E T Y U O P</b> are black keys, and <b>Z</b> / <b>X</b> move an octave. You can also click or tap the keys.
              </p>
            </>
          )}
        </>
      ),
    },
    {
      title: 'Every lesson has three parts',
      body: (
        <>
          <p className="grid grid-cols-[96px_1fr] items-baseline gap-2">
            <Chip on>Learn</Chip>
            <span>walks you through it, one step at a time.</span>
          </p>
          <p className="grid grid-cols-[96px_1fr] items-baseline gap-2">
            <Chip>Practice</Chip>
            <span>lets you play around, with chord names and the chord strip.</span>
          </p>
          <p className="grid grid-cols-[96px_1fr] items-baseline gap-2">
            <Chip>Challenges</Chip>
            <span>are the graded levels. 80% passes. A second try on a question still earns half.</span>
          </p>
          <p>{phone ? 'Pick a lesson with the menu button at the top left (“Lesson 1 ▾”).' : 'Pick a lesson with the numbers at the top left.'}</p>
        </>
      ),
    },
    {
      title: 'Playing in time',
      body: (
        <>
          <p>Some Challenges are timed: notes fall toward the keys and you play them on the beat.</p>
          <p>
            Do the <b>latency check</b> first ({phone ? 'in the ⋯ menu' : 'the Latency button at the top right'}). It measures your keyboard and speakers so the timing is fair. It takes about 20 seconds.
          </p>
        </>
      ),
    },
    {
      title: 'Make your own music',
      body: (
        <>
          <p className="grid grid-cols-[96px_1fr] items-baseline gap-2">
            <Chip>Sandbox</Chip>
            <span>records everything you play. Scroll back, play it back, or import a MIDI file.</span>
          </p>
          <p className="grid grid-cols-[96px_1fr] items-baseline gap-2">
            <Chip>{phone ? 'Jam' : 'Jam Room'}</Chip>
            <span>plays a groove, a backing track or a YouTube video for you to play along with.</span>
          </p>
          <p>Press Save performance to keep what you played as a code, a link or a .mid file.</p>
        </>
      ),
    },
    {
      title: 'Turning in your work',
      body: (
        <>
          <p className="flex flex-wrap items-center gap-1.5">
            Go to <Chip>{phone ? 'Grade' : 'Grade Report'}</Chip>, type your name, and copy your code.
          </p>
          <p>Paste the code into the assignment in Google Classroom. That's it.</p>
          <p className="text-wal1">Your name lives only inside the code. PianoLab never saves it, and your work stays on this computer until you turn it in.</p>
        </>
      ),
    },
  ];
  const close = () => {
    markSeen();
    onClose();
  };
  const last = i === cards.length - 1;
  const card = cards[i];
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 p-3" role="dialog" aria-modal="true" aria-label="Welcome to PianoLab" data-testid="welcome">
      <div className={`card flex w-full max-w-lg flex-col shadow-xl ${phone ? 'max-h-[94vh]' : ''}`}>
        <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
          <h2 className="h text-[21px] text-wal3" data-testid="welcome-title">
            {card.title}
          </h2>
          <button className="btn px-2.5 py-1 text-[13px]" onClick={close} data-testid="welcome-skip">
            {last ? 'Close' : 'Skip'}
          </button>
        </div>
        <div className={`flex flex-col gap-2.5 overflow-auto px-4 py-3 text-[15px] leading-snug text-wal2 ${phone ? '' : 'min-h-[190px]'}`}>{card.body}</div>
        <div className="flex items-center justify-between gap-2 border-t border-line px-4 py-2.5">
          <div className="flex gap-1.5" aria-label={`Card ${i + 1} of ${cards.length}`}>
            {cards.map((_, k) => (
              <button key={k} aria-label={`Card ${k + 1}`} onClick={() => setI(k)} className={`h-2.5 w-2.5 rounded-full border border-brass2 ${k === i ? 'bg-brass' : 'bg-transparent'}`} />
            ))}
          </div>
          <div className="flex gap-2">
            {i > 0 && (
              <button className="btn px-3 py-1" onClick={() => setI(i - 1)}>
                Back
              </button>
            )}
            <button className="btn btn-brass px-4 py-1" onClick={() => (last ? close() : setI(i + 1))} data-testid="welcome-next">
              {last ? 'Start playing' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
