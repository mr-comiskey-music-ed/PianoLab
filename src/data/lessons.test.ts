import { describe, expect, it } from 'vitest';
import lessons from './lessons.json';
import { Lesson } from '../types';
import { parseChord } from '../utils/chords';
import { parseNote, pcOf } from '../utils/music';

const LESSONS = lessons.lessons as unknown as Lesson[];

describe('lesson content', () => {
  it('has unique ids', () => {
    const ids = LESSONS.flatMap((l) => [l.id, ...l.levels.map((v) => v.id), ...l.learn.map((s) => s.id)]);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('every Learn step can be played', () => {
    for (const l of LESSONS)
      for (const s of l.learn) {
        for (const d of s.demo ?? []) for (const n of d.split('+')) expect(parseNote(n), `${s.id} demo ${n}`).not.toBeNull();
        if (!s.show) expect((s.tryAnswer?.length ?? 0) + (s.tryChord?.length ?? 0), `${s.id} has an answer`).toBeGreaterThan(0);
        for (const a of s.tryAnswer ?? []) expect(pcOf(a), `${s.id} answer ${a}`).not.toBeNull();
        for (const c of s.tryChord ?? []) expect(parseChord(c), `${s.id} chord ${c}`).not.toBeNull();
      }
  });
  it('every level prompt makes sense for its type', () => {
    for (const l of LESSONS)
      for (const v of l.levels)
        for (const p of v.prompts) {
          const where = `${v.id}: ${p.text}`;
          if (['buildIt', 'nameChord', 'earCheck', 'smooth'].includes(v.type)) expect(parseChord(p.chord ?? ''), where).not.toBeNull();
          if (['nameChord', 'earCheck', 'nameIt'].includes(v.type) && v.choices) for (const a of p.answer ?? []) expect(v.choices, where).toContain(a);
          if (v.type === 'findIt') for (const a of p.answer ?? []) expect(pcOf(a), where).not.toBeNull();
          if (v.type === 'nameIt' || v.type === 'halfStep') expect(pcOf(p.show ?? ''), where).not.toBeNull();
          if (v.type === 'halfStep') expect(Math.abs(p.step ?? 0), where).toBe(1);
        }
  });
});
