import { DEGREE_COLORS } from './colors';
import { pc, pcOf } from './music';

/**
 * Chords for Lessons 2-6: spelling, names, keys, roman numerals, function, the live chord detector, and Smooth Mover.
 * Pitch classes (0-11, C = 0) are used for theory; MIDI numbers for actual keys.
 */

export type Quality = 'maj' | 'min' | 'dim' | 'aug';
export const QUALITY_STEPS: Record<Quality, [number, number]> = { maj: [4, 7], min: [3, 7], dim: [3, 6], aug: [4, 8] };
const SUFFIX: Record<Quality, string> = { maj: '', min: 'm', dim: '°', aug: '+' };
const QUALITY_WORD: Record<Quality, string> = { maj: 'major', min: 'minor', dim: 'diminished', aug: 'augmented' };

/** Spell roots the way a key would (flats for F, Bb, Eb, Ab, Db, Gb keys; sharps otherwise). */
const SHARP_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const FLAT_NAMES = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];
export const pcName = (p: number, flats = false) => (flats ? FLAT_NAMES : SHARP_NAMES)[((p % 12) + 12) % 12];

export interface Chord {
  root: number; // pitch class
  quality: Quality;
  /** How the root was written (keeps "B♭" vs "A♯" as the lesson wrote it). */
  rootName: string;
}

/** "Dm", "F#", "Bb", "Bdim", "B°", "C+" -> Chord. Returns null if it can't be read. */
export function parseChord(sym: string): Chord | null {
  const m = sym.trim().match(/^([A-G])([#b♯♭]?)(m|min|dim|°|\+|aug|maj)?$/);
  if (!m) return null;
  const root = pcOf(m[1] + m[2]);
  if (root === null) return null;
  const q: Quality = m[3] === 'm' || m[3] === 'min' ? 'min' : m[3] === 'dim' || m[3] === '°' ? 'dim' : m[3] === '+' || m[3] === 'aug' ? 'aug' : 'maj';
  return { root, quality: q, rootName: (m[1] + m[2]).replace('#', '♯').replace('b', '♭') };
}

export const chordPcs = (c: Chord) => [c.root, (c.root + QUALITY_STEPS[c.quality][0]) % 12, (c.root + QUALITY_STEPS[c.quality][1]) % 12];
/** Short name: "Dm", "F♯", "B°". */
export const chordName = (c: Chord) => `${c.rootName}${SUFFIX[c.quality]}`;
/** Long name: "D minor". */
export const chordLongName = (c: Chord) => `${c.rootName} ${QUALITY_WORD[c.quality]}`;

export const INVERSION_NAMES = ['Root position', '1st inversion', '2nd inversion'] as const;

/** A voicing (MIDI notes, low to high) of a chord in the given inversion, starting at or above `floor`. */
export function voicing(c: Chord, inversion = 0, floor = 60): number[] {
  const pcs = chordPcs(c);
  const order = [...pcs.slice(inversion), ...pcs.slice(0, inversion)];
  const out: number[] = [];
  let prev = floor - 1;
  for (const p of order) {
    let n = prev + 1;
    while (pc(n) !== p) n++;
    out.push(n);
    prev = n;
  }
  return out;
}

/**
 * Do the held keys make this chord? Exactly the chord's three notes (any octave, doubling allowed), nothing else.
 * With `inversion`, the lowest key must also be the right chord tone (0 = root, 1 = 3rd, 2 = 5th).
 */
export function matchesChord(held: number[], c: Chord, inversion?: number): boolean {
  if (held.length < 3) return false;
  const want = chordPcs(c);
  const got = new Set(held.map(pc));
  if (got.size !== 3 || !want.every((p) => got.has(p))) return false;
  if (inversion === undefined) return true;
  return pc(Math.min(...held)) === want[inversion];
}

// ---------- Keys ----------
export interface KeyDef {
  id: string; // "C", "Am", "Gb"...
  tonic: number;
  mode: 'major' | 'minor';
  label: string; // "C major"
  flats: boolean;
}
const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11];
const MINOR_STEPS = [0, 2, 3, 5, 7, 8, 10];
const MAJOR_Q: Quality[] = ['maj', 'min', 'min', 'maj', 'maj', 'min', 'dim'];
const MINOR_Q: Quality[] = ['min', 'dim', 'maj', 'min', 'min', 'maj', 'maj'];
const MAJOR_NUMERALS = ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'];
const MINOR_NUMERALS = ['i', 'ii°', 'III', 'iv', 'v', 'VI', 'VII'];
/** Function labels (SPEC section 14): Home, Away, Tension. Editable here. */
const MAJOR_FUNCTION = ['Home', 'Away', 'Home', 'Away', 'Tension', 'Home', 'Tension'];
const MINOR_FUNCTION = ['Home', 'Away', 'Home', 'Away', 'Tension', 'Home', 'Tension'];

const FLAT_MAJORS = new Set([5, 10, 3, 8, 1, 6]); // F Bb Eb Ab Db Gb
const FLAT_MINORS = new Set([2, 7, 0, 5, 10, 3]); // Dm Gm Cm Fm Bbm Ebm

export function makeKey(tonic: number, mode: 'major' | 'minor'): KeyDef {
  const flats = mode === 'major' ? FLAT_MAJORS.has(tonic) : FLAT_MINORS.has(tonic);
  const name = pcName(tonic, flats);
  return { id: mode === 'major' ? name : `${name}m`, tonic, mode, label: `${name} ${mode}`, flats };
}

/** Keys for the chord strip's picker: C major and A minor first (Lessons 2-3), then the rest round the circle of 5ths. */
export const KEYS: KeyDef[] = [
  makeKey(0, 'major'),
  makeKey(9, 'minor'),
  ...[7, 5, 2, 10, 9, 3, 4, 8, 11, 1, 6].map((t) => makeKey(t, 'major')),
  ...[4, 2, 11, 7, 6, 0, 1, 5, 8, 3, 10].map((t) => makeKey(t, 'minor')),
];
export const keyById = (id: string) => KEYS.find((k) => k.id === id) ?? KEYS[0];

export interface Diatonic {
  degree: number; // 0-6
  chord: Chord;
  numeral: string;
  fn: string;
  color: string;
}

/** The key's seven chords (the chord strip). */
export function diatonic(k: KeyDef): Diatonic[] {
  const steps = k.mode === 'major' ? MAJOR_STEPS : MINOR_STEPS;
  const qs = k.mode === 'major' ? MAJOR_Q : MINOR_Q;
  const nums = k.mode === 'major' ? MAJOR_NUMERALS : MINOR_NUMERALS;
  const fns = k.mode === 'major' ? MAJOR_FUNCTION : MINOR_FUNCTION;
  const colors = Object.values(DEGREE_COLORS);
  return steps.map((st, i) => {
    const root = (k.tonic + st) % 12;
    return { degree: i, chord: { root, quality: qs[i], rootName: pcName(root, k.flats) }, numeral: nums[i], fn: fns[i], color: colors[i] };
  });
}

// ---------- The chord detector ("What am I playing?") ----------
export interface Detected {
  chord: Chord;
  /** 0 = root position, 1 = 1st inversion, 2 = 2nd inversion. */
  inversion: number;
  /** In the given key, if the chord belongs to it. */
  numeral?: string;
  fn?: string;
  color?: string;
}

/** Name the triad the held keys make (3 different note names forming a major, minor, diminished or augmented chord). */
export function detectChord(held: number[], k?: KeyDef): Detected | null {
  const pcs = Array.from(new Set(held.map(pc)));
  if (pcs.length !== 3) return null;
  const bass = pc(Math.min(...held));
  for (const root of pcs) {
    for (const q of ['maj', 'min', 'dim', 'aug'] as Quality[]) {
      const want = [root, (root + QUALITY_STEPS[q][0]) % 12, (root + QUALITY_STEPS[q][1]) % 12];
      if (!want.every((p) => pcs.includes(p))) continue;
      const inDiatonic = k ? diatonic(k).find((d) => d.chord.root === root && d.chord.quality === q) : undefined;
      const chord: Chord = { root, quality: q, rootName: pcName(root, k?.flats ?? false) };
      if (inDiatonic) chord.rootName = inDiatonic.chord.rootName;
      return { chord, inversion: Math.max(0, want.indexOf(bass)), numeral: inDiatonic?.numeral, fn: inDiatonic?.fn, color: inDiatonic?.color };
    }
  }
  return null;
}

// ---------- Smooth Mover ----------
/** Half steps moved from one voicing to another: pair the notes low-to-high (both are 3 notes). */
export const moveDistance = (from: number[], to: number[]) => {
  const a = [...from].sort((x, y) => x - y);
  const b = [...to].sort((x, y) => x - y);
  return a.reduce((sum, n, i) => sum + Math.abs(n - (b[i] ?? n)), 0);
};

/** The voicing of `c` (3 notes, any inversion, within an octave or so of `from`) that moves the fewest half steps. */
export function smoothestVoicing(from: number[], c: Chord): { notes: number[]; distance: number } {
  const lo = Math.min(...from);
  let best = { notes: voicing(c, 0, lo), distance: Infinity };
  for (let inv = 0; inv < 3; inv++) {
    for (let floor = lo - 12; floor <= lo + 12; floor++) {
      const v = voicing(c, inv, floor);
      const d = moveDistance(from, v);
      if (d < best.distance) best = { notes: v, distance: d };
    }
  }
  return best;
}
