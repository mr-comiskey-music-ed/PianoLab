import { LevelResult } from '../types';

/**
 * Autosave: keeps a student's work in THEIR OWN browser (localStorage) so closing the tab or reloading doesn't
 * lose it. Same idea as SynthLab and AudioPlot. Nothing is sent anywhere and no name is ever saved.
 * The submission code is still what students hand in. On load, a "Restore your last session?" prompt asks first;
 * autosave stays off until the student answers.
 */
/** Learn progress for one lesson. */
export interface LearnProgress {
  done: boolean;
  /** Index of the step the student is on. */
  step: number;
  /** The furthest step reached (steps before it are done). */
  max?: number;
}

export interface WorkSnapshot {
  results: LevelResult[];
  /** Learn progress by lesson id. (Saves from before Phase 2 had learnDone/learnStep for Lesson 1; they still load.) */
  learn: Record<string, LearnProgress>;
  /** The lesson picked in the lesson picker. */
  lessonId: string;
  soundId: string;
}

const KEY = 'pianolab:v1:autosave';
const LATENCY_KEY = 'pianolab:v1:latency';
const BEST_KEY = 'pianolab:v1:best';
const VERSION = 1;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown, min: number, max: number, fb: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fb);

/** Anything read back from storage is checked before it is used. */
export function cleanSnapshot(raw: unknown): WorkSnapshot | null {
  if (!isObj(raw)) return null;
  const results: LevelResult[] = [];
  if (Array.isArray(raw.results)) {
    for (const r of raw.results) {
      if (!isObj(r) || typeof r.levelId !== 'string' || !r.levelId) continue;
      const labels = r.labels === 'off' || r.labels === 'c' || r.labels === 'all' ? r.labels : 'all';
      results.push({ levelId: r.levelId, raw: num(r.raw, 0, 100, 0), labels, at: num(r.at, 0, Number.MAX_SAFE_INTEGER, 0) });
    }
  }
  const learn: Record<string, LearnProgress> = {};
  if (isObj(raw.learn)) {
    for (const [id, v] of Object.entries(raw.learn).slice(0, 50)) {
      if (!isObj(v) || !/^[a-z0-9-]{1,40}$/.test(id)) continue;
      learn[id] = { done: v.done === true, step: Math.round(num(v.step, 0, 200, 0)), ...(typeof v.max === 'number' ? { max: Math.round(num(v.max, 0, 200, 0)) } : {}) };
    }
  }
  // Older saves (Phase 1): Lesson 1 only.
  if (!learn['lesson-1'] && (raw.learnDone === true || typeof raw.learnStep === 'number'))
    learn['lesson-1'] = { done: raw.learnDone === true, step: Math.round(num(raw.learnStep, 0, 200, 0)) };
  return {
    results,
    learn,
    lessonId: typeof raw.lessonId === 'string' && /^[a-z0-9-]{1,40}$/.test(raw.lessonId) ? raw.lessonId : 'lesson-1',
    soundId: typeof raw.soundId === 'string' ? raw.soundId.slice(0, 40) : '',
  };
}

/** Used so an empty, brand-new session never overwrites a good save. */
export const hasWork = (s: WorkSnapshot) => s.results.length > 0 || Object.values(s.learn).some((p) => p.done || p.step > 0);

export function loadSaved(): { snapshot: WorkSnapshot; savedAt: number } | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!isObj(parsed) || parsed.v !== VERSION) return null;
    const snapshot = cleanSnapshot(parsed.data);
    if (!snapshot || !hasWork(snapshot)) return null;
    return { snapshot, savedAt: typeof parsed.savedAt === 'number' ? parsed.savedAt : Date.now() };
  } catch {
    return null;
  }
}

/** Returns true if the save worked. */
export function writeSaved(snapshot: WorkSnapshot): boolean {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ v: VERSION, savedAt: Date.now(), data: snapshot }));
    return true;
  } catch {
    return false;
  }
}

export function clearSaved() {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* nothing to clear */
  }
}

// ---------- Per-device settings (never hold a name) ----------
export function loadLatency(): number | null {
  // Saved as "2:<ms>". Plain numbers are from before the timing fix (they wrongly included the sound library's 100 ms
  // look-ahead), so they are ignored and the student is asked to check again.
  try {
    const m = (window.localStorage.getItem(LATENCY_KEY) ?? '').match(/^2:(-?\d+)$/);
    return m ? Number(m[1]) : null;
  } catch {
    return null;
  }
}
export function saveLatency(ms: number) {
  try {
    window.localStorage.setItem(LATENCY_KEY, `2:${Math.round(ms)}`);
  } catch {
    /* storage blocked */
  }
}

/** Personal best per level, in this browser only. */
export function loadBest(): Record<string, number> {
  try {
    const p = JSON.parse(window.localStorage.getItem(BEST_KEY) || '{}');
    return isObj(p) ? Object.fromEntries(Object.entries(p).filter(([, v]) => typeof v === 'number')) as Record<string, number> : {};
  } catch {
    return {};
  }
}
export function saveBest(levelId: string, raw: number): boolean {
  const best = loadBest();
  if ((best[levelId] ?? -1) >= raw) return false;
  best[levelId] = raw;
  try {
    window.localStorage.setItem(BEST_KEY, JSON.stringify(best));
  } catch {
    /* storage blocked */
  }
  return true;
}
