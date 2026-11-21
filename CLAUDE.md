# PianoLab

Piano learning app for Mr. Comiskey's high school classes. The full plan is `SPEC.md`; read it before big changes.
Drills are the means; students making music is the goal.

## Hard constraints
- **No student data, ever.** No accounts, no backend that stores student work, no analytics. Work leaves the app only as a
  base64 **code** pasted into Google Classroom. The student types their name when making the code and it lives ONLY inside
  the code (like SynthLab); the app never stores it. Older codes with no name still work; the batch view then uses any text
  pasted next to the code.
- Only things kept in the browser: autosave (`pianolab:v1:autosave`), latency (`pianolab:v1:latency`), personal bests
  (`pianolab:v1:best`), Custom Synth patches (`pianolab:v1:synths`: sound settings + patch names). Never a student name. "Restore your last session?" prompt first; autosave stays off until answered.
- **Chromebooks first**: each student has a Chromebook, a **25-key USB MIDI keyboard** and headphones. Keep it light and
  fast. Sounds load only when picked. Mobile is nice-to-have only.
- No traditional notation. MIDI-block notation, chord names, roman numerals only.
- Roman numerals/function labels are hidden in Lessons 1-2 (they appear from Lesson 3).

## Stack (same as SynthLab/AudioPlot)
- Vite + React 19 + TypeScript, Tailwind 4, Tone.js. Sounds load only when picked.
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
- `src/utils/autosave.ts`, `batch.ts`, `components/SaveUI.tsx`, `Modals.tsx` follow SynthLab's autosave and batch grader.

## Code format and versioning
- Submission code: `v1.<compressed>.<checksum>`. The leading `v1` is the format version.
- Never change what an existing key means. Add keys; bump the version only if unavoidable; keep a decode branch for every
  version ever shipped. `codec.test.ts` has a frozen v1 code that must keep decoding.
- **Level ids and lesson ids are saved in codes. Never rename or remove one.**
- Grades are percentages, no stars. A prompt earns full credit on the first try and half credit on the second (`credit()` in
  `grading.ts`). Level pass mark is per level (default 80). **50% floor**: a completed attempt never
  records below 50%; student sees the floored grade; batch view shows floored + raw (teacher only); the floor never
  changes pass/fail (pass uses raw). Code stores the raw score.
- Class average leaves out obvious failed attempts (all raw scores under 25).

## Note labels (important teaching rule)
Note names must NOT sit on the keys all the time; naming notes is the material. Each level in `lessons.json` has `labels`
(`all` / `c` / `off`): the easiest setting allowed and the starting one. Students can go harder, never easier. Name It
levels are always `off`. Learn shows no labels or highlights while a student is working something out; only the note the
app is playing is lit and labelled. Practice lets students choose. Do not light up the answer when asking to identify a key.
Learn steps only get a "Show me" demo when it teaches something (no demos for "play any D").

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
Sounds: Accurate-Salamander (CC BY 3.0, reduced mp3 copy ~8.5 MB in `public/samples/accurate-salamander/`, 5 velocity
layers; loads only when picked, watch load time on school Wi-Fi), Salamander Grand (Tone.js version, from `tonejs.github.io`; sounded thinner in headphones), Splendid Grand (smplr,
from `smpldsnds.github.io`, loaded lazily), Felt (Accurate-Salamander soft layer through a low-pass), Rhodes (jRhodes3d,
reduced copy ~1.8 MB in `public/samples/jrhodes3d/`, CC BY-NC 4.0), Synth Keys (SynthLab engine; Bright was toned down).
Sample files for Rhodes/Accurate are hosted with the app, so they need no outside host. Keep credits in the right panel.
Dropped: the smplr electric piano and the paste-a-SynthLab-patch sound.
Right panel controls must be defined OUTSIDE components (the Slider once lived inside RightPanel and broke click-and-drag).
Metronome: wood block only (chosen by Mr. Comiskey; no sound menu); compact (icon button, BPM box + slider, volume knob).
Custom Synth: SynthLab's Modern Synth panel (`src/synthlab/`, copied unchanged, see its README) in a pop-up that stops above
the piano so students keep playing. "Custom Synth" in the sound list opens it. Patches save to the browser.
Rhodes now has all 5 velocity layers (~1.8 MB); top notes missing a layer borrow the nearest layer of the same note.
Metronome sounds are in `audioEngine.ts` `tick()`.

## Open items (last updated end of Phase 1 testing)
- Waiting on Mr. Comiskey's Chromebook test of: Accurate-Salamander (5 layers, ~8.5 MB: load time on school Wi-Fi, sound in
  headphones), Felt (now Accurate-based), Synth Keys Bright (toned down, may need more), wood-block metronome + volume knob.
- Pick one sound per category, then delete the others and the "Compare versions" box (SPEC section 13). Candidates to cut:
  Salamander (Tone.js), Splendid Grand, and one of the Synth Keys.
- Grading confirmed: second try = half credit, 80% pass, the five Lesson 1 levels.
- Not built yet: About screen with full credits (credits are in a small right-panel list), scale-degree colors, Phases 2-4.
- Confirm the Vercel preview for branch `claude/charming-wozniak-94lfxk` builds; nothing is on `main` yet (merge only on his
  say-so, after class).
- Latency check result varied (88-141 ms in tests); worth a second look once timing grades exist (Phase 3).
