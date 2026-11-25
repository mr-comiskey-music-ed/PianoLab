import { describe, expect, it } from 'vitest';
import { decodeSubmission, encodeSubmission } from './codec';
import { accuracy, credit, floored, passed } from './grading';
import { parseBatch } from './batch';
import { cleanSnapshot } from './autosave';
import { validatePattern } from '../data/pattern';
import { packPerf, toMidiFile, unpackPerf } from './performance';
import { readMidiFile } from './midiImport';
import example from '../data/pattern.example.json';
import { Submission } from '../types';

const sub: Submission = {
  assignment: 'open',
  timestamp: 1_760_000_000_000,
  learnDone: true,
  results: [
    { levelId: 'l1-find-fc', raw: 100, labels: 'all', at: 1_760_000_000_000 },
    { levelId: 'l1-name-fc', raw: 38, labels: 'off', at: 1_760_000_000_000 },
  ],
};

describe('submission codes', () => {
  it('round-trips and starts with the version prefix', async () => {
    const code = await encodeSubmission(sub);
    expect(code.startsWith('v1.')).toBe(true);
    const back = await decodeSubmission(code);
    expect(back?.learnDone).toBe(true);
    expect(back?.results.map((r) => [r.levelId, r.raw, r.labels])).toEqual([
      ['l1-find-fc', 100, 'all'],
      ['l1-name-fc', 38, 'off'],
    ]);
  });

  it('keeps the name only inside the code, and codes without one still read', async () => {
    const named = await decodeSubmission(await encodeSubmission({ ...sub, name: '  Ana Rivera ' }));
    expect(named?.name).toBe('Ana Rivera');
    const plain = await decodeSubmission(await encodeSubmission(sub));
    expect(plain?.name).toBeUndefined();
  });

  it('rejects edited or cut-off codes', async () => {
    const code = await encodeSubmission(sub);
    expect(await decodeSubmission(code.slice(0, -3))).toBeNull();
    expect(await decodeSubmission(code.replace('v1.', 'v1.A'))).toBeNull();
    expect(await decodeSubmission('hello')).toBeNull();
  });

  it('an October v1 code still decodes (frozen sample)', async () => {
    // Generated once and frozen. If this ever fails, the v1 format was changed and old codes would stop grading.
    const frozen = 'v1.q1YqUbIyNDczgAAdpWwlq2qlHEPdtMy8FN20ZCWraEMDAx2jWB2QYF5ibipE0NhCxyC2VkcpR8nKsBYA.817rd5';
    const back = await decodeSubmission(frozen);
    expect(back?.learnDone).toBe(true);
    expect(back?.results.map((r) => [r.levelId, r.raw, r.labels])).toEqual([
      ['l1-find-fc', 100, 'all'],
      ['l1-name-fc', 38, 'off'],
    ]);
  });
});

describe('grading', () => {
  it('floors a completed attempt at 50 but never changes pass/fail', () => {
    expect(floored(10)).toBe(50);
    expect(floored(72)).toBe(72);
    expect(passed(10, { pass: 80 })).toBe(false);
    expect(passed(80, { pass: 80 })).toBe(true);
    expect(passed(79, { pass: 80 })).toBe(false);
  });
});

describe('credit for tries', () => {
  it('full, half, then none', () => {
    expect([0, 1, 2, 5].map(credit)).toEqual([1, 0.5, 0, 0]);
    expect(accuracy(7.5, 8)).toBeCloseTo(93.75);
  });
});

describe('batch grading', () => {
  it('reads a pasted class, labels lines, flags unreadable codes, floors, and averages without failed attempts', async () => {
    const good = await encodeSubmission(sub);
    const failed = await encodeSubmission({ ...sub, results: [{ levelId: 'l1-find-fc', raw: 10, labels: 'all', at: 0 }] });
    const named = await encodeSubmission({ ...sub, name: 'Cam Ortiz' });
    const text = `Ana R  ${good}\nBen T, ${failed}\n${named}\nCy L  v1.notacodenotacode.zzz\n${good}`;
    const r = await parseBatch(text);
    expect(r.entries.length).toBe(3);
    expect(r.duplicatesRemoved).toBe(1);
    expect(r.unreadable.length).toBe(1);
    expect(r.entries[0].label).toBe('Ana R');
    expect(r.entries[0].levels[1]).toMatchObject({ raw: 38, grade: 50, passed: false });
    expect(r.entries[1].headline).toBe(50); // floored
    expect(r.entries[1].counts).toBe(false);
    expect(r.entries[2].label).toBe('Cam Ortiz'); // the name inside the code wins
    expect(r.top).toBe(75); // (100 + 50) / 2
    expect(r.average).toBe(75); // the failed attempt is left out
  });
});

describe('autosave cleaning', () => {
  it('drops junk and keeps good data', () => {
    const s = cleanSnapshot({ results: [{ levelId: 'x', raw: 500, labels: 'weird', at: 1 }, 7, { raw: 3 }], learnDone: 'yes', learnStep: 3, soundId: 5, name: 'Nope' });
    expect(s?.results).toEqual([{ levelId: 'x', raw: 100, labels: 'all', at: 1 }]);
    expect(s?.learn['lesson-1']).toEqual({ done: false, step: 3 }); // an old Phase 1 save still loads
    expect(s?.lessonId).toBe('lesson-1');
    const s2 = cleanSnapshot({ results: [], learn: { 'lesson-2': { done: true, step: 4 }, 'Bad Id!': { done: true } }, lessonId: 'lesson-3' });
    expect(s2?.learn).toEqual({ 'lesson-2': { done: true, step: 4 } });
    expect(s2?.lessonId).toBe('lesson-3');
    expect(JSON.stringify(s)).not.toContain('Nope'); // autosave never keeps a name
    expect(cleanSnapshot('nope')).toBeNull();
  });
});

describe('pattern format', () => {
  it('accepts the example and rejects a bad one', () => {
    expect(validatePattern(example as never)).toEqual([]);
    expect(validatePattern({ id: 'x', tempo: 5 } as never).length).toBeGreaterThan(3);
  });
});

describe('Sandbox performances', () => {
  const notes = [
    { t: 0, d: 400, m: 60, v: 100 },
    { t: 500, d: 250, m: 64, v: 80 },
    { t: 500, d: 250, m: 67, v: 80 },
    { t: 1203, d: 998, m: 72, v: 127 },
  ];
  it('pack/unpack keeps the notes (to 5 ms)', () => {
    const back = unpackPerf(packPerf(notes));
    expect(back.map((n) => [n.m, n.v])).toEqual(notes.map((n) => [n.m, n.v]));
    back.forEach((n, i) => {
      expect(Math.abs(n.t - notes[i].t)).toBeLessThanOrEqual(5);
      expect(Math.abs(n.d - notes[i].d)).toBeLessThanOrEqual(5);
    });
    expect(unpackPerf('junk')).toEqual([]);
  });
  it('a code can carry a performance (key p) and still decode', async () => {
    const code = await encodeSubmission({ name: 'Sam', assignment: 'open', timestamp: 0, learnDone: false, results: [], perf: packPerf(notes) });
    const back = await decodeSubmission(code);
    expect(back?.name).toBe('Sam');
    expect(unpackPerf(back?.perf).length).toBe(4);
  });
  it('makes a valid MIDI file', () => {
    const f = toMidiFile(notes);
    expect(String.fromCharCode(...f.slice(0, 4))).toBe('MThd');
    expect(String.fromCharCode(...f.slice(14, 18))).toBe('MTrk');
    const len = (f[18] << 24) | (f[19] << 16) | (f[20] << 8) | f[21];
    expect(len).toBe(f.length - 22);
    expect(Array.from(f.slice(-4))).toEqual([0x00, 0xff, 0x2f, 0x00]);
  });
});

describe('MIDI import', () => {
  it('reads back a file PianoLab wrote', () => {
    const notes = [
      { t: 1000, d: 400, m: 60, v: 100 },
      { t: 1500, d: 250, m: 64, v: 80 },
    ];
    const got = readMidiFile(toMidiFile(notes).buffer as ArrayBuffer);
    expect(got.notes.map((n) => [n.m, n.v])).toEqual([[60, 100], [64, 80]]);
    expect(got.notes[0].t).toBe(0); // leading silence trimmed
    expect(Math.abs(got.notes[1].t - 500)).toBeLessThan(3);
    expect(Math.abs(got.notes[0].d - 400)).toBeLessThan(3);
  });
  it('rejects a file that is not MIDI', () => {
    expect(() => readMidiFile(new TextEncoder().encode('hello there, not midi').buffer as ArrayBuffer)).toThrow(/not a MIDI/);
  });
});

describe('per-lesson Learn in codes', () => {
  it('round-trips L and keeps l for Lesson 1', async () => {
    const code = await encodeSubmission({ assignment: 'open', timestamp: 0, learnDone: true, learned: ['lesson-1', 'lesson-3'], results: [] });
    const back = await decodeSubmission(code);
    expect(back?.learnDone).toBe(true);
    expect(back?.learned).toEqual(['lesson-1', 'lesson-3']);
  });
});

describe('Jam Room backing in codes and links', () => {
  it('keeps the backing in a code, and cleans hand-edited junk', async () => {
    const { cleanBacking, packPerf } = await import('./performance');
    const { encodeSubmission, decodeSubmission } = await import('./codec');
    const jam = [
      { k: 'g', at: 2500, until: 30000, g: 'pop', key: 'Am', n: ['i', 'VI', 'III', 'VII'], bpm: 96 },
      { k: 'y', at: 31000, v: 'brKVb6CKzFA', vt: 12.3 },
    ];
    const code = await encodeSubmission({ name: 'A', assignment: 'open', timestamp: 0, learnDone: false, results: [], perf: packPerf([{ t: 0, d: 400, m: 60, v: 90 }]), jam });
    const sub = await decodeSubmission(code);
    expect(cleanBacking(sub!.jam)).toEqual(jam);
    expect(cleanBacking([{ k: 'g', at: 'x' }, { k: 'zz', at: 1 }, null, { k: 't', at: 5, tr: 'my-track' }])).toEqual([{ k: 't', at: 5, tr: 'my-track' }]);
  });
  it('old links (notes only) still open; new links carry the backing', async () => {
    const { readPerfParam, packPerf } = await import('./performance');
    const { compress } = await import('./codec');
    const notes = [{ t: 0, d: 400, m: 60, v: 90 }];
    const old = await readPerfParam(await compress(JSON.stringify(packPerf(notes))));
    expect(old).toEqual({ notes, backing: [] });
    const withJam = await readPerfParam(await compress(JSON.stringify({ p: packPerf(notes), j: [{ k: 't', at: 0, tr: 'x' }] })));
    expect(withJam?.backing).toEqual([{ k: 't', at: 0, tr: 'x' }]);
  });
  it('remembers when the chord shape helper was showing (and old codes stay the same)', async () => {
    const code = await encodeSubmission({ assignment: 'open', timestamp: 0, learnDone: false, results: [{ levelId: 'l3-play-pop', raw: 90, labels: 'c', at: 0, shapes: true }, { levelId: 'l2-play-cfg', raw: 80, labels: 'c', at: 0 }] });
    const back = await decodeSubmission(code);
    expect(back?.results.find((r) => r.levelId === 'l3-play-pop')?.shapes).toBe(true);
    expect(back?.results.find((r) => r.levelId === 'l2-play-cfg')?.shapes).toBeUndefined();
  });
});
