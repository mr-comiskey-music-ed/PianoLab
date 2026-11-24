import { describe, expect, it } from 'vitest';
import { buildTimeline, resolveNumeral, rhythmBeats } from './patternEngine';
import { TimingJudge, summarize, steadyOffset, HitResult } from './timing';
import { keyById, chordName } from './chords';
import { Pattern } from '../data/pattern';

const base: Pattern = { id: 't', key: 'C', mode: 'major', progression: ['I', 'V', 'vi', 'IV'], texture: 'block', rhythm: 'half', voicing: 'root', tempo: 80, bars: 4 };

describe('pattern engine', () => {
  it('reads numerals in a key', () => {
    expect(chordName(resolveNumeral(keyById('G'), 'V')!.chord)).toBe('D');
    expect(chordName(resolveNumeral(keyById('Am'), 'VI')!.chord)).toBe('F');
    expect(chordName(resolveNumeral(keyById('C'), 'viio')!.chord)).toBe('B°');
  });
  it('lays out bars, hits and textures', () => {
    const t = buildTimeline(base);
    expect(t.bars.map((b) => b.symbol)).toEqual(['C', 'G', 'Am', 'F']);
    expect(t.hits.length).toBe(8); // 2 per bar
    expect(t.hits[0]).toMatchObject({ beat: 0, dur: 2, notes: [48, 52, 55], kind: 'chord' });
    expect(t.hits[2].notes).toEqual([55, 59, 62]);
    const bass = buildTimeline({ ...base, texture: 'bass', rhythm: 'whole' });
    expect(bass.hits.map((h) => h.notes)).toEqual([[48], [55], [57], [53]]);
    const arp = buildTimeline({ ...base, texture: 'arpeggio', rhythm: 'quarter', bars: 1 });
    expect(arp.hits.map((h) => h.notes[0])).toEqual([48, 52, 55, 60]);
    expect(rhythmBeats('sync:pop')).toEqual([0, 1.5, 3]);
  });
  it('transposes by changing the key', () => {
    expect(buildTimeline({ ...base, key: 'G' }).bars.map((b) => b.symbol)).toEqual(['G', 'D', 'Em', 'C']);
  });
  it('smoothest voicing moves little and stays on the 25 keys', () => {
    const t = buildTimeline({ ...base, voicing: 'smoothest', progression: ['I', 'IV', 'V', 'I'], rhythm: 'whole' });
    for (const h of t.hits) for (const n of h.notes) expect(n >= 48 && n <= 72).toBe(true);
    expect(t.hits[1].notes).toEqual([48, 53, 57]); // C to F: keep C
  });
});

describe('timing judge', () => {
  // A fake timer so the test controls when a chord "closes".
  const timers: (() => void)[] = [];
  const setTimer = (fn: () => void) => (timers.push(fn), timers.length);
  const flush = () => timers.splice(0).forEach((f) => f());

  it('grades Perfect / Good / Miss, notes, and latency', () => {
    const got: HitResult[] = [];
    const j = new TimingJudge(
      [
        { t: 1000, pcs: [0, 4, 7] },
        { t: 2000, pcs: [7, 11, 2] },
        { t: 3000, pcs: [9, 0, 4] },
        { t: 4000, pcs: [5] },
      ],
      30, // 30 ms latency is taken off each press
      (i, r) => (got[i] = r),
      setTimer,
    );
    // hit 1: chord rolled over 40 ms, first key 20 ms late after latency -> Perfect, right notes
    j.press(1050, 0); j.press(1070, 4); j.press(1090, 7); flush();
    // hit 2: 90 ms early -> Good, wrong chord (C instead of G)
    j.press(1940, 0); j.press(1940, 4); j.press(1940, 7); flush();
    // hit 3: 180 ms late -> Late (half credit for timing), and the right notes
    j.press(3210, 9); j.press(3210, 0); j.press(3210, 4); flush();
    // hit 4: never played
    j.tick(4500);
    expect(got[0]).toMatchObject({ status: 'perfect', notesRight: true, dt: 20 });
    expect(got[1]).toMatchObject({ status: 'good', notesRight: false, dt: -90 });
    expect(got[2]).toMatchObject({ status: 'off', notesRight: true, dt: 180 });
    expect(got[3]).toMatchObject({ status: 'miss', notesRight: false });
    const s = summarize(j.results);
    expect(s).toMatchObject({ perfect: 1, good: 1, off: 1, miss: 1, notesRight: 2, total: 4 });
    expect(s.timing).toBe(Math.round(((1 + 0.8 + 0.5) / 4) * 100)); // 58
    expect(s.notes).toBe(50);
    expect(s.raw).toBe(Math.round((((1 + 0.8 + 0.5) / 4) * 100 + 50) / 2)); // 54
  });
  it('ignores presses far from every hit', () => {
    const got: HitResult[] = [];
    const j = new TimingJudge([{ t: 1000, pcs: [0] }], 0, (i, r) => (got[i] = r), setTimer);
    j.press(500, 0); flush();
    expect(got.length).toBe(0);
  });
  it('spots a steady offset (a latency setting that may be wrong)', () => {
    const hits = [0, 750, 1500, 2250, 3000, 3750];
    expect(steadyOffset(hits.map((h) => h + 150 + (h % 3)), hits, 375)).toBeGreaterThanOrEqual(150); // always ~150 late
    expect(steadyOffset(hits.map((h) => h - 300), hits, 375)).toBe(-300); // far off: still found (half a beat)
    expect(steadyOffset(hits.map((h, i) => h + (i % 2 ? 90 : -90)), hits, 375)).toBeNull(); // early and late: no
    expect(steadyOffset(hits.map((h) => h + 20), hits, 375)).toBeNull(); // close enough
    expect(steadyOffset([150, 900], hits, 375)).toBeNull(); // too few presses
  });
});
