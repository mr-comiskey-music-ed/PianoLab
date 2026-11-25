import { describe, expect, it } from 'vitest';
import lessons from './lessons.json';
import { Lesson } from '../types';
import { KEYS, chordName, diatonic, diatonicSevenths, keyById, parseChord } from '../utils/chords';
import { parseNote, pcOf } from '../utils/music';
import { validatePattern } from './pattern';
import { buildTimeline } from '../utils/patternEngine';

const LESSONS = lessons.lessons as unknown as Lesson[];

describe('lesson content', () => {
  it('has unique ids', () => {
    const ids = LESSONS.flatMap((l) => [l.id, ...l.levels.map((v) => v.id), ...l.learn.map((s) => s.id)]);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('every Learn step can be played', () => {
    for (const l of LESSONS)
      for (const s of l.learn) {
        for (const d of s.demo ?? []) for (const n of d.replace(/\*\d+(\.\d+)?$/, '').split('+').filter((x) => x !== '_')) expect(parseNote(n), `${s.id} demo ${n}`).not.toBeNull();
        for (const n of Object.keys(s.tags ?? {})) expect(parseNote(n), `${s.id} tag ${n}`).not.toBeNull();
        if (s.tryInterval !== undefined) expect(s.tryInterval, `${s.id} interval`).toBeGreaterThan(0);
        if (!s.show) expect((s.tryAnswer?.length ?? 0) + (s.tryChord?.length ?? 0) + (s.tryTriad ? 1 : 0) + (s.tryProgression?.length ?? 0) + (s.tryInterval ? 1 : 0) + (s.tryScale ? 1 : 0) + (s.rhythm ? 1 : 0), `${s.id} has an answer`).toBeGreaterThan(0);
        for (const a of s.tryAnswer ?? []) expect(pcOf(a), `${s.id} answer ${a}`).not.toBeNull();
        for (const c of [...(s.tryChord ?? []), ...(s.tryProgression ?? [])]) expect(parseChord(c), `${s.id} chord ${c}`).not.toBeNull();
        // Every progression chord belongs to its key, and every strip/demoKeys key exists.
        if (s.tryProgression && !s.tryNames) for (const c of s.tryProgression) expect([...diatonic(keyById(s.tryKey ?? 'C')), ...diatonicSevenths(keyById(s.tryKey ?? 'C'))].some((d) => chordName(d.chord) === chordName(parseChord(c)!)), `${s.id}: ${c} in ${s.tryKey}`).toBe(true);
        for (const k of [...(s.strip ?? []), ...(s.demoKeys ?? [])]) expect(KEYS.some((x) => x.id === k), `${s.id} key ${k}`).toBe(true);
        if (s.demoKeys) expect(s.demoKeys.length, `${s.id} demoKeys`).toBe(s.demo?.length);
        if (s.tryScale) expect(KEYS.some((k) => k.mode === 'major' && k.id === s.tryScale), `${s.id} scale`).toBe(true);
        // Finger numbers / tags only on show steps: on a try step they'd show which keys to press.
        if (s.tags) expect(s.show, `${s.id} tags only on show steps`).toBe(true);
      }
  });
  it('Learn sections come in one run each (the step list groups them)', () => {
    for (const l of LESSONS) {
      const runs = l.learn.map((s) => s.section).filter((sec, i, all) => i === 0 || all[i - 1] !== sec);
      expect(new Set(runs).size, `${l.id} sections: ${runs.join(' > ')}`).toBe(runs.length);
    }
  });
  it('every level prompt makes sense for its type', () => {
    for (const l of LESSONS)
      for (const v of l.levels)
        for (const p of v.prompts) {
          const where = `${v.id}: ${p.text}`;
          if (['buildIt', 'nameChord', 'earCheck', 'smooth', 'speed'].includes(v.type)) expect(parseChord(p.chord ?? ''), where).not.toBeNull();
          if (['nameChord', 'earCheck', 'nameIt'].includes(v.type) && (p.choices ?? v.choices)) for (const a of p.answer ?? []) expect(p.choices ?? v.choices, where).toContain(a);
          if (v.type === 'nameChord') expect((p.choices ?? v.choices ?? []).length, where).toBeGreaterThan(1);
          if (v.type === 'findIt') for (const a of p.answer ?? []) expect(pcOf(a), where).not.toBeNull();
          if (v.type === 'nameIt' || v.type === 'halfStep') expect(pcOf(p.show ?? ''), where).not.toBeNull();
          if (v.type === 'halfStep') expect(Math.abs(p.step ?? 0), where).toBeGreaterThan(0);
          if (v.type === 'scale') expect(KEYS.some((k) => k.mode === 'major' && k.id === p.scale), `${where} key ${p.scale}`).toBe(true);
          if (v.type === 'quiz') expect(p.choices ?? v.choices, where).toContain(p.answer?.[0]);
          if (v.type === 'echo') {
            expect((p.notes ?? []).length, where).toBeGreaterThan(1);
            for (const n of p.notes ?? []) expect(parseNote(n), `${where} ${n}`).not.toBeNull();
          }
        }
  });
  it('timed levels are well formed', () => {
    for (const l of LESSONS)
      for (const v of l.levels) {
        if (v.type === 'play') {
          expect(v.pattern, v.id).toBeDefined();
          expect(validatePattern(v.pattern!), v.id).toEqual([]);
          const t = buildTimeline(v.pattern!);
          // every bar's numeral is in the key, and every note fits on the 25 keys (C3-C5)
          expect(t.bars.length, v.id).toBe(v.pattern!.bars);
          for (const h of t.hits) for (const n of h.notes) expect(n >= 48 && n <= 72, `${v.id} note ${n}`).toBe(true);
        }
        if (v.type === 'speed') {
          expect(v.seconds, v.id).toBeGreaterThan(0);
          expect(v.target, v.id).toBeGreaterThan(0);
          expect(v.prompts.length, v.id).toBeGreaterThan(3);
        }
      }
  });
});
