import { describe, expect, it } from 'vitest';
import { chordName, chordPcs, detectChord, diatonic, keyById, matchesChord, moveDistance, parseChord, smoothestVoicing, voicing } from './chords';
import { parseNote, pcOf } from './music';

const n = (...names: string[]) => names.map((x) => parseNote(x)!);

describe('chords', () => {
  it('reads chord symbols', () => {
    expect(chordPcs(parseChord('C')!)).toEqual([0, 4, 7]);
    expect(chordPcs(parseChord('Dm')!)).toEqual([2, 5, 9]);
    expect(chordPcs(parseChord('Bdim')!)).toEqual([11, 2, 5]);
    expect(chordName(parseChord('Bb')!)).toBe('B♭');
    expect(chordName(parseChord('F#m')!)).toBe('F♯m');
    expect(pcOf('Db')).toBe(1);
    expect(parseNote('Eb4')).toBe(63);
  });
  it('builds voicings and inversions', () => {
    expect(voicing(parseChord('C')!, 0, 60)).toEqual([60, 64, 67]);
    expect(voicing(parseChord('C')!, 1, 60)).toEqual([64, 67, 72]);
    expect(voicing(parseChord('F')!, 2, 55)).toEqual([60, 65, 69]);
  });
  it('matches any octave/inversion, no extra notes', () => {
    const c = parseChord('C')!;
    expect(matchesChord(n('E3', 'G3', 'C4'), c)).toBe(true);
    expect(matchesChord(n('C3', 'E3', 'G3', 'C4'), c)).toBe(true); // doubling is fine
    expect(matchesChord(n('C3', 'E3', 'G3', 'A3'), c)).toBe(false); // extra note
    expect(matchesChord(n('C3', 'E3'), c)).toBe(false);
    expect(matchesChord(n('E3', 'G3', 'C4'), c, 1)).toBe(true);
    expect(matchesChord(n('E3', 'G3', 'C4'), c, 0)).toBe(false);
  });
  it('knows the keys', () => {
    expect(diatonic(keyById('C')).map((d) => chordName(d.chord) + ' ' + d.numeral + ' ' + d.fn)).toEqual([
      'C I Home', 'Dm ii Away', 'Em iii Home', 'F IV Away', 'G V Tension', 'Am vi Home', 'B° vii° Tension',
    ]);
    expect(diatonic(keyById('Am')).map((d) => d.numeral)).toEqual(['i', 'ii°', 'III', 'iv', 'v', 'VI', 'VII']);
    expect(diatonic(keyById('F')).map((d) => chordName(d.chord))[3]).toBe('B♭');
  });
  it('detects chords with inversion and numeral', () => {
    const d = detectChord(n('A3', 'C4', 'F4'), keyById('C'))!;
    expect(chordName(d.chord)).toBe('F');
    expect(d.inversion).toBe(1);
    expect(d.numeral).toBe('IV');
    expect(d.fn).toBe('Away');
    expect(detectChord(n('C4', 'D4', 'E4'))).toBeNull();
    expect(chordName(detectChord(n('B3', 'D4', 'F4'))!.chord)).toBe('B°');
  });
  it('finds the smoothest move', () => {
    const cMaj = n('C4', 'E4', 'G4');
    const f = smoothestVoicing(cMaj, parseChord('F')!);
    expect(f.notes).toEqual(n('C4', 'F4', 'A4'));
    expect(f.distance).toBe(3);
    const g = smoothestVoicing(cMaj, parseChord('G')!);
    expect(g.distance).toBe(3); // B3 D4 G4
    expect(moveDistance(cMaj, n('G3', 'B3', 'D4'))).toBe(15);
  });
});
