# PianoLab

Piano learning app for Mr. Comiskey's high school classes. The full plan is `SPEC.md`; read it before big changes.
Drills are the means; students making music is the goal.

## Hard constraints
- **No student data, ever.** No accounts, no backend that stores student work, no analytics. Work leaves the app only as a
  base64 **code** pasted into Google Classroom. The student types their name when making the code and it lives ONLY inside
  the code (like SynthLab); the app never stores it. Older codes with no name still work; the batch view then uses any text
  pasted next to the code.
- Only things kept in the browser: autosave (`pianolab:v1:autosave`), latency (`pianolab:v1:latency`), personal bests
  (`pianolab:v1:best`), Custom Synth patches (`pianolab:v1:synths`: sound settings + patch names), welcome seen (`pianolab:v1:welcomed` = "1"). Never a student name.
  A Sandbox recording lives in memory only (gone on reload) unless saved as a code/link/.mid. "Restore your last session?" prompt first; autosave stays off until answered.
- **Chromebooks first**: each student has a Chromebook, a **25-key USB MIDI keyboard** and headphones. Keep it light and
  fast. Sounds load only when picked. Mobile is nice-to-have only.
- No traditional notation. MIDI-block notation, chord names, roman numerals only.
- Roman numerals: always shown on the chord strip and in Practice's centre display (his call; the old "hidden in Lessons
  1-2" rule is retired). No Home/Away/Tension function labels anywhere (removed at his request).

## Stack (same as SynthLab/AudioPlot)
- Vite + React 19 + TypeScript, Tailwind 4, Tone.js. Sounds load only when picked.
- `npm run dev` (port 3000), `npm run build`, `npm run lint` (tsc), `npm test` (vitest: codes, grading, batch, autosave).
- Vercel (`vercel.json` = SPA rewrite, same as AudioPlot). Proposed domain `pianolab.mrcomiskey.com`.
- Content is data: `src/data/lessons.json` (Learn steps + levels), `src/data/pattern.ts` + `pattern.example.json`
  (the pattern format, used from Phase 3). Adding a level/song means editing a list.
- Notes are MIDI numbers inside the app (60 = C4). 25-key view = C3-C5 (`src/utils/music.ts`).
- Inputs: Web MIDI, computer keyboard (A row = white, W row = black, Z/X = octave), touch/mouse (`src/input/`).

## Reused from other apps (copied, not shared packages)
- `src/audio/synthEngine.ts` = SynthLab's engine. **Two local changes**: `setOutput()` so it feeds the Mix panel, and
  notes start/stop at `Tone.immediate()` instead of `Tone.now()` (no 100 ms look-ahead on played keys). Re-copy and
  re-apply both if SynthLab's engine improves.
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
- Walnut wood (`.wood`, `.wood-v`): ambientCG "Wood 067" photo texture (CC0, `public/textures/`, ~100 KB) under a soft shade.
- Pitch colours (`src/utils/colors.ts`): C-to-B round the colour wheel like Shared Piano, slightly toned down. Piano-roll
  notes use them (keys stay plain for now). Roman numerals will use the C major scale's colours (`DEGREE_COLORS`).
- Layout: walnut top bar with tabs Learn / Practice / Challenges / Sandbox / Jam Room / Grade Report; left panel
  (lesson picker, instructions, scores, Challenge Yourself); center (stage/waterfall/piano roll, readout bar, piano); right panel
  (sounds + Mix icon, metronome, credits). The piano is always the main view, except on the Grade Report page.
- **The typing keyboard always belongs to the piano.** Only real text boxes take letter keys; sliders, knobs and buttons
  let go of focus after a mouse drag/click (`useInputs.ts`). Keep it that way for any new control.

## How Mr. Comiskey works (important)
- Very little coding knowledge. Explain in plain words, keep changes small, say what to click when something needs testing.
- He tests on **Vercel preview links** from the branch, on a real Chromebook with a 25-key MIDI keyboard.
- **Work on a branch. Never push or merge to `main` unless he says so, and only AFTER class, never while students are
  using the app.** Do not open a PR unless asked.
- Suggest ideas and angles before building. Ask before big changes.

## Status
Phase 1 (Foundation) built: piano with 3 inputs, latency check, sound engine + Mix, Lesson 1 Learn and 4 Challenge levels,
codes, batch grading, autosave, Sandbox.
**Phase 2 (Chords) built** (all at once, his choice): Lessons 2-6 in `lessons.json` (written by a script; edit the JSON),
lesson picker (all lessons open; later the teacher's assignment link can decide), chord detector, chord strip, Smooth Mover.
- Theory: `src/utils/chords.ts` (parse "Dm"/"F#"/"Bdim", voicings, keys, numerals, `detectChord`, `matchesChord`,
  `smoothestVoicing`). `detectChord` names extended chords too (6, 7, maj7, m7, m7♭5, °7, sus2/4, add9, 9, 11, 13, 7♭9...,
  5th-less forms; the bass picks between readings; slash chords like C7/E) with numerals like V7, ii7, viiø7.
  Tests: `chords.test.ts`, and `lessons.test.ts` checks every lesson's content.
- A chord counts in any octave or inversion with no extra notes (his choice); doubling is fine. Lesson 6 levels with
  `inv` require the right bass note. B° is shown in Learn but not tested in Lesson 2 (it appears as vii° in Lesson 3).
- Chord input (`chordInput.ts`): judged once 3+ keys are held steady ~90 ms; one chord = one answer; let go of all keys
  before the next try. Mouse can't hold chords; MIDI, computer keys and touch can. **Listeners must be created once per
  screen (`useChordWatcher`, `useNoteListener`), never re-subscribed on every render**: that once let a real keyboard's
  separate note messages judge one chord twice ("That is C major, not G major" right after a correct C). `e16` tests it.
- Challenge question order (`utils/shuffle.ts` `shuffleNoRepeats`): shuffled, but the same question never comes twice in a
  row, and a new try doesn't open with the question the last try ended on. With only two answers (Lesson 1's F/C
  levels) that means they alternate. Smooth Mover keeps its written order. `shuffle.test.ts` checks every level.
- Learn show steps: the demo button says "▶ Play example". Try steps with a demo have "▶ Show me" on the Stage.
- No Start / Restart / Show me buttons above the piano (removed at his request): Challenges' Start and Restart are on the
  Stage (Restart under the progress bar during a run); Learn's Show me is on the Stage. `ModeParts.start/restart` are unused.
- Demos: an entry ending "*2" is held twice as long (the note the counting stops on). Steps can write words on keys
  (`tags: {"C4": "Root", "E4": "3rd", "G4": "5th"}`; `keyText` on the Piano), moved with the demo's octave shift.
- Interval tries (`tryInterval: 4`): two piano keys held together that many half steps apart, each on a new bottom note
  (the chord listener judges at 2 keys for these steps). Lesson 5 starts with major 3rd (4) and minor 3rd (3) steps, then
  builds chords as "major 3rd + minor 3rd" / "minor 3rd + major 3rd" with Root / 3rd / 5th on the keys.
- Wording: "piano key" wherever "key" could mean a musical key (Lesson 4 especially).
- Learn demo label row on the Stage (`DemoRow`): letters without octave numbers; a two-note entry shows "C + E"; a chord
  shows its short name with the long name under it ("C" / "C major"); a chord/interval after counted notes, and any rest
  (`"_"`, `"_*2"`), gets a wide gap; tagged notes (Root/3rd/5th) are in their pitch colours. Key tags on the piano are
  pills in the note's pitch colour (same colours as the Sandbox roll).
- Challenge feedback: green box when right ("✓ Right!", or the answer for Ear Check), red box with a tip when wrong
  (short + long names: "That is C (C major), not C♯m (C♯ minor)"). Level list = one line per level so 6 fit a Chromebook.
- Listening levels (Ear Check, and nameChord with `playChord`): answer buttons stay closed until the chord has started
  playing; Ear Check shows and plays the right answer for ~1.8 s before the next question (buttons closed meanwhile).
  Questions can carry their own `choices` (Lesson 5 "Name the chord": 5 per question).
- Lesson 5 Learn order: major 3rd, try, minor 3rd, try · Chord names (D vs Dm) · Hearing it (long chords, pause between
  the D pair and the A pair) · Building chords · Build anywhere · More chords. Lesson 5 Challenges (8): Major and minor
  3rds · Major or minor? · Name major chords (`l5-name-major`) · Build major · Name minor chords (`l5-name-minor`) · Build
  minor · Name major and minor chords (`l5-name-heard`) · Play major and minor chords (`l5-build-mixed`). Short names
  ("Play Dm."). Name levels: the chord plays and lights up; 4 choices (kept easy: common chords) in A-G order
  (A, B♭, B, C, C♯...; major before minor on the same root); the mixed one always includes the same root's other quality.
- Lesson 6 Learn step 1: inversions shown low on the keyboard (C3 up), climbing, with coloured Root/3rd/5th tags; the
  Stage names each one ("C major, 1st inversion"). Sentences starting with a number ("1st inversion…") get their own line.
- Chord strip chords (Practice, Sandbox, Learn Stage strips) sound only while held: pointer down/up on a chord, or
  number keys 1-7 down/up (20 s safety cut-off).
- Lesson 4 levels: Half steps · Find the black keys (starts at Cs only) · Name the black key. (`l5-thirds` is a halfStep
  level with step 3/4.)
- `lessons.test.ts` also checks each lesson's Learn sections come in one run (the step list groups by section).
- Level types: findIt, nameIt, buildIt, nameChord (name / numeral / inversion via `choices`), halfStep,
  earCheck (major/minor, "Hear it again"), smooth (Smooth Mover: right chord AND fewest half steps from the lit chord;
  result shows half steps moved vs the smoothest possible). Choice-button answers don't flash the keys.
  Smooth Mover: replaying the lit chord (to place your hand) is ignored, no penalty; the "smoothest" target is chosen
  among voicings that fit on the keys on screen (`smoothestVoicing(from, c, range)`), and the start chord is moved into
  view, so a move never sends you off the keyboard. `e22` tests both.
- What you played: Practice's centre shows the last thing played, big: a chord (symbol, full name, inversion or bass, and
  its Roman numeral in the strip's key, in its degree colour) or a single note. A chord stays "the last thing" while its
  notes are let go unevenly; it changes only when a new chord forms or a new note starts from silence. The readout bar
  above the piano no longer shows "Last note"; only the Sandbox shows the chord there (its centre is the roll). No chord
  names in Challenges.
- Chord strip: Practice (Lesson 2+) and Sandbox only (in Learn it would give answers away); key picker, degree colours,
  numerals always shown (no checkbox). Hold a chord (or hold 1-7): one chord at a time (the last is cut off), voiced from
  a low I upward (I in octave 3, roots climbing) so there's no jump down. Strip chords go straight to the sound engine,
  not the piano: they never count in Learn/Practice/Challenges and the Sandbox doesn't record them.
- The middle area: suggested name **the Stage** (my suggestion, not yet confirmed by him; `data-testid="stage"`).
- Learn layout: the explanation ("say") sits on the Stage right above "Now you try", **one sentence per line**
  (`sentences()` in ModeLearn splits on sentence ends and on "\n"); the left panel only has the step list and Back/Next.
  Demos shift by whole octaves to stay on the keys on screen.
- Learn show steps can put chord strips on the Stage (`strip: ["C"]`, or two: `["C","G"]` with `demoKeys` saying which
  strip each demo chord belongs to); the chord playing lights up; click a chord to hear it. Used in Lesson 2 (Chords in a
  key, A minor) and Lesson 3 (numerals, I–V–vi–IV, the same in G, A minor). Strips are never on try steps (answers).
- Progression tries (`tryProgression` + `tryKey`): play the chords one after another; numeral chips fill in; a wrong or
  out-of-order chord is named with its numeral and the next numeral is given. Lesson 3: I–V–vi–IV, I–vi–IV–V in C, and
  i–VI–III–VII in A minor.
- Lesson 2 (now "White-key triads"): triad / third / root, 3rd, 5th language; "Build 4 triads" accepts any white-key
  stacked triad (root, skip, 3rd, skip, 5th; `tryTriad`), each on a different root; hints say "Find a D and build the
  triad up from there". Levels in order: Name C, F and G (`l2-name-cfg`) · Build C, F and G · Name all white-key triads ·
  Build all white-key triads. "Chords in A minor" level removed (same as Build all). Lesson 3 is "Roman numerals": Play
  the numeral · Name the numeral · Numerals in A minor (`l3-function` removed). His addition (other keys, C/G/F/D only, buttons, no piano: `quiz` type; a wrong answer shows the key's chords via the prompt's `tip`): Chords in other keys (`l3-key-chord`, "What is ii in G major?", 4 chord choices) · Numerals in other keys (`l3-key-numeral`, "What is Am in G major?", I–vi buttons), after Name the numeral. Removed ids never reached students.
- Black keys (Lesson 4+, and Sandbox): names on black keys when names are showing ("C♯" over "D♭"); black keys count as
  answers. Flats are read as sharps internally (`pcOf`).
- Per-lesson Learn: autosave keeps `learn: {lessonId: {done, step}}` + `lessonId` (old Phase 1 saves still load). Codes:
  new key `L` = lesson ids with Learn finished; `l` still means Lesson 1. Grade Report and batch view group by lesson
  (batch row = one chip per lesson: average, • = Learn finished; open a row for each level).
Sounds (all decided by Mr. Comiskey; no more comparing, the Compare box is gone): **Grand Piano** = Accurate-Salamander
(CC BY 3.0, ~8.5 MB in `public/samples/accurate-salamander/`, 5 velocity layers). **Electric Piano** (id `rhodes`) =
jRhodes3d (CC BY-NC 4.0, ~1.8 MB; bell attack tamed with a -4 dB dip at 2.5 kHz + roll-off above 6 kHz; he likes it now).
Removed: Salamander (Tone.js), Splendid Grand (and smplr), Wurlitzer. **Soft Piano** (id stays `felt`): Accurate soft
layer, low-pass 1.4 kHz, -5 dB at 550 Hz, own reverb, and generated tape hiss (does most of the work) with only a few faint
crackles, fading in while playing and out ~3 s after (`makeHissBuffer`). **Synth Keys**: Warm, Bright, Pad (his settings,
`SYNTH_PAD`, swell softened to 0.35 s amp / 0.25 s filter attack), Custom Synth. All samples hosted with the app.
Switching sounds: the old sound keeps playing until the new one has loaded; each note's release goes to the instrument
that started it (`noteVoice`), so no stuck/mixed notes. Sounds still load only when picked (25 Chromebooks pulling ~12 MB
each at the start of class would choke school Wi-Fi).
MIDI controllers: their octave buttons send nothing; the view follows the first out-of-view note by the fewest whole
octaves (`startFor`), matching one press of the controller's octave button.
Mix sliders: double-click resets to default.
Right panel controls must be defined OUTSIDE components (the Slider once lived inside RightPanel and broke click-and-drag).
Metronome: wood block only (chosen by Mr. Comiskey; no sound menu); compact (icon on/off button redrawn from his SVG so
the arm can swing, BPM box + slider, volume knob: 100% default, value bubble while dragging, double-click resets).
Mix: behind a small faders icon at the top right of the Sound box (not essential, so low-key).
Grade Report tab (like SynthLab): Get my code (`CodePanel`) and the teacher's batch grader. No Teacher button in the top bar.
Sandbox (`ModeSandbox.tsx`, `PianoRoll.tsx`, `utils/performance.ts`): records only while its tab is open; Save performance =
code (key `p`, name inside), link (`?perf=`, no name) or .mid; Clear. Batch view can play a performance back.
MIDI import (`utils/midiImport.ts`, no library): type 0/1 .mid, tempo changes respected, all tracks merged, drums
(channel 10) left out, sustain pedal lengthens notes, leading silence trimmed, cut at the Sandbox limit (3 min / 2000
notes). It replaces the current performance (asks first) and waits at the start ("Ready. Press Play back").
Sandbox left panel is kept short so it fits a Chromebook screen: one-line description, length only (no note count), the
label buttons are headed "View:" there (`labelControl.title`), "Challenge Yourself" elsewhere.
Piano roll (Shared Piano style): its own "roll clock" runs while you play, keeps going 1.2 s after the last key is let go,
then glides to a stop over 1.6 s (`TAIL`/`GLIDE` in `PianoRoll.tsx`); notes keep real timing for play back/MIDI.
Scroll/drag to look back ("Back to live" returns); scrolling plays the keys the line crosses, like play back (held while
the line sits in a note, let go 0.5 s after scrolling stops). Play back starts from the scrolled-to spot; the button is
Play back / Pause / Resume, and the space bar toggles it (Sandbox only, not while typing). A new note jumps back to live
and ends a paused play back.
Name boxes in code makers say "Your Name".
No browser pop-ups (`window.confirm`/`alert`): they freeze the page while open, which Vercel's speed check (the "INP
Issue" box on preview links) reports as a ~1 s slow button. "Are you sure?" questions are asked in the panel instead
(Sandbox Clear / import-over-a-recording: Clear-or-Replace / Keep it; Custom Synth delete: click × twice).
Oct -/+ buttons light up like the class MIDI keyboards: plain at home (C3-C5), green 1 octave, yellow 2, red 3, on the
button in the direction you moved (`octColor` in App.tsx).
Mix panel floats over the sound list (doesn't push it down).
Off-screen notes: when play back/scrubbing sounds notes outside the 25 keys on screen, the Oct button in that direction
flashes brass and a label says "Notes playing higher up: press Oct +" (or lower/Oct −). The roll draws such notes as thin
bars on the right edge (higher) or left edge (lower).
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

**Phase 3 (Time) built** (all at once, his choice; timed activities live inside the lessons):
- Pattern engine `utils/patternEngine.ts` (pattern -> timeline of hits; one chord per bar; textures, rhythms, voicings
  root/smoothest kept on C3-C5). Timing judge `utils/timing.ts`: the first key of a chord counts, other keys within 80 ms
  belong to it; Perfect ±50 ms, Good ±100 ms, Early/Late up to ±220 ms; latency is taken off first. Grade = half timing
  + half notes (his calls): timing Perfect 1, Good 0.8, Early/Late 0.5, slid in 0.33, Miss 0. **Wrong notes = Miss** (in the
  tally AND no timing credit), same as not playing. **Slid in**: first keys near the beat but not the chord, then the
  right chord held within 0.4 s (`SLIDE_MS`; uses `getHeld`) = Early/Late in the tally, right notes, 0.33 timing.
  Notes credit can be finer (`checkNotes`): **Smooth levels** (pattern voicing `smoothest`) judge the move from the chord
  the student actually played (so Chord Names Only really tests it): smoothest = 1, second-smoothest = 0.75 ("Almost
  smooth"), bigger = 0 ("Not smooth", a Miss); the first chord (or one after an unplayed chord) can be any voicing
  (`moveSizes` in chords.ts). **Not smooth** (right notes, big move) is now worth 25% of the chord (timing and notes,
  `partial`, under Early/Late; his call). Wrong chords can be fixed for half the chord's length (at least 0.4 s,
  `slideMs`). Root-then-chord patterns (bassChord/broken): the root beats also accept the whole chord in any inversion
  (`alt`), since Chord Names Only can't show it's just the root (his "inversions not accepted" report on l3-play-doowop).
  Falling Note Blocks show each note's name near the bottom of its block, spelled for the key (B♭ in F).
  Pops say e.g. "Perfect! · Almost smooth", "Not smooth", "Wrong notes". Result screen:
  Perfect · Good · Early/Late · Miss. Tests: `timing.test.ts`, `e31`.
- **Timing clock (fixed after his Chromebook test: he was "early" while with the click).** Two bugs: (1) every played key
  used `Tone.now()`, which is 100 ms in the future (Tone's look-ahead), so students heard their own notes late and pushed
  early; live notes now use `Tone.immediate()`. (2) The latency check compared taps on `Tone.now()` with clicks on the
  audio clock, adding ~100 ms to every latency. Now everything uses when a sound is HEARD on the `performance.now()` clock
  (`engine.audioToPerf`: audio clock + the device's output delay): the latency check's clicks, the timed level's clicks
  (`scheduleBeatClicks` returns `firstHeardAt`; the waterfall and judge start from it), and "Listen first" (notes start
  early by `outputDelayMs()`). Latency is saved as `"2:<ms>"` in `pianolab:v1:latency`; old plain numbers (inflated) are
  ignored, so everyone re-checks. `e29` tests the chain (40 ms keyboard delay -> latency 40 -> all Perfect). Test hook
  `window.__clicks` (latency check click times).
- Progression Play (`type: "play"`, `components/PlayLevel.tsx` + `Waterfall.tsx`): blocks in the bar's degree colour fall
  onto a brass line above the keys; bar labels show chord + numeral. Start screen: tempo (never slower than the level or
  the assignment), Show = Falling Note Blocks / Chord Names Only (the level's `screen` is the most help allowed; "Nothing (memory)" removed at his request),
  Listen first, Start. 4-click count-in shown as 1-2-3-4 (his call: how you'd count a band in; wood block, on the audio clock), Perfect/Good/Early/Late pops, Stop. The
  global metronome is turned off for it. Result shows Perfect/Good/Miss, timing % and right-notes %.
- Echo (`type: "echo"`, prompt `notes`): the app plays a short tune, then the student plays it back (any octave, same
  order). "Difficulty" (his wording): See Notes (keys light) / See First Note (only the first key lights) / By Ear (no
  lights, 2 replays); level `echo` is the easiest allowed. Restart during an Echo goes back to the start screen (to
  change the difficulty); other levels start over right away.
- Speed Round (`type: "speed"`, `seconds`, `target`): Build It rules, as many as possible; wrong = try again, Skip
  button; grade = right answers / target (max 100%).
- New levels (appended, ids saved in codes): `l1-echo`, `l2-play-roots`, `l2-play-cfg`, `l3-play-pop`, `l3-play-doowop`,
  `l5-speed`, `l6-play-smooth`. Lesson 5 has 9 levels; the level list was tightened so it still fits a Chromebook.
- His feedback round 2: "Falling Note Blocks" / "Chord Names Only" (Chord Names Only = full-width bands across the
  Stage, named in the middle, so they don't look like a piano key; the Perfect/Miss pop moves to the top there). Beat lines
  across the waterfall in every mode: beat 1 (bar line) thickest, beat 3 medium, beats 2 and 4 thin (count-in included).
  Lesson 2's timed levels are 8 bars, so missing one chord
  still passes (88%): Roots in time (whole) · C, F and G in time (whole notes now) · C, F and G: half notes
  (`l2-play-cfg-half`, new). Latency reminder: if at least 70% of presses are on the same side and the middle offset is
  70 ms or more (`steadyOffset` in timing.ts; compares to the nearest hit up to half a beat away, so a latency setting
  that is far off still shows), the result screen says "You were usually about N ms late/early..." with a Check latency
  button (`ctx.openLatency`).
- Smooth moves in time (Lesson 6, his plan, 16 bars each, whole notes, smoothest voicing, rising difficulty):
  `l6-play-smooth` I-IV-V-I in C · `l6-play-smooth-c6` all six (I-vi-ii-V-I-iii-IV-V) in C · `l6-play-smooth-g` I-IV-V-I in G
  · `l6-play-smooth-f` I-IV-V-vi in F · `l6-play-smooth-a` I-IV-V-I in A · `l6-play-smooth-d6` all six in D. Lesson 6 has 9
  levels (fits). Equal-distance moves pick the voicing nearest where the hand started (`smoothestVoicing(..., anchor)`),
  so a long progression doesn't creep up the keyboard (C: CEG > CFA > DGB > EGC, then the same loop).
- Timed level start screen: the chords are written short when they loop ("A – D – E – A × 4 · 16 bars", `chordSummary`
  in patternEngine.ts), and the grading rule is its own line: "80% to pass, half on timing, half on correct notes".
  Latency reminder and the latency check's intro: one sentence per line, short. Lesson 6 timed titles shortened to fit
  one line: Smooth: C major · Smooth: all of C · Smooth: G/F/A major · Smooth: all of D (ids unchanged).
- Latency check result says "Steady ✓", or (taps wandering more than 30 ms around their own middle, `tapSpread` in
  timing.ts) "Your taps were uneven..." with Try once more. Being steadily early/late is fine (that IS the latency).
  First timed challenge: if latency was never checked on this device, the start screen asks for it first (Check latency /
  Skip for now; skip lasts this visit only, nothing saved). His call instead of putting it in assignment links. (He asked
  about Soundtrap-style mic loopback: decided against: it measures speaker+mic delay, not the MIDI keyboard or the
  student's feel; mic permission prompts and 25 Chromebooks clicking in one room.)
- Level titles on the Stage are no longer in capitals (capitals turned "vi" into "VI").
- Assignment link (core, `utils/assignment.ts`): Grade Report > Teacher > "Make an assignment link": name, levels (by
  lesson), note names (level's own / at most Cs / none), slowest tempo, sound. Link = `?a=<compressed>.<checksum>`
  (keys t, v, n, b, s; never change their meaning). Opening it: banner, only the assigned lessons/levels, note names never
  easier than the limit, tempo floor, sound set and locked, opens on Challenges. The code's existing `a` key carries the
  assignment name (no format change); the batch view shows it under the student's name; the code then holds only the
  assigned levels. A broken link opens the normal app.
- Test hooks (no student data): `window.__play` (hit times) and `window.__echo` (the tune) for browser tests.

**Phase 4 (Music) built** (all at once, his choice; 7th chords became Lesson 8, not a bonus; no class-record backend;
YouTube ungraded):
- 7th chords in the theory (`chords.ts`): qualities dom7/maj7/min7/hdim7/dim7 (G7, Cmaj7, Dm7, Bø7, B°7), parse/name/
  match need all 4 notes (any inversion), `diatonicSevenths` (Imaj7 ii7 iii7 IVmaj7 V7 vi7 viiø7), and `parseNumeral`
  reads any numeral in a key (V7, ii7, Imaj7, blues I7/IV7, borrowed ♭VII/♭VI). The chord listeners wait for 4 keys when
  a 7th chord is asked for (Learn and Challenges `minNotes`).
- Lesson 7 "Major scales" (renamed from "Scales and the circle of 5ths"; `utils/scales.ts`: W W H W W W H, right-hand
  fingerings, sharps/flats, fifthUp/Down). Learn (his reorder: the circle-of-5ths step removed as clunky): Major scales
  (steps, fingers, play C) · Sharps: G and D (show + try each) · Flats: F (why some scales use flats: to keep the
  whole/half pattern, each letter once; show + try). Finger numbers as key tags on show steps only (`lessons.test`
  enforces it); `tryScale` = note by note, a wrong note starts over, 8 dots. Challenges (his redo; the old Play the scale
/ Sharps and flats / Circle of 5ths levels removed before any student used the site): C major scale (`l7-scale-c`) · C
major in time · G scale · G in time · D scale · D in time · F scale · F in time · More keys. Each "scale" level asks the
same scale 3 times with a reminder ("Remember: F♯."); a level whose questions are all the same keeps its order (no
shuffle). Timed scale levels have no chord/key label on the waterfall (`Timeline.scale`; it covered the notes). Level types used: `scale` (fingering shown as a hint) and pattern texture `scale`
  (up and down, one note per beat; Falling Note Blocks only); the `quiz` type (buttons, nothing lit) is used by Lesson 3's other-keys levels.
- Lesson 8 "7th chords" (his redo; 7ths taught from the octave, his option A): Learn: one more 3rd, try G7 · Find the
  7th from the octave (`l8-octave`: major 7th = half step below the octave, minor 7th = whole step below; tags Root /
  Octave / Maj 7 / Min 7) · try major 7ths, minor 7ths (`tryInterval` 11 / 10, 3 roots each; the octave gets "good start!")
  · Three kinds, all on G (Gmaj7 = major triad + major 7th, G7 = major triad + minor 7th, Gm7 = minor triad + minor 7th) ·
  try three maj7s (Cmaj7 Fmaj7 Gmaj7), three m7s (Dm7 Em7 Am7), three dom7s (G7 C7 D7) (`tryProgression` + `tryNames`:
  chips show chord names, no key); each repeats its recipe · the 7ths of C · ii7–V7–Imaj7 try. Levels (9, fits): Major and
  minor 7ths (`l8-sevenths`, halfStep 11/10; a wrong answer says "find the octave, then step down") · Major 7th chords
  (`l8-maj7`) · Minor 7th chords · Dominant 7th chords (3 chords x 3 each) · Play all 7th chords (`l8-build`) · Which kind
  of 7th? · ii7–V7–Imaj7 in C and in F · R&B 7ths in C (`l8-time-rnb`: IVmaj7–iii7–ii7–Imaj7, smooth, in time). A wrong
  7th chord in a Build level adds its recipe ("Cmaj7 = major triad + major 7th (a half step below the octave)",
  `SEVENTH_RECIPE` in ModeChallenge). `l8-numeral` removed (no students yet).
  Phone Learn try screens: explanation column 34%, try column 46% (the success message wrapped and spilled off the Stage).
- Jam Room tab (`ModeJam.tsx`, `audio/groove.ts`): backing = Groove (app-made drums + bass from the progression: Pop,
  Rock, Ballad, Funk, Lo-fi, Just the beat; a bar of clicks to count in) / Tracks (his audio files: `public/tracks/` +
  `src/data/tracks.json`, loaded only when played; README in the folder) / YouTube (his list `src/data/youtube.json` or a
  pasted link; youtube-nocookie IFrame player, ungraded, no chord chart; a message if YouTube is blocked). Key, chords
  (presets incl. 12-bar blues, or "My own…" numerals), tempo. Chord chart follows the music; "You're playing X ✓ On the
  chord". Melody mode (brass dot on the key's notes, `tint`), Key lock (other notes greyed and silent: `dim`/`silence`,
  handled in App's noteOn). Mix: Backing and Piano faders (double-click resets) with meters. Note names: student's
  choice. Dropdowns give the typing keyboard back after a pick (blur on change).
- Jam Room Stage shows a live piano roll of what the student plays (Sandbox's `PianoRoll`, the whole performance): behind the chord chart for Groove/Tracks; on top of the YouTube video, which is 50%
  see-through (his call), with the roll not taking clicks so the video's controls still work.
- Jam Room progressions have major and minor versions (his bug: A minor showed A–E–Fm–D): Pop i–VI–III–VII, '50s
  i–VI–iv–V, Sad pop i–VII–VI–VII, Rock i–VI–VII–i, Jazz iiø7–V7–i7, minor blues i7/iv7/v7; the dropdown names show the
  numerals for the key picked. ("Minor" preset removed: every preset has a minor version.)
- Jam Room saves performances (his request; the plan's Play Along "take"): everything played is kept in memory (Sandbox
  limits, long pauses shortened); Save performance (Sandbox's `SavePerformance`: code with name inside / link / .mid) and
  Clear (asks Clear it / Keep it) in the Stage's top-right corner. Piano notes only, not the backing.
- **Jam Room play back with its backing** (his request): a saved Jam Room performance also stores what played behind
  it and when (`BackingSeg` list in `utils/performance.ts`: groove id + key + numerals + BPM, his track id, or YouTube
  video id + video time; `at`/`until` on the performance's clock). Code key `j` (still v1; `cleanBacking` checks it);
  links carry `{p, j}` (old links = just the notes list, still open). The performance clock starts at the first note or
  the first backing; long pauses aren't shortened while a backing plays. Play back (Sandbox, `audio/backing.ts`
  `playBacking`) restarts each segment at the right moment, joining part-way after a pause (`startGroove(..., fromBeat)`,
  `startTrack(..., fileOffset)`, YouTube seek); speed stays 100% with a backing; a YouTube performance shows the video
  (50% see-through) under the roll. The batch view has "▶ With backing" (opens the Sandbox link). `e40`: notes land on
  the same groove beat within ~0.05 beat, also after pause/resume. `YouTubeBox.tsx` is shared (seek/play/pause control,
  play/pause reports). Test hook `window.__groove`.
- Sandbox MIDI import: Speed 50/75/100% (roll and sound slow together), Track picker for multi-track files (shown until
  you record on top), Mute (notes still come up and light, silently, to play the part yourself).

**Phone layout (mock-up stage, his call: sideways to play, everything slimmed, mock-up first)** (`utils/screen.ts`):
'phone' = sideways and at most 500 px tall; 'upright' = taller than wide and under 700 px wide; Chromebooks/laptops/tablets
= 'full' (unchanged). Phone, round 2 (his feedback): ONE bar on top: ☰ (opens the left drawer) · tabs ("Grade") ·
Oct − / Oct + · ♪ (Sound drawer) · ⋯ (MIDI/latency/saved chips); the bar above the keys and the "C3–C5" text are gone on
phones (no off-screen-notes label there; the Oct buttons still flash). The ☰ button became a labelled menu button (his
"not obvious" note): "Lesson 3 / Step 2 ▾" (Learn), "Lesson 3 / Level 2 ▾" (Challenges, `navLabel` from the modes),
"Lesson 3 / Practice ▾", "Sandbox / Options ▾", "Jam Room / Setup ▾": always two lines, fixed 92 px wide (the
Grade tab's logo takes the same width), so the tabs never shift (his report); a brass hint bubble "Lessons and levels are here" shows
once per visit under it (6 s or the first tap; nothing saved). Phone tab "Jam Room" -> "Jam". Drawers slide over (backdrop closes). Chord strip
hidden, except a compact one-row strip in the Sandbox (his call; `ChordStrip compact`). Stage contents at 80% (`.phone-stage` zoom) and laid out LEFT TO RIGHT (`StageRow.tsx`: `StageBox` + `Col`, used
by Challenges (start / question / result: score | passed + best | buttons), Learn (explanation | try | buttons),
Practice, the timed-level start screen); `ctx.phone` tells modes. Piano 36% of the height; stage side borders 10 px so
the waterfall lines up with the keys. Upright: "Turn your phone sideways to play" (Grade Report still opens). Touch
always works on phones (his requirement); Android Chrome takes USB/Bluetooth MIDI controllers; iPhone Safari has no
Web MIDI (touch only); the silent switch mutes web audio. Still to check on phones: Sandbox, Jam Room, Grade Report.

**His round 3 (phone + general):** Grade Report: the code box and Copy button sit right under "Your Name" (then the level
list), all screens. Jam Room: the "You're playing" line has a fixed height (`h-12`) so the chord chart doesn't jump. YouTube
iframes fill their frame (`[data-testid='youtube'] iframe` in index.css; YouTube's default 640x390 made a box in a box).
**Glissando** (`Piano.tsx` `move`): sliding a held finger, or the mouse with its button down, across the keys plays each
key it reaches and lets go of the one it left; keys another finger holds aren't cut off. `e41` tests these.

**Last build phase (his picks; class record skipped):**
- Phones: the Sandbox Stage has Save performance with Play back / Pause under it (top right, once something is recorded);
  the Jam Room's ▶ Play / ■ Stop sits under its Save bar (not for YouTube). YouTube on phones fills the whole short Stage
  (`YouTubeBox cover`: top and bottom cropped, the Stage's 0.8 zoom undone, `.yt-cover` in index.css) instead of a small
  box. (YouTube is blocked in the test browser; `e49` uses a stand-in player.)
- **Everything assignable** (`utils/assignment.ts`, new keys, old ones unchanged): `l` Learn lessons, `e` Echo at least
  See First Note / By Ear, `w` timed levels at most Chord Names Only (not scale levels), `o` opens on Learn / Challenges /
  Sandbox / Jam Room (automatic otherwise: levels, then Learn, then Jam), `m` a note from the teacher (banner), `j` a Jam
  Room setup (groove style + key + preset or the teacher's own numerals + slowest tempo, or one of his tracks, or a
  YouTube video + key; Key lock and Melody mode each off / on / student chooses). A link can assign only Learn, only the
  Jam Room or only the Sandbox. Learn-only lessons show "No Challenges in this assignment" in Challenges; a Jam/Sandbox-only
  link keeps every lesson open with no levels. A set-up Jam Room shows "Set up by your teacher" (tempo can only go faster).
  Saved performances (Sandbox, Jam) carry the assignment name in the code. Builder: Grade Report > Make an assignment
  link (Learn tick box on each lesson; timed/Echo options appear only when such levels are ticked). `e51` tests it.
- **Welcome walkthrough** (`Welcome.tsx`): 5 cards (playing: MIDI / computer keys / touch · Learn, Practice, Challenges ·
  latency check · Sandbox and Jam Room · turning in a code; phone wording differs). Shows on a first visit only (not for a
  returning student who gets the restore prompt); reopen with "?" in the top bar (phones: ⋯ > How it works). The phone
  nav hint waits until it closes. **Browser tests must set `pianolab:v1:welcomed` = "1"** or the welcome covers the page.
- **YouTube chord sheet** (his request): with a YouTube backing, "Chords (optional)" takes a progression found online
  (`readChordSheet` in ModeJam: chord names as sheets write them, "Am - F - C/E - G7", sus/add/odd chords count as their
  plain triad, or numerals). Boxes in order at the top left of the Stage, in degree colours with numerals for the key;
  not in time: the box you're playing lights up and the next one gets a dashed outline (it follows what you play,
  `sameFamily`: same root, both major-ish or minor-ish). Prefilled from `youtube.json`'s `chords`; an assignment's
  YouTube Jam can carry them (`custom`). `jamSheet.test.ts`, `e53`.
- **Chord rhythms lesson** (his request; shown as Lesson 7 between Inversions and Major scales; id `lesson-rhythm`, so the
  old `lesson-7`/`lesson-8` ids keep working and are now shown as Lessons 8 and 9 (`number` is display only)). Simple
  root-position chords, the rhythm is the point. Learn (`RhythmBox.tsx`): a counting grid "1 + 2 + 3 + 4 +" with each hit
  drawn where it falls and as long as it lasts; ▶ Listen (clicks + chords, a line moves along); try steps add ▶ Play
  along (4-click count-in, the due keys light, passes at 75% right notes Early/Late or better, `RHYTHM_PASS`). Steps:
  whole, half, quarter (+ try), 8ths (+ try), off the beat (+ try), the tresillo (3+3+2, the 3 side of the son clave; +
  try), oom-pah (broken: root on 1 and 3, chord on 2 and 4; + try), arpeggios (R 3 5 8 in 8ths; + try). Challenges (9):
  Half notes · Quarter notes · 8th notes (72) · 8th notes, faster (104) · Off the beat (G, no groove) · Tresillo (90) ·
  Tresillo, faster (112, funk) · Oom-pah (100) · Arpeggios (72, ballad). New rhythms in the pattern engine:
  `sync:tresillo` (= `sync:pop`), `sync:offbeats`, `sync:push`. Timed levels can have a `groove` (Jam Room style id): an
  app-made drums + bass backing on each bar's root with its own count-in bar, "Backing: groove / Clicks" on the start
  screen (`PlayLevel`). Arpeggio levels are Falling Note Blocks only, like scales. `e54` tests it.
- **Full debug pass (before the 2nd merge to main):** `e55` sweeps every lesson's Learn steps, every level's start
  screen, Practice and the other tabs on a Chromebook and a phone (page errors, console errors, Stage overflow): no errors
  anywhere. Fixed: (1) leaving Challenges mid-run stops a timed level (its clicks/groove played on and it was still
  graded; `useChallenge(ctx, active)`); (2) phone Stage columns (`Col`) centre with auto margins and scroll from the top
  when too tall (long Learn text lost its first lines above the edge); phone Learn text 16px; the rhythm box is compact on
  phones; (3) **no regex lookbehind `(?<=` anywhere**: iPhone Safari before 16.4 can't parse it and the whole app would fail
  to load (removed from `sentences`, `pretty`, `readChordSheet`). Older browser tests re-run with `nowelcome.cjs` preloaded
  (marks the welcome as seen): all pass except test-side drift (lesson numbers moved; e31's old "Not smooth = Miss" rule).
**His round after the whole-app review** (his answers: no in-app multitrack or song builder, Soundtrap/Logic do that; no
About page; no composition rubric):
- **Grooves**: Reggaeton (dembow, tresillo bass), Trap (half-time snare, fast hats, long 808 notes: bass steps can carry a
  length), Boom-bap (swung), Bossa nova, House / EDM (four on the floor, off-beat bass). **Custom pattern** (Jam Room Style
  list, last): a 4 x 16 grid (Hi-hat, Snare, Kick, Bass = the chord's root), starts as the Pop beat; on the Stage on a
  Chromebook, in the Setup drawer on phones; edits are heard right away (one shared style object); a saved performance
  stores the pattern (`cp` on the groove segment, `cleanSteps`), play back and the batch view rebuild it (`customStyle`).
- **Line patterns** (`texture: 'line'`, `LineNote` in pattern.ts, `lineTimeline` in patternEngine.ts): notes written one by
  one, relative to each bar's chord (bass: R 3 5 b7 O L5, A = a half step into the next root) or to the key (riffs: half
  steps up from the home note), repeating every `lineBars` bars. `lessons.test` checks every pattern's notes fit C3-C5 and
  every line note resolves. Levels can drop the groove's bass (`grooveBass: false`) so the student IS the bass player.
- **Bass lines** (Lesson 8, id `lesson-bass`): roots on the beat (pop/ballad) · rock 8ths · root and 5th (country/folk) ·
  octaves (disco) · off-beats (house/EDM: the kick takes the beat) · trap 808 (long, few, off the beat, octave bounce) ·
  walking into the next chord (Motown/R&B/jazz) · reggaeton tresillo. 9 levels, each with its style's groove minus bass,
  then Bass and chords (bassChord). **Riffs and melodies** (Lesson 9, id `lesson-riffs`; his one/two/three-note riff
  approach): one-note riff (rhythm makes it), two notes, three notes, the minor pentatonic, the blue note, call and response,
  land on a chord tone, make your own (Jam Room Key lock: Pentatonic). 9 levels incl. a funky one-note riff, blues riff,
  C major pentatonic riff and an Echo "Copy the riff". Major scales and 7th chords are now shown as Lessons 10 and 11.
- Jam Room Melody mode / Key lock can use the key's scale, its Pentatonic, or Blues (`scalePcs(key, which)`).
- **Chord shape helper** (SPEC "chord chart toggle"; Chromebook only, chord patterns only): Chord shapes Show/Hide on the
  timed start screen; during the run two mini keyboards (`MiniKeys.tsx`) top left: Now and Next, in the chord's colour.
  Assignment key `h` (1 always on, 0 hidden, left out = student chooses). Results played with it carry a third number 1 in
  the code (`shapes`); the batch view's level list says "chord shapes on". The hit pop moves right while it shows.
- **Batch view Listen** (his request): one performance at a time with its groove/track (YouTube ones: "With the video"
  opens the Sandbox), a now-playing bar (student, jump slider, time, Stop, Next student). Closing the window stops it.
  `e61`.
- **His Chord rhythms round 2:** lesson picker is two rows (6 per row) once there are more than 8 lessons; the Challenge
  Yourself buttons are one row of three (two short lines each) so long level lists still fit. Rhythm grid (`RhythmBox`):
  counts, beat lines and hit blocks are all placed by the same percentages (a half note on 3 starts exactly under the 3;
  `e62` checks it); bar lines strong, beats medium, +s faint. Off-beats last one 8th (`rhythmLengths`). Learn sections
  "Syncopation" + "The tresillo" -> "More rhythms" (off-beats aren't called syncopation). Oom-pah "pah" also accepts the 3rd
  + 5th without the root (`hitAlt`, also used by Challenges). Broken chords, arpeggios, bass lines and riffs show the
  full-Stage waterfall while Listen / Play along runs (portal into the Stage, `FALLS`). New textures: `brokenSplit` (root
  low in the left hand, the chord up in C4-C5) and `arp3` (C E G C E G C E | A C E A C E A C, his first arpeggio; root-3-5-
  octave is now last, "Up to the octave"). Learn sections: Broken chords (oom-pah, split hands) and Arpeggios (round the triad, up to the octave), split at his request. New levels `lr-split`, `lr-arp3` (Lesson 7 has 11). **Learn remembers**: the
  furthest step reached (`max` in autosave's learn progress) and a finished Learn count as done, so play-alongs aren't
  redone when going back.
- **His round 3 (rhythm + bass):** Chord rhythms patterns use `voicing: 'close'` (smoothest moves, NOT graded for
  smoothness; only `smoothest` is) with `startInv: 2` (C as G3 C4 E4, so IV and V are a short move): his "inversions
  avoid huge leaps". Arpeggios with `close`: root position at the octave nearest the last chord, starting mid-keyboard
  (C4 E4 G4, then A3 C4 E4: a 3rd down; `nearestRootPosition`). Tresillo Learn steps 100 BPM. Pop groove 25% louder in
  timed levels and Learn (`grooveLevel`). Chord shapes only with Chord Names Only, never in Chord rhythms (they steer away
  from inversions). New **Reggae** one-drop groove (off-beat steps and level). Learn rhythm steps can carry `groove` +
  `grooveBass` (RhythmBox plays the groove instead of clicks). **Sounds per lesson/step/level** (`sound`; ModeParts.sound;
  App switches to it and back to the student's own sound after; an assignment's sound wins): Bass lines = **Analog Bass**
  (`SYNTH_BASS`, both oscillators an octave down), the Hip hop steps and Trap level = **808** (his sample,
  `public/samples/808/808-c1.wav`, mono, a C1; played two octaves below the key). Both are in the sound list under "Bass".
  The Trap groove's bass uses the 808 too once it has loaded. Bass Learn: every step has its style's groove (minus bass);
  Root and 5th = root on 1 held, 5th on beat 4; the EDM off-beat steps are gone (he'd never heard it): Octaves (show +
  try) then Octaves with a 5th (the 5th on the last 8th; show + try, House groove); level `lb-edm` is now "Octaves with a
  5th" (id kept). `e64`.
- **His round 4:** Chord rhythms Challenges have the same section headings as Learn (Note lengths · 8th notes · More
  rhythms · Broken chords · Arpeggios; level `section`, rows slimmer so 11 levels + headings fit). Trap groove: kick and 808
  always hit together (kick = bass steps 0, 6, 10 = the lesson's 808 line). Bass "Walking" -> **Passing notes** (G – C – Em –
  D: hold the root, a passing note on 4: B, D, E♭; ids `lb-learn-walk`/`lb-try-walk`/`lb-walk` kept). Line notes outside the
  key are spelled by where they go (E♭ down into D, D♯ up into E; `TimedHit.name`). Reggaeton bass = root, 5th, octave.
  Major scales Learn: a right-hand diagram (`HandDiagram.tsx`, finger numbers) lights the finger with the demo; on try steps
  the finger just played lights and the next has a dashed ring; "Thumb under!" when the thumb tucks. Riffs and melodies:
  soft chords low (root F2–E3) under every riff step and level (`pad`; a PolySynth in `groove.ts`, the click style carries
  it when there's no groove). `lm-three` follows the dembow (3+3+2 16ths with the snare: A C D | A C A).
- **His round 5 (bass + echo):** "Listen first" / RhythmBox Listen schedule notes on the audio clock 150 ms ahead
  (`engine.noteOn(m, v, at)`, `perfToAudio`, `SCHED_MS`; every Voice and the SynthLab engine take an optional `at`): a
  plain timer ran late on a busy Chromebook ("late on every note"). Echo: a 3 s pause starts the answer over (dots empty).
  Bass: Root and 5th uses `5n` (the 5th above or below, nearer the next root: G's D is D3 before C). New **Disco** groove
  (four on the floor, open hat on the off-beats, `open`), used by the octave steps and `lb-octave`. `lb-edm` = "Root,
  octave, 5th" (1, + of 2, 4). Trap = half-time harmony (each chord two bars, hits 1, 4, 2 of bar 2; `TRAP2`), Learn at 140
  too; the Trap groove's kick follows the line (`kickFollows`). `lb-both` = "Your own bass line": the Electric Piano plays
  the chords (`keys: 'rhodes'`, `noteOnWith`), root or 5th on 1 and 3 (line note `or`), extra notes free, groove picked on
  the start screen (`grooves`). Test hook `window.__trace` (note/kick audio times).
- **His round 6:** Bass lines (not the 808 parts) sit an octave lower (pattern `octave: -1`, notes C2-C4; lessons.test
  allows it) and every bass line ends on the home chord's root on beat 1 (`end`, an extra bar). A low part shows a brass
  bubble by Oct − once per visit (`low` in ModeParts, nothing saved); until Oct − is pressed the waterfall draws low notes
  on the same letter in view. Passing notes: D … F♯ on 4 of the last bar, then home to G. Learn 9-10 = Root, octave, 5th.
  Leaving the bass lessons with a Bass sound switches to the Electric Piano (not back to the old sound). "Your own bass
  line" (`fill`): the root on 1 is the hit; each bar also needs the root (any octave) or the 5th after beat 1; half the
  score ("More notes in 7 of 8 bars"). Major scales: Learn tries and the finger demos go up AND back down (15 dots;
  "3 over the thumb!"; `scaleSteps`/`scaleFingers`), a 2 s pause starts a scale over (Learn and Challenges, no penalty), a
  wrong note that is the starting note begins a new try; scale Challenges show the hand.
- **His round 7:** Learn try steps have "↻ Try again" once done (also for steps finished before; `redo` in ModeLearn
  counts only the new try; Next stays open). Scale up-and-down: the top note again at the turn is ignored. Bass endings:
  the last note is as long as the line's first note and isn't drawn on the Learn grid (`gridBeats`). Lesson 11: Learn adds
  black-key tries (Dmaj7 Emaj7 Amaj7 = white-black-white-black; Bm7 F♯m7 Gm7; A7 F7); levels maj7/m7/dom7 include them;
  `l8-time-rnb` = Imaj7–iii7–vi7–ii7; new `l8-time-minor` Dm7–Am7–Em7–Fmaj7 (10 levels, fits).
- **His round 8:** Lesson 11 maj7 / m7 levels ask 8 questions: all 6 chords once + 2 random repeats (level `count`). Custom
  pattern grid: Open hi-hat row (`o`, optional in `CustomPattern` so old codes still read), then Hi-hat, Snare, Kick, a gap
  with a line, and "Bass Notes" (so it doesn't read as a bass drum).
- **His round 9:** Practice tab removed; the Sandbox tab is now **Practice Room** (mode id still `sandbox`; phones "Practice";
  tabs Learn · Challenges · Practice Room · Jam Room · Grade Report); its left panel ends with a "Tips" dropdown showing each
  lesson's `practice` text (`leftBottom` in ModeParts). The three note-name buttons became one **Note Names** dropdown
  (Hide / Show / Show Cs; only the allowed ones; hidden when there's no choice, e.g. Name It levels and Learn).
  Jam Room key = **Key** (12 letters) + **Scale** (`JAM_MODES`: Major, Minor, Major/Minor pentatonic, Blues, Dorian,
  Mixolydian, Lydian, Phrygian, Harmonic minor): `family` (major/minor) sets the chords, `steps` set Melody mode / Key lock
  (the old Key scale / Pentatonic / Blues toggle is gone). Modal vamps in PROGRESSIONS (`only`: picked when the mode is
  chosen). The assignment builder offers all 24 keys (`JAM_KEYS`). YouTube list entries can carry `start` (seconds; links'
  `t=` is read too): his picks added (Sweet Groove Am from 0:33, Deep Soul Groove Am, D major pop rock, E minor rock ballad).
  YouTube view counts can't be read from the cloud container (YouTube shows a robot check), even with the PianoLab
  environment allowing www.youtube.com.
- **His round 10:** Practice tips are a brass card under Note Names (big dark text, one sentence per line; Clear and
  Import MIDI share a row so it fits). Note Names options: Hide / Show All / Show Cs. YouTube: the player's own keyboard
  shortcuts are off (`disablekb`; "F" went full screen), and a click on the video hands the keyboard back to the piano
  ~150 ms later (window blur -> blur the iframe). In the Jam Room the Space bar plays / pauses the video and the left /
  right arrows jump 5 s (`YouTubeBox keys`). `e73`, `e74` (stand-in player).
- **Logo / favicon** (`public/favicon.svg`, his pick): "PL" made of two piano white keys, each with its black key in
  the notch: a cream key turned 180° = P, a gold key = L (the C key is L-shaped from above).
- **Remind him later**: graded YouTube play-along (his "leave it for now, remind me").
- Shuffle test allows 30 s (it timed out at 5 s on a slow run).

## Open items (last updated end of Phase 1 testing)
- Waiting on Mr. Comiskey's Chromebook test of: Soft Piano (gentler crackle), Pad (softer swell).
- MIDI import choices to confirm (see SPEC section 10): merge all tracks, drop drums, 3-minute cap, replace not append.
- Grading confirmed: second try = half credit, 80% pass. Lesson 1 has four levels; the octave level (`l1-octave`) was removed
  before anything reached students (he doesn't care about the octave). Old saves drop results for removed levels.
- Teacher button should eventually assign anything (SPEC section 8, "Everything is assignable"). Today it only batch grades.
- Not built yet: About screen with full credits (credits are in a small right-panel list); class-record backend (skipped,
  his call); graded YouTube play-along (ungraded for now).
- Phase 4 to try on the Chromebook: Lessons 7-8, the Jam Room (does YouTube load on the school network?), Sandbox import
  speed/track/mute. He will supply backing tracks (and YouTube links) for the lists.
- Phase 3 to try on the Chromebook: timing feel with the real MIDI keyboard (run the latency check first), Echo,
  Speed Round, an assignment link end to end.
- Phase 2 to try on the Chromebook: every lesson's Learn, the chord levels with the MIDI keyboard, Smooth Mover, the strip.
- Assignment link: core built (Phase 3). Later: assign Learn-only lessons, due dates, more settings (SPEC section 8).
- Second merge to `main` on 2026-11-25 (his say-so, after the debug pass; a fast-forward): Chord rhythms lesson, everything
  assignable, welcome walkthrough, YouTube chord sheet, phone fixes.
- Phases 1-4 merged to `main` on 2026-11-24 (his say-so; a fast-forward, main had only his uploaded files). Keep working
  on the branch; merge again only when he says, after class. Check that Vercel's production build (main) works.
- Latency: the old 88-141 ms readings included a 100 ms bug (fixed). Expect much smaller numbers now; re-check on the Chromebook.
