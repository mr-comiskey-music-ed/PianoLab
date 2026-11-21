# Copied from SynthLab

These files are SynthLab's Modern Synth panel (`MinilogueView`) and the pieces it needs, copied from
`mr-comiskey-music-ed/SynthLab` `src/components` and `src/utils` (commit cbdd805). They are kept unchanged so they can be
re-copied when SynthLab improves. Local changes:

- import paths point at this folder (`./taper`, `./balanceText`)
- `AdsrVisualizer.tsx`: the `<svg>` `title` attribute became `aria-label` (PianoLab's stricter TypeScript settings)
- `MinilogueView.tsx`: a `compact` prop (PianoLab's pop-up): hides the MODERN SYNTH title bar and the Master Vol knob,
  less padding, shorter filter/scope/envelope displays. Without `compact` it is exactly SynthLab's panel.
