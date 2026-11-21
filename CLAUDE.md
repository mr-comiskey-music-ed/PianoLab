# PianoLab

Piano learning app for Mr. Comiskey's high school classes. The full plan is `SPEC.md`; read it before big changes.
Drills are the means; students making music is the goal.

## Hard constraints
- **No student data, ever.** No names, no accounts, no backend that stores student work, no analytics. Work leaves the
  app only as a base64 **code** pasted into Google Classroom. Codes contain no name. The batch view labels a code with
  whatever text the teacher pasted next to it.
- Only things kept in the browser: autosave (`pianolab:v1:autosave`), latency (`pianolab:v1:latency`), personal bests
  (`pianolab:v1:best`). Never a name. "Restore your last session?" prompt first; autosave stays off until answered.
- **Chromebooks first**: each student has a Chromebook, a **25-key USB MIDI keyboard** and headphones. Keep it light and
  fast. Sounds load only when picked. Mobile is nice-to-have only.
- No traditional notation. MIDI-block notation, chord names, roman numerals only.
- Roman numerals/function labels are hidden in Lessons 1-2 (they appear from Lesson 3).

## Stack (same as SynthLab/AudioPlot)
- Vite + React 19 + TypeScript, Tailwind 4, Tone.js. `smplr` is loaded lazily, only when a smplr sound is picked.
- `npm run dev` (port 3000), `npm run build`, `npm run lint` (tsc), `npm test` (vitest: codes, grading, batch, autosave).
- Vercel (`vercel.json` = SPA rewrite, same as AudioPlot). Proposed domain `pianolab.mrcomiskey.com`.
- Content is data: `src/data/lessons.json` (Learn steps + levels), `src/data/pattern.ts` + `pattern.example.json`
  (the pattern format, used from Phase 3). Adding a level/song means editing a list.
- Notes are MIDI numbers inside the app (60 = C4). 25-key view = C3-C5 (`src/utils/music.ts`).
- Inputs: Web MIDI, computer keyboard (A row = white, W row = black, Z/X = octave), touch/mouse (`src/input/`).

## Reused from other apps (copied, not shared packages)
- `src/audio/synthEngine.ts` = SynthLab's engine. **One local change**: `setOutput()` so it feeds the Mix panel. Re-copy and
  re-apply that change if SynthLab's engine improves.
- `src/utils/codec.ts` = AudioPlot/SynthLab code compression (deflate-raw + base64url + checksum), new submission format.
- `src/utils/patchCode.ts` reads SynthLab patch codes (short keys copied from SynthLab; keep in sync, they are append-only).
- `src/utils/autosave.ts`, `batch.ts`, `components/SaveUI.tsx`, `Modals.tsx` follow SynthLab's autosave and batch grader.

## Code format and versioning
- Submission code: `v1.<compressed>.<checksum>`. The leading `v1` is the format version.
- Never change what an existing key means. Add keys; bump the version only if unavoidable; keep a decode branch for every
  version ever shipped. `codec.test.ts` has a frozen v1 code that must keep decoding.
- **Level ids and lesson ids are saved in codes. Never rename or remove one.**
- Grades are percentages, no stars. Level pass mark is per level (default 80). **50% floor**: a completed attempt never
  records below 50%; student sees the floored grade; batch view shows floored + raw (teacher only); the floor never
  changes pass/fail (pass uses raw). Code stores the raw score.
- Class average leaves out obvious failed attempts (all raw scores under 25).

## Design tokens (Studio Warm v2) - defined in `src/index.css`
- AudioPlot palette: creams `#f7f1e6` (panels) / `#efe6d8` (page, chips); lines `#ddd0bc`, `#c4b49b`; walnut browns
  `#66584a` muted text, `#4d3f31`, `#3a2f24`, `#2a2118` (text, keyboard bed), `#1e1710` (waterfall), `#140f0a` (black keys);
  brass `#d9a441` with `#2a1e08` text, darker brass `#b8862c`, `#8f6620`.
- Fonts: **Barlow** (body), **Barlow Semi Condensed** (headings/numbers). Nothing else.
- Walnut wood cheeks around piano and waterfall (`.wood`, `.wood-v`); CSS-generated placeholder, swap for a CC0 walnut photo.
- Scale-degree colors (same in every key) are in SPEC section 14; add them when chords arrive (Phase 2).
- Layout: walnut top bar; left panel (lesson, instructions, scores, Get my code); center (stage/waterfall, readout bar,
  piano); right panel (sounds, Mix, Compare versions, metronome). The piano is always the main view.

## How Mr. Comiskey works (important)
- Very little coding knowledge. Explain in plain words, keep changes small, say what to click when something needs testing.
- He tests on **Vercel preview links** from the branch, on a real Chromebook with a 25-key MIDI keyboard.
- **Work on a branch. Never push or merge to `main` unless he says so, and only AFTER class, never while students are
  using the app.** Do not open a PR unless asked.
- Suggest ideas and angles before building. Ask before big changes.

## Status
Phase 1 (Foundation) built: piano with 3 inputs, latency check, sound engine + Mix + Compare box, Lesson 1 Learn and
5 Challenge levels, codes, batch grading, autosave. See SPEC section 17 for Phases 2-4.
Not wired yet: Accurate-Salamander and jRhodes3d (need sample files hosted). Sample sources used: Tone.js Salamander
(`tonejs.github.io`) and smplr (`smpldsnds.github.io`).
