import { describe, expect, it } from 'vitest';
import { accidentals, fifthDown, fifthUp, scaleNotes, scaleStep } from './scales';
import { keyById } from './chords';

describe('major scales (Lesson 7)', () => {
  it('knows each key’s sharps and flats', () => {
    expect(accidentals(keyById('C'))).toEqual([]);
    expect(accidentals(keyById('G'))).toEqual(['F♯']);
    expect(accidentals(keyById('D'))).toEqual(['F♯', 'C♯']);
    expect(accidentals(keyById('A'))).toEqual(['F♯', 'C♯', 'G♯']);
    expect(accidentals(keyById('F'))).toEqual(['B♭']);
    expect(accidentals(keyById('B♭'))).toEqual(['B♭', 'E♭']);
  });
  it('walks the circle of 5ths', () => {
    expect(['C', 'G', 'D', 'A'].map(fifthUp)).toEqual(['G', 'D', 'A', 'E']);
    expect(['C', 'F', 'B♭'].map(fifthDown)).toEqual(['F', 'B♭', 'E♭']);
  });
  it('judges a scale note by note', () => {
    const g = scaleNotes(55); // G3 up
    expect(scaleStep(7, [55])).toBe('next');
    expect(scaleStep(7, g.slice(0, 7))).toBe('next');
    expect(scaleStep(7, g)).toBe('done');
    expect(scaleStep(7, [55, 57, 59, 60, 62, 64, 65])).toBe('wrong'); // F instead of F♯
    expect(scaleStep(7, [57])).toBe('wrong-start');
  });
});
