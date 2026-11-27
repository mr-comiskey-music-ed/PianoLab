import React, { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { GROOVES, Groove, GrooveStyle, TRACKS } from '../audio/groove';
import { Chord, Diatonic, KEYS, KeyDef, Quality, chordName, chordPcs, detectChord, diatonic, diatonicSevenths, keyById, makeKey, parseChord, parseNumeral } from '../utils/chords';
import { KEY_COUNT, pc, pcOf } from '../utils/music';
import { MAJOR_SCALE } from '../utils/scales';
import { textOn } from './ChordStrip';
import { PianoRoll } from './PianoRoll';
import { YouTubeBox, YTControl, youTubeId } from './YouTubeBox';
import { BackingSeg, CustomPattern, MAX_PERF_MS, MAX_PERF_NOTES, PerfNote, formatLength, perfLength } from '../utils/performance';
import { SavePerformance } from './ModeSandbox';
import { Labels, ModeCtx, ModeParts } from './modeTypes';
import youtubeData from '../data/youtube.json';

/**
 * The Jam Room (SPEC section 10): pick a backing, a key and a progression, and play. Ungraded.
 *  - Backing: an app-made groove (drums + bass from the progression), one of Mr. Comiskey's audio tracks
 *    (`src/data/tracks.json`), or a YouTube video (his list in `src/data/youtube.json`, or a pasted link).
 *  - A chord chart follows the music (app grooves and tracks) and says when you're on the chord.
 *  - Melody mode: the key's notes get a brass dot. Key lock: other notes are greyed out and silent.
 *  - Mixer: Backing and Piano faders with level meters.
 */

type Source = 'groove' | 'track' | 'youtube';
interface YouTubeVideo {
  title: string;
  url: string;
  key: string;
  mode?: 'major' | 'minor';
  chords?: string;
}
export const VIDEOS = (youtubeData as { videos: YouTubeVideo[] }).videos;

/**
 * Progressions to jam over (Roman numerals, one per bar), each with a major-key and a minor-key version: in A minor the
 * Pop progression is i – VI – III – VII (Am F C G), not the major numerals read in a minor key (his bug report).
 */
export const PROGRESSIONS: { id: string; label: string; major: string[]; minor: string[] }[] = [
  { id: 'pop', label: 'Pop', major: ['I', 'V', 'vi', 'IV'], minor: ['i', 'VI', 'III', 'VII'] },
  { id: '50s', label: "'50s", major: ['I', 'vi', 'IV', 'V'], minor: ['i', 'VI', 'iv', 'V'] },
  { id: 'sad', label: 'Sad pop', major: ['vi', 'IV', 'I', 'V'], minor: ['i', 'VII', 'VI', 'VII'] },
  { id: 'rock', label: 'Rock', major: ['I', '♭VII', 'IV', 'I'], minor: ['i', 'VI', 'VII', 'i'] },
  { id: 'jazz', label: 'Jazz', major: ['ii7', 'V7', 'Imaj7', 'Imaj7'], minor: ['iiø7', 'V7', 'i7', 'i7'] },
  {
    id: 'blues',
    label: '12-bar blues',
    major: ['I7', 'I7', 'I7', 'I7', 'IV7', 'IV7', 'I7', 'I7', 'V7', 'IV7', 'I7', 'V7'],
    minor: ['i7', 'i7', 'i7', 'i7', 'iv7', 'iv7', 'i7', 'i7', 'v7', 'iv7', 'i7', 'v7'],
  },
];
/** A preset's numerals for a key: its minor version in a minor key. */
export const presetNumerals = (p: (typeof PROGRESSIONS)[number], k: KeyDef) => (k.mode === 'minor' ? p.minor : p.major);
/** "Pop: i – VI – III – VII" (the numerals for the key picked). */
const presetName = (p: (typeof PROGRESSIONS)[number], k: KeyDef) => (p.id === 'blues' ? `${p.label} (7ths)` : `${p.label}: ${presetNumerals(p, k).join(' – ')}`);
/** A pause longer than this is shortened to SHORT_GAP in a saved performance (same as the Sandbox). */
const LONG_GAP = 8000;
const SHORT_GAP = 2000;
export const JAM_KEYS = KEYS.filter((k) => k.mode === 'major' || ['Am', 'Em', 'Dm'].includes(k.id));

/** The pitch classes of a key's scale (major, or natural minor). */
/** Which notes Melody mode marks and Key lock lets through: the key's scale, its pentatonic, or the blues scale. */
export type JamScale = 'key' | 'penta' | 'blues';
export const scalePcs = (k: KeyDef, which: JamScale = 'key') =>
  (which === 'penta'
    ? k.mode === 'major'
      ? [0, 2, 4, 7, 9]
      : [0, 3, 5, 7, 10]
    : which === 'blues'
      ? [0, 3, 5, 6, 7, 10]
      : k.mode === 'major'
        ? MAJOR_SCALE.slice(0, 7)
        : [0, 2, 3, 5, 7, 8, 10]
  ).map((s) => pc(k.tonic + s));

/** Read numerals typed by a student ("I V vi IV", "I - IV - V7"). Unreadable ones are dropped. */
export function readNumerals(k: KeyDef, text: string): Diatonic[] {
  return text
    .split(/[\s,–—-]+/)
    .filter(Boolean)
    .map((t) => parseNumeral(k, t))
    .filter((d): d is Diatonic => !!d)
    .slice(0, 16);
}

/** One chord box from a chord sheet a student found online (YouTube jams): what they typed, and the chord it means. */
export interface SheetChord {
  text: string;
  chord: Chord;
  numeral: string;
  color: string;
}
const MINORISH: Quality[] = ['min', 'min7', 'dim', 'hdim7', 'dim7'];
/** Same chord for "you're on it": same root, and both minor-ish or both major-ish (a plain triad counts for a sus or add9). */
export const sameFamily = (a: Chord, b: Chord) => a.root === b.root && MINORISH.includes(a.quality) === MINORISH.includes(b.quality);
/**
 * Read a chord sheet: chord names as found online ("Am F C G", "Am - F - C - G", "C/E", "Gsus4", "Cadd9") or numerals
 * ("vi IV I V"). Chords this app can't name exactly count as their plain major/minor triad; anything else is skipped.
 */
export function readChordSheet(k: KeyDef, text: string): SheetChord[] {
  const inKey = [...diatonic(k), ...diatonicSevenths(k)];
  const out: SheetChord[] = [];
  for (const tok of text.replace(/(\S)-([A-G])/g, '$1 $2').split(/[\s,|–—]+/).filter(Boolean)) {
    const t = tok.replace(/[()]/g, '');
    let chord = parseChord(t.split('/')[0]);
    if (!chord) {
      const m = t.split('/')[0].match(/^([A-G][#b♯♭]?)(.*)$/);
      if (m) chord = parseChord(m[1] + (/^(m(?!aj)|min|-)/.test(m[2]) ? 'm' : ''));
    }
    if (chord) {
      const d = inKey.find((x) => x.chord.root === chord!.root && x.chord.quality === chord!.quality) ?? diatonic(k).find((x) => sameFamily(x.chord, chord!));
      out.push({ text: t.replace('#', '♯').replace(/^([A-G])b/, '$1♭'), chord, numeral: d?.numeral ?? '', color: d?.color ?? '#66584a' });
    } else {
      const d = parseNumeral(k, t);
      if (d) out.push({ text: chordName(d.chord), chord: d.chord, numeral: d.numeral, color: d.color });
    }
    if (out.length >= 24) break;
  }
  return out;
}

/** A small level meter (0-1), updated by the parent's animation loop. */
const Meter: React.FC<{ level: number }> = ({ level }) => (
  <div className="h-2 w-full overflow-hidden rounded-full bg-[#ddd0bc]">
    <div className={`h-full ${level > 0.9 ? 'bg-bad' : 'bg-brass2'}`} style={{ width: `${Math.round(level * 100)}%` }} />
  </div>
);

const ROWS: [keyof CustomPattern, string][] = [
  ['o', 'Open hi-hat'],
  ['h', 'Hi-hat'],
  ['s', 'Snare'],
  ['k', 'Kick'],
  ['b', 'Bass Notes'],
];
/** Where a Custom pattern starts: the Pop groove's beat. */
const startPattern = (): CustomPattern => {
  const pop = GROOVES[0];
  return { k: [...pop.kick], s: [...pop.snare], h: [...pop.hat], o: [], b: pop.bass.map((x) => x[0]) };
};

/** The Custom pattern grid (his "doesn't have to be big"): 4 rows x 16 steps; click a square to turn it on or off. */
const BeatGrid: React.FC<{ pattern: CustomPattern; onToggle: (row: keyof CustomPattern, step: number) => void; step: number; compact?: boolean }> = ({ pattern, onToggle, step, compact }) => (
  <div className={`flex flex-col ${compact ? 'gap-0.5' : 'gap-1'}`} data-testid="beat-grid">
    {ROWS.map(([row, label]) => (
      <Fragment key={row}>
      {row === 'b' && (
        // The bass row plays notes (each chord's root), not a drum: a gap and a line keep it apart from the drums.
        <div className={`flex items-center ${compact ? 'h-3.5 pl-11' : 'h-5 pl-[68px]'}`} aria-hidden="true">
          <div className="h-[2px] w-full rounded bg-[#8a7a66]" />
        </div>
      )}
      <div className="flex items-center gap-1">
        <span className={`h shrink-0 text-right leading-tight ${compact ? 'w-10 text-[10px] text-wal2' : 'w-16 text-[12px] text-line2'}`}>{label}</span>
        <div className="flex gap-[2px]">
          {Array.from({ length: 16 }, (_, k) => {
            const on = (pattern[row] ?? []).includes(k);
            return (
              <button
                key={k}
                aria-label={`${label} step ${k + 1}`}
                aria-pressed={on}
                data-testid={`beat-${row}-${k}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onToggle(row, k)}
                className={`${compact ? 'h-3.5 w-[11px]' : 'h-5 w-6'} rounded-[3px] ${k % 4 === 0 ? 'ml-1 first:ml-0' : ''} ${on ? 'bg-brass' : k % 4 === 0 ? 'bg-[#5a4a3a]' : 'bg-[#3a2f24]'} ${k === step ? 'ring-2 ring-panel' : ''}`}
              />
            );
          })}
        </div>
      </div>
      </Fragment>
    ))}
  </div>
);

export function useJam(ctx: ModeCtx, active: boolean): ModeParts {
  const [source, setSource] = useState<Source>('groove');
  const [grooveId, setGrooveId] = useState('pop');
  // "Custom pattern": the student's own beat. The groove plays one shared style object, so edits are heard right away.
  const [beatPat, setBeatPat] = useState<CustomPattern>(startPattern);
  const liveCustom = useRef<GrooveStyle>({ id: 'custom', name: 'Custom pattern', bpm: 90, kick: [], snare: [], hat: [], bass: [] });
  useEffect(() => {
    const st = liveCustom.current;
    st.kick = beatPat.k;
    st.snare = beatPat.s;
    st.hat = beatPat.h;
    st.open = beatPat.o ?? [];
    st.bass = beatPat.b.map((x) => [x, 'R'] as [number, 'R']);
    // A saved performance keeps the pattern as it was last heard.
    const open = segs.current.find((x) => x.until === undefined);
    if (open && open.k === 'g' && open.g === 'custom') open.cp = { ...beatPat };
  }, [beatPat]);
  const toggleStep = (row: keyof CustomPattern, step: number) =>
    setBeatPat((p) => {
      const cur = p[row] ?? [];
      return { ...p, [row]: cur.includes(step) ? cur.filter((x) => x !== step) : [...cur, step].sort((a, b) => a - b) };
    });
  const styleName = grooveId === 'custom' ? 'Custom pattern' : `${GROOVES.find((g) => g.id === grooveId)?.name ?? 'Groove'} groove`;
  const [keyId, setKeyId] = useState('C');
  const [progId, setProgId] = useState('pop');
  const [custom, setCustom] = useState('I IV V I');
  const [bpm, setBpm] = useState(GROOVES[0].bpm);
  const [trackId, setTrackId] = useState(TRACKS[0]?.id ?? '');
  const [ytText, setYtText] = useState('');
  const [videoId, setVideoId] = useState<string | null>(null);
  /** YouTube jams: a chord sheet the student found online (not in time, just in order). */
  const [ytChords, setYtChords] = useState('');
  const [sheetPlace, setSheetPlace] = useState(-1);
  const [melody, setMelody] = useState(false);
  const [keyLock, setKeyLock] = useState(false);
  const [jamScale, setJamScale] = useState<JamScale>('key');
  const [backVol, setBackVol] = useState(1);
  const [pianoVol, setPianoVol] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [beat, setBeat] = useState(-Infinity);
  const [meters, setMeters] = useState({ back: 0, piano: 0 });
  const [held, setHeld] = useState<number[]>([]);
  const [labels, setLabels] = useState<Labels>('c');
  // What the student plays rises up the Stage as a piano roll, like the Sandbox, and is kept (in memory only) so it can be
  // saved as a performance: a code, a link or a .mid file. Same limits as the Sandbox; long pauses are shortened.
  const [rollNotes, setRollNotes] = useState<PerfNote[]>([]);
  const rollRef = useRef<PerfNote[]>([]);
  rollRef.current = rollNotes;
  const rollT0 = useRef<number | null>(null);
  const lastAt = useRef(0);
  const rollOffset = useRef(0);
  const [full, setFull] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [clearAsk, setClearAsk] = useState(false);

  // A teacher's assignment can set the Jam Room up (SPEC section 8): backing, key, chords, tempo (the slowest allowed),
  // and Key lock / Melody mode fixed on or off, or left to the student.
  const setup = ctx.assignment?.jam;
  useEffect(() => {
    if (!setup) return;
    setSource(setup.source);
    if (setup.groove) setGrooveId(setup.groove);
    if (setup.key) setKeyId(setup.key);
    if (setup.prog) setProgId(setup.prog);
    if (setup.custom) {
      if (setup.source === 'youtube') setYtChords(setup.custom);
      else setCustom(setup.custom);
    }
    setBpm(setup.bpm ?? GROOVES.find((g) => g.id === setup.groove)?.bpm ?? GROOVES[0].bpm);
    if (setup.track) setTrackId(setup.track);
    if (setup.video) setVideoId(setup.video);
    if (setup.keyLock !== 'choose') setKeyLock(setup.keyLock === 'on');
    if (setup.melody !== 'choose') setMelody(setup.melody === 'on');
  }, [setup]);
  const minBpm = setup?.bpm ?? 50;

  const track = TRACKS.find((t) => t.id === trackId);
  const key: KeyDef =
    source === 'track' && track ? makeKey(pcOf(track.key) ?? 0, track.mode) : keyById(keyId);
  const chords: Diatonic[] = useMemo(() => {
    if (source === 'youtube') return [];
    if (source === 'track') return track ? readNumerals(key, track.progression.join(' ')) : [];
    const p = PROGRESSIONS.find((x) => x.id === progId);
    return readNumerals(key, p ? presetNumerals(p, key).join(' ') : custom);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, track?.id, key.id, progId, custom]);

  // What played behind the performance, and when (saved with it so play back sounds the way the student heard it).
  const segs = useRef<BackingSeg[]>([]);
  /** The performance's clock starts at the first note or the first backing, whichever comes first. */
  const clockNow = () => {
    const now = performance.now();
    if (rollT0.current === null) rollT0.current = now - (perfLength(rollRef.current) ? perfLength(rollRef.current) + SHORT_GAP : 0);
    lastAt.current = now;
    return now - rollT0.current;
  };
  const openSeg = () => segs.current.find((x) => x.until === undefined);
  const closeSeg = () => {
    const o = openSeg();
    if (o && rollT0.current !== null) o.until = Math.round(performance.now() - rollT0.current);
  };
  const stop = () => {
    if (Groove.isMade()) Groove.get().stop();
    closeSeg();
    setPlaying(false);
    setBeat(-Infinity);
  };
  // Leaving the Jam Room stops the backing and puts the piano level back.
  useEffect(() => {
    if (active) return;
    stop();
    ctx.engine.setPianoLevel(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
  useEffect(() => () => stop(), []); // eslint-disable-line react-hooks/exhaustive-deps

  // Faders.
  useEffect(() => {
    if (active) ctx.engine.setPianoLevel(pianoVol);
  }, [active, pianoVol, ctx.engine]);
  useEffect(() => {
    if (Groove.isMade()) Groove.get().setLevel(backVol);
  }, [backVol]);

  // What's being played (for "on the chord", and the roll).
  useEffect(() => {
    if (!active) return;
    return ctx.subscribeNotes((e) => {
      setHeld(ctx.getHeld());
      const now = performance.now();
      if (e.on) {
        if (rollRef.current.length >= MAX_PERF_NOTES) return setFull(true);
        if (rollT0.current === null) {
          const end = perfLength(rollRef.current);
          rollT0.current = now - (end ? end + SHORT_GAP : 0);
        } else if (now - lastAt.current > LONG_GAP && !openSeg()) rollT0.current += now - lastAt.current - SHORT_GAP; // (not while a backing plays: it would fall out of step)
        const t = now - rollT0.current;
        if (t > MAX_PERF_MS) return setFull(true);
        lastAt.current = now;
        setRollNotes((prev) => [...prev, { t, d: -1, m: e.midi, v: Math.max(1, Math.round(e.vel * 127)) }]);
      } else if (rollT0.current !== null) {
        lastAt.current = now;
        const end = now - rollT0.current;
        setRollNotes((prev) => {
          for (let i = prev.length - 1; i >= 0; i--)
            if (prev[i].m === e.midi && prev[i].d < 0) {
              const next = prev.slice();
              next[i] = { ...prev[i], d: Math.max(20, end - prev[i].t) };
              return next;
            }
          return prev;
        });
      }
    });
  }, [active, ctx]);

  // While playing: where the music is, and the meters.
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    const loop = () => {
      if (Groove.isMade() && Groove.get().isRunning) setBeat(Groove.get().beatsNow());
      setMeters({ back: Groove.isMade() ? Groove.get().level() : 0, piano: ctx.engine.pianoLevel() });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [active, ctx.engine]);

  const play = async () => {
    if (playing) return stop();
    await ctx.engine.unlock();
    ctx.stopMetronome();
    const g = Groove.get();
    g.setLevel(backVol);
    if (source === 'groove') {
      const style = grooveId === 'custom' ? liveCustom.current : (GROOVES.find((x) => x.id === grooveId) ?? GROOVES[0]);
      const pos = clockNow();
      const heard = g.startGroove(style, bpm, chords.length ? chords.map((d) => d.chord.root) : [key.tonic]);
      closeSeg();
      segs.current.push({ k: 'g', at: Math.round(pos + heard - performance.now()), g: style.id, key: key.id, n: chords.map((d) => d.numeral), bpm, ...(style.id === 'custom' ? { cp: { ...beatPat } } : {}) });
      setPlaying(true);
    } else if (source === 'track' && track) {
      setLoading(true);
      try {
        await g.startTrack(track);
        const pos = clockNow();
        closeSeg();
        segs.current.push({ k: 't', at: Math.round(pos + g.trackStartHeard(track) - performance.now()), tr: track.id });
        setPlaying(true);
      } finally {
        setLoading(false);
      }
    }
  };

  // Melody mode / Key lock: the key's notes on the keys in view.
  const inKey = new Set(scalePcs(key, jamScale));
  const view = Array.from({ length: KEY_COUNT }, (_, i) => ctx.viewStart + i);
  const tint = active && melody ? new Set(view.filter((m) => inKey.has(pc(m)))) : undefined;
  const dim = active && keyLock ? new Set(view.filter((m) => !inKey.has(pc(m)))) : undefined;
  const silence = active && keyLock ? (m: number) => !inKey.has(pc(m)) : undefined;

  // The chord chart: which bar is playing.
  const barNow = chords.length && beat >= 0 ? Math.floor(beat / 4) % chords.length : -1;
  const beatInBar = beat >= 0 ? Math.floor(beat % 4) : -1;
  const countIn = playing && beat < 0 && beat > -5 ? Math.min(4, Math.floor(beat + 5)) : 0;
  const det = held.length >= 2 ? detectChord(held, key) : null;
  const want = barNow >= 0 ? chords[barNow] : null;
  // On the chord: the bar's chord tones are all there (a triad over a 7th, or the 7th itself, both count).
  const onChord = !!(want && held.length >= 3 && chordPcs(want.chord).slice(0, 3).every((p) => held.some((h) => pc(h) === p)) && held.every((h) => chordPcs(want.chord).includes(pc(h))));

  // YouTube jams: the student's chord sheet, in order. The box you're playing lights up and the next one is outlined
  // (it follows what you play; it can't know where the video is).
  const sheet = useMemo(() => (source === 'youtube' ? readChordSheet(key, ytChords) : []), [source, key, ytChords]);
  useEffect(() => setSheetPlace(-1), [ytChords]);
  useEffect(() => {
    if (!det || !sheet.length) return;
    setSheetPlace((p) => {
      const n = sheet.length;
      if (p >= 0 && sameFamily(sheet[p].chord, det.chord)) return p;
      const next = (p + 1) % n;
      if (sameFamily(sheet[next].chord, det.chord)) return next;
      const any = sheet.findIndex((x) => sameFamily(x.chord, det.chord));
      return any >= 0 ? any : p;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [det?.symbol, sheet]);

  const sel = 'w-full rounded-md border border-line2 bg-white px-1.5 py-1 text-[13px]';
  /** Dropdowns hand the typing keyboard back to the piano once something is picked. */
  const pick = (fn: (v: string) => void) => (e: React.ChangeEvent<HTMLSelectElement>) => {
    fn(e.target.value);
    e.currentTarget.blur();
  };
  const changeSetting = (fn: () => void) => {
    stop();
    fn();
  };

  const left = (
    <div className="flex flex-col gap-1.5 text-[13px]" data-testid="jam-left">
      <div className="flex items-baseline justify-between">
        <div className="h text-[11px] uppercase text-muted">Jam Room</div>
        <div className="text-[12px] text-wal1">Play along · not graded</div>
      </div>
      {setup ? (
        // Set up by the teacher: what it is, and only the tempo can change (faster, never slower than the assignment).
        <div className="card flex flex-col gap-1 px-2 py-1.5" data-testid="jam-assigned">
          <div className="h text-[11px] uppercase text-muted">Set up by your teacher</div>
          <div className="h text-[15px] text-wal3">
            {source === 'groove' ? styleName : source === 'track' ? (track?.title ?? 'Track') : 'YouTube video'}
            {' · '}
            {key.label}
          </div>
          {source === 'groove' && <div className="text-wal1">{chords.map((d) => d.numeral).join(' – ')}</div>}
          {source === 'youtube' && sheet.length > 0 && <div className="text-wal1">{sheet.map((c) => c.text).join(' – ')}</div>}
          {source === 'groove' && (
            <div className="flex items-center gap-2">
              <span className="h w-14 shrink-0 text-wal3">Tempo</span>
              <button className="btn px-2 py-0.5" disabled={bpm <= minBpm} onClick={() => changeSetting(() => setBpm((b) => Math.max(minBpm, b - 5)))} aria-label="Slower">
                −
              </button>
              <span className="h w-16 text-center text-[15px]" data-testid="jam-bpm">
                {bpm} BPM
              </span>
              <button className="btn px-2 py-0.5" onClick={() => changeSetting(() => setBpm((b) => Math.min(200, b + 5)))} aria-label="Faster">
                +
              </button>
            </div>
          )}
        </div>
      ) : (
        <>
      <div className="flex gap-1" role="radiogroup" aria-label="Backing">
        {(
          [
            ['groove', 'Groove'],
            ['track', 'Tracks'],
            ['youtube', 'YouTube'],
          ] as const
        ).map(([id, label]) => (
          <button key={id} role="radio" aria-checked={source === id} data-testid={`jam-source-${id}`} className={`btn flex-1 px-1 py-1 text-[13px] ${source === id ? 'btn-brass' : ''}`} onClick={() => changeSetting(() => setSource(id))}>
            {label}
          </button>
        ))}
      </div>
      {source === 'groove' && (
        <>
          <label className="flex items-center gap-2">
            <span className="h w-14 shrink-0 text-wal3">Style</span>
            <select className={sel} value={grooveId} data-testid="jam-style" onChange={pick((v) => changeSetting(() => { setGrooveId(v); if (v !== 'custom') setBpm(GROOVES.find((g) => g.id === v)?.bpm ?? 90); }))}>
              {GROOVES.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
              <option value="custom">Custom pattern…</option>
            </select>
          </label>
          {grooveId === 'custom' && ctx.phone && <BeatGrid pattern={beatPat} onToggle={toggleStep} step={playing && beat >= 0 ? Math.floor(beat * 4) % 16 : -1} compact />}
          <label className="flex items-center gap-2">
            <span className="h w-14 shrink-0 text-wal3">Key</span>
            <select className={sel} value={keyId} data-testid="jam-key" onChange={pick((v) => changeSetting(() => setKeyId(v)))}>
              {JAM_KEYS.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            <span className="h w-14 shrink-0 text-wal3">Chords</span>
            <select className={sel} value={progId} data-testid="jam-prog" onChange={pick((v) => changeSetting(() => setProgId(v)))}>
              {PROGRESSIONS.map((p) => (
                <option key={p.id} value={p.id}>
                  {presetName(p, key)}
                </option>
              ))}
              <option value="custom">My own…</option>
            </select>
          </label>
          {progId === 'custom' && (
            <input className={sel} value={custom} onChange={(e) => setCustom(e.target.value)} onBlur={() => stop()} placeholder="e.g. I V vi IV" aria-label="Your own progression (Roman numerals)" data-testid="jam-custom" />
          )}
          <div className="flex items-center gap-2">
            <span className="h w-14 shrink-0 text-wal3">Tempo</span>
            <button className="btn px-2 py-0.5" onClick={() => changeSetting(() => setBpm((b) => Math.max(50, b - 5)))} aria-label="Slower">
              −
            </button>
            <span className="h w-16 text-center text-[15px]" data-testid="jam-bpm">
              {bpm} BPM
            </span>
            <button className="btn px-2 py-0.5" onClick={() => changeSetting(() => setBpm((b) => Math.min(160, b + 5)))} aria-label="Faster">
              +
            </button>
          </div>
        </>
      )}
      {source === 'track' &&
        (TRACKS.length ? (
          <label className="flex items-center gap-2">
            <span className="h w-14 shrink-0 text-wal3">Track</span>
            <select className={sel} value={trackId} data-testid="jam-track" onChange={pick((v) => changeSetting(() => setTrackId(v)))}>
              {TRACKS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <div className="rounded-md border border-line bg-panel px-2 py-1.5 text-wal1" data-testid="jam-no-tracks">
            No tracks yet. Mr. Comiskey's backing tracks will show up here.
          </div>
        ))}
      {source === 'youtube' && (
        <>
          {VIDEOS.length > 0 && (
            <select className={sel} value="" data-testid="jam-videos" onChange={pick((v) => { const vid = VIDEOS[Number(v)]; setVideoId(youTubeId(vid.url)); setKeyId(vid.mode === 'minor' ? `${vid.key}m` : vid.key); setYtChords(vid.chords ?? ''); })}>
              <option value="">Pick a video…</option>
              {VIDEOS.map((v, i) => (
                <option key={i} value={i}>
                  {v.title}
                </option>
              ))}
            </select>
          )}
          <div className="flex gap-1">
            <input className={sel} value={ytText} onChange={(e) => setYtText(e.target.value)} placeholder="Paste a YouTube link" aria-label="YouTube link" data-testid="jam-yt-link" />
            <button className="btn btn-brass shrink-0 px-2 py-1 text-[13px]" disabled={!youTubeId(ytText)} onClick={() => setVideoId(youTubeId(ytText))} data-testid="jam-yt-load">
              Load
            </button>
          </div>
          <label className="flex items-center gap-2">
            <span className="h w-14 shrink-0 text-wal3">Key</span>
            <select className={sel} value={keyId} data-testid="jam-key" onChange={pick(setKeyId)}>
              {JAM_KEYS.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-0.5">
            <span className="h text-wal3">Chords (optional)</span>
            <input className={sel} value={ytChords} onChange={(e) => setYtChords(e.target.value)} placeholder="Found them online? e.g. Am F C G" aria-label="The song's chords" data-testid="jam-yt-chords" />
          </label>
        </>
      )}
        </>
      )}
      {source !== 'youtube' && (
        <button className={`btn text-[16px] ${playing ? 'btn-dark' : 'btn-brass'}`} onClick={() => void play()} disabled={loading || (source === 'track' && !track)} data-testid="jam-play">
          {loading ? 'Loading…' : playing ? '■ Stop' : '▶ Play'}
        </button>
      )}
      <div className="flex gap-1">
        <button className={`btn flex-1 px-1 py-1 text-[13px] ${melody ? 'btn-brass' : ''}`} aria-pressed={melody} disabled={!!setup && setup.melody !== 'choose'} onClick={() => setMelody((v) => !v)} data-testid="jam-melody" title="Mark the notes of the key">
          Melody mode
        </button>
        <button className={`btn flex-1 px-1 py-1 text-[13px] ${keyLock ? 'btn-brass' : ''}`} aria-pressed={keyLock} disabled={!!setup && setup.keyLock !== 'choose'} onClick={() => setKeyLock((v) => !v)} data-testid="jam-keylock" title="Notes outside the key are greyed out and silent">
          Key lock
        </button>
      </div>
      {(melody || keyLock) && (
        <div className="flex gap-1" role="radiogroup" aria-label="Which notes" data-testid="jam-scale">
          {(
            [
              ['key', key.mode === 'major' ? 'Major scale' : 'Minor scale'],
              ['penta', 'Pentatonic'],
              ['blues', 'Blues'],
            ] as const
          ).map(([id, label]) => (
            <button key={id} role="radio" aria-checked={jamScale === id} data-testid={`jam-scale-${id}`} className={`btn flex-1 px-1 py-0.5 text-[12px] ${jamScale === id ? 'btn-brass' : ''}`} onClick={() => setJamScale(id)}>
              {label}
            </button>
          ))}
        </div>
      )}
      <div className="card flex flex-col gap-0.5 px-2 py-1.5" data-testid="jam-mixer">
        <div className="h text-[11px] uppercase text-muted">Mix</div>
        {(
          [
            ['Backing', backVol, setBackVol, meters.back],
            ['Piano', pianoVol, setPianoVol, meters.piano],
          ] as const
        ).map(([label, v, set, lvl]) => (
          <div key={label} className="flex items-center gap-2">
            <span className="h w-14 shrink-0 text-wal3">{label}</span>
            <div className="flex flex-1 flex-col gap-0.5">
              <input type="range" min={0} max={1.5} step={0.05} value={v} onChange={(e) => set(Number(e.target.value))} onDoubleClick={() => set(1)} aria-label={`${label} volume`} data-testid={`jam-vol-${label.toLowerCase()}`} className="accent-[#b8862c]" />
              <Meter level={lvl} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  // Always the same height, so the chord chart above doesn't jump when a chord name appears (his phone report).
  const nowPlaying = det ? (
    <div className="flex h-12 items-center gap-3" data-testid="jam-playing">
      <span className="h text-[14px] uppercase tracking-wider text-line2">You're playing</span>
      <span className="h text-[30px] text-panel">{det.symbol}</span>
      {want && (
        <span className={`h rounded-md px-2 py-0.5 text-[15px] ${onChord ? 'bg-[#cfe3b4] text-good' : 'bg-white/10 text-line2'}`} data-testid="jam-on-chord" data-on={onChord ? 'yes' : 'no'}>
          {onChord ? '✓ On the chord' : `The chord is ${chordName(want.chord)}`}
        </span>
      )}
    </div>
  ) : (
    <div className="h flex h-12 items-center text-[15px] text-line2">{playing ? 'Play along!' : ' '}</div>
  );

  const roll = (
    // The roll sits behind the chord chart and over the (half see-through) video; it never takes clicks.
    <div className="pointer-events-none absolute inset-y-0 left-[2px] right-[2px]" data-testid="jam-roll">
      <PianoRoll notes={rollNotes} start={ctx.viewStart} now={() => (rollT0.current === null ? null : performance.now() - rollT0.current)} offset={rollOffset} canScroll={false} />
    </div>
  );
  const inner =
    source === 'youtube' ? (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-3">
        {videoId ? (
          // Half see-through, so the notes rising up the Stage show on top of it.
          <div className={ctx.phone ? 'absolute inset-0 opacity-50' : 'h-full max-h-full opacity-50'} data-testid="youtube-wrap">
            <YouTubeBox
              cover={ctx.phone}
              videoId={videoId}
              volume={backVol}
              onPlayState={(on, seconds) => {
                // The video playing / pausing is recorded too, with where it was, so play back can line it up.
                if (on) {
                  const pos = clockNow();
                  closeSeg();
                  segs.current.push({ k: 'y', at: Math.round(pos), v: videoId, vt: Math.round(seconds * 10) / 10 });
                } else closeSeg();
              }}
            />
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 px-6 text-center">
            <div className="h text-[26px] text-panel">Jam along with a YouTube video</div>
            <div className="text-[15px] text-line2">Paste a link on the left (or pick one from the list).</div>
            <div className="text-[15px] text-line2">Set the key, then turn on Melody mode or Key lock to help.</div>
          </div>
        )}
        {sheet.length > 0 && (
          // The chord sheet, over the video (top left; Save is top right). Not in time: just in order.
          <div className={`pointer-events-none absolute left-3 top-2 z-20 flex flex-wrap gap-1 ${ctx.phone ? 'right-[300px]' : 'right-[290px]'}`} data-testid="jam-sheet">
            {sheet.map((c, i) => {
              const on = i === sheetPlace && !!det && sameFamily(c.chord, det.chord);
              const next = i === (sheetPlace + 1) % sheet.length && !on;
              return (
                <div
                  key={i}
                  data-testid="jam-sheet-chord"
                  data-on={on ? 'yes' : next ? 'next' : 'no'}
                  className={`flex min-w-[52px] flex-col items-center rounded-md px-1.5 py-0.5 leading-tight shadow transition-transform ${on ? 'scale-110 ring-2 ring-panel' : next ? 'outline-2 outline-offset-1 outline-dashed outline-brass' : 'opacity-80'}`}
                  style={{ background: c.color, color: textOn(c.color) }}
                >
                  <span className="h text-[18px]">{c.text}</span>
                  {c.numeral && <span className="h text-[11px]">{c.numeral}</span>}
                </div>
              );
            })}
          </div>
        )}
        {nowPlaying}
      </div>
    ) : (
      <div className="flex h-full flex-col items-center justify-center gap-4 px-4" data-testid="jam-stage">
        <div className="h text-[13px] uppercase tracking-wider text-brass">
          {source === 'track' ? (track?.title ?? 'No track') : styleName} · {key.label}
          {source === 'groove' ? ` · ${bpm} BPM` : ''}
        </div>
        {/* The chord chart: one box per bar; the bar playing now is lit, with its beats. */}
        <div className="flex max-w-full flex-wrap justify-center gap-1.5" data-testid="jam-chart">
          {chords.map((d, i) => {
            const now = i === barNow;
            return (
              <div
                key={i}
                data-testid="jam-bar"
                data-now={now ? 'yes' : 'no'}
                className={`flex w-[84px] flex-col items-center rounded-lg px-1 py-1.5 transition-transform ${now ? 'scale-110 shadow-lg' : 'opacity-60'}`}
                style={{ background: d.color, color: textOn(d.color) }}
              >
                <span className="h text-[24px] leading-none">{chordName(d.chord)}</span>
                <span className="h text-[13px]">{d.numeral}</span>
                <span className="mt-1 flex gap-1">
                  {[0, 1, 2, 3].map((b) => (
                    <span key={b} className={`h-1.5 w-1.5 rounded-full ${now && b <= beatInBar ? 'bg-current' : 'bg-current opacity-25'}`} />
                  ))}
                </span>
              </div>
            );
          })}
          {!chords.length && <div className="text-[15px] text-line2">Type Roman numerals, like I V vi IV.</div>}
        </div>
        {countIn > 0 && (
          <div className="h text-[48px] leading-none text-brass" data-testid="jam-count">
            {countIn}
          </div>
        )}
        {source === 'groove' && grooveId === 'custom' && !ctx.phone && (
          <BeatGrid pattern={beatPat} onToggle={toggleStep} step={playing && beat >= 0 ? Math.floor(beat * 4) % 16 : -1} />
        )}
        {nowPlaying}
      </div>
    );

  const finished = rollNotes.filter((n) => n.d > 0);
  const saveBar = (
    // Save / Clear what you've played (top corner of the Stage; the left panel is full on a Chromebook).
    <div className="absolute right-3 top-2 z-20 flex items-center gap-1.5" data-testid="jam-save-bar">
      <span className="h text-[12px] text-line2" data-testid="jam-length">
        {full ? 'Full · ' : ''}
        {formatLength(perfLength(finished))}
      </span>
      <button className="btn btn-brass px-2.5 py-1 text-[13px]" disabled={!finished.length} onClick={() => setSaveOpen(true)} data-testid="jam-save">
        Save performance
      </button>
      {clearAsk ? (
        <>
          <button
            className="btn px-2 py-1 text-[13px]"
            data-testid="jam-clear-yes"
            onClick={() => {
              stop();
              segs.current = [];
              setRollNotes([]);
              rollT0.current = null;
              setFull(false);
              setClearAsk(false);
            }}
          >
            Clear it
          </button>
          <button className="btn btn-dark px-2 py-1 text-[13px]" onClick={() => setClearAsk(false)}>
            Keep it
          </button>
        </>
      ) : (
        <button className="btn btn-dark px-2 py-1 text-[13px]" disabled={!rollNotes.length} onClick={() => setClearAsk(true)} data-testid="jam-clear" title="Start your performance over">
          Clear
        </button>
      )}
      {ctx.phone && source !== 'youtube' && (
        // Phones: the backing's Play / Stop is also here, under Save (the setup drawer is closed while playing).
        <button className={`btn absolute right-0 top-full mt-1.5 px-3 py-1 text-[14px] ${playing ? 'btn-dark' : 'btn-brass'}`} onClick={() => void play()} disabled={loading || (source === 'track' && !track)} data-testid="jam-play-stage">
          {loading ? 'Loading…' : playing ? '■ Stop' : '▶ Play'}
        </button>
      )}
    </div>
  );

  const stage = (
    <div className="relative h-full w-full">
      {saveBar}
      {source === 'youtube' ? (
        <>
          <div className="absolute inset-0">{inner}</div>
          {roll}
        </>
      ) : (
        <>
          {roll}
          <div className="relative z-10 h-full">{inner}</div>
        </>
      )}
    </div>
  );

  // Note names: the student's choice, like Practice.
  return {
    left,
    stage,
    labels,
    labelControl: { value: labels, allowed: ['all', 'c', 'off'], set: setLabels, title: 'Note names' },
    detector: true,
    tint,
    dim,
    silence,
    overlay: saveOpen ? <SavePerformance notes={finished} backing={segs.current.map((x) => ({ ...x }))} assignment={ctx.assignment?.title} onClose={() => setSaveOpen(false)} /> : undefined,
  };
}
