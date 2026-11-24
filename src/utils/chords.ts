import { DEGREE_COLORS } from './colors';
import { pc, pcOf } from './music';

/**
 * Chords for Lessons 2-6 and 8 (7th chords): spelling, names, keys, roman numerals, the live chord detector (with 7ths, 9ths...), and Smooth Mover.
 * Pitch classes (0-11, C = 0) are used for theory; MIDI numbers for actual keys.
 */

/** Triads (Lessons 2-6) and 7th chords (Lesson 8): dom7 = G7, maj7 = Cmaj7, min7 = Dm7, hdim7 = Bø7 (m7♭5), dim7 = B°7. */
export type Quality = 'maj' | 'min' | 'dim' | 'aug' | 'dom7' | 'maj7' | 'min7' | 'hdim7' | 'dim7';
/** Half steps above the root for each chord tone after the root. */
export const QUALITY_STEPS: Record<Quality, number[]> = {
  maj: [4, 7],
  min: [3, 7],
  dim: [3, 6],
  aug: [4, 8],
  dom7: [4, 7, 10],
  maj7: [4, 7, 11],
  min7: [3, 7, 10],
  hdim7: [3, 6, 10],
  dim7: [3, 6, 9],
};
const SUFFIX: Record<Quality, string> = { maj: '', min: 'm', dim: '°', aug: '+', dom7: '7', maj7: 'maj7', min7: 'm7', hdim7: 'ø7', dim7: '°7' };
const QUALITY_WORD: Record<Quality, string> = {
  maj: 'major',
  min: 'minor',
  dim: 'diminished',
  aug: 'augmented',
  dom7: 'dominant 7th',
  maj7: 'major 7th',
  min7: 'minor 7th',
  hdim7: 'half-diminished 7th',
  dim7: 'diminished 7th',
};

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

const QUALITY_BY_SUFFIX: Record<string, Quality> = {
  '': 'maj', maj: 'maj', m: 'min', min: 'min', dim: 'dim', '°': 'dim', '+': 'aug', aug: 'aug',
  '7': 'dom7', maj7: 'maj7', M7: 'maj7', 'Δ7': 'maj7', m7: 'min7', min7: 'min7',
  'ø7': 'hdim7', ø: 'hdim7', m7b5: 'hdim7', 'm7♭5': 'hdim7', '°7': 'dim7', dim7: 'dim7', o7: 'dim7',
};
/** "Dm", "F#", "Bb", "Bdim", "B°", "C+", "G7", "Cmaj7", "Dm7", "Bø7", "B°7" -> Chord. Returns null if it can't be read. */
export function parseChord(sym: string): Chord | null {
  const m = sym.trim().match(/^([A-G])([#b♯♭]?)(.*)$/);
  if (!m) return null;
  const root = pcOf(m[1] + m[2]);
  if (root === null) return null;
  const q = QUALITY_BY_SUFFIX[m[3]];
  if (!q) return null;
  return { root, quality: q, rootName: (m[1] + m[2]).replace('#', '♯').replace('b', '♭') };
}

export const chordPcs = (c: Chord) => [c.root, ...QUALITY_STEPS[c.quality].map((st) => (c.root + st) % 12)];
/** A 7th chord (4 notes) rather than a triad. */
export const isSeventh = (c: Chord) => QUALITY_STEPS[c.quality].length === 3;
/** Short name: "Dm", "F♯", "B°". */
export const chordName = (c: Chord) => `${c.rootName}${SUFFIX[c.quality]}`;
/** Long name: "D minor". */
export const chordLongName = (c: Chord) => `${c.rootName} ${QUALITY_WORD[c.quality]}`;

export const INVERSION_NAMES = ['Root position', '1st inversion', '2nd inversion', '3rd inversion'] as const;

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
 * Do the held keys make this chord? Exactly the chord's notes (3 for a triad, 4 for a 7th; any octave, doubling
 * allowed), nothing else. With `inversion`, the lowest key must also be the right chord tone (0 = root, 1 = 3rd, 2 = 5th,
 * 3 = 7th).
 */
export function matchesChord(held: number[], c: Chord, inversion?: number): boolean {
  const want = chordPcs(c);
  if (held.length < want.length) return false;
  const got = new Set(held.map(pc));
  if (got.size !== want.length || !want.every((p) => got.has(p))) return false;
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
  color: string;
}

/** The key's seven chords (the chord strip). */
export function diatonic(k: KeyDef): Diatonic[] {
  const steps = k.mode === 'major' ? MAJOR_STEPS : MINOR_STEPS;
  const qs = k.mode === 'major' ? MAJOR_Q : MINOR_Q;
  const nums = k.mode === 'major' ? MAJOR_NUMERALS : MINOR_NUMERALS;
  const colors = Object.values(DEGREE_COLORS);
  return steps.map((st, i) => {
    const root = (k.tonic + st) % 12;
    return { degree: i, chord: { root, quality: qs[i], rootName: pcName(root, k.flats) }, numeral: nums[i], color: colors[i] };
  });
}

const MAJOR_7Q: Quality[] = ['maj7', 'min7', 'min7', 'maj7', 'dom7', 'min7', 'hdim7'];
const MINOR_7Q: Quality[] = ['min7', 'hdim7', 'maj7', 'min7', 'min7', 'maj7', 'dom7'];
const SEVENTH_NUM: Record<string, string> = { maj7: 'maj7', min7: '7', dom7: '7', hdim7: 'ø7', dim7: '°7' };

/** The key's seven 7th chords (Lesson 8): in C, Cmaj7 (Imaj7), Dm7 (ii7), Em7 (iii7), Fmaj7 (IVmaj7), G7 (V7), Am7 (vi7),
 *  Bø7 (viiø7). */
export function diatonicSevenths(k: KeyDef): Diatonic[] {
  const qs = k.mode === 'major' ? MAJOR_7Q : MINOR_7Q;
  return diatonic(k).map((d, i) => ({
    ...d,
    chord: { ...d.chord, quality: qs[i] },
    numeral: d.numeral.replace('°', '') + SEVENTH_NUM[qs[i]],
  }));
}

const ROMAN = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii'];
/**
 * Any Roman numeral in a key, not just the key's own chords (Jam Room progressions): "I", "vi", "V7" (dominant),
 * "ii7", "Imaj7", "viiø7", "vii°", and borrowed chords like "♭VII" or "bVI" (a half step lower) and "I7" (blues).
 * Upper case = major, lower case = minor; with 7: upper case = dominant 7th, lower case = minor 7th. Null if unreadable.
 */
export function parseNumeral(k: KeyDef, text: string): Diatonic | null {
  const m = text.trim().match(/^([b♭#♯]?)(VII|VI|V|IV|III|II|I|vii|vi|v|iv|iii|ii|i)(°|o|ø|\+)?(maj7|7)?$/);
  if (!m) return null;
  const degree = ROMAN.indexOf(m[2].toLowerCase());
  const upper = m[2] === m[2].toUpperCase();
  const steps = k.mode === 'major' ? MAJOR_STEPS : MINOR_STEPS;
  const shift = m[1] === 'b' || m[1] === '♭' ? -1 : m[1] ? 1 : 0;
  const root = (((k.tonic + steps[degree] + shift) % 12) + 12) % 12;
  const mark = m[3] === 'o' ? '°' : m[3];
  let quality: Quality;
  if (m[4] === 'maj7') {
    if (!upper || mark) return null;
    quality = 'maj7';
  } else if (m[4] === '7') quality = mark === 'ø' ? 'hdim7' : mark === '°' ? 'dim7' : mark === '+' ? 'dom7' : upper ? 'dom7' : 'min7';
  else quality = mark === 'ø' ? 'hdim7' : mark === '°' ? 'dim' : mark === '+' ? 'aug' : upper ? 'maj' : 'min';
  const flats = k.flats || shift < 0;
  const color = Object.values(DEGREE_COLORS)[degree];
  return { degree, chord: { root, quality, rootName: pcName(root, flats) }, numeral: text.trim().replace(/^b/, '♭').replace(/^#/, '♯').replace(/o/, '°'), color };
}

// ---------- The chord detector ("What am I playing?") ----------
/**
 * Chord types the detector knows, by intervals above the root (half steps). Earlier entries win when a set of notes
 * could be named two ways. `core` is the triad inside (for numerals and the chord strip); `num` is what follows the
 * numeral ("V" + "7" = V7).
 */
interface ChordType {
  iv: number[];
  suffix: string;
  long: string;
  core: Quality | 'sus';
  num: string;
}
const T = (iv: number[], suffix: string, long: string, core: Quality | 'sus', num = suffix): ChordType => ({ iv, suffix, long, core, num });
const CHORD_TYPES: ChordType[] = [
  T([0, 4, 7], '', 'major', 'maj', ''),
  T([0, 3, 7], 'm', 'minor', 'min', ''),
  T([0, 3, 6], '°', 'diminished', 'dim', ''),
  T([0, 4, 8], '+', 'augmented', 'aug', ''),
  T([0, 5, 7], 'sus4', 'suspended 4th', 'sus'),
  T([0, 2, 7], 'sus2', 'suspended 2nd', 'sus'),
  T([0, 4, 7, 10], '7', 'dominant 7th', 'maj'),
  T([0, 4, 7, 11], 'maj7', 'major 7th', 'maj'),
  T([0, 3, 7, 10], 'm7', 'minor 7th', 'min', '7'),
  T([0, 3, 6, 10], 'm7♭5', 'half-diminished 7th', 'dim', 'ø7'),
  T([0, 3, 6, 9], '°7', 'diminished 7th', 'dim', '°7'),
  T([0, 3, 7, 11], 'm(maj7)', 'minor-major 7th', 'min', '(maj7)'),
  T([0, 4, 7, 9], '6', 'major 6th', 'maj'),
  T([0, 3, 7, 9], 'm6', 'minor 6th', 'min', '6'),
  T([0, 5, 7, 10], '7sus4', 'dominant 7th, suspended 4th', 'sus'),
  T([0, 2, 4, 7], 'add9', 'add 9', 'maj'),
  T([0, 2, 3, 7], 'm(add9)', 'minor add 9', 'min', 'add9'),
  T([0, 2, 4, 7, 10], '9', 'dominant 9th', 'maj'),
  T([0, 2, 4, 7, 11], 'maj9', 'major 9th', 'maj'),
  T([0, 2, 3, 7, 10], 'm9', 'minor 9th', 'min', '9'),
  T([0, 2, 4, 7, 9], '6/9', 'six-nine', 'maj'),
  T([0, 1, 4, 7, 10], '7♭9', 'dominant 7th flat 9', 'maj'),
  T([0, 3, 4, 7, 10], '7♯9', 'dominant 7th sharp 9', 'maj'),
  T([0, 4, 6, 7, 11], 'maj7♯11', 'major 7th sharp 11', 'maj'),
  T([0, 2, 4, 5, 7, 10], '11', 'dominant 11th', 'maj'),
  T([0, 2, 3, 5, 7, 10], 'm11', 'minor 11th', 'min', '11'),
  T([0, 2, 4, 7, 9, 10], '13', 'dominant 13th', 'maj'),
  T([0, 4, 7, 9, 10], '13', 'dominant 13th', 'maj'),
  T([0, 2, 4, 7, 9, 11], 'maj13', 'major 13th', 'maj'),
  // The same chords with the 5th left out, as players often do:
  T([0, 4, 10], '7', 'dominant 7th', 'maj'),
  T([0, 4, 11], 'maj7', 'major 7th', 'maj'),
  T([0, 3, 10], 'm7', 'minor 7th', 'min', '7'),
  T([0, 2, 4, 10], '9', 'dominant 9th', 'maj'),
  T([0, 2, 4, 11], 'maj9', 'major 9th', 'maj'),
  T([0, 2, 3, 10], 'm9', 'minor 9th', 'min', '9'),
  T([0, 4, 9, 10], '13', 'dominant 13th', 'maj'),
];
const TRIAD_Q: Quality[] = ['maj', 'min', 'dim', 'aug'];

export interface Detected {
  /** The root, and the triad inside the chord (C7 -> C major), for the chord strip. */
  chord: Chord;
  /** "G7", "Dm", "C/E"... */
  symbol: string;
  /** "G dominant 7th". */
  longName: string;
  /** A plain major/minor/diminished/augmented triad. */
  triad: boolean;
  /** Triads: 0 = root position, 1 = 1st inversion, 2 = 2nd inversion. Other chords: 0, with `bass` set when it isn't the root. */
  inversion: number;
  /** The bottom note's name when it isn't the root (shown as a slash chord: C7/E). */
  bass?: string;
  /** In the given key, if the chord's root and triad belong to it: "V7", "ii", "IVmaj7". */
  numeral?: string;
  color?: string;
  /** The keys it was named from. */
  notes?: number[];
}

/** Name what the held keys make (3 or more different notes): triads, 6ths, 7ths, 9ths, 11ths, 13ths, sus and add chords. */
export function detectChord(held: number[], k?: KeyDef): Detected | null {
  const pcs = Array.from(new Set(held.map(pc)));
  if (pcs.length < 3 || pcs.length > 7) return null;
  const bassPc = pc(Math.min(...held));
  let found: { root: number; t: ChordType; rank: number } | null = null;
  for (const root of pcs) {
    const ivs = pcs.map((p) => (p - root + 12) % 12).sort((a, b) => a - b);
    CHORD_TYPES.forEach((t, rank) => {
      if (t.iv.length !== ivs.length || !t.iv.every((v, i) => v === ivs[i])) return;
      // Prefer the reading whose root is in the bass (C6 with C on the bottom, Am7 with A on the bottom), then list order.
      const score = rank - (root === bassPc ? 1000 : 0);
      if (!found || score < found.rank) found = { root, t, rank: score };
    });
  }
  if (!found) return null;
  const { root, t } = found as { root: number; t: ChordType };
  const dia = k ? diatonic(k).find((d) => d.chord.root === root) : undefined;
  const rootName = dia?.chord.rootName ?? pcName(root, k?.flats ?? false);
  const triad = TRIAD_Q.includes(t.core as Quality) && t.iv.length === 3;
  const coreQ: Quality = t.core === 'sus' ? 'maj' : t.core;
  const chord: Chord = { root, quality: coreQ, rootName };
  const chordTones = t.iv.map((v) => (root + v) % 12);
  let numeral: string | undefined;
  if (dia && (t.core === 'sus' || dia.chord.quality === t.core)) {
    let base = dia.numeral;
    if (t.num.startsWith('ø') || t.num.startsWith('°')) base = base.replace(/°$/, '');
    if (t.core === 'sus') base = base.toUpperCase().replace('°', '');
    numeral = base + t.num;
  }
  const bass = bassPc !== root ? pcName(bassPc, k?.flats ?? false) : undefined;
  return {
    chord,
    symbol: `${rootName}${t.suffix}${bass && !triad ? `/${bass}` : ''}`,
    longName: `${rootName} ${t.long}`,
    triad,
    inversion: triad ? Math.max(0, chordTones.indexOf(bassPc)) : 0,
    bass,
    numeral,
    color: numeral ? dia?.color : undefined,
    notes: [...held].sort((a, b) => a - b),
  };
}

/**
 * How a strip chord is played: root position, the key's I in octave 3 and each chord's root climbing the scale from it,
 * so going I to vii never jumps down an octave.
 */
export function stripVoicing(k: KeyDef, degree: number): number[] {
  const d = diatonic(k)[degree];
  return voicing(d.chord, 0, 48 + k.tonic + ((d.chord.root - k.tonic + 12) % 12));
}

/** Which of the key's seven chords these keys make (any octave/inversion), or -1. */
export function degreeOf(k: KeyDef, held: number[]): number {
  return diatonic(k).findIndex((d) => matchesChord(held, d.chord));
}

// ---------- Smooth Mover ----------
/** Half steps moved from one voicing to another: pair the notes low-to-high (both are 3 notes). */
export const moveDistance = (from: number[], to: number[]) => {
  const a = [...from].sort((x, y) => x - y);
  const b = [...to].sort((x, y) => x - y);
  return a.reduce((sum, n, i) => sum + Math.abs(n - (b[i] ?? n)), 0);
};

/** Every different move size (half steps) from `from` to some voicing of `c` nearby, smallest first. */
export function moveSizes(from: number[], c: Chord): number[] {
  const lo = Math.min(...from);
  const out = new Set<number>();
  for (let inv = 0; inv < chordPcs(c).length; inv++) for (let floor = lo - 12; floor <= lo + 12; floor++) out.add(moveDistance(from, voicing(c, inv, floor)));
  return [...out].sort((x, y) => x - y);
}

/**
 * The voicing of `c` (3 notes, any inversion, within an octave or so of `from`) that moves the fewest half steps.
 * With `range` [lowest, highest], only voicings that fit on those keys count (Smooth Mover keeps targets on screen); if
 * none fits, any voicing counts.
 */
export function smoothestVoicing(from: number[], c: Chord, range?: [number, number], anchor?: number): { notes: number[]; distance: number } {
  const lo = Math.min(...from);
  // Equal moves: with an anchor (the middle of where the hand started), take the one nearest it, so a long progression
  // doesn't creep up (or down) the keyboard.
  const off = (v: number[]) => (anchor === undefined ? 0 : Math.abs(v.reduce((a, n) => a + n, 0) / v.length - anchor));
  const find = (fits: (v: number[]) => boolean) => {
    let best = { notes: voicing(c, 0, lo), distance: Infinity };
    for (let inv = 0; inv < chordPcs(c).length; inv++) {
      for (let floor = lo - 12; floor <= lo + 12; floor++) {
        const v = voicing(c, inv, floor);
        if (!fits(v)) continue;
        const d = moveDistance(from, v);
        if (d < best.distance || (d === best.distance && off(v) < off(best.notes))) best = { notes: v, distance: d };
      }
    }
    return best;
  };
  if (range) {
    const inView = find((v) => v[0] >= range[0] && v[v.length - 1] <= range[1]);
    if (inView.distance < Infinity) return inView;
  }
  return find(() => true);
}
