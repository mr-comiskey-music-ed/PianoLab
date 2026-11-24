import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BackingTrack, GROOVES, Groove } from '../audio/groove';
import { Diatonic, KEYS, KeyDef, chordName, chordPcs, detectChord, keyById, makeKey, parseNumeral } from '../utils/chords';
import { KEY_COUNT, pc, pcOf } from '../utils/music';
import { MAJOR_SCALE } from '../utils/scales';
import { textOn } from './ChordStrip';
import { Labels, ModeCtx, ModeParts } from './modeTypes';
import tracksData from '../data/tracks.json';
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
const TRACKS = (tracksData as { tracks: BackingTrack[] }).tracks;
const VIDEOS = (youtubeData as { videos: YouTubeVideo[] }).videos;

/** Progressions to jam over (Roman numerals, one per bar). The last one is the student's own. */
export const PROGRESSIONS: { id: string; name: string; numerals: string[] }[] = [
  { id: 'pop', name: 'Pop: I – V – vi – IV', numerals: ['I', 'V', 'vi', 'IV'] },
  { id: '50s', name: "'50s: I – vi – IV – V", numerals: ['I', 'vi', 'IV', 'V'] },
  { id: 'sad', name: 'Sad pop: vi – IV – I – V', numerals: ['vi', 'IV', 'I', 'V'] },
  { id: 'rock', name: 'Rock: I – ♭VII – IV – I', numerals: ['I', '♭VII', 'IV', 'I'] },
  { id: 'jazz', name: 'Jazz: ii7 – V7 – Imaj7', numerals: ['ii7', 'V7', 'Imaj7', 'Imaj7'] },
  { id: 'blues', name: '12-bar blues (7ths)', numerals: ['I7', 'I7', 'I7', 'I7', 'IV7', 'IV7', 'I7', 'I7', 'V7', 'IV7', 'I7', 'V7'] },
  { id: 'minor', name: 'Minor: i – VI – III – VII', numerals: ['i', 'VI', 'III', 'VII'] },
];
const JAM_KEYS = KEYS.filter((k) => k.mode === 'major' || ['Am', 'Em', 'Dm'].includes(k.id));

/** The pitch classes of a key's scale (major, or natural minor). */
const scalePcs = (k: KeyDef) => (k.mode === 'major' ? MAJOR_SCALE.slice(0, 7) : [0, 2, 3, 5, 7, 8, 10]).map((s) => pc(k.tonic + s));

/** "https://youtu.be/ID", "...watch?v=ID", "/embed/ID", "/shorts/ID" or a bare id -> the video id. */
export function youTubeId(text: string): string | null {
  const t = text.trim();
  const m = t.match(/(?:youtu\.be\/|[?&]v=|\/embed\/|\/shorts\/|\/live\/)([A-Za-z0-9_-]{11})/) ?? t.match(/^([A-Za-z0-9_-]{11})$/);
  return m ? m[1] : null;
}

/** Read numerals typed by a student ("I V vi IV", "I - IV - V7"). Unreadable ones are dropped. */
export function readNumerals(k: KeyDef, text: string): Diatonic[] {
  return text
    .split(/[\s,–—-]+/)
    .filter(Boolean)
    .map((t) => parseNumeral(k, t))
    .filter((d): d is Diatonic => !!d)
    .slice(0, 16);
}

// ---- The YouTube IFrame player (loaded only when a video is picked) ----
interface YTPlayer {
  setVolume(v: number): void;
  destroy(): void;
}
type YTNamespace = { Player: new (el: HTMLElement, opts: object) => YTPlayer };
let ytReady: Promise<YTNamespace> | null = null;
function loadYouTube(): Promise<YTNamespace> {
  const w = window as unknown as { YT?: YTNamespace & { loaded?: number }; onYouTubeIframeAPIReady?: () => void };
  if (w.YT?.Player) return Promise.resolve(w.YT);
  ytReady ??= new Promise((resolve, reject) => {
    w.onYouTubeIframeAPIReady = () => resolve(w.YT!);
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.onerror = () => {
      ytReady = null;
      reject(new Error('blocked'));
    };
    document.head.appendChild(s);
    window.setTimeout(() => reject(new Error('timeout')), 10000);
  });
  return ytReady;
}

const YouTubeBox: React.FC<{ videoId: string; volume: number }> = ({ videoId, volume }) => {
  const el = useRef<HTMLDivElement>(null);
  const player = useRef<YTPlayer | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    let gone = false;
    setErr('');
    loadYouTube()
      .then((YT) => {
        if (gone || !el.current) return;
        // youtube-nocookie: no tracking cookies until a video is played.
        player.current = new YT.Player(el.current, {
          videoId,
          host: 'https://www.youtube-nocookie.com',
          playerVars: { rel: 0, modestbranding: 1, playsinline: 1 },
          events: { onReady: () => player.current?.setVolume(Math.round(Math.min(1, volume) * 100)) },
        });
      })
      .catch(() => !gone && setErr("YouTube didn't load. It may be blocked on this network."));
    return () => {
      gone = true;
      player.current?.destroy();
      player.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]);
  useEffect(() => {
    try {
      player.current?.setVolume(Math.round(Math.min(1, volume) * 100));
    } catch {
      /* not ready yet */
    }
  }, [volume]);
  return (
    <div className="relative aspect-video h-full max-h-full max-w-full" data-testid="youtube">
      {err ? <div className="flex h-full items-center justify-center px-6 text-center text-[16px] text-line2">{err}</div> : <div ref={el} className="h-full w-full" />}
    </div>
  );
};

/** A small level meter (0-1), updated by the parent's animation loop. */
const Meter: React.FC<{ level: number }> = ({ level }) => (
  <div className="h-2 w-full overflow-hidden rounded-full bg-[#ddd0bc]">
    <div className={`h-full ${level > 0.9 ? 'bg-bad' : 'bg-brass2'}`} style={{ width: `${Math.round(level * 100)}%` }} />
  </div>
);

export function useJam(ctx: ModeCtx, active: boolean): ModeParts {
  const [source, setSource] = useState<Source>('groove');
  const [grooveId, setGrooveId] = useState('pop');
  const [keyId, setKeyId] = useState('C');
  const [progId, setProgId] = useState('pop');
  const [custom, setCustom] = useState('I IV V I');
  const [bpm, setBpm] = useState(GROOVES[0].bpm);
  const [trackId, setTrackId] = useState(TRACKS[0]?.id ?? '');
  const [ytText, setYtText] = useState('');
  const [videoId, setVideoId] = useState<string | null>(null);
  const [melody, setMelody] = useState(false);
  const [keyLock, setKeyLock] = useState(false);
  const [backVol, setBackVol] = useState(1);
  const [pianoVol, setPianoVol] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [beat, setBeat] = useState(-Infinity);
  const [meters, setMeters] = useState({ back: 0, piano: 0 });
  const [held, setHeld] = useState<number[]>([]);
  const [labels, setLabels] = useState<Labels>('c');

  const track = TRACKS.find((t) => t.id === trackId);
  const key: KeyDef =
    source === 'track' && track ? makeKey(pcOf(track.key) ?? 0, track.mode) : keyById(keyId);
  const chords: Diatonic[] = useMemo(() => {
    if (source === 'youtube') return [];
    if (source === 'track') return track ? readNumerals(key, track.progression.join(' ')) : [];
    const p = PROGRESSIONS.find((x) => x.id === progId);
    return readNumerals(key, p ? p.numerals.join(' ') : custom);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, track?.id, key.id, progId, custom]);

  const stop = () => {
    if (Groove.isMade()) Groove.get().stop();
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

  // What's being played (for "on the chord").
  useEffect(() => {
    if (!active) return;
    return ctx.subscribeNotes(() => setHeld(ctx.getHeld()));
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
      const style = GROOVES.find((x) => x.id === grooveId) ?? GROOVES[0];
      g.startGroove(style, bpm, chords.length ? chords.map((d) => d.chord.root) : [key.tonic]);
      setPlaying(true);
    } else if (source === 'track' && track) {
      setLoading(true);
      try {
        await g.startTrack(track);
        setPlaying(true);
      } finally {
        setLoading(false);
      }
    }
  };

  // Melody mode / Key lock: the key's notes on the keys in view.
  const inKey = new Set(scalePcs(key));
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
            <select className={sel} value={grooveId} data-testid="jam-style" onChange={pick((v) => changeSetting(() => { setGrooveId(v); setBpm(GROOVES.find((g) => g.id === v)?.bpm ?? 90); }))}>
              {GROOVES.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </label>
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
                  {p.name}
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
            <select className={sel} value="" data-testid="jam-videos" onChange={pick((v) => { const vid = VIDEOS[Number(v)]; setVideoId(youTubeId(vid.url)); setKeyId(vid.mode === 'minor' ? `${vid.key}m` : vid.key); })}>
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
        </>
      )}
      {source !== 'youtube' && (
        <button className={`btn text-[16px] ${playing ? 'btn-dark' : 'btn-brass'}`} onClick={() => void play()} disabled={loading || (source === 'track' && !track)} data-testid="jam-play">
          {loading ? 'Loading…' : playing ? '■ Stop' : '▶ Play'}
        </button>
      )}
      <div className="flex gap-1">
        <button className={`btn flex-1 px-1 py-1 text-[13px] ${melody ? 'btn-brass' : ''}`} aria-pressed={melody} onClick={() => setMelody((v) => !v)} data-testid="jam-melody" title="Mark the notes of the key">
          Melody mode
        </button>
        <button className={`btn flex-1 px-1 py-1 text-[13px] ${keyLock ? 'btn-brass' : ''}`} aria-pressed={keyLock} onClick={() => setKeyLock((v) => !v)} data-testid="jam-keylock" title="Notes outside the key are greyed out and silent">
          Key lock
        </button>
      </div>
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

  const nowPlaying = det ? (
    <div className="flex items-center gap-3" data-testid="jam-playing">
      <span className="h text-[14px] uppercase tracking-wider text-line2">You're playing</span>
      <span className="h text-[30px] text-panel">{det.symbol}</span>
      {want && (
        <span className={`h rounded-md px-2 py-0.5 text-[15px] ${onChord ? 'bg-[#cfe3b4] text-good' : 'bg-white/10 text-line2'}`} data-testid="jam-on-chord" data-on={onChord ? 'yes' : 'no'}>
          {onChord ? '✓ On the chord' : `The chord is ${chordName(want.chord)}`}
        </span>
      )}
    </div>
  ) : (
    <div className="h text-[15px] text-line2">{playing ? 'Play along!' : ' '}</div>
  );

  const stage =
    source === 'youtube' ? (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-3">
        {videoId ? (
          <YouTubeBox videoId={videoId} volume={backVol} />
        ) : (
          <div className="flex flex-col items-center gap-2 px-6 text-center">
            <div className="h text-[26px] text-panel">Jam along with a YouTube video</div>
            <div className="text-[15px] text-line2">Paste a link on the left (or pick one from the list).</div>
            <div className="text-[15px] text-line2">Set the key, then turn on Melody mode or Key lock to help.</div>
          </div>
        )}
        {nowPlaying}
      </div>
    ) : (
      <div className="flex h-full flex-col items-center justify-center gap-4 px-4" data-testid="jam-stage">
        <div className="h text-[13px] uppercase tracking-wider text-brass">
          {source === 'track' ? (track?.title ?? 'No track') : `${GROOVES.find((g) => g.id === grooveId)?.name} groove`} · {key.label}
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
        {nowPlaying}
      </div>
    );

  // Note names: the student's choice, like Practice.
  return { left, stage, labels, labelControl: { value: labels, allowed: ['all', 'c', 'off'], set: setLabels, title: 'Note names' }, detector: true, tint, dim, silence };
}
