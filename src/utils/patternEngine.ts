import { Pattern, Rhythm, Texture } from '../data/pattern';
import { Chord, KeyDef, chordName, chordPcs, diatonic, diatonicSevenths, makeKey, parseNumeral, smoothestVoicing, voicing } from './chords';
import { pc, pcOf } from './music';
import { MAJOR_SCALE } from './scales';

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
  /** The bar's chord root (pitch class): oom-pah "pah" hits also accept the chord without it (3rd + 5th). */
  rootPc?: number;
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
  /** A scale (Lesson 7): no chord labels on the waterfall (they sat in the way of the notes; his call). */
  scale?: boolean;
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
      // Syncopated presets: "sync:pop" = 1, the "and" of 2, 4 (a common pop push). That is the tresillo: 3 + 3 + 2
      // eighths, the "3 side" of the son clave ("sync:tresillo" says so).
      if (r === 'sync:pop' || r === 'sync:tresillo') return [0, 1.5, 3];
      if (r === 'sync:charleston') return [0, 1.5];
      // Off-beats only: every "and" (reggae / ska).
      if (r === 'sync:offbeats') return [0.5, 1.5, 2.5, 3.5];
      // The tresillo with an extra hit on 4 + : 1, + of 2, 4, + of 4 (a pushed pop / funk comp).
      if (r === 'sync:push') return [0, 1.5, 3, 3.5];
      return [0, 1, 2, 3];
  }
}

/** How long each hit lasts, when it isn't simply "until the next one" (off-beats are short 8ths, with rests between). */
export function rhythmLengths(r: Rhythm): number[] | null {
  return r === 'sync:offbeats' ? [0.5, 0.5, 0.5, 0.5] : null;
}

/** "V" in C major -> the G chord (with its numeral and colour). Accepts "vii°"/"viio" and "ii°"/"iio", and 7th chords
 *  (Lesson 8): "V7", "ii7", "Imaj7", "viiø7". */
export function resolveNumeral(k: KeyDef, numeral: string) {
  const n = numeral.replace(/o$/, '°').trim();
  return diatonic(k).find((d) => d.numeral === n) ?? diatonicSevenths(k).find((d) => d.numeral === n) ?? parseNumeral(k, numeral);
}

/** The lowest note for chords: the root's octave-3 position (C3-B3), which keeps a 25-key view (C3-C5) comfortable. */
const BASE = 48;

/** A chord in root position at the octave whose root is nearest `near`, with `span` half steps above the root on the keys. */
function nearestRootPosition(chord: Chord, near: number, span: number): number[] {
  const roots = [0, 1, 2].map((k) => BASE + chord.root + 12 * k).filter((r) => r + span <= BASE + 24);
  const r = roots.reduce((a, b) => (Math.abs(b - near) < Math.abs(a - near) ? b : a), roots[0] ?? BASE + chord.root);
  return voicing(chord, 0, r);
}
/** The first chord in a given inversion, placed in the middle of the keys (C in 2nd inversion = G3 C4 E4). */
function startVoicing(chord: Chord, inv: number): number[] {
  const fits = Array.from({ length: 19 }, (_, k) => voicing(chord, inv, BASE + k)).filter((v) => v[0] >= BASE && v[v.length - 1] <= BASE + 24);
  const mid = (v: number[]) => Math.abs(v.reduce((a, n) => a + n, 0) / v.length - 60);
  return fits.length ? fits.reduce((a, b) => (mid(b) < mid(a) ? b : a)) : voicing(chord, 0, BASE + chord.root);
}

/** Build the timeline for a pattern (tempo can be overridden, e.g. a student playing faster). */
export function buildTimeline(p: Pattern, tempo = p.tempo): Timeline {
  const tonic = pcOf(p.key) ?? 0;
  const key = makeKey(tonic, p.mode);
  if (p.texture === 'scale') return scaleTimeline(p, key, tempo);
  if (p.texture === 'line') return lineTimeline(p, key, tempo);
  const hitsInBar = rhythmBeats(p.rhythm);
  const lens = rhythmLengths(p.rhythm);
  const hits: TimedHit[] = [];
  const bars: BarInfo[] = [];
  let prev: number[] | null = null;
  // Where the hand starts (the middle of the first chord): smooth moves stay near it.
  let anchor: number | undefined;
  for (let bar = 0; bar < p.bars; bar++) {
    const d = resolveNumeral(key, p.progression[bar % p.progression.length]);
    if (!d) continue;
    const chord: Chord = d.chord;
    // Voicing: root position near C3, or (inversions / smoothest / close) the smoothest move from the last chord, kept in
    // view. Close arpeggios: root position at the octave nearest the last chord (starting mid-keyboard), so C to Am is a
    // 3rd down, not a jump up from C3 (his report).
    let notes: number[];
    const arp = p.texture === 'arpeggio' || p.texture === 'arp3';
    if (arp && p.voicing === 'close') notes = nearestRootPosition(chord, prev ? prev[0] : 60, p.texture === 'arpeggio' ? 12 : 7);
    else if (p.voicing === 'root') notes = voicing(chord, 0, BASE + chord.root);
    else if (!prev) notes = p.startInv !== undefined && p.voicing !== 'inversions' ? startVoicing(chord, p.startInv) : voicing(chord, 0, BASE + chord.root);
    else notes = smoothestVoicing(prev, chord, [BASE, BASE + 24], anchor).notes;
    anchor ??= notes.reduce((a, n) => a + n, 0) / notes.length;
    prev = notes;
    bars.push({ bar, beat: bar * 4, symbol: chordName(chord), numeral: d.numeral, color: d.color });
    const root = BASE + chord.root;
    // Split oom-pah: the chord goes up to the right-hand side (an inversion that fits C4-C5).
    const high = p.texture === 'brokenSplit' ? [0, 1, 2].map((inv) => voicing(chord, inv, 60)).find((v) => v[0] >= 60 && v[v.length - 1] <= 72) ?? notes.map((n) => n + 12) : notes;
    hitsInBar.forEach((b, i) => {
      const next = hitsInBar[i + 1] ?? 4;
      const hit = textureHit(p.texture, p.texture === 'brokenSplit' && i % 2 ? high : notes, root, i);
      hits.push({ beat: bar * 4 + b, dur: lens?.[i] ?? next - b, notes: hit, pcs: Array.from(new Set(hit.map(pc))), kind: hit.length > 1 ? 'chord' : 'note', bar, chordPcs: Array.from(new Set(notes.map(pc))), rootPc: pc(chord.root) });
    });
  }
  return { key, hits, bars, beats: p.bars * 4, tempo };
}

/**
 * Lesson 7: the major scale up one octave and back down, one note per quarter (8 up, 7 down, the last held for 2 beats:
 * 4 bars), repeated to fill the bars. Starts on the tonic in octave 3, so it always fits on the 25 keys.
 */
function scaleTimeline(p: Pattern, key: KeyDef, tempo: number): Timeline {
  const start = BASE + key.tonic;
  const up = MAJOR_SCALE.map((st) => start + st);
  const run = [...up, ...up.slice(0, -1).reverse()]; // 15 notes
  const scalePcs = up.slice(0, 7).map(pc);
  const color = diatonic(key)[0].color;
  const hits: TimedHit[] = [];
  const bars: BarInfo[] = [];
  const loops = Math.max(1, Math.round(p.bars / 4));
  for (let l = 0; l < loops; l++) {
    run.forEach((n, i) => {
      const beat = l * 16 + i;
      hits.push({ beat, dur: i === run.length - 1 ? 2 : 1, notes: [n], pcs: [pc(n)], kind: 'note', bar: Math.floor(beat / 4), chordPcs: scalePcs });
    });
  }
  for (let b = 0; b < loops * 4; b++) bars.push({ bar: b, beat: b * 4, symbol: key.label, numeral: '', color });
  return { key, hits, bars, beats: loops * 16, tempo, scale: true };
}

/** The bar's chord (numeral resolved in the key), or the tonic chord if it doesn't read. */
const barChord = (p: Pattern, key: KeyDef, bar: number) => resolveNumeral(key, p.progression[bar % p.progression.length]) ?? diatonic(key)[0];

/** Which note a line token means (see `LineNote`). */
export function lineNote(token: string, chord: Chord, next: Chord, tonic: number, of: 'chord' | 'key'): number | null {
  if (of === 'key') {
    const n = Number(token);
    return Number.isFinite(n) ? BASE + tonic + n : null;
  }
  const root = BASE + chord.root;
  const tones = chordPcs(chord).map((x) => (x - chord.root + 12) % 12); // [0, 3rd, 5th, (7th)]
  const nextRoot = BASE + next.root;
  switch (token) {
    case 'R':
      return root;
    case '3':
      return root + tones[1];
    case '5':
      return root + tones[2];
    case 'b7':
      return root + 10;
    case 'O':
      return root + 12;
    case 'L5':
      return root - 5 >= BASE ? root - 5 : root + 7;
    case 'A':
      return nextRoot - 1 >= BASE ? nextRoot - 1 : nextRoot + 1;
    case 'A+':
      return nextRoot + 1;
    default:
      return null;
  }
}

/**
 * Bass lines and riffs: the line's notes, bar after bar (a line can span `lineBars` bars before repeating). Bass lines
 * follow each bar's chord (root, 5th, a note leading into the next chord...); riffs stay in the key.
 */
function lineTimeline(p: Pattern, key: KeyDef, tempo: number): Timeline {
  const span = Math.max(1, p.lineBars ?? 1);
  const of = p.lineOf ?? 'chord';
  const line = [...(p.line ?? [])].sort((a, b) => a.b - b.b);
  const hits: TimedHit[] = [];
  const bars: BarInfo[] = [];
  for (let bar = 0; bar < p.bars; bar++) {
    const d = barChord(p, key, bar);
    bars.push({ bar, beat: bar * 4, symbol: chordName(d.chord), numeral: d.numeral, color: d.color });
  }
  for (let start = 0; start < p.bars; start += span) {
    line.forEach((ln, i) => {
      const beat = start * 4 + ln.b;
      if (beat >= p.bars * 4) return;
      const bar = Math.floor(beat / 4);
      const chord = barChord(p, key, bar).chord;
      const next = barChord(p, key, bar + 1).chord;
      const note = lineNote(ln.n, chord, next, key.tonic, of);
      if (note === null) return;
      const until = line[i + 1]?.b ?? span * 4;
      const dur = Math.min(ln.d ?? until - ln.b, p.bars * 4 - beat);
      hits.push({ beat, dur, notes: [note], pcs: [pc(note)], kind: 'note', bar, chordPcs: chordPcs(chord) });
    });
  }
  return { key, hits, bars, beats: p.bars * 4, tempo };
}

/** What one hit plays, for each texture (SPEC section 6). `i` is the hit's place in its bar. */
function textureHit(t: Texture, chord: number[], root: number, i: number): number[] {
  switch (t) {
    case 'scale':
    case 'line':
      return chord; // (scales and lines have their own timelines)
    case 'bass':
      return [root]; // single notes: the chord's root
    case 'block':
      return chord;
    case 'bassChord':
      // the root on the first hit of the bar, the chord on the rest (both together if the bar has one hit)
      return i === 0 ? [root] : chord;
    case 'broken':
    case 'brokenSplit':
      // "oom-pah": root, chord, root, chord
      return i % 2 === 0 ? [root] : chord;
    case 'arp3':
      // round and round the triad: root, 3rd, 5th, root, 3rd, 5th…
      return [chord[i % chord.length]];
    case 'arpeggio': {
      // up the chord one note at a time: root, 3rd, 5th, top root
      const up = [...chord, chord[0] + 12];
      return [up[i % up.length]];
    }
  }
}

/**
 * Another right answer for a hit, besides its own notes. Root-then-chord patterns: a root-only beat also accepts the
 * whole chord (with Chord Names Only you can't see it's just the root). Oom-pah: the "pah" also accepts the chord without
 * its root, the 3rd and 5th only (his call).
 */
export function hitAlt(t: Texture, h: TimedHit): number[] | undefined {
  const rootThenChord = t === 'bassChord' || t === 'broken' || t === 'brokenSplit';
  if (rootThenChord && h.kind === 'note') return h.chordPcs;
  if ((t === 'broken' || t === 'brokenSplit') && h.kind === 'chord' && h.rootPc !== undefined) return h.chordPcs.filter((x) => x !== h.rootPc);
  return undefined;
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
