import React, { MutableRefObject, useEffect, useRef, useState } from 'react';

/** "https://youtu.be/ID", "...watch?v=ID", "/embed/ID", "/shorts/ID" or a bare id -> the video id. */
/** Where a link says to start ("&t=33", "?t=1m5s", "&start=33"), in seconds; 0 if it doesn't say. */
export function youTubeStart(text: string): number {
  const m = text.match(/[?&](?:t|start)=(?:(\d+)m)?(\d+)s?/);
  return m ? Number(m[1] ?? 0) * 60 + Number(m[2]) : 0;
}

export function youTubeId(text: string): string | null {
  const t = text.trim();
  const m = t.match(/(?:youtu\.be\/|[?&]v=|\/embed\/|\/shorts\/|\/live\/)([A-Za-z0-9_-]{11})/) ?? t.match(/^([A-Za-z0-9_-]{11})$/);
  return m ? m[1] : null;
}

/** What other code can do with the video (play back of a saved Jam Room performance). */
export interface YTControl {
  seekTo(seconds: number): void;
  play(): void;
  pause(): void;
  time(): number;
}

interface YTPlayer {
  setVolume(v: number): void;
  destroy(): void;
  getCurrentTime(): number;
  seekTo(s: number, allowSeekAhead: boolean): void;
  playVideo(): void;
  pauseVideo(): void;
}
type YTNamespace = { Player: new (el: HTMLElement, opts: object) => YTPlayer };
let ytReady: Promise<YTNamespace> | null = null;
/** The YouTube IFrame API, loaded the first time a video is shown. */
function loadYouTube(): Promise<YTNamespace> {
  const w = window as unknown as { YT?: YTNamespace; onYouTubeIframeAPIReady?: () => void };
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

/** YouTube's player states. */
const PLAYING = 1;

/**
 * A YouTube video (youtube-nocookie: no tracking cookies until it plays). `onPlayState` reports playing / not playing
 * with the video's time (the Jam Room records it so play back lines up); `control` lets play back seek, play and pause.
 */
export const YouTubeBox: React.FC<{
  videoId: string;
  volume: number;
  onPlayState?: (playing: boolean, seconds: number) => void;
  control?: MutableRefObject<YTControl | null>;
  /** Phones: fill the whole (short, wide) Stage, cropping the top and bottom of the video, instead of a small box. */
  cover?: boolean;
  /** Start this many seconds in (e.g. to skip a guitar solo at the top of a backing track). */
  start?: number;
}> = ({ videoId, volume, onPlayState, control, cover, start }) => {
  const el = useRef<HTMLDivElement>(null);
  const player = useRef<YTPlayer | null>(null);
  const [err, setErr] = useState('');
  const onState = useRef(onPlayState);
  onState.current = onPlayState;
  useEffect(() => {
    let gone = false;
    setErr('');
    loadYouTube()
      .then((YT) => {
        if (gone || !el.current) return;
        player.current = new YT.Player(el.current, {
          videoId,
          host: 'https://www.youtube-nocookie.com',
          playerVars: { rel: 0, modestbranding: 1, playsinline: 1, ...(start ? { start: Math.round(start) } : {}) },
          events: {
            onReady: () => {
              player.current?.setVolume(Math.round(Math.min(1, volume) * 100));
              if (control)
                control.current = {
                  seekTo: (t) => player.current?.seekTo(t, true),
                  play: () => player.current?.playVideo(),
                  pause: () => player.current?.pauseVideo(),
                  time: () => player.current?.getCurrentTime() ?? 0,
                };
            },
            onStateChange: (e: { data: number }) => onState.current?.(e.data === PLAYING, player.current?.getCurrentTime() ?? 0),
          },
        });
      })
      .catch(() => !gone && setErr("YouTube didn't load. It may be blocked on this network."));
    return () => {
      gone = true;
      if (control) control.current = null;
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
  const box = (
    <div className={cover ? 'yt-cover' : 'relative aspect-video h-full max-h-full max-w-full'} data-testid="youtube">
      {err ? <div className="flex h-full items-center justify-center px-6 text-center text-[16px] text-line2">{err}</div> : <div ref={el} className="h-full w-full" />}
    </div>
  );
  return cover ? <div className="yt-cover-wrap">{box}</div> : box;
};
