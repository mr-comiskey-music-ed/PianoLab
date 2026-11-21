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

/** Credit for one prompt: right first try = 1, right on the second try = half, after that = 0. */
export const credit = (misses: number) => (misses === 0 ? 1 : misses === 1 ? 0.5 : 0);

/** Accuracy percent from the credit earned over the number of prompts. */
export function accuracy(points: number, total: number): number {
  return total > 0 ? (points / total) * 100 : 0;
}
