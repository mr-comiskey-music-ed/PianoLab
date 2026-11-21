import { describe, expect, it } from 'vitest';
import { decodeSubmission, encodeSubmission } from './codec';
import { floored, passed } from './grading';
import { parseBatch } from './batch';
import { cleanSnapshot } from './autosave';
import { decodePatch } from './patchCode';
import { compress } from './codec';
import { validatePattern } from '../data/pattern';
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

  it('contains no name field', async () => {
    const code = await encodeSubmission(sub);
    const decoded = (await decodeSubmission(code)) as unknown as Record<string, unknown>;
    expect(Object.keys(decoded).sort()).toEqual(['assignment', 'learnDone', 'results', 'timestamp']);
    // The packed text itself has no name key either.
    const { decompress } = await import('./codec');
    const json = (await decompress(code.split('.')[1])) as string;
    expect(Object.keys(JSON.parse(json)).sort()).toEqual(['k', 'l', 't']);
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

describe('batch grading', () => {
  it('reads a pasted class, labels lines, flags unreadable codes, floors, and averages without failed attempts', async () => {
    const good = await encodeSubmission(sub);
    const failed = await encodeSubmission({ ...sub, results: [{ levelId: 'l1-find-fc', raw: 10, labels: 'all', at: 0 }] });
    const text = `Ana R  ${good}\nBen T, ${failed}\nCy L  v1.notacodenotacode.zzz\n${good}`;
    const r = await parseBatch(text);
    expect(r.entries.length).toBe(2);
    expect(r.duplicatesRemoved).toBe(1);
    expect(r.unreadable.length).toBe(1);
    expect(r.entries[0].label).toBe('Ana R');
    expect(r.entries[0].levels[1]).toMatchObject({ raw: 38, grade: 50, passed: false });
    expect(r.entries[1].headline).toBe(50); // floored
    expect(r.entries[1].counts).toBe(false);
    expect(r.top).toBe(75); // (100 + 50) / 2
    expect(r.average).toBe(75); // the failed attempt is left out
  });
});

describe('autosave cleaning', () => {
  it('drops junk and keeps good data', () => {
    const s = cleanSnapshot({ results: [{ levelId: 'x', raw: 500, labels: 'weird', at: 1 }, 7, { raw: 3 }], learnDone: 'yes', learnStep: 3, soundId: 5 });
    expect(s?.results).toEqual([{ levelId: 'x', raw: 100, labels: 'all', at: 1 }]);
    expect(s?.learnDone).toBe(false);
    expect(s?.learnStep).toBe(3);
    expect(cleanSnapshot('nope')).toBeNull();
  });
});

describe('SynthLab patch codes', () => {
  it('reads a format-2 patch code', async () => {
    const code = await compress(JSON.stringify({ w1: 'q', fc: 1200, v: 2 }));
    const p = await decodePatch(`https://synthlab.mrcomiskey.com/?patch=${code}`);
    expect(p?.vco1Waveform).toBe('square');
    expect(p?.filterCutoff).toBe(1200);
    expect(p?.filterResonance).toBe(0.1); // default
  });
  it('returns null for rubbish', async () => {
    expect(await decodePatch('not a patch')).toBeNull();
  });
});

describe('pattern format', () => {
  it('accepts the example and rejects a bad one', () => {
    expect(validatePattern(example as never)).toEqual([]);
    expect(validatePattern({ id: 'x', tempo: 5 } as never).length).toBeGreaterThan(3);
  });
});
