import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Level } from '../types';
import { chordName, diatonic, keyById, pcName } from '../utils/chords';
import { pc } from '../utils/music';
import { SongPart, SongUnit, UnitTally, chartSummary, chordOk, emptyTally, graded, melodyOk, melodyPcs, parseChart, songScore, unitAt } from '../utils/song';
import { JAM_MODES, sameFamily } from './ModeJam';
import { ModeCtx } from './modeTypes';
import { StageBox } from './StageRow';
import { YouTubeBox, YTControl, youTubeId } from './YouTubeBox';

/** What the student plays, as the start screen and the result say it. */
const PART_TEXT: Record<SongPart, { play: string; rule: string; result: string }> = {
  chords: { play: 'Play the chords', rule: 'A bar counts if you play its chord somewhere in it, in any rhythm, any inversion', result: 'Right chord in' },
  bass: { play: 'Play the bass: each chord’s root', rule: 'A bar counts if you play its root (any octave) somewhere in it', result: 'Right root in' },
  melody: { play: 'Play a melody', rule: 'A bar counts if you play in it and at least 3 of every 4 notes are in the scale', result: 'In the key in' },
};
/** If the video's time jumps more than this from where it should be, the student moved it: the run stops. */
const JUMP_S = 2;

export interface SongDone {
  right: number;
  total: number;
  part: SongPart;
}

/**
 * Songs lesson: a graded play-along with a YouTube video (his plan). The level's chart says where bar 1 lands in the
 * video and the tempo, so the video's own clock tells which bar is playing. Graded bar by bar (`utils/song.ts`).
 */
export function useSongLevel(ctx: ModeCtx, level: Level, opts: { onFinish: (raw: number, done: SongDone) => void }) {
  const song = level.song;
  const beats = song?.beats ?? 4;
  const units: SongUnit[] = useMemo(() => (song ? parseChart(song.chart, beats) : []), [song, beats]);
  const key = keyById(song?.key ?? 'C');
  const scale = useMemo(() => (song ? melodyPcs(song, song.scale ? JAM_MODES.find((m) => m.id === song.scale)?.steps : undefined) : []), [song]);
  const videoId = song ? youTubeId(song.video) : null;
  const control = useRef<YTControl | null>(null);
  const [running, setRunning] = useState(false);
  const runningRef = useRef(false);
  const [clicks, setClicks] = useState(false);
  const [note, setNote] = useState('');
  /** Beats from bar 1 (negative = before it), refreshed for the screen. */
  const [beatNow, setBeatNow] = useState(-99);
  const tallies = useRef<UnitTally[]>([]);
  const [, bump] = useState(0);
  const playing = useRef(false);
  const anchor = useRef({ v: 0, p: 0 });
  const lastClick = useRef(-99);
  const finishRef = useRef(opts.onFinish);
  finishRef.current = opts.onFinish;

  const spb = song ? 60 / song.bpm : 0.5;
  /** Where the video is now (seconds), smoothed between YouTube's own time reports. */
  const videoNow = (at = performance.now()) => (playing.current ? anchor.current.v + (at - anchor.current.p) / 1000 : anchor.current.v);
  const beatAt = (seconds: number) => (song ? (seconds - song.beat1) / spb : -99);
  /** The song beat a played key belongs to: the video's time, less the student's latency. */
  const playedBeat = () => beatAt(videoNow(performance.now() - ctx.latency));

  const stop = (msg = '') => {
    runningRef.current = false;
    setRunning(false);
    setNote(msg);
  };
  // A new level: back to the start screen.
  useEffect(() => {
    stop();
    setBeatNow(-99);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level.id]);

  /** Mark the unit a moment belongs to, from what's held (chords) or the key just pressed (bass, melody). */
  const judge = (beat: number, pressed?: number) => {
    if (!song || !runningRef.current) return;
    const i = unitAt(units, beat);
    if (i < 0) return;
    const u = units[i];
    const t = (tallies.current[i] ??= emptyTally());
    if (song.part === 'chords') {
      if (u.chord && !t.ok && chordOk(ctx.getHeld(), u.chord)) t.ok = true;
    } else if (pressed !== undefined) {
      if (song.part === 'bass') {
        if (u.chord && pc(pressed) === u.chord.root) t.ok = true;
      } else {
        t.notes++;
        if (scale.includes(pc(pressed))) t.inKey++;
      }
    }
  };
  const judgeRef = useRef(judge);
  judgeRef.current = judge;
  useEffect(
    () =>
      ctx.subscribeNotes((e) => {
        if (!runningRef.current) return;
        judgeRef.current(playedBeat(), e.on ? e.midi : undefined);
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ctx.subscribeNotes],
  );

  // The song's clock: follow the video, judge held chords, click along if asked, and end after the last bar.
  useEffect(() => {
    if (!running || !song) return;
    const last = units[units.length - 1];
    const endBeat = last ? last.at + last.len : 0;
    const id = window.setInterval(() => {
      const c = control.current;
      if (!c) return;
      const now = performance.now();
      const rep = c.time();
      const est = videoNow(now);
      if (Math.abs(rep - est) > JUMP_S && playing.current) {
        c.pause();
        stop('The video jumped, so the run stopped. Press Start to go again from the top.');
        return;
      }
      if (!playing.current || Math.abs(rep - est) > 0.3) anchor.current = { v: rep, p: now };
      const beat = beatAt(videoNow(now));
      judgeRef.current(beatAt(videoNow(now - ctx.latency)));
      // Clicks along (a check that the chart lines up, or a help): each beat scheduled just before it's due.
      if (clicks && playing.current) {
        const next = Math.floor(beat) + 1;
        const wait = (next - beat) * spb;
        if (next > lastClick.current && wait < 0.12) {
          lastClick.current = next;
          ctx.engine.clickAt(ctx.engine.perfToAudio(now + wait * 1000), ((next % beats) + beats) % beats === 0 ? 0 : 1);
        }
      }
      setBeatNow(beat);
      if (beat >= endBeat + 0.25) {
        c.pause();
        runningRef.current = false;
        setRunning(false);
        const s = songScore(song.part, units, tallies.current);
        finishRef.current(s.raw, { right: s.right, total: s.total, part: song.part });
      }
    }, 25);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, song, units, clicks]);
  // Leaving the level or the tab: stop the video.
  useEffect(() => () => control.current?.pause(), []);

  const start = () => {
    const c = control.current;
    if (!song || !c) {
      setNote('The video is still loading. Try Start again in a moment.');
      return;
    }
    ctx.stopMetronome();
    void ctx.engine.unlock();
    tallies.current = units.map(() => emptyTally());
    lastClick.current = -99;
    const from = Math.max(0, song.start ?? song.beat1 - 2 * beats * spb);
    anchor.current = { v: from, p: performance.now() };
    c.seekTo(from);
    c.play();
    setNote('');
    setBeatNow(beatAt(from));
    runningRef.current = true;
    setRunning(true);
    bump((n) => n + 1);
  };

  if (!song || !videoId) return { stage: <div className="p-6 text-line2">This song has no video yet.</div>, running: false, stop: () => stop() };

  const text = PART_TEXT[song.part];
  const colorOf = (u: SongUnit) => (u.chord ? (diatonic(key).find((d) => sameFamily(d.chord, u.chord!))?.color ?? '#66584a') : '#3a2f24');
  const label = (u: SongUnit) => (!u.chord ? 'N.C.' : song.part === 'bass' ? pcName(u.chord.root, key.flats) : chordName(u.chord));
  const cur = unitAt(units, beatNow);
  const done = (i: number) => (song.part === 'melody' ? melodyOk(tallies.current[i] ?? emptyTally()) : !!tallies.current[i]?.ok);
  const sofar = units.map((u, i) => ({ u, i })).filter(({ u, i }) => graded(song.part, u) && (cur < 0 ? beatNow >= u.at + u.len : i < cur));
  const right = sofar.filter(({ i }) => done(i)).length;
  const toGo = Math.ceil(-beatNow);

  const video = (
    <div className={`pointer-events-auto absolute inset-0 flex items-center justify-center ${running ? 'opacity-60' : 'opacity-35'}`} data-testid="song-video">
      <div className={ctx.phone ? 'absolute inset-0' : 'h-full max-h-full'}>
        <YouTubeBox
          cover={ctx.phone}
          videoId={videoId}
          volume={1}
          control={control}
          keys={running}
          onPlayState={(on, seconds) => {
            playing.current = on;
            anchor.current = { v: seconds, p: performance.now() };
          }}
        />
      </div>
    </div>
  );

  const stage = running ? (
    <div className="relative h-full w-full overflow-hidden" data-testid="song-run">
      {video}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col items-center gap-2 p-3">
        {/* One square per graded bar: green right, red missed, grey still to come. */}
        <div className="flex max-w-full flex-wrap justify-center gap-[3px]" data-testid="song-marks">
          {units.map((u, i) =>
            graded(song.part, u) ? (
              <span key={i} className={`h-2.5 w-2.5 rounded-sm ${i === cur ? 'bg-brass' : (cur < 0 ? beatNow >= u.at + u.len : i < cur) ? (done(i) ? 'bg-[#7fb04f]' : 'bg-[#c0574f]') : 'bg-[#66584a]'}`} />
            ) : null,
          )}
        </div>
        {beatNow < 0 ? (
          <div className="h rounded-xl bg-[#1e1710]/85 px-5 py-2 text-center text-panel" data-testid="song-countdown">
            <div className="text-[15px] text-line2">{text.play}{song.part === 'melody' ? ` in ${key.label}` : ''}</div>
            <div className="text-[44px] leading-none">{toGo <= beats ? toGo : 'Get ready'}</div>
          </div>
        ) : (
          <div className="flex items-end gap-2" data-testid="song-bars">
            {units.slice(Math.max(0, cur), Math.max(0, cur) + 4).map((u, k) => {
              const i = Math.max(0, cur) + k;
              const now = i === cur;
              const prog = now ? Math.min(1, Math.max(0, (beatNow + 0.25 - u.at) / u.len)) : 0;
              return (
                <div
                  key={i}
                  className={`h relative overflow-hidden rounded-lg text-center text-panel shadow ${now ? 'px-5 py-2 text-[40px] ring-2 ring-brass' : 'px-3 py-1 text-[22px] opacity-80'}`}
                  style={{ background: colorOf(u) }}
                  data-testid={now ? 'song-now' : undefined}
                >
                  {label(u)}
                  {now && <span className="absolute bottom-0 left-0 h-1.5 bg-panel/80" style={{ width: `${prog * 100}%` }} />}
                </div>
              );
            })}
          </div>
        )}
        {song.part === 'melody' && beatNow >= 0 && <div className="h rounded-md bg-[#1e1710]/80 px-2 py-0.5 text-[14px] text-line2">Melody in {key.label}</div>}
      </div>
      <div className="absolute bottom-2 right-3 z-10 flex items-center gap-3">
        <span className="h rounded-md bg-[#1e1710]/85 px-2 py-1 text-[15px] text-panel" data-testid="song-score">
          {right} of {sofar.length} bars
        </span>
        <button className="btn btn-dark px-3 py-1" onClick={() => { control.current?.pause(); stop(); }} data-testid="song-stop">
          ■ Stop
        </button>
      </div>
    </div>
  ) : (
    <div className="relative h-full w-full overflow-hidden">
      {video}
      <div className="absolute inset-0 z-10 bg-[#1e1710]/55">
        <StageBox phone={ctx.phone} className="gap-2 px-6" testid="song-start">
          <div className="h text-[14px] tracking-wide text-brass">Song: {level.title}</div>
          <div className="h text-[28px] leading-tight text-panel">{level.blurb}</div>
          <div className="flex flex-col items-center gap-0.5 text-[15px] text-line2">
            <div className="text-panel">
              {text.play}
              {song.part === 'melody' ? ` in ${key.label}` : ''}: {chartSummary(units)}
            </div>
            <div>{text.rule}.</div>
            <div>{level.pass}% of the bars to pass.</div>
          </div>
          <label className="flex items-center gap-2 text-[14px] text-line2">
            <input type="checkbox" checked={clicks} onChange={(e) => { setClicks(e.target.checked); e.currentTarget.blur(); }} data-testid="song-clicks" />
            Clicks along with the beat
          </label>
          {note && <div className="max-w-[560px] rounded-lg bg-[#f6e3b8] px-3 py-1 text-[14px] text-wal2" data-testid="song-note">{note}</div>}
          <button className="btn btn-brass mt-1 text-[18px]" data-testid="start" onClick={start}>
            Start
          </button>
        </StageBox>
      </div>
    </div>
  );

  return { stage, running, stop: () => { control.current?.pause(); stop(); } };
}
