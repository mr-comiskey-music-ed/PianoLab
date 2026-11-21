/**
 * The pattern format (SPEC section 6). Everything a student plays in time is one of these.
 * Phase 1 only defines and validates it; the pattern engine arrives in Phase 3.
 * Data files (JSON) hold the patterns, so adding one means editing a list.
 */
export type Texture = 'bass' | 'block' | 'bassChord' | 'broken' | 'arpeggio';
export type Rhythm = 'whole' | 'half' | 'quarter' | 'eighths' | `sync:${string}`;
export type Voicing = 'root' | 'inversions' | 'smoothest';

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
}

const TEXTURES: Texture[] = ['bass', 'block', 'bassChord', 'broken', 'arpeggio'];
const VOICINGS: Voicing[] = ['root', 'inversions', 'smoothest'];

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
  return bad;
}
