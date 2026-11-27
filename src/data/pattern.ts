/**
 * The pattern format (SPEC section 6). Everything a student plays in time is one of these.
 * Phase 1 only defines and validates it; the pattern engine arrives in Phase 3.
 * Data files (JSON) hold the patterns, so adding one means editing a list.
 */
/** `scale` (Lesson 7): the key's major scale up and down, one note per hit (the progression is ignored). */
/** `line`: a bass line or riff written note by note (`line`), repeated every `lineBars` bars. */
/** `brokenSplit`: oom-pah with the root low (left hand) and the whole chord up high (right hand). `arp3`: the triad
 *  going round and round (C E G C E G…), the simplest arpeggio. */
export type Texture = 'bass' | 'block' | 'bassChord' | 'broken' | 'brokenSplit' | 'arpeggio' | 'arp3' | 'scale' | 'line';
/**
 * One note of a line. `b` = beat inside the line (0 = beat 1 of its first bar), `d` = length in beats (default: until
 * the next note). `n`: with `lineOf: 'chord'` (bass lines) a note of the bar's chord: R root, 3 its 3rd, 5 its 5th, b7,
 * O the octave, L5 the 5th below, 5n the 5th above or below (nearer the next root), A a half step below the next bar's root (leading into it), A+ a half step above it;
 * with `lineOf: 'key'` (riffs) half steps up from the key's home note ("0", "3", "7", "12").
 */
export interface LineNote {
  b: number;
  n: string;
  d?: number;
  /** Other notes that also count here, same tokens as `n` ("5": the root or its 5th). */
  or?: string[];
}
export type Rhythm = 'whole' | 'half' | 'quarter' | 'eighths' | `sync:${string}`;
/** `close`: each chord moves as little as it can (inversions), like `smoothest`, but smoothness isn't graded; arpeggios
 *  stay in root position, each at the octave nearest the last one. */
export type Voicing = 'root' | 'inversions' | 'smoothest' | 'close';

export interface Pattern {
  id: string;
  /** Tonic letter, e.g. "C", "F#", "Bb". */
  key: string;
  mode: 'major' | 'minor';
  /** Roman numerals, e.g. ["I","V","vi","IV"]. */
  progression: string[];
  texture: Texture;
  rhythm: Rhythm;
  voicing: Voicing;
  /** Beats per minute. */
  tempo: number;
  bars: number;
  /** The first chord's inversion with `close` / `smoothest` voicing (2 = C as G C E, so I can reach IV and V easily). */
  startInv?: number;
  /** texture `line`: the notes, what they're relative to, and how many bars before it repeats (default 1). */
  line?: LineNote[];
  lineOf?: 'chord' | 'key';
  lineBars?: number;
  /** Bass lines: play everything this many octaves lower (-1: low bass, students press Oct −). */
  octave?: number;
  /** texture `line`: finish with one more bar, the home chord's root on beat 1 (I or i), instead of just stopping. */
  end?: boolean;
}

const TEXTURES: Texture[] = ['bass', 'block', 'bassChord', 'broken', 'brokenSplit', 'arpeggio', 'arp3', 'scale', 'line'];
const VOICINGS: Voicing[] = ['root', 'inversions', 'smoothest', 'close'];

/** Returns a list of problems; an empty list means the pattern is well formed. */
export function validatePattern(p: Partial<Pattern>): string[] {
  const bad: string[] = [];
  if (!p.id) bad.push('id is missing');
  if (!p.key) bad.push('key is missing');
  if (p.mode !== 'major' && p.mode !== 'minor') bad.push('mode must be major or minor');
  if (!Array.isArray(p.progression) || p.progression.length === 0) bad.push('progression needs at least one numeral');
  if (!p.texture || !TEXTURES.includes(p.texture)) bad.push('texture is not recognised');
  if (!p.rhythm) bad.push('rhythm is missing');
  if (!p.voicing || !VOICINGS.includes(p.voicing)) bad.push('voicing is not recognised');
  if (typeof p.tempo !== 'number' || p.tempo < 30 || p.tempo > 240) bad.push('tempo must be 30-240');
  if (typeof p.bars !== 'number' || p.bars < 1) bad.push('bars must be at least 1');
  if (p.texture === 'line' && !(Array.isArray(p.line) && p.line.length)) bad.push('a line needs its notes');
  return bad;
}
