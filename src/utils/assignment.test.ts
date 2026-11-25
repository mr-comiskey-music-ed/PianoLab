import { describe, expect, it } from 'vitest';
import { applyAssignment, decodeAssignment, encodeAssignment, harderLabels, openTab } from './assignment';
import { ALL_LESSONS, ALL_LEVELS } from './batch';

const known = ALL_LEVELS.map((l) => l.id);
const lessonIds = ALL_LESSONS.map((l) => l.id);

describe('assignment links', () => {
  it('round-trips through a link', async () => {
    const t = await encodeAssignment({ title: 'Week 3', levels: ['l3-play-pop', 'l2-build-cfg'], labels: 'c', tempo: 90, sound: 'accurate' });
    const a = await decodeAssignment(`https://pianolab.example/?a=${t}`, known);
    expect(a).toEqual({ title: 'Week 3', levels: ['l3-play-pop', 'l2-build-cfg'], labels: 'c', tempo: 90, sound: 'accurate' });
  });
  it('rejects edited links and drops unknown levels', async () => {
    const t = await encodeAssignment({ title: 'X', levels: ['l1-find-fc', 'no-such-level'] });
    expect((await decodeAssignment(t, known))?.levels).toEqual(['l1-find-fc']);
    expect(await decodeAssignment(t.slice(0, -1) + (t.endsWith('a') ? 'b' : 'a'), known)).toBeNull();
    expect(await decodeAssignment((await encodeAssignment({ title: 'X', levels: ['gone'] })), known)).toBeNull();
  });
  it('shows only assigned lessons and levels, never with easier note names', () => {
    const ls = applyAssignment(ALL_LESSONS, { title: 'X', levels: ['l1-find-fc', 'l1-name-fc', 'l5-build-major'], labels: 'c' });
    expect(ls.map((l) => l.id)).toEqual(['lesson-1', 'lesson-5']);
    expect(ls[0].levels.map((v) => v.id)).toEqual(['l1-find-fc', 'l1-name-fc']);
    for (const l of ls) for (const v of l.levels) expect(['c', 'off']).toContain(v.labels);
    expect(ls[0].levels[1].labels).toBe('off'); // Name It stays off
    expect(harderLabels('all', 'off')).toBe('off');
  });
  it('carries Learn, limits, a note, the opening tab and a Jam Room setup', async () => {
    const jam = { source: 'groove' as const, groove: 'funk', key: 'Am', prog: 'custom', custom: 'i iv v i', bpm: 90, keyLock: 'on' as const, melody: 'choose' as const };
    const t = await encodeAssignment({ title: 'Jam day', levels: ['l1-echo'], learn: ['lesson-2', 'nope'], echo: 'ear', screen: 'names', open: 'jam', note: 'Save 1 minute.', jam });
    const a = await decodeAssignment(t, known, lessonIds);
    expect(a).toMatchObject({ title: 'Jam day', levels: ['l1-echo'], learn: ['lesson-2'], echo: 'ear', screen: 'names', open: 'jam', note: 'Save 1 minute.', jam });
    const ls = applyAssignment(ALL_LESSONS, a);
    expect(ls.map((l) => l.id)).toEqual(['lesson-1', 'lesson-2']);
    expect(ls[1].levels).toEqual([]); // Learn only
    expect(ls[0].levels[0].echo).toBe('ear');
  });
  it('can assign just Learn, just the Jam Room or just the Sandbox', async () => {
    const learnOnly = await decodeAssignment(await encodeAssignment({ title: 'L', levels: [], learn: ['lesson-3'] }), known, lessonIds);
    expect(learnOnly && openTab(learnOnly)).toBe('learn');
    const jamOnly = await decodeAssignment(await encodeAssignment({ title: 'J', levels: [], jam: { source: 'youtube', video: 'abcdefghijk', key: 'Am', keyLock: 'off', melody: 'on' } }), known, lessonIds);
    expect(jamOnly && openTab(jamOnly)).toBe('jam');
    expect(jamOnly?.jam?.video).toBe('abcdefghijk');
    const sandbox = await decodeAssignment(await encodeAssignment({ title: 'S', levels: [], open: 'sandbox' }), known, lessonIds);
    expect(sandbox && openTab(sandbox)).toBe('sandbox');
    expect(await decodeAssignment(await encodeAssignment({ title: 'Nothing', levels: [] }), known, lessonIds)).toBeNull();
  });
  it('timed levels can be limited to Chord Names Only (not scale levels)', () => {
    const ls = applyAssignment(ALL_LESSONS, { title: 'X', levels: ['l3-play-pop', 'l7-time-c'], screen: 'names' });
    const lv = ls.flatMap((l) => l.levels);
    expect(lv.find((v) => v.id === 'l3-play-pop')?.screen).toBe('names');
    expect(lv.find((v) => v.id === 'l7-time-c')?.screen ?? 'blocks').toBe('blocks');
  });
});
