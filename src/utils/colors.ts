/**
 * Pitch colours: the chromatic scale C to B goes round the colour wheel (red, orange, yellow, green, blue, purple, pink),
 * like Chrome Music Lab's Shared Piano, toned down a little to sit with the walnut and brass look.
 * Used for piano-roll notes now. Roman numerals will reuse the C major scale's colours (I = C, ii = D, ... vii° = B).
 */
export const PITCH_COLORS = [
  '#c94a5c', // C  red
  '#d9674e', // C# red-orange
  '#dc9356', // D  orange
  '#d9b052', // D# amber
  '#d8cc5a', // E  yellow
  '#9fbf55', // F  lime
  '#6ea362', // F# green
  '#3f7d6c', // G  teal
  '#46689e', // G# blue
  '#5a49b8', // A  indigo
  '#8f55b0', // A# purple
  '#cc68a8', // B  pink
] as const;

export const pitchColor = (midi: number) => PITCH_COLORS[((midi % 12) + 12) % 12];

/** Scale-degree colours for Roman numerals (later phases): the C major scale's pitch colours. */
export const DEGREE_COLORS = {
  I: PITCH_COLORS[0],
  ii: PITCH_COLORS[2],
  iii: PITCH_COLORS[4],
  IV: PITCH_COLORS[5],
  V: PITCH_COLORS[7],
  vi: PITCH_COLORS[9],
  'vii°': PITCH_COLORS[11],
} as const;

/** '#rrggbb' + alpha -> 'rgba(...)'. */
export const withAlpha = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};
