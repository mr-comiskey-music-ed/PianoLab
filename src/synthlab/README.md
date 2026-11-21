# Copied from SynthLab

These files are SynthLab's Modern Synth panel (`MinilogueView`) and the pieces it needs, copied from
`mr-comiskey-music-ed/SynthLab` `src/components` and `src/utils` (commit cbdd805). They are kept unchanged so they can be
re-copied when SynthLab improves. Local changes:

- import paths point at this folder (`./taper`, `./balanceText`)
- `AdsrVisualizer.tsx`: the `<svg>` `title` attribute became `aria-label` (PianoLab's stricter TypeScript settings)
