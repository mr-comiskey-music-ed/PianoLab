import { SynthParams } from '../types';
import { DEFAULT_SYNTH_PARAMS } from '../data/defaults';
import { decompress, extractParam } from './codec';

/**
 * Reads SynthLab patch codes so students can play their own SynthLab sound here.
 * The short keys below are copied from SynthLab (src/utils/submissionCodec.ts). SynthLab says "append only",
 * so these must match it; if SynthLab adds a setting, add its key here too.
 */
const PARAM_KEYS: Record<keyof SynthParams, string> = {
  masterVolume: 'mv',
  vco1Waveform: 'w1', vco1Octave: 'o1', vco1Semi: 's1', vco1Fine: 'f1', vco1Level: 'l1', vco1PulseWidth: 'p1',
  vco2Waveform: 'w2', vco2Octave: 'o2', vco2Semi: 's2', vco2Fine: 'f2', vco2Level: 'l2', vco2PulseWidth: 'p2',
  noiseLevel: 'nl', oscBalance: 'ob',
  filterCutoff: 'fc', filterResonance: 'fr', filterEnvAmount: 'fe', filterKeyTracking: 'fk', filterRolloff: 'fo',
  ampAttack: 'aa', ampDecay: 'ad', ampSustain: 'as', ampRelease: 'ar',
  modAttack: 'ma', modDecay: 'md', modSustain: 'ms', modRelease: 'mr',
  lfoRate: 'lr', lfoWaveform: 'lw', lfoDepth: 'ld', lfoDestination: 'lt',
  voiceMode: 'vm', glide: 'gl',
};
const PARAM_LONG = Object.fromEntries(Object.entries(PARAM_KEYS).map(([k, v]) => [v, k])) as Record<string, keyof SynthParams>;
const WAVE_LONG: Record<string, string> = { i: 'sine', t: 'triangle', w: 'sawtooth', q: 'square', n: 'noise' };
const WAVE_FIELDS = new Set<keyof SynthParams>(['vco1Waveform', 'vco2Waveform', 'lfoWaveform']);
const SYNTHLAB_FORMAT_VERSION = 2;

/** Old patches (before SynthLab format 2) used a different pulse width scale. */
const legacyWidthToDuty = (w: unknown) => {
  const n = Number(w);
  return Number.isFinite(n) ? Math.max(0.05, Math.min(0.95, (1 + Math.max(-1, Math.min(1, n))) / 2)) : 0.5;
};

function unpack(packed: Record<string, unknown>, legacy: boolean): SynthParams {
  const params: any = { ...DEFAULT_SYNTH_PARAMS, ...(legacy ? { vco1PulseWidth: 0, vco2PulseWidth: 0, lfoDepth: 0.05 } : {}) };
  for (const [k, v] of Object.entries(packed || {})) {
    const long = (PARAM_LONG[k] ?? k) as keyof SynthParams;
    if (!(long in DEFAULT_SYNTH_PARAMS)) continue;
    params[long] = WAVE_FIELDS.has(long) && typeof v === 'string' ? WAVE_LONG[v] ?? v : v;
  }
  if (legacy) {
    params.vco1PulseWidth = legacyWidthToDuty(params.vco1PulseWidth);
    params.vco2PulseWidth = legacyWidthToDuty(params.vco2PulseWidth);
  }
  return params as SynthParams;
}

/** Accepts a SynthLab patch code or a link containing ?patch=. Returns null if it isn't one. */
export async function decodePatch(code: string): Promise<SynthParams | null> {
  const raw = extractParam(code, 'patch').replace(/\s+/g, '');
  if (!raw) return null;
  const json = await decompress(raw);
  if (json) {
    try {
      const parsed = JSON.parse(json);
      if (parsed && typeof parsed === 'object') {
        const { v, ...rest } = parsed;
        return unpack(rest, v !== SYNTHLAB_FORMAT_VERSION);
      }
    } catch {
      /* fall through to the older format */
    }
  }
  try {
    const parsed = JSON.parse(atob(decodeURIComponent(raw)));
    if (parsed && typeof parsed === 'object') return unpack(parsed, true);
  } catch {
    /* not a patch */
  }
  return null;
}
