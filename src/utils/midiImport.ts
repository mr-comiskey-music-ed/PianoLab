import { MAX_PERF_MS, MAX_PERF_NOTES, PerfNote } from './performance';

export interface MidiImport {
  notes: PerfNote[];
  /** Name from the file's first track name, if any. */
  title: string;
  /** Notes left out: drums (channel 10) and anything past the length limit. */
  skippedDrums: number;
  cutOff: boolean;
}

/**
 * Read a standard MIDI file (.mid, type 0 or 1) into Sandbox notes, with real timing from the file's tempo changes.
 * All tracks are merged; drums (channel 10) are left out; the sustain pedal (CC 64) lengthens notes the way you'd hear
 * them; leading silence is trimmed; anything past the Sandbox limit (3 minutes or 2000 notes) is cut off.
 * Throws an Error with a plain-English message if the file isn't a MIDI file.
 */
export function readMidiFile(buf: ArrayBuffer): MidiImport {
  const d = new DataView(buf);
  let p = 0;
  const str = (n: number) => {
    let s = '';
    for (let i = 0; i < n; i++) s += String.fromCharCode(d.getUint8(p + i));
    p += n;
    return s;
  };
  const u32 = () => ((p += 4), d.getUint32(p - 4));
  const u16 = () => ((p += 2), d.getUint16(p - 2));
  const vlq = (end: number) => {
    let v = 0;
    for (let i = 0; i < 4 && p < end; i++) {
      const b = d.getUint8(p++);
      v = (v << 7) | (b & 0x7f);
      if (!(b & 0x80)) break;
    }
    return v;
  };

  if (buf.byteLength < 14 || str(4) !== 'MThd') throw new Error('That file is not a MIDI file (.mid).');
  const hlen = u32();
  const format = u16();
  const ntracks = u16();
  const division = u16();
  p = 8 + hlen;
  if (format > 1) throw new Error('This MIDI file type (type 2) is not supported. Try saving it as type 1.');
  if (division & 0x8000) throw new Error('This MIDI file uses SMPTE timing, which is not supported.');

  type Ev = { tick: number; kind: 'on' | 'off' | 'pedal' | 'tempo'; ch: number; a: number; b: number };
  const events: Ev[] = [];
  let title = '';
  for (let t = 0; t < ntracks && p + 8 <= buf.byteLength; t++) {
    const id = str(4);
    const len = u32();
    const end = Math.min(buf.byteLength, p + len);
    if (id !== 'MTrk') {
      p = end;
      continue;
    }
    let tick = 0;
    let status = 0;
    while (p < end) {
      tick += vlq(end);
      let st = d.getUint8(p);
      if (st & 0x80) p++;
      else st = status; // running status
      if (st === 0xff) {
        const type = d.getUint8(p++);
        const l = vlq(end);
        if (type === 0x51 && l === 3) events.push({ tick, kind: 'tempo', ch: 0, a: (d.getUint8(p) << 16) | (d.getUint8(p + 1) << 8) | d.getUint8(p + 2), b: 0 });
        if (type === 0x03 && !title) {
          const save = p;
          title = str(l).trim();
          p = save;
        }
        p += l;
        continue;
      }
      if (st === 0xf0 || st === 0xf7) {
        p += vlq(end);
        continue;
      }
      status = st;
      const type = st & 0xf0;
      const ch = st & 0x0f;
      const a = d.getUint8(p++);
      const b = type === 0xc0 || type === 0xd0 ? 0 : d.getUint8(p++);
      if (type === 0x90 && b > 0) events.push({ tick, kind: 'on', ch, a, b });
      else if (type === 0x80 || (type === 0x90 && b === 0)) events.push({ tick, kind: 'off', ch, a, b });
      else if (type === 0xb0 && a === 64) events.push({ tick, kind: 'pedal', ch, a, b });
    }
    p = end;
  }

  // Ticks -> ms using the tempo map (default 120 BPM).
  events.sort((x, y) => x.tick - y.tick || (x.kind === 'tempo' ? -1 : 0) - (y.kind === 'tempo' ? -1 : 0));
  let lastTick = 0;
  let ms = 0;
  let usPerQuarter = 500000;
  const timed = events.map((e) => {
    ms += ((e.tick - lastTick) * usPerQuarter) / division / 1000;
    lastTick = e.tick;
    if (e.kind === 'tempo') usPerQuarter = e.a || 500000;
    return { ...e, ms };
  });

  // Pair note-ons with note-offs; the sustain pedal holds released notes until it lifts.
  const notes: PerfNote[] = [];
  const open = new Map<string, PerfNote[]>(); // `${ch}:${midi}` -> notes still sounding
  const pedal = new Set<number>();
  const sustained = new Map<number, PerfNote[]>(); // ch -> released while the pedal was down
  let skippedDrums = 0;
  const end = (n: PerfNote, at: number) => (n.d = Math.max(20, at - n.t));
  for (const e of timed) {
    if (e.kind === 'tempo') continue;
    if (e.ch === 9) {
      if (e.kind === 'on') skippedDrums++;
      continue;
    }
    const key = `${e.ch}:${e.a}`;
    if (e.kind === 'on') {
      // Re-striking a held (or pedalled) note ends the old one.
      const held = sustained.get(e.ch)?.filter((n) => n.m === e.a) ?? [];
      held.forEach((n) => end(n, e.ms));
      if (held.length) sustained.set(e.ch, (sustained.get(e.ch) ?? []).filter((n) => n.m !== e.a));
      const n: PerfNote = { t: e.ms, d: -1, m: e.a, v: e.b };
      notes.push(n);
      open.set(key, [...(open.get(key) ?? []), n]);
    } else if (e.kind === 'off') {
      const list = open.get(key);
      const n = list?.shift();
      if (!n) continue;
      if (pedal.has(e.ch)) sustained.set(e.ch, [...(sustained.get(e.ch) ?? []), n]);
      else end(n, e.ms);
    } else if (e.kind === 'pedal') {
      if (e.b >= 64) pedal.add(e.ch);
      else {
        pedal.delete(e.ch);
        (sustained.get(e.ch) ?? []).forEach((n) => end(n, e.ms));
        sustained.delete(e.ch);
      }
    }
  }
  // Anything never let go ends at the last event.
  notes.forEach((n) => n.d < 0 && end(n, ms));

  notes.sort((a, b) => a.t - b.t);
  const first = notes.length ? notes[0].t : 0;
  notes.forEach((n) => (n.t -= first));
  const kept = notes.filter((n) => n.t < MAX_PERF_MS).slice(0, MAX_PERF_NOTES);
  kept.forEach((n) => (n.d = Math.min(n.d, MAX_PERF_MS - n.t)));
  return { notes: kept, title, skippedDrums, cutOff: kept.length < notes.length };
}
