import { Level, Submission } from '../types';
import { decodeSubmission } from './codec';
import { bestByLevel, floored, passed } from './grading';
import lessons from '../data/lessons.json';

export const ALL_LEVELS: Level[] = (lessons.lessons as unknown as { levels: Level[] }[]).flatMap((l) => l.levels);
export const levelInfo = (id: string) => ALL_LEVELS.find((l) => l.id === id);

/** An attempt where every raw score is under this is treated as "obviously not a real try" and left out of the class average. */
export const FAILED_ATTEMPT_RAW = 25;

export interface LevelLine {
  levelId: string;
  title: string;
  raw: number;
  grade: number;
  passed: boolean;
  labels: string;
}

export interface BatchEntry {
  id: number;
  /** The name inside the code; if there is none (older codes), whatever was pasted next to it. Never stored. */
  label: string;
  submission: Submission;
  levels: LevelLine[];
  /** Average of the floored grades for the levels this student did. */
  headline: number | null;
  /** True when this attempt counts toward the class average. */
  counts: boolean;
}

export interface BatchResult {
  entries: BatchEntry[];
  unreadable: string[];
  duplicatesRemoved: number;
  top: number | null;
  average: number | null;
}

// New codes look like v1.<compressed>.<checksum>.
const LOOKS_LIKE_CODE = /^v\d+\.[A-Za-z0-9_-]{8,}\.[a-z0-9]{1,8}$/;
const LONG_TOKEN = 30;

export function summarize(sub: Submission): { levels: LevelLine[]; headline: number | null; counts: boolean } {
  const best = bestByLevel(sub.results);
  const levels: LevelLine[] = Object.values(best).map((r) => {
    const info = levelInfo(r.levelId);
    return {
      levelId: r.levelId,
      title: info?.title ?? r.levelId,
      raw: Math.round(r.raw),
      grade: floored(r.raw),
      passed: info ? passed(r.raw, info) : false,
      labels: r.labels,
    };
  });
  const headline = levels.length ? Math.round(levels.reduce((a, l) => a + l.grade, 0) / levels.length) : null;
  const counts = levels.some((l) => l.raw >= FAILED_ATTEMPT_RAW);
  return { levels, headline, counts };
}

/**
 * Pull every code out of pasted text (a column from Classroom or a spreadsheet, one per line, comma-separated,
 * mixed with names...), then decode each one. Same approach as SynthLab's batch grader.
 */
export async function parseBatch(text: string): Promise<BatchResult> {
  const seen = new Set<string>();
  const jobs: { token: string; label: string }[] = [];
  let duplicatesRemoved = 0;

  for (const line of text.split(/\r?\n/)) {
    const tokens = line.split(/[\s,;"'|]+/).filter(Boolean);
    const candidates = tokens.filter((t) => LOOKS_LIKE_CODE.test(t) || t.length >= LONG_TOKEN);
    const label = tokens.filter((t) => !candidates.includes(t)).join(' ').slice(0, 40);
    for (const token of candidates) {
      if (seen.has(token)) {
        duplicatesRemoved++;
        continue;
      }
      seen.add(token);
      jobs.push({ token, label });
    }
  }

  const decoded = await Promise.all(jobs.map((j) => decodeSubmission(j.token)));
  const entries: BatchEntry[] = [];
  const unreadable: string[] = [];
  decoded.forEach((sub, i) => {
    if (!sub) {
      unreadable.push(jobs[i].label || `${jobs[i].token.slice(0, 14)}...`);
      return;
    }
    entries.push({ id: entries.length + 1, label: sub.name || jobs[i].label, submission: sub, ...summarize(sub) });
  });

  const counted = entries.filter((e) => e.counts && e.headline !== null).map((e) => e.headline as number);
  const all = entries.filter((e) => e.headline !== null).map((e) => e.headline as number);
  return {
    entries,
    unreadable,
    duplicatesRemoved,
    top: all.length ? Math.max(...all) : null,
    average: counted.length ? Math.round(counted.reduce((a, b) => a + b, 0) / counted.length) : null,
  };
}
