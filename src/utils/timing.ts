/**
 * Timing grades for playing in time (SPEC section 7). Rhythm-game hit windows: Perfect ±50 ms, Good ±100 ms, Early/Late
 * up to ±220 ms. A chord's time is when its FIRST key goes down (his choice); the other keys count if they land within
 * GROUP_MS of it. The student's latency (from the latency check) is taken off every key press first.
 *
 * Each hit is graded twice (his calls):
 *   timing: Perfect 1, Good 0.8, Early/Late 0.5, "slid in" 0.33, Miss 0. Only the RIGHT notes in time earn timing
 *     credit: wrong notes are a Miss (in the tally and the timing score), the same as not playing.
 *   notes: 1 for the right notes (any octave); a level can grade more finely (`checkNotes`: Smooth levels give 0.75 for
 *     the second-smoothest move and 0 for anything bigger).
 * "Slid in": the first keys were near the beat but not quite the chord, and the student got to the right chord within
 * the hit's slide time (at least SLIDE_MS; PlayLevel allows up to half the chord's length). It counts as Early/Late in
 * the tally, right notes, and 0.33 timing credit. A `partial` result (Smooth levels: right notes, not smooth) is worth
 * that fraction of the whole chord (0.25), also under Early/Late.
 * Grade = half timing, half notes. A press more than MATCH_MS away from every hit doesn't match anything.
 */
export const PERFECT_MS = 50;
export const GOOD_MS = 100;
/** How far from a hit a press can be and still be "for" that hit (Early/Late beyond GOOD_MS). */
export const MATCH_MS = 220;
/** Keys within this long of a chord's first key belong to the same chord. */
export const GROUP_MS = 80;
/** How long after the first key a wrong chord can still be fixed ("slid in"). */
export const SLIDE_MS = 400;
const GOOD_CREDIT = 0.8;
/** Played, but further off than Good (up to MATCH_MS): Early or Late. Half credit for timing. */
const OFF_CREDIT = 0.5;
/** Slid into the right chord after a near-the-beat start. A third of the timing credit. */
const SLIDE_CREDIT = 0.33;

export interface ExpectedHit {
  /** Milliseconds from the start (the first downbeat after the count-in). */
  t: number;
  pcs: number[];
  /** Also right: e.g. the whole chord where the pattern has just its root (with Chord Names Only you can't tell). */
  alt?: number[];
  /** How long after the first key a wrong chord can still be fixed (default SLIDE_MS). */
  slideMs?: number;
}

/** 'off' = Early or Late (or slid in); 'miss' = not played, or wrong notes. */
export type HitStatus = 'perfect' | 'good' | 'off' | 'miss';
export interface HitResult {
  status: HitStatus;
  /** The right notes were played (in the end). */
  notesRight: boolean;
  /** Notes credit 0-1 (default: 1 if right, 0 if not). */
  notes?: number;
  /** Early (-) or late (+), ms. Missing if nothing was played for this hit. */
  dt?: number;
  /** Got to the right chord after a near-the-beat start. */
  slid?: boolean;
  /** A short word about the notes: "Wrong notes", "Not smooth", "Almost smooth". */
  why?: string;
  /** Right notes in the end but only part credit for the whole chord (timing and notes both), e.g. 0.25 for "Not
   *  smooth" on Smooth levels. Counted under Early/Late. */
  partial?: number;
}

export interface TimingSummary {
  perfect: number;
  good: number;
  /** Early or Late (including "slid in"). */
  off: number;
  /** Not played, or wrong notes. */
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

const timingCredit = (r: HitResult) =>
  r.partial !== undefined ? r.partial : r.status === 'perfect' ? 1 : r.status === 'good' ? GOOD_CREDIT : r.status === 'off' ? (r.slid ? SLIDE_CREDIT : OFF_CREDIT) : 0;
const notesCredit = (r: HitResult) => r.notes ?? (r.notesRight ? 1 : 0);

export function summarize(results: (HitResult | undefined)[]): TimingSummary {
  const total = results.length;
  const r = results.map((x) => x ?? { status: 'miss' as const, notesRight: false });
  const count = (s: HitStatus) => r.filter((x) => x.status === s).length;
  const timing = total ? (r.reduce((a, x) => a + timingCredit(x), 0) / total) * 100 : 0;
  const notes = total ? (r.reduce((a, x) => a + notesCredit(x), 0) / total) * 100 : 0;
  return {
    perfect: count('perfect'),
    good: count('good'),
    off: count('off'),
    miss: count('miss'),
    notesRight: r.filter((x) => x.notesRight).length,
    total,
    timing: Math.round(timing),
    notes: Math.round(notes),
    raw: Math.round((timing + notes) / 2),
  };
}

/** How right a chord's keys are for a hit: credit 0-1 and an optional word; `partial` = right notes, but the whole chord
 *  only earns that much (timing and notes). */
export type NotesCheck = (hit: number, keys: number[]) => { credit: number; why?: string; partial?: number };

/** The default: the right note names (pitch classes), any octave, nothing extra. */
export const pitchClassCheck =
  (hits: ExpectedHit[]): NotesCheck =>
  (i, keys) => {
    const got = new Set(keys.map((k) => ((k % 12) + 12) % 12));
    const same = (want: number[]) => got.size === new Set(want).size && want.every((p) => got.has(p));
    return same(hits[i].pcs) || (hits[i].alt && same(hits[i].alt!)) ? { credit: 1 } : { credit: 0, why: 'Wrong notes' };
  };

/**
 * Judges a run live. Feed it key presses (`press`, a MIDI note) with their time in ms on the same clock as the hits;
 * call `tick` now and then so hits that went by unplayed become misses. `onResult` is called once per hit (and again if
 * a wrong chord is fixed in time: "slid in").
 */
export class TimingJudge {
  readonly results: (HitResult | undefined)[];
  /** When each chord/note was played (ms, latency already taken off), matched or not. For `steadyOffset`. */
  readonly presses: number[] = [];
  private group: { t: number; keys: number[]; timer: number } | null = null;
  /** A wrong chord that can still be fixed (until `deadline`). */
  private slide: { i: number; dt: number; deadline: number; keys: number[] } | null = null;
  private setTimer: (fn: () => void, ms: number) => number;
  private check: NotesCheck;
  private getHeld?: () => number[];

  constructor(
    private hits: ExpectedHit[],
    private latencyMs: number,
    private onResult: (index: number, r: HitResult) => void,
    opts: { setTimer?: (fn: () => void, ms: number) => number; checkNotes?: NotesCheck; getHeld?: () => number[] } = {},
  ) {
    this.results = hits.map(() => undefined);
    this.setTimer = opts.setTimer ?? ((fn, ms) => window.setTimeout(fn, ms));
    this.check = opts.checkNotes ?? pitchClassCheck(hits);
    this.getHeld = opts.getHeld;
  }

  /** A key (MIDI note) went down at time `t` (ms). */
  press(t: number, key: number) {
    const at = t - this.latencyMs;
    if (this.group && at - this.group.t <= GROUP_MS) {
      this.group.keys.push(key);
      return;
    }
    this.closeGroup();
    // Fixing a wrong chord ("sliding in"), unless this press is really for the next hit.
    const sl = this.slide;
    if (sl && at <= sl.deadline && !this.hits.some((h, i) => !this.results[i] && Math.abs(at - h.t) <= MATCH_MS)) {
      sl.keys.push(key);
      const keys = this.getHeld ? this.getHeld() : sl.keys;
      const c = this.check(sl.i, keys);
      if (c.credit > 0) {
        const r: HitResult =
          c.partial !== undefined
            ? { status: 'off', notesRight: true, notes: c.partial, partial: c.partial, dt: sl.dt, slid: true, why: c.why }
            : { status: 'off', notesRight: true, notes: c.credit, dt: sl.dt, slid: true, why: c.why };
        this.results[sl.i] = r;
        this.slide = null;
        this.onResult(sl.i, r);
      }
      return;
    }
    this.slide = null;
    const g = { t: at, keys: [key], timer: 0 };
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
    const c = this.check(best, g.keys);
    const dt = Math.round(bestDt);
    const a = Math.abs(bestDt);
    const notesRight = c.credit > 0;
    // Wrong notes = Miss (no timing credit), but they can still be fixed for a moment.
    const status: HitStatus = !notesRight ? 'miss' : c.partial !== undefined ? 'off' : a <= PERFECT_MS ? 'perfect' : a <= GOOD_MS ? 'good' : 'off';
    const r: HitResult =
      c.partial !== undefined ? { status, notesRight, notes: c.partial, partial: c.partial, dt, why: c.why } : { status, notesRight, notes: c.credit, dt, why: c.why };
    this.results[best] = r;
    if (!notesRight) this.slide = { i: best, dt, deadline: g.t + (this.hits[best].slideMs ?? SLIDE_MS), keys: [...g.keys] };
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

/** Taps that wander more than this (typical distance from their own middle value, ms) are "uneven". */
export const STEADY_MS = 30;
/**
 * How much latency-check taps wander around their own middle value (the median distance from the median, ms). Being
 * steadily early or late doesn't count: that steady amount IS the latency. Only going back and forth around the beat does.
 */
export function tapSpread(offsets: number[]): number {
  if (!offsets.length) return 0;
  const mid = (xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  };
  const m = mid(offsets);
  return Math.round(mid(offsets.map((o) => Math.abs(o - m))));
}
