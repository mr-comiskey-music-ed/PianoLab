import { Labels } from '../components/modeTypes';
import { Lesson } from '../types';
import { checksum, compress, decompress, extractParam } from './codec';

/**
 * The teacher's assignment link (SPEC section 8, core version): `?a=<compressed>.<checksum>`.
 * It picks the levels (their lessons come along), the least help with note names, the slowest tempo for timed levels,
 * and a sound. No student data: it only describes the work. The title goes into each student's code (key `a`) so the
 * batch view shows which assignment a code is for.
 *
 * Packed keys (never change what one means; add new ones): t = title, v = level ids, n = note names (0 off, 1 Cs,
 * 2 all), b = slowest tempo, s = sound id.
 */
export interface Assignment {
  title: string;
  levels: string[];
  /** The most help with note names allowed ('all' = the level's own setting). */
  labels?: Labels;
  /** The slowest tempo allowed for timed levels (BPM). */
  tempo?: number;
  /** The sound everyone plays with (locked while the assignment is open). */
  sound?: string;
}

const LABEL_CODES: Record<Labels, number> = { off: 0, c: 1, all: 2 };
const LABEL_NAMES: Labels[] = ['off', 'c', 'all'];

export async function encodeAssignment(a: Assignment): Promise<string> {
  const packed: Record<string, unknown> = { t: a.title.trim().slice(0, 60), v: a.levels };
  if (a.labels && a.labels !== 'all') packed.n = LABEL_CODES[a.labels];
  if (a.tempo) packed.b = Math.round(a.tempo);
  if (a.sound) packed.s = a.sound;
  const json = JSON.stringify(packed);
  return `${await compress(json)}.${checksum(json)}`;
}

/** The link the teacher posts: this app's address with `?a=`. */
export const assignmentLink = (token: string, base = `${window.location.origin}${window.location.pathname}`) => `${base}?a=${token}`;

/** Returns the assignment, or null if the link is broken. Level ids this app doesn't know are dropped. */
export async function decodeAssignment(text: string, known: string[]): Promise<Assignment | null> {
  const raw = extractParam(text, 'a').trim();
  const m = raw.match(/^([A-Za-z0-9_-]+)\.([a-z0-9]{1,8})$/);
  if (!m) return null;
  const json = await decompress(m[1]);
  if (!json || checksum(json) !== m[2]) return null;
  try {
    const d = JSON.parse(json);
    const levels = Array.isArray(d.v) ? (d.v as unknown[]).filter((x): x is string => typeof x === 'string' && known.includes(x)) : [];
    if (!levels.length) return null;
    return {
      title: typeof d.t === 'string' && d.t.trim() ? d.t.trim().slice(0, 60) : 'Assignment',
      levels,
      labels: LABEL_NAMES[Number(d.n)] ?? 'all',
      ...(Number(d.b) >= 30 && Number(d.b) <= 240 ? { tempo: Number(d.b) } : {}),
      ...(typeof d.s === 'string' ? { sound: d.s } : {}),
    };
  } catch {
    return null;
  }
}

const HARD: Labels[] = ['all', 'c', 'off'];
/** The harder of two note-name settings. */
export const harderLabels = (a: Labels, b: Labels): Labels => (HARD.indexOf(a) >= HARD.indexOf(b) ? a : b);

/** The lessons as an assignment shows them: only lessons with assigned levels, only those levels, note names limited. */
export function applyAssignment(lessons: Lesson[], a: Assignment | null): Lesson[] {
  if (!a) return lessons;
  return lessons
    .map((l) => ({ ...l, levels: l.levels.filter((v) => a.levels.includes(v.id)).map((v) => ({ ...v, labels: harderLabels(v.labels, a.labels ?? 'all') })) }))
    .filter((l) => l.levels.length > 0);
}
