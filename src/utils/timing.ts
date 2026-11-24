/**
 * Timing grades for playing in time (SPEC section 7). Rhythm-game hit windows: Perfect ±50 ms, Good ±100 ms, Miss beyond.
 * A chord's time is when its FIRST key goes down (his choice); the other keys count if they land within GROUP_MS of it.
 * The student's latency (from the latency check) is taken off every key press first.
 *
 * Each hit is graded twice: timing (Perfect = 1, Good = 0.75, Miss = 0) and notes (the right note names, any octave).
 * Grade = half timing, half notes. A press more than MATCH_MS away from every hit doesn't match anything.
 */
export const PERFECT_MS = 50;
export const GOOD_MS = 100;
/** How far from a hit a press can be and still be "for" that hit (graded as a timing miss beyond GOOD_MS). */
export const MATCH_MS = 220;
/** Keys within this long of a chord's first key belong to the same chord. */
export const GROUP_MS = 80;
const GOOD_CREDIT = 0.75;

export interface ExpectedHit {
  /** Milliseconds from the start (the first downbeat after the count-in). */
  t: number;
  pcs: number[];
}

export type HitStatus = 'perfect' | 'good' | 'miss';
export interface HitResult {
  status: HitStatus;
  /** The right note names were played. */
  notesRight: boolean;
  /** Early (-) or late (+), ms. Missing if nothing was played for this hit. */
  dt?: number;
}

export interface TimingSummary {
  perfect: number;
  good: number;
  miss: number;
  notesRight: number;
  total: number;
  /** 0-100 */
  timing: number;
  notes: number;
  /** 0-100: half timing, half notes. This is the level's raw score. */
  raw: number;
  /** Set when nearly every press was early (-) or late (+) by about the same amount (ms): a sign the latency setting
   *  may be wrong. See `steadyOffset`. */
  offset?: number;
}

export function summarize(results: (HitResult | undefined)[]): TimingSummary {
  const total = results.length;
  const r = results.map((x) => x ?? { status: 'miss' as const, notesRight: false });
  const perfect = r.filter((x) => x.status === 'perfect').length;
  const good = r.filter((x) => x.status === 'good').length;
  const notesRight = r.filter((x) => x.notesRight).length;
  const timing = total ? ((perfect + GOOD_CREDIT * good) / total) * 100 : 0;
  const notes = total ? (notesRight / total) * 100 : 0;
  return { perfect, good, miss: total - perfect - good, notesRight, total, timing: Math.round(timing), notes: Math.round(notes), raw: Math.round((timing + notes) / 2) };
}

/**
 * Judges a run live. Feed it key presses (`press`) with their time in ms on the same clock as the hits; call `tick` now
 * and then so hits that went by unplayed become misses. `onResult` is called once per hit.
 */
export class TimingJudge {
  readonly results: (HitResult | undefined)[];
  /** When each chord/note was played (ms, latency already taken off), matched or not. For `steadyOffset`. */
  readonly presses: number[] = [];
  private group: { t: number; pcs: Set<number>; timer: number } | null = null;

  constructor(
    private hits: ExpectedHit[],
    private latencyMs: number,
    private onResult: (index: number, r: HitResult) => void,
    private setTimer: (fn: () => void, ms: number) => number = (fn, ms) => window.setTimeout(fn, ms),
  ) {
    this.results = hits.map(() => undefined);
  }

  /** A key went down at time `t` (ms). */
  press(t: number, pitchClass: number) {
    const at = t - this.latencyMs;
    if (this.group && at - this.group.t <= GROUP_MS) {
      this.group.pcs.add(pitchClass);
      return;
    }
    this.closeGroup();
    const g = { t: at, pcs: new Set([pitchClass]), timer: 0 };
    g.timer = this.setTimer(() => {
      if (this.group === g) this.closeGroup();
    }, GROUP_MS + 5);
    this.group = g;
  }

  /** Judge the chord/note that has been gathering. */
  closeGroup() {
    const g = this.group;
    this.group = null;
    if (!g) return;
    this.presses.push(g.t);
    // The nearest hit not yet judged, within MATCH_MS.
    let best = -1;
    let bestDt = Infinity;
    this.hits.forEach((h, i) => {
      if (this.results[i]) return;
      const dt = g.t - h.t;
      if (Math.abs(dt) <= MATCH_MS && Math.abs(dt) < Math.abs(bestDt)) {
        best = i;
        bestDt = dt;
      }
    });
    if (best < 0) return; // not near any hit: ignored
    const want = this.hits[best].pcs;
    const notesRight = g.pcs.size === want.length && want.every((p) => g.pcs.has(p));
    const a = Math.abs(bestDt);
    const status: HitStatus = a <= PERFECT_MS ? 'perfect' : a <= GOOD_MS ? 'good' : 'miss';
    const r = { status, notesRight, dt: Math.round(bestDt) };
    this.results[best] = r;
    this.onResult(best, r);
  }

  /** Hits that went by more than MATCH_MS ago without a press become misses. */
  tick(now: number) {
    const at = now - this.latencyMs;
    this.hits.forEach((h, i) => {
      if (this.results[i] || at - h.t <= MATCH_MS + GROUP_MS) return;
      const r: HitResult = { status: 'miss', notesRight: false };
      this.results[i] = r;
      this.onResult(i, r);
    });
  }
}

/** Presses needed before a steady offset counts, the smallest offset worth mentioning, and how many presses must agree. */
const OFFSET_MIN_PRESSES = 4;
export const OFFSET_MIN_MS = 70;
const OFFSET_AGREE = 0.7;

/**
 * Is the student consistently off by about the same amount? Each press is compared with the nearest hit (up to half a
 * beat away, so even a latency setting that is far off shows up). If at least 70% of presses are on the same side and
 * the middle value is 70 ms or more, returns that offset (ms, - early / + late); otherwise null.
 */
export function steadyOffset(presses: number[], hitTimes: number[], maxMs: number): number | null {
  const ds = presses
    .map((p) => hitTimes.reduce((best, h) => (Math.abs(p - h) < Math.abs(best) ? p - h : best), Infinity))
    .filter((d) => Math.abs(d) <= maxMs)
    .sort((a, b) => a - b);
  if (ds.length < OFFSET_MIN_PRESSES) return null;
  const mid = ds[Math.floor(ds.length / 2)];
  const sameSide = ds.filter((d) => Math.sign(d) === Math.sign(mid)).length / ds.length;
  return Math.abs(mid) >= OFFSET_MIN_MS && sameSide >= OFFSET_AGREE ? Math.round(mid) : null;
}
