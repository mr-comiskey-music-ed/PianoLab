import { Pattern, Rhythm, Texture } from '../data/pattern';
import { Chord, KeyDef, chordName, diatonic, makeKey, smoothestVoicing, voicing } from './chords';
import { pc, pcOf } from './music';

/**
 * The pattern engine (SPEC section 6): turns a pattern (key, numerals, texture, rhythm, voicing, tempo, bars) into a
 * timeline of things to play. Everything a student plays in time comes from here, so transposing is just a new key.
 * 4/4 time throughout. One chord per bar, cycling through the progression.
 */

/** One thing to play: a chord or a single note, at a beat. */
export interface TimedHit {
  /** Beats from the start of the pattern (after the count-in). */
  beat: number;
  /** Length in beats (until the next hit). */
  dur: number;
  /** The keys to show (and that the app plays in "Listen first"). */
  notes: number[];
  /** What counts as right: the note names (pitch classes); any octave. */
  pcs: number[];
  kind: 'chord' | 'note';
  bar: number;
  /** The bar's whole chord (pitch classes), e.g. for a root-only hit. */
  chordPcs: number[];
}

/** A bar's chord, for the labels on the waterfall. */
export interface BarInfo {
  bar: number;
  beat: number;
  symbol: string;
  numeral: string;
  color: string;
}

export interface Timeline {
  key: KeyDef;
  hits: TimedHit[];
  bars: BarInfo[];
  /** Total length in beats. */
  beats: number;
  tempo: number;
}

/** Where hits fall inside one 4/4 bar, in beats. */
export function rhythmBeats(r: Rhythm): number[] {
  switch (r) {
    case 'whole':
      return [0];
    case 'half':
      return [0, 2];
    case 'quarter':
      return [0, 1, 2, 3];
    case 'eighths':
      return [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5];
    default:
      // Syncopated presets: "sync:pop" = 1, the "and" of 2, 4 (a common pop push).
      if (r === 'sync:pop') return [0, 1.5, 3];
      if (r === 'sync:charleston') return [0, 1.5];
      return [0, 1, 2, 3];
  }
}

/** "V" in C major -> the G chord (with its numeral and colour). Accepts "vii°"/"viio" and "ii°"/"iio". */
export function resolveNumeral(k: KeyDef, numeral: string) {
  const n = numeral.replace(/o$/, '°').trim();
  return diatonic(k).find((d) => d.numeral === n) ?? null;
}

/** The lowest note for chords: the root's octave-3 position (C3-B3), which keeps a 25-key view (C3-C5) comfortable. */
const BASE = 48;

/** Build the timeline for a pattern (tempo can be overridden, e.g. a student playing faster). */
export function buildTimeline(p: Pattern, tempo = p.tempo): Timeline {
  const tonic = pcOf(p.key) ?? 0;
  const key = makeKey(tonic, p.mode);
  const hitsInBar = rhythmBeats(p.rhythm);
  const hits: TimedHit[] = [];
  const bars: BarInfo[] = [];
  let prev: number[] | null = null;
  // Where the hand starts (the middle of the first chord): smooth moves stay near it.
  let anchor: number | undefined;
  for (let bar = 0; bar < p.bars; bar++) {
    const d = resolveNumeral(key, p.progression[bar % p.progression.length]);
    if (!d) continue;
    const chord: Chord = d.chord;
    // Voicing: root position near C3, or (inversions / smoothest) the smoothest move from the last chord, kept in view.
    let notes: number[];
    if (p.voicing === 'root' || !prev) notes = voicing(chord, 0, BASE + chord.root);
    else notes = smoothestVoicing(prev, chord, [BASE, BASE + 24], anchor).notes;
    anchor ??= notes.reduce((a, n) => a + n, 0) / notes.length;
    prev = notes;
    bars.push({ bar, beat: bar * 4, symbol: chordName(chord), numeral: d.numeral, color: d.color });
    const root = BASE + chord.root;
    hitsInBar.forEach((b, i) => {
      const next = hitsInBar[i + 1] ?? 4;
      const hit = textureHit(p.texture, notes, root, i);
      hits.push({ beat: bar * 4 + b, dur: next - b, notes: hit, pcs: Array.from(new Set(hit.map(pc))), kind: hit.length > 1 ? 'chord' : 'note', bar, chordPcs: Array.from(new Set(notes.map(pc))) });
    });
  }
  return { key, hits, bars, beats: p.bars * 4, tempo };
}

/** What one hit plays, for each texture (SPEC section 6). `i` is the hit's place in its bar. */
function textureHit(t: Texture, chord: number[], root: number, i: number): number[] {
  switch (t) {
    case 'bass':
      return [root]; // single notes: the chord's root
    case 'block':
      return chord;
    case 'bassChord':
      // the root on the first hit of the bar, the chord on the rest (both together if the bar has one hit)
      return i === 0 ? [root] : chord;
    case 'broken':
      // "oom-pah": root, chord, root, chord
      return i % 2 === 0 ? [root] : chord;
    case 'arpeggio': {
      // up the chord one note at a time: root, 3rd, 5th, top root
      const up = [...chord, chord[0] + 12];
      return [up[i % up.length]];
    }
  }
}

/** Beats -> milliseconds at a tempo. */
export const beatMs = (tempo: number) => 60000 / tempo;

/**
 * The chords of a run, short: a loop that repeats is written once with how many times ("A – D – E – A × 4");
 * anything else is listed in full.
 */
export function chordSummary(symbols: string[]): string {
  for (let p = 1; p <= symbols.length / 2; p++) {
    if (symbols.length % p) continue;
    if (symbols.every((x, i) => x === symbols[i % p])) return `${symbols.slice(0, p).join(' – ')} × ${symbols.length / p}`;
  }
  return symbols.join(' – ');
}
