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
  the numeral · Name the numeral · Numerals in A minor (`l3-function` removed). Removed ids never reached students.
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
  enforces it); `tryScale` = note by note, a wrong note starts over, 8 dots. Timed levels in the order C, G, D, F. Levels: Play the scale
  (`scale` type, fingering shown as a hint) · Sharps and flats (`quiz` type: buttons, nothing lit) · The circle of 5ths
  (quiz) · C/G/F/D major in time (pattern texture `scale`: up and down, one note per beat; Falling Note Blocks only) ·
  More keys (A, B♭, E, E♭).
- Lesson 8 "7th chords": Learn (one more 3rd, G7; dominant/major/minor 7ths; the 7ths of C; ii7–V7–Imaj7 try).
  Levels: Build 7th chords · Which kind of 7th? (listen) · Play the 7th numeral · ii7–V7–Imaj7 in C and in F (smooth,
  in time; the smooth check counts 4 notes).
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
hidden. Stage contents at 80% (`.phone-stage` zoom) and laid out LEFT TO RIGHT (`StageRow.tsx`: `StageBox` + `Col`, used
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
- Phases 1-4 merged to `main` on 2026-11-24 (his say-so; a fast-forward, main had only his uploaded files). Keep working
  on the branch; merge again only when he says, after class. Check that Vercel's production build (main) works.
- Latency: the old 88-141 ms readings included a 100 ms bug (fixed). Expect much smaller numbers now; re-check on the Chromebook.
