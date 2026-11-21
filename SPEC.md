# PianoLab: Spec

PianoLab is a piano learning app for Mr. Comiskey's classes. It reinforces the piano lessons he teaches live, then supports and assesses students' learning and playing. It sits alongside his other teaching apps (SynthLab, MixerLab, AudioPlot, and others) and follows the same conventions.

- **Repo:** `mr-comiskey-music-ed/PianoLab`
- **Deploy:** Vercel, at `pianolab.mrcomiskey.com` (proposed)
- **Design mockups:** "PianoLab — main screen directions" canvas. The chosen look is the **Studio Warm v2** artboard.

---

## 1. Teaching goal

By the end of the course, a student can **find, name, build, voice, and play chords in time, in a key, and talk about them by function** (roman numerals, plus Home, Away, and Tension).

The class's real aim is creative: students expressing themselves. PianoLab's drills are the means, not the end. Jam Room and Play Along are where the drills turn into music.

## 2. Hard constraints

- **No student data, ever.** No names, no accounts, and no backend that stores student work. Student work leaves the app only as a **base64 code** pasted into Google Classroom. (The one exception is the optional numbers-only class record in §11, which has no text fields at all.)
- **Chromebooks first.** Every student has their own Chromebook, a **25-key USB MIDI keyboard**, and headphones. The app must be lightweight and fast on a Chromebook. Mobile is a nice-to-have, not a goal.
- **Browser-local storage is fine** for per-device things: autosave and restore, the latency setting, and personal bests. It never holds a name.
- Students reach the app through Google Classroom links.
- **No traditional notation.** Use MIDI block notation (the waterfall and piano roll), chord names, and roman numerals only.

## 3. Curriculum (unit sequence)

The app follows the order Mr. Comiskey teaches in. Each unit has levels.

| Unit | Topic | Notes |
|---|---|---|
| 1 | Finding F and C | Use the black-key groups: C sits left of the 2-group, and F sits left of the 3-group. Labels are hidden. |
| 2 | The musical alphabet, A–G | Going up and down, and wrapping from G back to A. |
| 3 | All white-key names | Early levels accept any octave. Later levels require a specific octave. |
| 4 | Thirds | Skip one white key. This prepares for chord building. |
| 5 | White-key chords in C major and A minor | All seven diatonic chords, with roman numerals and degree colors. |
| 6 | Black-key names | Sharps and flats, including two names for one key. |
| 7 | Major and minor chords by half steps | Major = 4 + 3 half steps. Minor = 3 + 4 half steps. |
| 8 | Inversions | Show-and-tell plus lots of repetition. Smooth Mover lives here. |
| 9 | Scales around the circle of 5ths | Start with C, G, F, and D, and keep going as far as the class gets. Includes fingering hints. |
| Bonus | 7th chords | A bonus level, not a full unit. |

Root position versus inversion ear training is **not** a beginner skill. It appears only in Unit 8 and later.

## 4. App structure

The **piano is always the main view**, fixed along the bottom. Everything above it changes by mode.

### Modes (top-bar tabs)
- **Learn:** short demos where the app plays and highlights things while the student watches. Always shows the full scroll and labels. Every unit opens with Learn.
- **Practice:** free exploration with labels and hints on. No grading. The chord detector is on.
- **Challenge:** graded levels that produce a code.
- **Jam Room:** pick a genre track, a sound, and a progression, then play. It can be graded or ungraded (§10).

### The unit loop
Every unit follows the same three steps: **Show → Explore → Challenge.** Students learn the app once, and "do the Challenge for Unit 5" always means the same thing.

## 5. Assessment types

### Identify (no playing)
- **Name It:** keys light up, and the student picks the note or chord name.
- **Ear Check:** the app plays something, and the student identifies it. Start with major versus minor. Root position versus inversion comes later (Unit 8 and up).

### Build (play one thing at a time, no timing)
- **Find It:** "Play every F" or "Play an E."
- **Build It:** "Play D minor" or "Play the IV chord in G."
- **Numeral Translator:** given a key and a numeral, play the chord.
- **Echo:** the app plays a pattern, and the student plays it back. It has a scaffold setting:
  - *Watch & Play:* keys light up as the pattern plays.
  - *Hint:* only the first note lights up.
  - *Ear Only:* the pattern is audio only, with limited replays. This works for single notes, short melodies, and chord quality.

### Perform (in time)
- **Progression Play:** the pattern engine (§6), with difficulty knobs.
- **Smooth Mover:** given chord A and then chord B, the student plays the voicing of B that moves the fewest half steps from A. A ghost of the previous chord stays visible. The score counts total half steps moved.
- **Speed Round:** as many Build It prompts as possible in 60 seconds. This one is the most game-like.
- **Song Play-Along:** a backing track or YouTube video plus a part (§10). The graded portion is **45 seconds at most**.

### Cut
- *Spot the Wrong Note:* it doesn't match a real musical situation.
- *Missing Chord:* there's no single right answer in real music.

### Rules for every assessment
- **The chord detector is turned off** in all Identify and Build assessments.
- Grades are **percentages**. No stars.

## 6. Pattern engine

Everything a student plays in time is a **pattern** with five parts:

| Part | Values |
|---|---|
| Progression | Roman numerals plus a key, e.g. `I V vi IV` in C |
| Texture | Bass only, Block, Bass + chord, Broken, Arpeggio |
| Rhythm | Whole, Half, Quarter, 8ths, plus syncopated presets |
| Voicing | Root position only, Inversions allowed, Smoothest voice leading required |
| Tempo | BPM |

- Progressions are stored as numerals, so **transposing is just a change of key**. The same loop can move around the circle of 5ths.
- "Single notes as the roots of a chord" is just the **Bass only** texture.
- These same five parts are the **scaffolding knobs** students use to make things easier or harder.

Example pattern data:

```json
{
  "id": "u5-l3-four-chord-loop",
  "key": "C",
  "mode": "major",
  "progression": ["I", "V", "vi", "IV"],
  "texture": "block",
  "rhythm": "quarter",
  "voicing": "root",
  "tempo": 80,
  "bars": 8
}
```

## 7. Scaffolding and grading

- Students can adjust their own difficulty: notes on screen, rhythm, texture, tempo, and labels.
- **The teacher sets the minimum difficulty for each assignment.** Students can go harder, but not below the minimum. For example, the tempo can't drop below the teacher's minimum.
- The code records the settings the student actually used, so the batch view shows them.
- **Timing:** rhythm-game hit windows (starting values, adjustable later): Perfect ±50 ms, Good ±100 ms, Miss beyond that. These roll up to a timing percentage.
- **Pitch:** an accuracy percentage. Early levels grade by note name (any octave). Later levels can require a specific octave.
- **Pass mark:** set per level (80% by default).
- **Hands:** MIDI can't tell which hand pressed a key, so "left hand" means notes below a **split point**. Fingering is shown as hints only and is never graded.

## 8. Teacher assignment builder

A teacher-only page that builds a **link** to paste into Google Classroom. All settings live in the URL, so the app stays stateless. Settings:

- Unit, level, and assessment type
- Pattern (key, progression, texture, rhythm, voicing), or a custom progression the teacher types in (e.g. a song the class is covering)
- Minimum tempo and other minimum-difficulty settings
- **Notes on screen:** Off, Chord names only, or Full scroll, or "student chooses"
- **Key lock** on or off (§10)
- Echo scaffold level (Watch & Play, Hint, or Ear Only)
- Backing track or YouTube video, for Play Along
- An optional "Class record: N" number to display (§11)

## 9. Codes, batch grading, and saving

- **Reuse the code compression and batch grading from AudioPlot and SynthLab.** Don't rebuild them.
- **Version the code format from day one** (e.g. a `v1` prefix). Codes from October must still grade correctly in March.
- A code holds: the assignment ID, level, settings used, the percentages, the attempt time, and, for Play Along, the compressed MIDI take (45 seconds at most).
- **Batch view:** the teacher pastes a whole class's codes and gets one compact line per student, then can open each student's work one at a time. It also shows the **class top score and class average**, with obvious failed attempts left out of the average.
- **Personal best** is saved in the student's own browser.
- **Autosave and restore**, the same as Mr. Comiskey's other apps: progress is saved in the browser with a "Restore your last session?" prompt. No name is ever saved, and the code is still what students turn in.

## 10. Play Along and Jam Room

### Backing sources (both supported)
- **Teacher-made backing tracks** (audio files with a known tempo) give exact sync and reliable timing grades.
- **YouTube videos** (type beats, backing tracks, and real songs), through the YouTube IFrame API. A tap-tempo and offset step lines the grid up with the video.

### Audio
- The browser can't capture YouTube's audio. A **take is the student's MIDI performance**, timestamped against the video or track, and it can be replayed in sync.
- A **two-fader mixer** (Video or Track, and Piano) with a level meter.

### Play Along
- The teacher's part is usually just the **chord progression**. An optional piano scroll can guide students, and its visibility follows the assignment's Notes on screen setting.
- Gradeable as an assessment, up to 45 seconds.

### Jam Room
- Choose a genre or track, choose a sound, see the progression, and play.
- **Melody mode** highlights the notes of the key.
- **Key lock** greys out notes outside the key and makes them silent. The teacher sets it in the builder, and students can toggle it in Jam Room.
- Ungraded by default. When graded, only chord accuracy counts, and the melody stays free.

## 11. Class record backend (optional, later phase)

- A tiny database that stores **only numbers**: a level ID, a score, and a date (plus an optional class-period number). **No text fields anywhere**, so a name can't be stored even on purpose.
- It's for bragging rights only, never for grades. Scores could be faked, and grades always come from codes.
- Until this is built, the class record comes from batch grading plus the `Class record: N` link setting.

## 12. Input

- **Web MIDI** is the primary input. It already works on the students' Chromebooks.
- **The 25-key range is the default view:** 15 white keys (C3–C5), with Oct − and Oct + buttons that match the controller's own octave buttons. Every graded exercise fits inside 25 keys.
- **Computer keyboard:** a GarageBand-style Musical Typing layout (the A row is white keys, the W row is black keys, and Z and X shift octaves).
- **Touch:** a multitouch on-screen keyboard.
- **Latency calibration:** a tap-along step during the exercise portion, before any assessment. The result is saved in the browser and applied to all timing grades.

## 13. Audio engine

- **Tone.js**, for accurate scheduling (rhythm grading, backing sync, and the metronome).
- Each sound loads **only when it's picked**, and only the needed range and a reduced set of velocity layers, so the app stays light on Chromebooks.
- **Sounds:** wire up every option to start, so Mr. Comiskey can choose one per category. The others get removed later.

| Category | Versions to compare |
|---|---|
| Grand Piano | Salamander Grand (Yamaha C5, CC-BY 3.0), Splendid Grand (Steinway, via smplr), Accurate-Salamander (remastered) |
| Electric Piano | jRhodes3d (Rhodes Mark I, CC-BY-NC), smplr electric piano |
| Felt Piano | The softest Salamander layers (or the "Moonlight" soft bank) with a darker EQ, or the grand with a low-pass "felt" filter |
| Synth Keys | Built-in PianoLab synth presets (warm and bright), sharing SynthLab's synth engine with a cleaner UI |
| SynthLab patch | Paste a SynthLab patch code to play your own sound |

- The "Compare versions" box is **for teacher testing only** and gets removed once a version is chosen for each category.
- **Mix panel** (behind the Mix button, not always visible): a one-knob EQ, a one-knob compressor, and reverb with Length, Color, and Mix.
- A metronome toggle.
- **Licensing:** credit sample authors on an About screen. The app is educational and non-commercial. Never use samples rendered out of commercial DAW instruments.

## 14. Visual language

### Layout (see the Studio Warm v2 mockup)
- **Top bar (walnut wood):** the logo, mode tabs, MIDI status, and latency status.
- **Left panel:** the unit and level, instructions, level progress, the "Make it easier or harder" controls, scores, and **Get my code**.
- **Center:** the chord strip (the key's seven chords), the waterfall, the chord readout bar (octave buttons, chord, numeral, inversion, function, Restart, and Start), and the piano. Walnut **wood cheeks** frame the piano and waterfall.
- **Right panel:** the sound list, the Mix button, the Compare versions box (temporary), and the metronome.

### Colors
- **The base palette comes from AudioPlot:**
  - Creams: `#f7f1e6` for panels, `#efe6d8` for the page and chips
  - Lines: `#ddd0bc` and `#c4b49b`
  - Walnut browns: `#66584a` for muted text, `#4d3f31`, `#3a2f24`, `#2a2118` for text and the keyboard bed, `#1e1710` for the waterfall background, and `#140f0a` for black keys
  - Brass accent: `#d9a441`, with `#2a1e08` text on it. Darker brass `#b8862c` and `#8f6620` for rings and knob pointers.
- **Wood textures:** use a CC0 walnut photo for the real build. The mockup's texture is a generated placeholder.
- **Scale-degree colors**, the same in every key:

| Degree | Background | Text |
|---|---|---|
| I | `#EBC0BD` | `#7A2E2A` |
| ii | `#F3D3BC` | `#8A4A22` |
| iii | `#F6EBB4` | `#5E5820` |
| IV | `#DDEAB9` | `#46632A` |
| V | `#B9D9D5` | `#285450` |
| vi | `#C9C6E3` | `#3B3591` |
| vii° | `#EAC5DF` | `#7A2F63` |

- **Function is shown as a label, not a color:** Home (I, iii, vi), Away (ii, IV), and Tension (V, vii°). This mapping is editable.

### Type
- **Barlow** for body text and **Barlow Semi Condensed** for headings and numbers, matching SynthLab.

### Waterfall
- Falling blocks in degree colors land on a brass hit line. Faint guide lines show key boundaries, with stronger lines at each C. Each bar is labeled with its chord and numeral.

## 15. Other features

- **Chord detector ("What am I playing?"):** live chord name, inversion, numeral in the current key, and function. Mr. Comiskey can use it on the projector while teaching. It's on in Practice, Learn, and Jam Room, and off in Identify and Build assessments.
- **Fingering hints**, especially for scales: numbers over the keys, with the thumb-under spot highlighted.
- **MIDI export:** download a performance as a `.mid` file, for example to bring into Soundtrap.

## 16. Content as data

- Units, levels, patterns, backing tracks, and YouTube songs live in **data files** (JSON), separate from the app code.
- Adding a level, a progression, or a song means editing a list, which Mr. Comiskey can do from his phone.

## 17. Build phases

Each phase gets its own branch and a Vercel preview, and is tested on a real Chromebook with a 25-key keyboard. Merges to `main` happen **after class**, never while students are working.

1. **Foundation:** the piano with all three inputs, latency calibration, the audio engine with all sound versions and the Mix panel, Units 1–3 (note finding), codes, batch grading, autosave, and the Studio Warm v2 layout. **Design the pattern data format now**, even though it isn't used until Phase 3.
2. **Chords:** Units 4–8, the chord detector, inversions, Smooth Mover, roman numerals, the chord strip, and function labels.
3. **Time:** the pattern engine, metronome, waterfall, hit windows, Progression Play, Speed Round, Echo, and the assignment builder.
4. **Music:** scales and the circle of 5ths with fingering, Jam Room, backing tracks, YouTube Play Along with the mixer, MIDI export, the 7th-chord bonus, and the optional class record backend.

## 18. Open questions

- Confirm the subdomain: `pianolab.mrcomiskey.com`?
- Which sound version wins in each category (decided after Phase 1 testing).
- The specific levels in each unit, and the pass mark for each.
- The first set of backing tracks and YouTube songs.
- The exact syncopated rhythm presets.
