import { compress, decompress } from './codec';

/** A student's own beat (Jam Room "Custom pattern"): which 16ths have a kick, snare, hi-hat and bass note (the root). */
export interface CustomPattern {
  k: number[];
  s: number[];
  h: number[];
  b: number[];
  /** Open hi-hat (added later: older codes don't have it). */
  o?: number[];
}
/** Steps 0-15, each once, sorted (for patterns read back from a code or link). */
export const cleanSteps = (x: unknown): number[] => (Array.isArray(x) ? [...new Set(x.filter((v): v is number => Number.isInteger(v) && v >= 0 && v < 16))].sort((a, b) => a - b) : []);

/**
 * A Sandbox performance: what a student played, as notes. Nothing else (no name) is in it.
 * Times are milliseconds from the first note.
 */
export interface PerfNote {
  /** Start, ms from the first note. */
  t: number;
  /** Length in ms. */
  d: number;
  /** MIDI note number (60 = C4). */
  m: number;
  /** Velocity 1-127. */
  v: number;
}

/** Keep codes and links a sensible size: 3 minutes or 2000 notes, whichever comes first. */
export const MAX_PERF_MS = 3 * 60 * 1000;
export const MAX_PERF_NOTES = 2000;

/** Times are stored in steps of 5 ms (finer than anyone can hear in a recording like this). */
const STEP = 5;

/**
 * Pack notes into a flat list of whole numbers: for each note [gap since the previous note's start, midi, velocity,
 * length], times in 5 ms steps. This is what goes in a code (key `p`) or a link.
 */
export function packPerf(notes: PerfNote[]): number[] {
  const out: number[] = [];
  let prev = 0;
  for (const n of [...notes].sort((a, b) => a.t - b.t)) {
    const t = Math.round(n.t / STEP);
    out.push(t - prev, n.m, n.v, Math.max(1, Math.round(n.d / STEP)));
    prev = t;
  }
  return out;
}

/** Undo packPerf. Anything that doesn't look right is skipped rather than crashing. */
export function unpackPerf(flat: unknown): PerfNote[] {
  if (!Array.isArray(flat)) return [];
  const notes: PerfNote[] = [];
  let t = 0;
  for (let i = 0; i + 3 < flat.length && notes.length < MAX_PERF_NOTES; i += 4) {
    const [gap, m, v, d] = flat.slice(i, i + 4).map(Number);
    if (![gap, m, v, d].every(Number.isFinite) || gap < 0) return notes;
    t += gap;
    if (m < 0 || m > 127) continue;
    notes.push({ t: t * STEP, m: Math.round(m), v: Math.max(1, Math.min(127, Math.round(v))), d: Math.max(1, d) * STEP });
  }
  return notes;
}

/** Length of a performance in ms. */
export const perfLength = (notes: PerfNote[]) => notes.reduce((a, n) => Math.max(a, n.t + n.d), 0);

export const formatLength = (ms: number) => {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

// ---------- Backing (Jam Room) ----------
/**
 * What was playing behind a Jam Room performance, so play back sounds the way the student heard it. Each time a backing
 * starts there's a segment; `at` / `until` are ms on the performance's clock (`until` missing = to the end).
 *  g = an app-made groove (`at` = when beat 1 of bar 1 was heard; the count-in is the bar before it)
 *  t = one of Mr. Comiskey's tracks (`at` = when the file's start was heard)
 *  y = a YouTube video (`vt` = the video's time, in seconds, at `at`)
 * Stored in codes (key `j`) and links. Ids that no longer exist are skipped at play back.
 */
export type BackingSeg =
  | { k: 'g'; at: number; until?: number; g: string; key: string; n: string[]; bpm: number; /** g "custom": the student's pattern. */ cp?: CustomPattern }
  | { k: 't'; at: number; until?: number; tr: string }
  | { k: 'y'; at: number; until?: number; v: string; vt: number };

const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? Math.round(x) : null);
const str = (x: unknown, max = 40) => (typeof x === 'string' && x.length <= max ? x : null);
/** Keep only well-formed segments (codes and links can be hand-edited). */
export function cleanBacking(x: unknown): BackingSeg[] {
  if (!Array.isArray(x)) return [];
  const out: BackingSeg[] = [];
  for (const s of x.slice(0, 60)) {
    if (!s || typeof s !== 'object') continue;
    const o = s as Record<string, unknown>;
    const at = num(o.at);
    if (at === null) continue;
    const until = num(o.until);
    const base = until !== null ? { at, until } : { at };
    if (o.k === 'g' && str(o.g) && str(o.key, 4) && Array.isArray(o.n) && num(o.bpm)) {
      const cp = o.cp && typeof o.cp === 'object' ? (o.cp as Record<string, unknown>) : null;
      out.push({
        k: 'g',
        ...base,
        g: o.g as string,
        key: o.key as string,
        n: (o.n as unknown[]).filter((v): v is string => !!str(v, 8)).slice(0, 16),
        bpm: Math.max(40, Math.min(200, num(o.bpm)!)),
        ...(cp ? { cp: { k: cleanSteps(cp.k), s: cleanSteps(cp.s), h: cleanSteps(cp.h), b: cleanSteps(cp.b), ...(cleanSteps(cp.o).length ? { o: cleanSteps(cp.o) } : {}) } } : {}),
      });
    } else if (o.k === 't' && str(o.tr)) out.push({ k: 't', ...base, tr: o.tr as string });
    else if (o.k === 'y' && str(o.v, 11) && typeof o.vt === 'number' && Number.isFinite(o.vt)) out.push({ k: 'y', ...base, v: o.v as string, vt: Math.max(0, Math.round(o.vt * 10) / 10) });
  }
  return out;
}

// ---------- Link ----------
/** A link that opens PianoLab's Sandbox with this performance (and its backing, if any) ready to play. */
export async function perfLink(notes: PerfNote[], backing: BackingSeg[] = []): Promise<string> {
  // Older links hold just the notes list; links with a backing hold { p: notes, j: backing }.
  const data = await compress(JSON.stringify(backing.length ? { p: packPerf(notes), j: backing } : packPerf(notes)));
  return `${window.location.origin}/?perf=${data}`;
}

/** Read a performance out of a `?perf=` value. Returns null if it is damaged. */
export async function readPerfParam(value: string): Promise<{ notes: PerfNote[]; backing: BackingSeg[] } | null> {
  const json = await decompress(value);
  if (!json) return null;
  try {
    const d = JSON.parse(json);
    const notes = unpackPerf(Array.isArray(d) ? d : d?.p);
    return notes.length ? { notes, backing: Array.isArray(d) ? [] : cleanBacking(d?.j) } : null;
  } catch {
    return null;
  }
}

// ---------- Standard MIDI file ----------
const TICKS = 480; // per quarter note; at 120 BPM one tick is about 1.04 ms

function varLen(n: number): number[] {
  const bytes = [n & 0x7f];
  while ((n >>= 7)) bytes.unshift((n & 0x7f) | 0x80);
  return bytes;
}

/** A type-0 .mid file (piano, 120 BPM) that opens in GarageBand, Soundtrap, BandLab, MuseScore and the like. */
export function toMidiFile(notes: PerfNote[]): Uint8Array {
  const msToTicks = (ms: number) => Math.round((ms / 500) * TICKS);
  const events: { at: number; bytes: number[] }[] = [];
  for (const n of notes) {
    events.push({ at: msToTicks(n.t), bytes: [0x90, n.m, n.v] });
    events.push({ at: msToTicks(n.t + n.d), bytes: [0x80, n.m, 0] });
  }
  // Note-offs before note-ons at the same moment, so a repeated note is not cut short.
  events.sort((a, b) => a.at - b.at || (a.bytes[0] === 0x80 ? -1 : 1));
  const name = Array.from(new TextEncoder().encode('PianoLab performance'));
  const track: number[] = [
    0x00, 0xff, 0x03, name.length, ...name,
    0x00, 0xff, 0x51, 0x03, 0x07, 0xa1, 0x20, // tempo 120 BPM
    0x00, 0xff, 0x58, 0x04, 0x04, 0x02, 0x18, 0x08, // 4/4
    0x00, 0xc0, 0x00, // acoustic grand piano
  ];
  let last = 0;
  for (const e of events) {
    track.push(...varLen(e.at - last), ...e.bytes);
    last = e.at;
  }
  track.push(0x00, 0xff, 0x2f, 0x00);
  const len = track.length;
  return new Uint8Array([
    0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, (TICKS >> 8) & 0xff, TICKS & 0xff,
    0x4d, 0x54, 0x72, 0x6b, (len >>> 24) & 0xff, (len >>> 16) & 0xff, (len >>> 8) & 0xff, len & 0xff,
    ...track,
  ]);
}

export function downloadMidi(notes: PerfNote[], filename = 'pianolab-performance.mid') {
  const url = URL.createObjectURL(new Blob([toMidiFile(notes) as BlobPart], { type: 'audio/midi' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
