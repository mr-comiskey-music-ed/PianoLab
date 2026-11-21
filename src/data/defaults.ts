import { SynthParams } from '../types';

/** Same defaults as SynthLab's DEFAULT_SYNTH_PARAMS (copied so patch codes decode the same way). */
export const DEFAULT_SYNTH_PARAMS: SynthParams = {
  masterVolume: 0.75,
  vco1Waveform: 'sawtooth', vco1Octave: 0, vco1Semi: 0, vco1Fine: 0, vco1Level: 0.8, vco1PulseWidth: 0.5,
  vco2Waveform: 'square', vco2Octave: 0, vco2Semi: 0, vco2Fine: 7, vco2Level: 0, vco2PulseWidth: 0.5,
  noiseLevel: 0, oscBalance: 0,
  filterCutoff: 20000, filterResonance: 0.1, filterEnvAmount: 40, filterKeyTracking: 0.5, filterRolloff: -24,
  ampAttack: 0.02, ampDecay: 0.4, ampSustain: 0.6, ampRelease: 0.3,
  modAttack: 0.03, modDecay: 0.5, modSustain: 0.2, modRelease: 0.4,
  lfoRate: 4, lfoWaveform: 'triangle', lfoDepth: 0, lfoDestination: 'pitch',
  voiceMode: 'poly', glide: 0,
};

/** PianoLab's two built-in Synth Keys presets. */
export const SYNTH_KEYS_WARM: SynthParams = {
  ...DEFAULT_SYNTH_PARAMS,
  vco1Waveform: 'triangle', vco2Waveform: 'sawtooth', vco2Level: 0.35, oscBalance: -0.3, vco2Fine: 6,
  filterCutoff: 1800, filterResonance: 0.8, filterEnvAmount: 25, filterKeyTracking: 0.7,
  ampAttack: 0.012, ampDecay: 0.7, ampSustain: 0.55, ampRelease: 0.5,
  modAttack: 0.01, modDecay: 0.6, modSustain: 0.3, modRelease: 0.5,
};

export const SYNTH_KEYS_BRIGHT: SynthParams = {
  ...DEFAULT_SYNTH_PARAMS,
  vco1Waveform: 'sawtooth', vco2Waveform: 'triangle', vco2Level: 0.3, oscBalance: -0.2, vco2Fine: 8,
  filterCutoff: 2600, filterResonance: 0.9, filterEnvAmount: 30, filterKeyTracking: 0.8,
  ampAttack: 0.006, ampDecay: 0.5, ampSustain: 0.5, ampRelease: 0.35,
  modAttack: 0.005, modDecay: 0.4, modSustain: 0.35, modRelease: 0.35,
};

/** Pad (Mr. Comiskey's settings): gentle swell, long release, dark 2-pole filter, pulse-width movement. Poly, for chords. */
export const SYNTH_PAD: SynthParams = {
  ...DEFAULT_SYNTH_PARAMS,
  vco1Waveform: 'square', vco1Octave: 0, vco1Level: 0.71, vco1PulseWidth: 0.22,
  vco2Waveform: 'square', vco2Octave: 1, vco2Fine: 8, vco2Level: 0.46, vco2PulseWidth: 0.5,
  noiseLevel: 0, oscBalance: 0,
  filterCutoff: 156.3, filterResonance: 0.1, filterEnvAmount: 43, filterKeyTracking: 0.5, filterRolloff: -12,
  // Swell softened from his 1.36 s / 0.64 s attacks so chords speak sooner.
  ampAttack: 0.35, ampDecay: 1.12, ampSustain: 0.76, ampRelease: 3.41,
  modAttack: 0.25, modDecay: 0.718, modSustain: 0.06, modRelease: 2.01,
  lfoRate: 3.2, lfoWaveform: 'sine', lfoDepth: 0.16, lfoDestination: 'pwm',
  voiceMode: 'poly', glide: 0,
};
