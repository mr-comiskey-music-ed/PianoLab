# PianoLab

Piano learning app for Mr. Comiskey's high school classes. The full plan is `SPEC.md`; read it before big changes.
Drills are the means; students making music is the goal.

## Hard constraints
- **No student data, ever.** No accounts, no backend that stores student work, no analytics. Work leaves the app only as a
  base64 **code** pasted into Google Classroom. The student types their name when making the code and it lives ONLY inside
  the code (like SynthLab); the app never stores it. Older codes with no name still work; the batch view then uses any text
  pasted next to the code.
- Only things kept in the browser: autosave (`pianolab:v1:autosave`), latency (`pianolab:v1:latency`), personal bests
  (`pianolab:v1:best`), Custom Synth patches (`pianolab:v1:synths`: sound settings + patch names). Never a student name.
  A Sandbox recording lives in memory only (gone on reload) unless saved as a code/link/.mid. "Restore your last session?" prompt first; autosave stays off until answered.
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
(`all` / `c` / `off`): the easiest setting allowed and the starting one. Students can go harder, never easier (the
"Challenge Yourself" buttons: Show Note Names / Show Cs / Hide Note Names; no extra explanation text). Name It
levels are always `off`. Learn shows no labels or highlights while a student is working something out; only the note the
app is playing is lit and labelled. Practice lets students choose. Do not light up the answer when asking to identify a key.
Learn steps only get a "Show me" demo when it teaches something (no demos for "play any D").
Learn steps with `show: true` are show and tell (the musical alphabet): the demo plays by itself with names on every key
(`labels: "all"`), no "now you try". Next step also appears in the center once a step is done. Leaving a step stops its demo.

## Design tokens (Studio Warm v2) - defined in `src/index.css`
- AudioPlot palette: creams `#f7f1e6` (panels) / `#efe6d8` (page, chips); lines `#ddd0bc`, `#c4b49b`; walnut browns
  `#66584a` muted text, `#4d3f31`, `#3a2f24`, `#2a2118` (text, keyboard bed), `#1e1710` (waterfall), `#140f0a` (black keys);
  brass `#d9a441` with `#2a1e08` text, darker brass `#b8862c`, `#8f6620`.
- Fonts: **Barlow** (body), **Barlow Semi Condensed** (headings/numbers). Nothing else.
- Walnut wood cheeks around piano and waterfall (`.wood`, `.wood-v`); CSS-generated placeholder, swap for a CC0 walnut photo.
- Scale-degree colors (same in every key) are in SPEC section 14; add them when chords arrive (Phase 2).
- Layout: walnut top bar with tabs Learn / Practice / Challenges / Sandbox / Jam Room (soon) / Grade Report; left panel
  (lesson, instructions, scores, Challenge Yourself); center (stage/waterfall/piano roll, readout bar, piano); right panel
  (sounds + Mix icon, metronome, Compare versions). The piano is always the main view, except on the Grade Report page.
- **The typing keyboard always belongs to the piano.** Only real text boxes take letter keys; sliders, knobs and buttons
  let go of focus after a mouse drag/click (`useInputs.ts`). Keep it that way for any new control.

## How Mr. Comiskey works (important)
- Very little coding knowledge. Explain in plain words, keep changes small, say what to click when something needs testing.
- He tests on **Vercel preview links** from the branch, on a real Chromebook with a 25-key MIDI keyboard.
- **Work on a branch. Never push or merge to `main` unless he says so, and only AFTER class, never while students are
  using the app.** Do not open a PR unless asked.
- Suggest ideas and angles before building. Ask before big changes.

## Status
Phase 1 (Foundation) built: piano with 3 inputs, latency check, sound engine + Mix + Compare box, Lesson 1 Learn and
4 Challenge levels, codes, batch grading, autosave. See SPEC section 17 for Phases 2-4.
Sounds: Accurate-Salamander (CC BY 3.0, reduced mp3 copy ~8.5 MB in `public/samples/accurate-salamander/`, 5 velocity
layers; loads only when picked, watch load time on school Wi-Fi), Salamander Grand (Tone.js version, from `tonejs.github.io`; sounded thinner in headphones), Splendid Grand (smplr,
from `smpldsnds.github.io`, loaded lazily), Felt (Accurate-Salamander soft layer through a low-pass), Rhodes (jRhodes3d,
reduced copy ~1.8 MB in `public/samples/jrhodes3d/`, CC BY-NC 4.0), Synth Keys (SynthLab engine; Bright was toned down).
Sample files for Rhodes/Accurate are hosted with the app, so they need no outside host. Keep credits in the right panel.
Dropped: the smplr electric piano and the paste-a-SynthLab-patch sound.
Right panel controls must be defined OUTSIDE components (the Slider once lived inside RightPanel and broke click-and-drag).
Metronome: wood block only (chosen by Mr. Comiskey; no sound menu); compact (icon on/off button redrawn from his SVG so
the arm can swing, BPM box + slider, volume knob: 100% default, value bubble while dragging, double-click resets).
Mix: behind a small faders icon at the top right of the Sound box (not essential, so low-key).
Grade Report tab (like SynthLab): Get my code (`CodePanel`) and the teacher's batch grader. No Teacher button in the top bar.
Sandbox (`ModeSandbox.tsx`, `PianoRoll.tsx`, `utils/performance.ts`): records only while its tab is open; Save performance =
code (key `p`, name inside), link (`?perf=`, no name) or .mid; Clear. Batch view can play a performance back.
Piano roll (Shared Piano style): its own "roll clock" runs while you play and glides to a stop ~1.4 s after you stop
(`makeRollMap`); notes keep real timing for play back/MIDI. Scroll/drag to look back, "Back to live", Play back starts
from the scrolled-to spot, a new note jumps back to live.
Oct -/+ buttons light up like the class MIDI keyboards: plain at home (C3-C5), green 1 octave, yellow 2, red 3, on the
button in the direction you moved (`octColor` in App.tsx).
Mix panel floats over the sound list (doesn't push it down).
Learn "find another X in a different place" needs a different key; the same key again gets a hint.
Metronome: arm swings in time with the clicks (`engine.metroPosition()`), BPM box drags up/down or double-click to type
(40-200), volume 0-150% (squared gain so 150% sounds about half again as loud). On = brown button with brass icon.
Lit keys: soft breathing glow + warm gradient (`.lit` in `index.css`), never a hard growing outline.
Custom Synth: SynthLab's Modern Synth panel (`src/synthlab/`, copied, see its README; its `compact` prop hides the title
bar and Master Vol and shortens the displays; filter display 1.5x the scope) in a pop-up between the top bar and the piano
(never covers either) so students keep playing. One header row: Start from (Warm, Bright, Pad, Plain saw; all poly,
because the app is about chords - no mono leads), My sounds, name + Save. Shrunk to fit so it never scrolls (down to 50%). "Custom Synth" in the sound list opens it. Patches save to the browser.
Rhodes now has all 5 velocity layers (~1.8 MB); top notes missing a layer borrow the nearest layer of the same note.
Metronome sounds are in `audioEngine.ts` `tick()`.

## Open items (last updated end of Phase 1 testing)
- Waiting on Mr. Comiskey's Chromebook test of: Accurate-Salamander (5 layers, ~8.5 MB: load time on school Wi-Fi, sound in
  headphones), Felt (now Accurate-based), Synth Keys Bright (toned down, may need more), wood-block metronome + volume knob.
- Pick one sound per category, then delete the others and the "Compare versions" box (SPEC section 13). He wants to hear
  the pianos on headphones and other speakers first. Candidates to cut: Salamander (Tone.js), Splendid Grand, one Synth Keys.
- Grading confirmed: second try = half credit, 80% pass. Lesson 1 has four levels; the octave level (`l1-octave`) was removed
  before anything reached students (he doesn't care about the octave). Old saves drop results for removed levels.
- Teacher button should eventually assign anything (SPEC section 8, "Everything is assignable"). Today it only batch grades.
- Not built yet: About screen with full credits (credits are in a small right-panel list), scale-degree colors, Phases 2-4.
- Confirm the Vercel preview for branch `claude/charming-wozniak-94lfxk` builds; nothing is on `main` yet (merge only on his
  say-so, after class).
- Latency check result varied (88-141 ms in tests); worth a second look once timing grades exist (Phase 3).
