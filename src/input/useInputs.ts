import { useEffect, useRef, useState } from 'react';
import { TYPING_MAP } from '../utils/music';

/**
 * The three ways to play (SPEC section 12): Web MIDI (primary), computer keyboard (GarageBand-style Musical
 * Typing; Z and X shift octaves), and touch/mouse (handled by the Piano component itself).
 */
export interface InputHandlers {
  noteOn: (midi: number, velocity: number, source: 'midi' | 'typing') => void;
  noteOff: (midi: number, source: 'midi' | 'typing') => void;
  octave: (delta: number) => void;
}

export function useInputs(handlers: InputHandlers, viewStart: number) {
  const h = useRef(handlers);
  h.current = handlers;
  const start = useRef(viewStart);
  start.current = viewStart;
  const [midiStatus, setMidiStatus] = useState<'checking' | 'none' | 'unavailable' | string>('checking');

  // ----- Web MIDI -----
  useEffect(() => {
    let access: MIDIAccess | null = null;
    let dead = false;
    const onMsg = (e: MIDIMessageEvent) => {
      const d = e.data;
      if (!d) return;
      const [status, note, vel] = d;
      const cmd = status >> 4;
      if (cmd === 9 && vel > 0) h.current.noteOn(note, vel / 127, 'midi');
      else if (cmd === 8 || (cmd === 9 && vel === 0)) h.current.noteOff(note, 'midi');
    };
    const attach = () => {
      if (!access || dead) return;
      const names: string[] = [];
      access.inputs.forEach((input) => {
        input.onmidimessage = onMsg;
        const n = input.name || 'MIDI keyboard';
        if (!/through|logic pro/i.test(n)) names.push(n);
      });
      setMidiStatus(names.length ? names[0] : 'none');
    };
    if (typeof navigator === 'undefined' || !navigator.requestMIDIAccess) {
      setMidiStatus('unavailable');
      return;
    }
    navigator.requestMIDIAccess().then(
      (a) => {
        access = a;
        a.onstatechange = attach;
        attach();
      },
      () => setMidiStatus('unavailable'),
    );
    return () => {
      dead = true;
      if (access) {
        access.onstatechange = null;
        access.inputs.forEach((i) => (i.onmidimessage = null));
      }
    };
  }, []);

  // ----- Computer keyboard -----
  useEffect(() => {
    const down = new Map<string, number>(); // key -> midi it started, so note-off matches even if the view moved
    const typingTarget = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      return !!t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT' || t.isContentEditable);
    };
    const onDown = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || typingTarget(e)) return;
      const k = e.key.toLowerCase();
      if (k === 'z') return h.current.octave(-1);
      if (k === 'x') return h.current.octave(1);
      const off = TYPING_MAP[k];
      if (off === undefined || down.has(k)) return;
      const midi = start.current + off;
      down.set(k, midi);
      h.current.noteOn(midi, 0.8, 'typing');
    };
    const onUp = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      const midi = down.get(k);
      if (midi === undefined) return;
      down.delete(k);
      h.current.noteOff(midi, 'typing');
    };
    const blur = () => {
      down.forEach((midi) => h.current.noteOff(midi, 'typing'));
      down.clear();
    };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', blur);
    };
  }, []);

  return midiStatus;
}
