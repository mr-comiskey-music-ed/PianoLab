import { describe, expect, it } from 'vitest';
import { diatonicSevenths, isSeventh, chordName, chordPcs, detectChord, diatonic, keyById, matchesChord, moveDistance, moveSizes, parseChord, smoothestVoicing, voicing } from './chords';
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
    expect(diatonic(keyById('C')).map((d) => chordName(d.chord) + ' ' + d.numeral)).toEqual(['C I', 'Dm ii', 'Em iii', 'F IV', 'G V', 'Am vi', 'B° vii°']);
    expect(diatonic(keyById('Am')).map((d) => d.numeral)).toEqual(['i', 'ii°', 'III', 'iv', 'v', 'VI', 'VII']);
    expect(diatonic(keyById('F')).map((d) => chordName(d.chord))[3]).toBe('B♭');
  });
  it('detects chords with inversion and numeral', () => {
    const d = detectChord(n('A3', 'C4', 'F4'), keyById('C'))!;
    expect(chordName(d.chord)).toBe('F');
    expect(d.inversion).toBe(1);
    expect(d.numeral).toBe('IV');
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

describe('chord names with extensions', () => {
  const name = (...ns: string[]) => detectChord(n(...ns), keyById('C'));
  it('names 7ths, 9ths, 11ths, 13ths, sus and add chords, with numerals', () => {
    expect(name('G3', 'B3', 'D4', 'F4')).toMatchObject({ symbol: 'G7', longName: 'G dominant 7th', numeral: 'V7' });
    expect(name('C4', 'E4', 'G4', 'B4')).toMatchObject({ symbol: 'Cmaj7', numeral: 'Imaj7' });
    expect(name('D4', 'F4', 'A4', 'C5')).toMatchObject({ symbol: 'Dm7', numeral: 'ii7' });
    expect(name('B3', 'D4', 'F4', 'A4')).toMatchObject({ symbol: 'Bm7♭5', numeral: 'viiø7' });
    expect(name('C4', 'E4', 'G4', 'D5')).toMatchObject({ symbol: 'Cadd9' });
    expect(name('C3', 'E3', 'G3', 'B♭3'.replace('♭', 'b'), 'D4')).toMatchObject({ symbol: 'C9' });
    expect(name('C4', 'F4', 'G4')).toMatchObject({ symbol: 'Csus4', numeral: 'Isus4' });
    expect(name('G3', 'B3', 'F4')).toMatchObject({ symbol: 'G7', longName: 'G dominant 7th' }); // no 5th
    expect(name('C3', 'E3', 'G3', 'Bb3', 'D4', 'A4')).toMatchObject({ symbol: 'C13' });
    expect(name('C3', 'E3', 'G3', 'Bb3', 'D4', 'F4')).toMatchObject({ symbol: 'C11' });
  });
  it('uses the bass to choose between readings, and shows slash chords', () => {
    expect(name('C4', 'E4', 'G4', 'A4')?.symbol).toBe('C6');
    expect(name('A3', 'C4', 'E4', 'G4')?.symbol).toBe('Am7');
    expect(name('E3', 'G3', 'Bb3', 'C4')?.symbol).toBe('C7/E');
    const tri = name('E3', 'G3', 'C4')!;
    expect(tri.symbol).toBe('C');
    expect(tri.inversion).toBe(1);
  });
});

describe('move sizes', () => {
  it('lists every move size to a chord, smallest first', () => {
    const sizes = moveSizes([60, 64, 67], parseChord('F')!); // C E G -> F: C F A moves 3
    expect(sizes[0]).toBe(3);
    expect(sizes[1]).toBeGreaterThan(3);
  });
});

describe('7th chords (Lesson 8)', () => {
  it('reads, names and spells them', () => {
    const g7 = parseChord('G7')!;
    expect(isSeventh(g7)).toBe(true);
    expect(chordPcs(g7)).toEqual([7, 11, 2, 5]);
    expect(chordName(parseChord('Cmaj7')!)).toBe('Cmaj7');
    expect(chordName(parseChord('Dm7')!)).toBe('Dm7');
    expect(chordName(parseChord('Bø7')!)).toBe('Bø7');
    expect(chordPcs(parseChord('Bm7b5')!)).toEqual([11, 2, 5, 9]);
    expect(parseChord('C9')).toBeNull();
  });
  it('a 7th chord needs all four notes, any inversion', () => {
    expect(matchesChord(n('G3', 'B3', 'D4', 'F4'), parseChord('G7')!)).toBe(true);
    expect(matchesChord(n('B3', 'D4', 'F4', 'G4'), parseChord('G7')!)).toBe(true);
    expect(matchesChord(n('G3', 'B3', 'D4'), parseChord('G7')!)).toBe(false);
    expect(matchesChord(n('G3', 'B3', 'D4', 'F4'), parseChord('G')!)).toBe(false);
    expect(matchesChord(n('F3', 'G3', 'B3', 'D4'), parseChord('G7')!, 3)).toBe(true); // 7th on the bottom
  });
  it('the 7th chords of C major', () => {
    expect(diatonicSevenths(keyById('C')).map((d) => `${chordName(d.chord)} ${d.numeral}`)).toEqual([
      'Cmaj7 Imaj7', 'Dm7 ii7', 'Em7 iii7', 'Fmaj7 IVmaj7', 'G7 V7', 'Am7 vi7', 'Bø7 viiø7',
    ]);
  });
});
