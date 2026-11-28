import React, { useEffect, useRef, useState } from 'react';
import { AudioEngine } from '../audio/audioEngine';
import { chartSummary, fitTaps, parseChart } from '../utils/song';
import { JAM_KEYS } from './ModeJam';
import { Shell } from './Modals';
import { YouTubeBox, YTControl, youTubeId } from './YouTubeBox';

const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(2).padStart(5, '0')}`;

/**
 * Teacher tool (Grade Report > Chart a song): work out a song's tempo and where bar 1 lands by tapping along with the
 * video, check it with clicks, and copy the chart to send in for the Songs lesson. Nothing is saved.
 */
export const ChartSongModal: React.FC<{ engine: AudioEngine; onClose: () => void }> = ({ engine, onClose }) => {
  const [link, setLink] = useState('');
  const videoId = youTubeId(link);
  const control = useRef<YTControl | null>(null);
  const playing = useRef(false);
  const anchor = useRef({ v: 0, p: 0 });
  const [taps, setTaps] = useState<number[]>([]);
  const [flash, setFlash] = useState(0);
  const [clicks, setClicks] = useState(false);
  const [title, setTitle] = useState('');
  const [key, setKey] = useState('C');
  const [part, setPart] = useState<'chords' | 'bass' | 'melody'>('chords');
  const [chords, setChords] = useState('');
  const [copied, setCopied] = useState(false);
  const fit = fitTaps(taps);

  /** The video's time now (seconds), smoothed between YouTube's own reports. */
  const videoNow = () => {
    const c = control.current;
    if (!c) return 0;
    const now = performance.now();
    const est = playing.current ? anchor.current.v + (now - anchor.current.p) / 1000 : anchor.current.v;
    const rep = c.time();
    if (!playing.current || Math.abs(rep - est) > 0.3) {
      anchor.current = { v: rep, p: now };
      return rep;
    }
    return est;
  };
  const tap = () => {
    if (!playing.current) return;
    setTaps((t) => [...t, videoNow()]);
    setFlash((n) => n + 1);
  };
  const tapRef = useRef(tap);
  tapRef.current = tap;
  // Space bar = tap (not while typing in a box).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || (t.tagName === 'INPUT' && (t as HTMLInputElement).type === 'text'))) return;
      e.preventDefault();
      e.stopPropagation();
      tapRef.current();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);
  // Clicks along with the fitted beat, to check it lines up.
  useEffect(() => {
    if (!clicks || !fit) return;
    const spb = 60 / fit.bpm;
    let last = -99;
    const id = window.setInterval(() => {
      if (!playing.current) return;
      const beat = (videoNow() - fit.beat1) / spb;
      const next = Math.floor(beat) + 1;
      const wait = (next - beat) * spb;
      if (next > last && wait < 0.12) {
        last = next;
        void engine.unlock();
        engine.clickAt(engine.perfToAudio(performance.now() + wait * 1000), ((next % 4) + 4) % 4 === 0 ? 0 : 1);
      }
    }, 25);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clicks, fit?.bpm, fit?.beat1]);

  const units = chords.trim() ? parseChart(chords) : [];
  const chart =
    fit && videoId
      ? [
          `Song: ${title.trim() || '(name it)'}`,
          `Video: https://youtu.be/${videoId}`,
          `Key: ${key}`,
          `Part: ${part}`,
          `Tempo: ${fit.bpm.toFixed(2)} BPM`,
          `Bar 1 at: ${fit.beat1.toFixed(2)} s`,
          `Chords: ${chords.trim() || '(add the chords)'}`,
        ].join('\n')
      : '';
  const blur = (e: React.SyntheticEvent<HTMLElement>) => e.currentTarget.blur();
  const field = 'rounded-md border border-line2 bg-white px-2 py-1 text-[14px]';

  return (
    <Shell title="Chart a song" onClose={onClose} wide>
      <div className="flex flex-col gap-3 text-[14px] text-wal2" data-testid="chart-song">
        <p className="text-wal1">For the Songs lesson: tap along with a video to find its tempo and where bar 1 starts, then copy the chart and send it in.</p>
        <label className="flex flex-col gap-1">
          <span className="h text-[12px] uppercase text-muted">1 · YouTube link</span>
          <input className={field} value={link} onChange={(e) => { setLink(e.target.value); setTaps([]); }} placeholder="Paste a YouTube link" data-testid="chart-link" />
        </label>
        {videoId && (
          <>
            <div className="mx-auto aspect-video w-full max-w-[520px] overflow-hidden rounded-lg bg-black">
              <YouTubeBox
                videoId={videoId}
                volume={1}
                control={control}
                onPlayState={(on, seconds) => {
                  // Playing: let go of the link box, so the space bar taps.
                  if (on && (document.activeElement as HTMLElement | null)?.dataset.testid === 'chart-link') (document.activeElement as HTMLElement).blur();
                  playing.current = on;
                  anchor.current = { v: seconds, p: performance.now() };
                }}
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="h text-[12px] uppercase text-muted">2 · Tap the beat</span>
              <span>Play the video. Start tapping on beat 1 of bar 1, then tap every beat. Tap at least 2 bars; a whole verse makes it more exact. A missed beat is fine.</span>
              <div className="flex items-center gap-2">
                <button key={flash} className="btn btn-brass pop flex-1 py-3 text-[18px]" onClick={tap} data-testid="chart-tap">
                  Tap (or space bar)
                </button>
                <button className="btn py-3" onClick={() => setTaps([])} disabled={!taps.length} data-testid="chart-clear">
                  Start over
                </button>
              </div>
              <div data-testid="chart-fit">
                {taps.length === 0
                  ? 'No taps yet.'
                  : !fit
                    ? `${taps.length} taps. Keep going…`
                    : `${fit.beats} beats tapped · Tempo ${fit.bpm.toFixed(1)} BPM · Bar 1 at ${fmt(fit.beat1)} · ${fit.spreadMs <= 40 ? `steady (taps within ${fit.spreadMs} ms)` : `uneven (taps off by up to ${fit.spreadMs} ms): try again, or tap longer`}`}
              </div>
            </div>
            {fit && (
              <div className="flex flex-col gap-1">
                <span className="h text-[12px] uppercase text-muted">3 · Check it</span>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={clicks} onChange={(e) => { setClicks(e.target.checked); blur(e); }} data-testid="chart-clicks" />
                  Clicks along with the beat (accent on beat 1)
                </label>
                <button
                  className="btn self-start"
                  onClick={() => {
                    setClicks(true);
                    control.current?.seekTo(Math.max(0, fit.beat1 - (4 * 60) / fit.bpm));
                    control.current?.play();
                  }}
                  data-testid="chart-play-bar1"
                >
                  ▶ Play from just before bar 1
                </button>
                <span className="text-muted">The accented click should land on bar 1, and the clicks should still be on the beat near the end of the song.</span>
              </div>
            )}
            <div className="grid gap-2 sm:grid-cols-2">
              <span className="h text-[12px] uppercase text-muted sm:col-span-2">4 · The song</span>
              <input className={field} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Song name (as students will see it)" data-testid="chart-title" />
              <div className="flex gap-2">
                <select className={field} value={key} onChange={(e) => { setKey(e.target.value); blur(e); }} aria-label="Key" data-testid="chart-key">
                  {JAM_KEYS.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.label}
                    </option>
                  ))}
                </select>
                <select className={field} value={part} onChange={(e) => { setPart(e.target.value as typeof part); blur(e); }} aria-label="What students play" data-testid="chart-part">
                  <option value="chords">Chords</option>
                  <option value="bass">Bass (roots)</option>
                  <option value="melody">Melody</option>
                </select>
              </div>
              <input className={`${field} sm:col-span-2`} value={chords} onChange={(e) => setChords(e.target.value)} placeholder="Chords bar by bar, e.g. (D A Bm G)x8   ·   C*2 = two bars   ·   G,D = two in a bar" data-testid="chart-chords" />
              {units.length > 0 && <span className="text-muted sm:col-span-2" data-testid="chart-summary">Reads as: {chartSummary(units)}</span>}
            </div>
            {chart && (
              <div className="flex flex-col gap-1">
                <span className="h text-[12px] uppercase text-muted">5 · Copy and send it</span>
                <textarea readOnly className={`${field} h-36 font-mono text-[13px]`} value={chart} data-testid="chart-out" onFocus={(e) => e.currentTarget.select()} />
                <button
                  className="btn btn-dark self-start"
                  onClick={() => {
                    void navigator.clipboard?.writeText(chart).then(() => {
                      setCopied(true);
                      window.setTimeout(() => setCopied(false), 1500);
                    });
                  }}
                  data-testid="chart-copy"
                >
                  {copied ? '✓ Copied' : 'Copy'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </Shell>
  );
};
