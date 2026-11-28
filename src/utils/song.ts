import { Chord, KeyDef, Quality, chordName, keyById, matchesChord, parseChord } from './chords';
import { pc } from './music';

/**
 * Songs lesson: graded YouTube play-alongs (his plan). The app can't hear the video, so each song level carries a chart:
 * where bar 1 starts in the video, the tempo, and the chords bar by bar. Grading is bar by bar (his pick): a bar counts
 * if the student played the right thing somewhere in it, in any rhythm.
 */
export type SongPart = 'chords' | 'bass' | 'melody';

export interface SongChart {
  /** The YouTube link or 11-character video id. */
  video: string;
  /** Seconds into the video where bar 1's beat 1 lands. */
  beat1: number;
  bpm: number;
  /** Beats per bar (default 4). */
  beats?: number;
  /** Where the video starts when Start is pressed (seconds). Default: two bars before bar 1. */
  start?: number;
  /** The song's key ("Am", "D"): numerals, and the notes that count for a melody. */
  key: string;
  /** What the student plays: the chords, the bass (each chord's root), or a melody in the key. */
  part: SongPart;
  /**
   * The chords, one per bar: "Am F C G". "Am*2" = two bars of Am; "C,G" = two chords sharing a bar (half each);
   * "(Am F C G)x4" repeats a group; "%" repeats the last bar; "N.C." = no chord (not graded).
   */
  chart: string;
  /** Melody parts: which scale counts (a Jam Room scale id: "penta-minor", "blues"...). Default: the key's own scale. */
  scale?: string;
}

/** One graded stretch of the song: usually a bar, half a bar when two chords share it. */
export interface SongUnit {
  bar: number;
  /** Beats from bar 1's beat 1. */
  at: number;
  len: number;
  /** As written ("Am7", "C/E"), and the chord it means; null = no chord (not graded for chords/bass). */
  text: string;
  chord: Chord | null;
}

/** Read one chord as charts write it: slash chords by their chord, sus/add/odd ones as their plain triad. */
export function chartChord(tok: string): Chord | null {
  const t = tok.replace(/[()]/g, '').split('/')[0];
  const c = parseChord(t);
  if (c) return c;
  const m = t.match(/^([A-G][#b♯♭]?)(.*)$/);
  if (!m) return null;
  return parseChord(m[1] + (/^(m(?!aj)|min|-)/.test(m[2]) ? 'm' : ''));
}

/** Expand "(Am F)x2" groups (one level deep is plenty for a chart). */
function expandRepeats(text: string): string {
  return text.replace(/\(([^()]*)\)\s*[x×*](\d+)/gi, (_, inner: string, n: string) => Array(Math.min(64, Number(n))).fill(inner).join(' '));
}

/** The chart, bar by bar and chord by chord. */
export function parseChart(text: string, beatsPerBar = 4): SongUnit[] {
  const units: SongUnit[] = [];
  let bar = 0;
  let last: string[] | null = null;
  for (const raw of expandRepeats(text).split(/[\s|]+/).filter(Boolean)) {
    let tok = raw;
    let times = 1;
    const rep = tok.match(/^(.+)\*(\d+)$/);
    if (rep) {
      tok = rep[1];
      times = Math.min(64, Number(rep[2]));
    }
    const parts: string[] = tok === '%' && last ? last : tok.split(',').filter(Boolean);
    last = parts;
    for (let r = 0; r < times; r++) {
      parts.forEach((p, k) => {
        const len = beatsPerBar / parts.length;
        const nc = /^(N\.?C\.?|-|x)$/i.test(p);
        units.push({ bar, at: bar * beatsPerBar + k * len, len, text: p.replace('#', '♯').replace(/^([A-G])b/, '$1♭'), chord: nc ? null : chartChord(p) });
      });
      bar++;
    }
    if (bar > 400) break;
  }
  return units;
}

/** "Am – F – C – G × 4 · 16 bars" for the start screen. */
export function chartSummary(units: SongUnit[]): string {
  const bars: string[] = [];
  units.forEach((u) => {
    const s = u.chord ? chordName(u.chord) : 'N.C.';
    if (bars[u.bar] === undefined) bars[u.bar] = s;
    else bars[u.bar] += `, ${s}`;
  });
  const n = bars.length;
  for (const size of [1, 2, 4, 8]) {
    if (n % size || n === size) continue;
    const loop = bars.slice(0, size);
    if (bars.every((b, i) => b === loop[i % size])) return `${loop.join(' – ')} × ${n / size} · ${n} bars`;
  }
  const shown = bars.slice(0, 8).join(' – ');
  return `${shown}${n > 8 ? ' …' : ''} · ${n} bars`;
}

const TRIAD_OF: Partial<Record<Quality, Quality>> = { dom7: 'maj', maj7: 'maj', min7: 'min', hdim7: 'dim', dim7: 'dim' };
/** Right chord: exactly its notes (any octave or inversion), or for a 7th chord its plain triad too. */
export function chordOk(held: number[], c: Chord): boolean {
  if (matchesChord(held, c)) return true;
  const t = TRIAD_OF[c.quality];
  return !!t && matchesChord(held, { ...c, quality: t });
}

/** The notes that count in a melody part. */
export function melodyPcs(song: SongChart, steps?: number[]): number[] {
  const k: KeyDef = keyById(song.key);
  const s = steps ?? (k.mode === 'major' ? [0, 2, 4, 5, 7, 9, 11] : [0, 2, 3, 5, 7, 8, 10]);
  return s.map((x) => pc(k.tonic + x));
}

/** A melody bar counts if something was played in it and at least this share of its notes were in the scale. */
export const MELODY_IN_KEY = 0.75;
/** A chord or root played this much of a beat before a bar starts counts for that bar (players lean in early). */
export const EARLY_BEATS = 0.25;

/** What happened in one unit, filled in during the run. */
export interface UnitTally {
  ok: boolean;
  /** Melody: notes played, and how many were in the scale. */
  notes: number;
  inKey: number;
}
export const emptyTally = (): UnitTally => ({ ok: false, notes: 0, inKey: 0 });

/** Which unit a moment in the song belongs to (beats from bar 1), leaning early by EARLY_BEATS. -1 before the start. */
export function unitAt(units: SongUnit[], beat: number): number {
  const b = beat + EARLY_BEATS;
  for (let i = 0; i < units.length; i++) if (b >= units[i].at && b < units[i].at + units[i].len) return i;
  return -1;
}

/** Is this unit graded at all? (No-chord bars are skipped for chords and bass.) */
export const graded = (part: SongPart, u: SongUnit) => part === 'melody' || !!u.chord;

/** Final score: the share of graded beats that were right (a half-bar chord counts half a bar). */
export function songScore(part: SongPart, units: SongUnit[], tallies: UnitTally[]): { raw: number; right: number; total: number } {
  let got = 0;
  let all = 0;
  let right = 0;
  let total = 0;
  units.forEach((u, i) => {
    if (!graded(part, u)) return;
    all += u.len;
    total++;
    const t = tallies[i] ?? emptyTally();
    const ok = part === 'melody' ? t.notes > 0 && t.inKey / t.notes >= MELODY_IN_KEY : t.ok;
    if (ok) {
      got += u.len;
      right++;
    }
  });
  return { raw: all ? Math.round((got / all) * 100) : 0, right, total };
}

/** Did a melody unit pass (for the ✓ marks during the run)? */
export const melodyOk = (t: UnitTally) => t.notes > 0 && t.inKey / t.notes >= MELODY_IN_KEY;
