import { describe, expect, it } from 'vitest';
import { applyAssignment, decodeAssignment, encodeAssignment, harderLabels } from './assignment';
import { ALL_LESSONS, ALL_LEVELS } from './batch';

const known = ALL_LEVELS.map((l) => l.id);

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
});
