import { KeyDef, keyById, pcName } from './chords';
import { pc } from './music';

/**
 * Major scales (Lesson 7): the whole/half step pattern, the notes from a starting key, right-hand fingering, and which
 * notes are sharp or flat in each key. One octave up, which always fits on the 25 keys on screen.
 */

/** Half steps above the tonic for the 8 notes of a major scale (W W H W W W H). */
export const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11, 12];
/** "W" or "H" for each step between the 8 notes. */
export const STEP_PATTERN = ['W', 'W', 'H', 'W', 'W', 'W', 'H'];

/** The 8 notes (MIDI) of the major scale starting on `startMidi`. */
export const scaleNotes = (startMidi: number) => MAJOR_SCALE.map((s) => startMidi + s);

/** Right-hand fingering going up (thumb = 1). Standard fingerings; the thumb tucks under where a 1 follows a 3 or 4. */
const RH_FINGERS: Record<string, number[]> = {
  C: [1, 2, 3, 1, 2, 3, 4, 5],
  G: [1, 2, 3, 1, 2, 3, 4, 5],
  D: [1, 2, 3, 1, 2, 3, 4, 5],
  A: [1, 2, 3, 1, 2, 3, 4, 5],
  E: [1, 2, 3, 1, 2, 3, 4, 5],
  B: [1, 2, 3, 1, 2, 3, 4, 5],
  F: [1, 2, 3, 4, 1, 2, 3, 4],
  'B♭': [4, 1, 2, 3, 1, 2, 3, 4],
  'E♭': [3, 1, 2, 3, 4, 1, 2, 3],
  'A♭': [3, 4, 1, 2, 3, 1, 2, 3],
};
export const fingering = (keyId: string) => RH_FINGERS[keyId] ?? RH_FINGERS.C;

/** The sharps or flats in a major key, spelled for the key ("F♯", "C♯"), in circle order. */
export function accidentals(k: KeyDef): string[] {
  const naturals = new Set([0, 2, 4, 5, 7, 9, 11]);
  const pcs = MAJOR_SCALE.slice(0, 7).map((s) => pc(k.tonic + s));
  const order = k.flats ? [10, 3, 8, 1, 6, 11, 4] : [6, 1, 8, 3, 10, 5, 0]; // B♭ E♭ A♭ D♭ G♭... / F♯ C♯ G♯ D♯ A♯...
  return order.filter((p) => pcs.includes(p) && !naturals.has(p)).map((p) => pcName(p, k.flats));
}

/** The major key a 5th above (sharps side) or below (flats side) on the circle of 5ths. */
export const fifthUp = (keyId: string) => keyById(pcName(pc(keyById(keyId).tonic + 7), [5, 10, 3, 8, 1].includes(pc(keyById(keyId).tonic + 7)))).id;
export const fifthDown = (keyId: string) => keyById(pcName(pc(keyById(keyId).tonic + 5), [5, 10, 3, 8, 1, 6].includes(pc(keyById(keyId).tonic + 5)))).id;

/**
 * Judge one more note of "play the scale up" (Learn and Challenges). `played` = the notes so far (MIDI). Returns
 * 'next' (right, keep going), 'done' (all 8), or a reason it's wrong (start again).
 */
export function scaleStep(tonicPc: number, played: number[], down = false): 'next' | 'done' | 'wrong-start' | 'wrong' {
  const steps = scaleSteps(down);
  const first = played[0];
  if (pc(first) !== tonicPc) return 'wrong-start';
  const i = played.length - 1;
  if (played[i] !== first + steps[i]) return 'wrong';
  return played.length === steps.length ? 'done' : 'next';
}

/** Half steps from the start: up one octave, or (Learn, his request) up and back down (15 notes). */
export const scaleSteps = (down = false) => (down ? [...MAJOR_SCALE, ...MAJOR_SCALE.slice(0, 7).reverse()] : MAJOR_SCALE);
/** The right-hand fingers for each of those notes (the same note keeps its finger on the way down). */
export const scaleFingers = (keyId: string, down = false) => {
  const f = fingering(keyId);
  return down ? [...f, ...f.slice(0, 7).reverse()] : f;
};
