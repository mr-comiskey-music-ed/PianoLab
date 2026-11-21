import { Level, LevelResult } from '../types';

/** A completed attempt never records below this, because raw percentages are brutal at first. */
export const GRADE_FLOOR = 50;
export const DEFAULT_PASS = 80;

/** The grade the student sees. Only for a completed attempt. */
export const floored = (raw: number) => Math.max(GRADE_FLOOR, Math.round(raw));

/** Pass/fail always uses the RAW score. The floor never changes whether a level is passed. */
export const passed = (raw: number, level: Pick<Level, 'pass'>) => Math.round(raw) >= (level.pass ?? DEFAULT_PASS);

/** Best result for each level (highest raw wins). */
export function bestByLevel(results: LevelResult[]): Record<string, LevelResult> {
  const out: Record<string, LevelResult> = {};
  for (const r of results) if (!out[r.levelId] || r.raw > out[r.levelId].raw) out[r.levelId] = r;
  return out;
}

/** First-try accuracy: right on the first press counts 1, a retry counts 0. */
export function accuracy(firstTryCorrect: number, total: number): number {
  return total > 0 ? (firstTryCorrect / total) * 100 : 0;
}
