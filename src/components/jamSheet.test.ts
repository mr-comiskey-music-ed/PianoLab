import { describe, expect, it } from 'vitest';
import { readChordSheet } from './ModeJam';
import { keyById } from '../utils/chords';

describe('YouTube chord sheet', () => {
  it('reads chord names the way sheets online write them', () => {
    const s = readChordSheet(keyById('Am'), 'Am - F - C/E - G7 | Dsus4 Bb x2 Cadd9 (Em)');
    expect(s.map((c) => c.text)).toEqual(['Am', 'F', 'C/E', 'G7', 'Dsus4', 'B♭', 'Cadd9', 'Em']);
    expect(s.map((c) => c.numeral)).toEqual(['i', 'VI', 'III', 'VII7', '', '', 'III', 'v']);
    expect(s[4].chord.quality).toBe('maj'); // a sus chord counts as its plain triad
  });
  it('also reads numerals, and keys with sharps', () => {
    expect(readChordSheet(keyById('G'), 'I V vi IV').map((c) => c.text)).toEqual(['G', 'D', 'Em', 'C']);
    expect(readChordSheet(keyById('D'), 'D A Bm F#m').map((c) => c.numeral)).toEqual(['I', 'V', 'vi', 'iii']);
  });
});
