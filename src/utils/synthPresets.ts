import { SynthParams } from '../types';
import { DEFAULT_SYNTH_PARAMS } from '../data/defaults';

/**
 * Custom Synth patches, saved in THIS browser only (localStorage key `pianolab:v1:synths`). They are sound settings plus a
 * patch name the student types, never a student name. Nothing is sent anywhere.
 */
export interface SavedPatch {
  id: string;
  name: string;
  params: SynthParams;
  savedAt: number;
}
interface Store {
  v: 1;
  current: SynthParams | null;
  presets: SavedPatch[];
}

const KEY = 'pianolab:v1:synths';
export const MAX_PRESETS = 30;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

const WAVES = ['sine', 'triangle', 'sawtooth', 'square', 'noise'];
const LFO_WAVES = ['sine', 'triangle', 'sawtooth', 'square'];
const LFO_DESTS = ['pitch', 'cutoff', 'pwm'];

/** Anything read back from storage is checked before it reaches the synth (same rules as SynthLab's autosave). */
export function cleanParams(raw: unknown): SynthParams {
  const out: Record<string, unknown> = { ...DEFAULT_SYNTH_PARAMS };
  if (!isObj(raw)) return out as unknown as SynthParams;
  for (const [k, def] of Object.entries(DEFAULT_SYNTH_PARAMS)) {
    const v = raw[k];
    if (typeof def === 'number' && typeof v === 'number' && Number.isFinite(v)) out[k] = v;
  }
  if (typeof raw.vco1Waveform === 'string' && WAVES.includes(raw.vco1Waveform)) out.vco1Waveform = raw.vco1Waveform;
  if (typeof raw.vco2Waveform === 'string' && WAVES.includes(raw.vco2Waveform)) out.vco2Waveform = raw.vco2Waveform;
  if (typeof raw.lfoWaveform === 'string' && LFO_WAVES.includes(raw.lfoWaveform)) out.lfoWaveform = raw.lfoWaveform;
  if (typeof raw.lfoDestination === 'string' && LFO_DESTS.includes(raw.lfoDestination)) out.lfoDestination = raw.lfoDestination;
  if (raw.filterRolloff === -12 || raw.filterRolloff === -24) out.filterRolloff = raw.filterRolloff;
  if (raw.voiceMode === 'poly' || raw.voiceMode === 'mono') out.voiceMode = raw.voiceMode;
  return out as unknown as SynthParams;
}

function read(): Store {
  try {
    const p = JSON.parse(window.localStorage.getItem(KEY) || 'null');
    if (!isObj(p) || p.v !== 1) return { v: 1, current: null, presets: [] };
    const presets: SavedPatch[] = Array.isArray(p.presets)
      ? p.presets
          .filter((x): x is Record<string, unknown> => isObj(x) && typeof x.name === 'string' && typeof x.id === 'string')
          .slice(0, MAX_PRESETS)
          .map((x) => ({ id: String(x.id), name: String(x.name).slice(0, 40), params: cleanParams(x.params), savedAt: Number(x.savedAt) || 0 }))
      : [];
    return { v: 1, current: p.current ? cleanParams(p.current) : null, presets };
  } catch {
    return { v: 1, current: null, presets: [] };
  }
}

function write(s: Store): boolean {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s));
    return true;
  } catch {
    return false;
  }
}

export const loadCurrentPatch = () => read().current;
export const saveCurrentPatch = (params: SynthParams) => write({ ...read(), current: params });
export const listPresets = () => read().presets;

/** Save under a name. Saving with a name that already exists replaces that one. Returns false if storage is blocked or full. */
export function savePreset(name: string, params: SynthParams): boolean {
  const s = read();
  const clean = name.trim().slice(0, 40);
  if (!clean) return false;
  const existing = s.presets.find((p) => p.name.toLowerCase() === clean.toLowerCase());
  const entry: SavedPatch = { id: existing?.id ?? `p${Date.now().toString(36)}`, name: clean, params, savedAt: Date.now() };
  const rest = s.presets.filter((p) => p.id !== entry.id);
  if (!existing && rest.length >= MAX_PRESETS) return false;
  return write({ ...s, presets: [entry, ...rest] });
}

export function deletePreset(id: string) {
  const s = read();
  write({ ...s, presets: s.presets.filter((p) => p.id !== id) });
}
