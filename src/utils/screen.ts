import { useEffect, useState } from 'react';

/**
 * Which layout to use (mobile is a nice-to-have; Chromebooks always get the full layout):
 *  - 'phone': a phone held sideways (short screen). Compact top bar, side panels become pull-out drawers, short Stage,
 *    big piano.
 *  - 'upright': a phone held upright. 25 keys don't fit, so it asks to turn the phone (the Grade Report still works).
 *  - 'full': Chromebooks, laptops, tablets.
 */
export type ScreenKind = 'full' | 'phone' | 'upright';

export function screenKind(w = window.innerWidth, h = window.innerHeight): ScreenKind {
  if (h > w && w < 700) return 'upright';
  if (h <= 500 && w > h) return 'phone';
  return 'full';
}

export function useScreenKind(): ScreenKind {
  const [kind, setKind] = useState<ScreenKind>(() => screenKind());
  useEffect(() => {
    const on = () => setKind(screenKind());
    window.addEventListener('resize', on);
    window.addEventListener('orientationchange', on);
    return () => {
      window.removeEventListener('resize', on);
      window.removeEventListener('orientationchange', on);
    };
  }, []);
  return kind;
}
