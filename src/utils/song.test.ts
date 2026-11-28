import { describe, expect, it } from 'vitest';
import { chartSummary, chordOk, emptyTally, parseChart, songScore, unitAt } from './song';
import { parseChord } from './chords';

describe('song charts', () => {
  it('reads bars, repeats, held bars, split bars and no-chord bars', () => {
    const u = parseChart('(Am F)x2 C*2 G,D % N.C.');
    expect(u.map((x) => x.text)).toEqual(['Am', 'F', 'Am', 'F', 'C', 'C', 'G', 'D', 'G', 'D', 'N.C.']);
    expect(u.map((x) => x.bar)).toEqual([0, 1, 2, 3, 4, 5, 6, 6, 7, 7, 8]);
    expect(u[7]).toMatchObject({ at: 26, len: 2 });
    expect(u[10].chord).toBeNull();
  });
  it('reads chords as charts write them', () => {
    const u = parseChart('C/E Gsus4 Am7 Bbadd9 F#m');
    expect(u.map((x) => x.chord && `${x.chord.root}:${x.chord.quality}`)).toEqual(['0:maj', '7:maj', '9:min7', '10:maj', '6:min']);
  });
  it('summarises a loop', () => {
    expect(chartSummary(parseChart('(Am F C G)x4'))).toBe('Am – F – C – G × 4 · 16 bars');
    expect(chartSummary(parseChart('D A Bm G D A G G'))).toBe('D – A – Bm – G – D – A – G – G · 8 bars');
  });
  it('a 7th chord also takes its plain triad', () => {
    const am7 = parseChord('Am7')!;
    expect(chordOk([57, 60, 64, 67], am7)).toBe(true);
    expect(chordOk([57, 60, 64], am7)).toBe(true);
    expect(chordOk([57, 60, 65], am7)).toBe(false);
  });
  it('leans a quarter beat early and scores by length', () => {
    const u = parseChart('C G,F');
    expect(unitAt(u, -0.5)).toBe(-1);
    expect(unitAt(u, -0.2)).toBe(0);
    expect(unitAt(u, 3.8)).toBe(1);
    expect(unitAt(u, 5.9)).toBe(2);
    const t = [emptyTally(), { ...emptyTally(), ok: true }, emptyTally()];
    t[0].ok = true;
    expect(songScore('chords', u, t)).toEqual({ raw: 75, right: 2, total: 3 });
    expect(songScore('melody', u, [{ ok: false, notes: 4, inKey: 3 }, emptyTally(), { ok: false, notes: 2, inKey: 1 }])).toEqual({ raw: 50, right: 1, total: 3 });
  });
});
