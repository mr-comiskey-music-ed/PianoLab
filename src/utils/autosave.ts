import { LevelResult } from '../types';

/**
 * Autosave: keeps a student's work in THEIR OWN browser (localStorage) so closing the tab or reloading doesn't
 * lose it. Same idea as SynthLab and AudioPlot. Nothing is sent anywhere and no name is ever saved.
 * The submission code is still what students hand in. On load, a "Restore your last session?" prompt asks first;
 * autosave stays off until the student answers.
 */
export interface WorkSnapshot {
  results: LevelResult[];
  learnDone: boolean;
  /** How far through Learn: index of the next step. */
  learnStep: number;
  soundId: string;
  labels: 'off' | 'c' | 'all';
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
  return {
    results,
    learnDone: raw.learnDone === true,
    learnStep: Math.round(num(raw.learnStep, 0, 200, 0)),
    soundId: typeof raw.soundId === 'string' ? raw.soundId.slice(0, 40) : '',
    labels: raw.labels === 'off' || raw.labels === 'c' || raw.labels === 'all' ? raw.labels : 'all',
  };
}

/** Used so an empty, brand-new session never overwrites a good save. */
export const hasWork = (s: WorkSnapshot) => s.results.length > 0 || s.learnDone || s.learnStep > 0;

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
  try {
    const v = Number(window.localStorage.getItem(LATENCY_KEY));
    return Number.isFinite(v) && window.localStorage.getItem(LATENCY_KEY) !== null ? v : null;
  } catch {
    return null;
  }
}
export function saveLatency(ms: number) {
  try {
    window.localStorage.setItem(LATENCY_KEY, String(Math.round(ms)));
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
