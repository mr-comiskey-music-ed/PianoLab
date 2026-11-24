import { describe, expect, it } from 'vitest';
import { shuffleNoRepeats } from './shuffle';
import lessons from '../data/lessons.json';
import { Lesson } from '../types';

const key = (p: { text: string; notes?: string[]; chord?: string; show?: string; inv?: number; step?: number; answer?: string[] }) =>
  [p.text, p.chord ?? '', p.show ?? '', p.inv ?? '', p.step ?? '', (p.answer ?? []).join('/'), (p.notes ?? []).join()].join('|');

describe('no question twice in a row', () => {
  it('never repeats a question back to back, in any level (1000 shuffles each)', () => {
    for (const les of lessons.lessons as unknown as Lesson[])
      for (const lv of les.levels) {
        if (lv.type === 'smooth' || lv.type === 'play') continue; // Smooth Mover keeps its order; play levels have no questions
        for (let k = 0; k < 1000; k++) {
          const order = shuffleNoRepeats(lv.prompts, key, key(lv.prompts[0]));
          expect(order.length).toBe(lv.prompts.length);
          expect(key(order[0]), `${lv.id} opens with the last question`).not.toBe(key(lv.prompts[0]));
          for (let i = 1; i < order.length; i++) expect(key(order[i]), `${lv.id} repeats at ${i}`).not.toBe(key(order[i - 1]));
        }
      }
  });
  it('keeps every question', () => {
    const xs = ['a', 'a', 'a', 'b', 'b', 'c'];
    const out = shuffleNoRepeats(xs, (x) => x);
    expect([...out].sort()).toEqual(xs);
    for (let i = 1; i < out.length; i++) expect(out[i]).not.toBe(out[i - 1]);
  });
});
