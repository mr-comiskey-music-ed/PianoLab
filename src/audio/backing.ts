import { GROOVES, Groove, TRACKS, customStyle } from './groove';
import { AudioEngine } from './audioEngine';
import { keyById, parseNumeral } from '../utils/chords';
import { BackingSeg } from '../utils/performance';
import { YTControl } from '../components/YouTubeBox';

/** How far ahead (ms) a backing is started, so it can be scheduled exactly. */
const LEAD_MS = 60;

/**
 * Play a Jam Room performance's backing along with its notes (Sandbox play back): each segment starts (or joins part
 * way) at the right moment on the play back clock. `posNow()` = where play back is now (ms on the performance's clock).
 * Returns a stop function. YouTube needs the video showing (`yt`); without it, video segments are skipped.
 */
export function playBacking(segs: BackingSeg[], posNow: () => number, yt: YTControl | null): () => void {
  const timers: number[] = [];
  const engine = AudioEngine.get();
  const at = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, Math.max(0, ms)));
  const pos = posNow();
  let stopped = false;

  for (const seg of segs) {
    if (seg.until !== undefined && seg.until <= pos) continue;
    const end = seg.until;
    if (seg.k === 'g') {
      const style = seg.g === 'custom' && seg.cp ? customStyle(seg.cp, seg.bpm) : GROOVES.find((g) => g.id === seg.g);
      if (!style) continue;
      const key = keyById(seg.key);
      const roots = seg.n.map((n) => parseNumeral(key, n)?.chord.root).filter((r): r is number => r !== undefined);
      const beatMs = 60000 / seg.bpm;
      const countIn = seg.at - 4 * beatMs; // when the count-in's first click was heard
      const start = () => {
        if (stopped) return;
        // The beat that will be heard LEAD_MS (+ the output delay) from now.
        const fromBeat = (posNow() + LEAD_MS + engine.outputDelayMs() - seg.at) / beatMs;
        Groove.get().startGroove(style, seg.bpm, roots.length ? roots : [key.tonic], LEAD_MS / 1000, Math.max(-4, fromBeat));
      };
      at(countIn - pos - LEAD_MS - engine.outputDelayMs(), start);
      if (end !== undefined) at(end - pos, () => Groove.get().stop());
    } else if (seg.k === 't') {
      const track = TRACKS.find((t) => t.id === seg.tr);
      if (!track) continue;
      const start = () => {
        if (stopped) return;
        const offset = (posNow() + LEAD_MS + engine.outputDelayMs() - seg.at) / 1000;
        void Groove.get().startTrack(track, LEAD_MS / 1000, Math.max(0, offset));
      };
      at(seg.at - pos - LEAD_MS - engine.outputDelayMs(), start);
      if (end !== undefined) at(end - pos, () => Groove.get().stop());
    } else if (seg.k === 'y' && yt) {
      const start = () => {
        if (stopped) return;
        yt.seekTo(seg.vt + Math.max(0, posNow() - seg.at) / 1000);
        yt.play();
      };
      at(seg.at - pos, start);
      if (end !== undefined) at(end - pos, () => yt.pause());
    }
  }
  return () => {
    stopped = true;
    timers.forEach((t) => window.clearTimeout(t));
    if (Groove.isMade()) Groove.get().stop();
    yt?.pause();
  };
}

/** When the last backing segment ends (ms), so play back doesn't stop before the music does. */
export const backingEnd = (segs: BackingSeg[]) => segs.reduce((a, s) => Math.max(a, s.until ?? 0), 0);
