/** Note helpers. Notes are MIDI numbers everywhere inside the app (60 = middle C = C4). */
export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
const BLACK = new Set([1, 3, 6, 8, 10]);

export const isBlack = (midi: number) => BLACK.has(((midi % 12) + 12) % 12);
export const letterOf = (midi: number) => NOTE_NAMES[((midi % 12) + 12) % 12];
export const octaveOf = (midi: number) => Math.floor(midi / 12) - 1;
/** "C4", "F#3". */
export const noteName = (midi: number) => `${letterOf(midi)}${octaveOf(midi)}`;
/** "C4" -> 60. Returns null if it isn't a note name. */
export function parseNote(name: string): number | null {
  const m = name.match(/^([A-G])(#?)(-?\d)$/);
  if (!m) return null;
  return NOTE_NAMES.indexOf((m[1] + m[2]) as (typeof NOTE_NAMES)[number]) + (Number(m[3]) + 1) * 12;
}

/** The 25-key default view: C3 to C5. */
export const DEFAULT_START = 48;
export const KEY_COUNT = 25;
export const MIN_START = 24; // C1
export const MAX_START = 84; // C6 (a 25-key view from C6 reaches C8)

/** Keep a view start on a C and inside the allowed range. */
export const clampStart = (start: number) => Math.max(MIN_START, Math.min(MAX_START, Math.round(start / 12) * 12));

/**
 * Slide the view so a note that arrives outside it becomes visible, by the fewest whole octaves from where it is now.
 * That matches a 25-key controller's own octave buttons (one octave per press), which send nothing the app can see:
 * the first note after a press tells us where the controller went.
 */
export function startFor(midi: number, current: number = DEFAULT_START): number {
  let s = current;
  if (midi >= s + KEY_COUNT) s += 12 * Math.ceil((midi - (s + KEY_COUNT - 1)) / 12);
  else if (midi < s) s -= 12 * Math.ceil((s - midi) / 12);
  return clampStart(s);
}

export const inView = (midi: number, start: number) => midi >= start && midi < start + KEY_COUNT;

/** GarageBand-style Musical Typing: A row = white keys, W row = black keys, from the view's lowest C. */
export const TYPING_MAP: Record<string, number> = {
  a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6, g: 7, y: 8, h: 9, u: 10, j: 11,
  k: 12, o: 13, l: 14, p: 15, ';': 16,
};
