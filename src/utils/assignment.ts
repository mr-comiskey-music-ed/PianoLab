import { Labels } from '../components/modeTypes';
import { EchoHelp, Lesson, ScreenHelp } from '../types';
import { checksum, compress, decompress, extractParam } from './codec';

/**
 * The teacher's assignment link (SPEC section 8, core version): `?a=<compressed>.<checksum>`.
 * It picks the levels (their lessons come along), the least help with note names, the slowest tempo for timed levels,
 * and a sound. No student data: it only describes the work. The title goes into each student's code (key `a`) so the
 * batch view shows which assignment a code is for.
 *
 * Packed keys (never change what one means; add new ones): t = title, v = level ids, n = note names (0 off, 1 Cs,
 * 2 all), b = slowest tempo, s = sound id.
 * Added for "everything is assignable" (SPEC section 8): l = lesson ids whose Learn is assigned, e = least Echo help
 * (1 See First Note, 2 By Ear), w = timed levels show at most Chord Names Only (1), o = the tab it opens on
 * (l Learn, c Challenges, s Sandbox, j Jam Room), m = a note from the teacher, j = a Jam Room setup (see `JamSetup`).
 */

/** How a Jam Room switch is set: off, on, or the student chooses. */
export type Choice = 'off' | 'on' | 'choose';
/**
 * A Jam Room set up by the teacher (packed as j: s source g/t/y, g groove id, k key id, p preset id or "custom",
 * c custom numerals, b tempo (the slowest allowed), tr track id, y YouTube video id, kl Key lock, md Melody mode: 0 off,
 * 1 on, 2 student chooses).
 */
export interface JamSetup {
  source: 'groove' | 'track' | 'youtube';
  groove?: string;
  key?: string;
  prog?: string;
  custom?: string;
  bpm?: number;
  track?: string;
  video?: string;
  keyLock: Choice;
  melody: Choice;
}
export type OpenTab = 'learn' | 'challenge' | 'sandbox' | 'jam';
const CHOICES: Choice[] = ['off', 'on', 'choose'];
const TABS: Record<string, OpenTab> = { l: 'learn', c: 'challenge', s: 'sandbox', j: 'jam' };
const TAB_CODE: Record<OpenTab, string> = { learn: 'l', challenge: 'c', sandbox: 's', jam: 'j' };
const ECHO: EchoHelp[] = ['watch', 'hint', 'ear'];
export interface Assignment {
  title: string;
  levels: string[];
  /** The most help with note names allowed ('all' = the level's own setting). */
  labels?: Labels;
  /** The slowest tempo allowed for timed levels (BPM). */
  tempo?: number;
  /** The sound everyone plays with (locked while the assignment is open). */
  sound?: string;
  /** Lessons whose Learn is assigned (their Learn and Practice open too). */
  learn?: string[];
  /** The most help Echo levels allow ('watch' = the level's own). */
  echo?: EchoHelp;
  /** The most help timed levels allow ('blocks' = the level's own). */
  screen?: ScreenHelp;
  /** The tab the link opens on. */
  open?: OpenTab;
  /** A note from the teacher, shown in the banner. */
  note?: string;
  /** A Jam Room set up by the teacher. */
  jam?: JamSetup;
}

const LABEL_CODES: Record<Labels, number> = { off: 0, c: 1, all: 2 };
const LABEL_NAMES: Labels[] = ['off', 'c', 'all'];

export async function encodeAssignment(a: Assignment): Promise<string> {
  const packed: Record<string, unknown> = { t: a.title.trim().slice(0, 60), v: a.levels };
  if (a.labels && a.labels !== 'all') packed.n = LABEL_CODES[a.labels];
  if (a.tempo) packed.b = Math.round(a.tempo);
  if (a.sound) packed.s = a.sound;
  if (a.learn?.length) packed.l = a.learn;
  if (a.echo && a.echo !== 'watch') packed.e = ECHO.indexOf(a.echo);
  if (a.screen === 'names') packed.w = 1;
  if (a.open) packed.o = TAB_CODE[a.open];
  if (a.note?.trim()) packed.m = a.note.trim().slice(0, 300);
  if (a.jam) {
    const j = a.jam;
    const pj: Record<string, unknown> = { s: j.source[0], kl: CHOICES.indexOf(j.keyLock), md: CHOICES.indexOf(j.melody) };
    if (j.groove) pj.g = j.groove;
    if (j.key) pj.k = j.key;
    if (j.prog) pj.p = j.prog;
    if (j.custom) pj.c = j.custom.slice(0, 80);
    if (j.bpm) pj.b = Math.round(j.bpm);
    if (j.track) pj.tr = j.track;
    if (j.video) pj.y = j.video;
    packed.j = pj;
  }
  const json = JSON.stringify(packed);
  return `${await compress(json)}.${checksum(json)}`;
}

/** The link the teacher posts: this app's address with `?a=`. */
export const assignmentLink = (token: string, base = `${window.location.origin}${window.location.pathname}`) => `${base}?a=${token}`;

const str = (v: unknown, max = 40) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined);
function readJam(v: unknown): JamSetup | undefined {
  if (typeof v !== 'object' || v === null) return undefined;
  const d = v as Record<string, unknown>;
  const source = d.s === 't' ? 'track' : d.s === 'y' ? 'youtube' : 'groove';
  const bpm = Number(d.b);
  return {
    source,
    ...(str(d.g) ? { groove: str(d.g) } : {}),
    ...(str(d.k) ? { key: str(d.k) } : {}),
    ...(str(d.p) ? { prog: str(d.p) } : {}),
    ...(str(d.c, 80) ? { custom: str(d.c, 80) } : {}),
    ...(bpm >= 40 && bpm <= 200 ? { bpm } : {}),
    ...(str(d.tr) ? { track: str(d.tr) } : {}),
    ...(typeof d.y === 'string' && /^[A-Za-z0-9_-]{11}$/.test(d.y) ? { video: d.y } : {}),
    keyLock: CHOICES[Number(d.kl)] ?? 'choose',
    melody: CHOICES[Number(d.md)] ?? 'choose',
  };
}

/**
 * Returns the assignment, or null if the link is broken or assigns nothing. Level and lesson ids this app doesn't know
 * are dropped.
 */
export async function decodeAssignment(text: string, known: string[], knownLessons: string[] = []): Promise<Assignment | null> {
  const raw = extractParam(text, 'a').trim();
  const m = raw.match(/^([A-Za-z0-9_-]+)\.([a-z0-9]{1,8})$/);
  if (!m) return null;
  const json = await decompress(m[1]);
  if (!json || checksum(json) !== m[2]) return null;
  try {
    const d = JSON.parse(json);
    const levels = Array.isArray(d.v) ? (d.v as unknown[]).filter((x): x is string => typeof x === 'string' && known.includes(x)) : [];
    const learn = Array.isArray(d.l) ? (d.l as unknown[]).filter((x): x is string => typeof x === 'string' && knownLessons.includes(x)) : [];
    const jam = readJam(d.j);
    const open = TABS[String(d.o)];
    if (!levels.length && !learn.length && !jam && open !== 'sandbox') return null;
    return {
      title: typeof d.t === 'string' && d.t.trim() ? d.t.trim().slice(0, 60) : 'Assignment',
      levels,
      labels: LABEL_NAMES[Number(d.n)] ?? 'all',
      ...(Number(d.b) >= 30 && Number(d.b) <= 240 ? { tempo: Number(d.b) } : {}),
      ...(typeof d.s === 'string' ? { sound: d.s } : {}),
      ...(learn.length ? { learn } : {}),
      ...(Number(d.e) === 1 || Number(d.e) === 2 ? { echo: ECHO[Number(d.e)] } : {}),
      ...(Number(d.w) === 1 ? { screen: 'names' as const } : {}),
      ...(open ? { open } : {}),
      ...(str(d.m, 300) ? { note: str(d.m, 300) } : {}),
      ...(jam ? { jam } : {}),
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
  const echoMin = ECHO.indexOf(a.echo ?? 'watch');
  return lessons
    .map((l) => ({
      ...l,
      levels: l.levels
        .filter((v) => a.levels.includes(v.id))
        .map((v) => ({
          ...v,
          labels: harderLabels(v.labels, a.labels ?? 'all'),
          ...(v.type === 'echo' && echoMin > ECHO.indexOf(v.echo ?? 'watch') ? { echo: ECHO[echoMin] } : {}),
          ...(v.type === 'play' && a.screen === 'names' && v.pattern?.texture !== 'scale' ? { screen: 'names' as const } : {}),
        })),
    }))
    .filter((l) => l.levels.length > 0 || a.learn?.includes(l.id));
}

/** The tab an assignment opens on: the teacher's pick, or what it has (levels, then Learn, then the Jam Room). */
export const openTab = (a: Assignment): OpenTab => a.open ?? (a.levels.length ? 'challenge' : a.learn?.length ? 'learn' : a.jam ? 'jam' : 'sandbox');
