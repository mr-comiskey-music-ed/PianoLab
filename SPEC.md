# PianoLab: Spec

PianoLab is a piano learning app for Mr. Comiskey's classes. It reinforces the piano lessons he teaches live, then supports and assesses students' learning and playing. It sits alongside his other teaching apps (SynthLab, MixerLab, AudioPlot, and others) and follows the same conventions.

- **Repo:** `mr-comiskey-music-ed/PianoLab`
- **Deploy:** Vercel, at `pianolab.mrcomiskey.com` (proposed)
- **Design mockups:** "PianoLab — main screen directions" canvas. The chosen look is the **Studio Warm v2** artboard.

---

## 1. Teaching goal

By the end of the course, a student can **find, name, build, voice, and play chords in time, in a key, and talk about them by function** (roman numerals, plus Home, Away, and Tension).

The class's real aim is creative: students expressing themselves, writing songs, making beats, etc. PianoLab's drills are the means, not the end. Jam Room and Play Along are where the drills turn into music.

## 2. Hard constraints

- **No student data, ever.** No accounts, and no backend that stores student work. The student's name is typed when making a code and lives only inside that code; the app never saves it. Student work leaves the app only as a **base64 code** pasted into Google Classroom. (The one exception is the optional numbers-only class record in §11, which has no text fields at all.)
- **Chromebooks first.** Every student has their own Chromebook, a **25-key USB MIDI keyboard**, and headphones. The app must be lightweight and fast on a Chromebook. Mobile is a nice-to-have, not a goal.
- **Browser-local storage is fine** for per-device things: autosave and restore, the latency setting, and personal bests. It never holds a name.
- Students reach the app through Google Classroom links.
- **No traditional notation.** Use MIDI block notation (the waterfall and piano roll), chord names, and roman numerals only.

## 3. Curriculum (lesson sequence)

The app follows the order Mr. Comiskey teaches in. Each lesson has levels.

| Lesson | Topic | Notes |
|---|---|---|
| 1 | White-key note names | One lesson that Mr. Comiskey covers in about 10 minutes live. Its Learn section walks through three touch points: **finding F and C** (C sits left of the 2-black-key group, and F sits left of the 3-group), **the musical alphabet A–G** (a show-and-tell with names on the keys: up, down, and wrapping from G back to A), and then **all white keys**. Levels accept any octave (the octave level was cut). |
| 2 | White-key chords in C major and A minor | Chords as a concept: stacking **thirds** by skipping a white key (a quick moment, with no major/minor 3rds yet). Chord names and degree colors only, **no roman numerals yet**. |
| 3 | Roman numerals and function | Once chords make sense, introduce numerals, then Home, Away, and Tension. Same white-key chords, new language. |
| 4 | Black-key names and half steps | Sharps and flats, two names for one key, and the **half step** (any key to its nearest neighbor, black or white). |
| 5 | Major and minor chords anywhere | The real work on **major and minor 3rds**: counting half steps. Major = 4 + 3, and minor = 3 + 4. Build major and minor chords on any root, black keys included. |
| 6 | Inversions | Show-and-tell plus lots of repetition. Smooth Mover lives here. |
| 7 | Scales around the circle of 5ths | Start with C, G, F, and D, and keep going as far as the class gets. Includes fingering hints. |
| Bonus | 7th chords | A bonus level, not a full lesson. |

- Root position versus inversion ear training is **not** for beginners. It appears only in Lesson 6 and later.
- **Roman numerals and function labels stay hidden** in Lessons 1–2: the chord strip, waterfall, and chord readout show chord names only. From Lesson 3 on they appear. In Practice and Jam Room they're a toggle.

## 4. App structure

The **piano is always the main view**, fixed along the bottom. Everything above it changes by mode.

### Modes (top-bar tabs)
- **Learn:** short demos where the app plays and highlights things, followed right away by **"now you try" prompts**. The student plays what was just taught and gets quick feedback (right, or a hint and try again). Not graded, but the code notes whether Learn was completed, like SynthLab. Always shows the full scroll and labels. Every lesson opens with Learn.
- **Practice:** free exploration with labels and hints on. No grading. The chord detector is on. Students can **record a practice session and save it**, like Chrome Music Lab's Shared Piano: as a **code** (paste it back in to replay it, or turn it in on Classroom) or as a **.mid export**. Recordings are capped at a few minutes so codes stay a reasonable length.
- **Challenge:** graded levels that produce a code.
- **Jam Room:** pick a genre track, a sound, and a progression, then play. It can be graded or ungraded (§10).
- **Sandbox** (built in Phase 1): play anything; it records as you go onto a scrolling piano roll (bars rise out of the keys). **Save performance** makes a code (name inside, for Classroom; code key `p`), a link (`?perf=`, opens the Sandbox ready to play back, no name in it) or a .mid file. **Clear** starts over. Capped at 3 minutes or 2000 notes; long pauses are shortened. The batch view plays performances back.
- **Grade Report** (last tab, like SynthLab/AudioPlot): the student's levels, Learn status and **Get my code**; the teacher's batch grader lives here too (no Teacher button in the top bar).

### The lesson loop
Every lesson follows the same three steps: **Show → Explore → Challenge.** Students learn the app once, and "do the Challenge for Lesson 2" always means the same thing.

## 5. Assessment types

### Identify (no playing)
- **Name It:** keys light up, and the student picks the note or chord name.
- **Ear Check:** the app plays something, and the student identifies it. Start with major versus minor. Root position versus inversion comes later (Lesson 6 and up).

### Build (play one thing at a time, no timing)
- **Find It:** "Play every F" or "Play an E."
- **Build It:** "Play D minor" or "Play the IV chord in G."
- **Numeral Translator:** given a key and a numeral, play the chord. Lesson 3 and later.
- **Echo:** the app plays a pattern, and the student plays it back. It has a scaffold setting:
  - *Watch & Play:* keys light up as the pattern plays.
  - *Hint:* only the first note lights up.
  - *Ear Only:* the pattern is audio only, with limited replays. This works for single notes, short melodies, and chord quality.

### Perform (in time)
- **Progression Play:** the pattern engine (§6), with difficulty knobs.
- **Smooth Mover:** given chord A and then chord B, the student plays the voicing of B that moves the fewest half steps from A. A ghost of the previous chord stays visible. The score counts total half steps moved.
- **Speed Round:** as many Build It prompts as possible in 60 seconds. This one is the most game-like.
- **Song Play-Along:** a backing track or YouTube video plus a part (§10). The graded portion is **45 seconds at most**.
- **Chord chart toggle (all Perform types):** an optional small chord diagram, a mini keyboard showing which keys to press, for the chord being prompted and the next one coming up. It follows the current voicing and inversion. Students can turn it on or off. In the assignment builder, the teacher can allow it, hide it, or let students choose, and the code records whether it was on.

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
  "id": "lesson3-level3-four-chord-loop",
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
- **50% grade floor:** a completed attempt never records a grade below 50%, because raw percentages are brutal at first. The student sees the floored grade. The batch view shows the floored grade plus the raw score, for the teacher only. The floor never changes whether a level is passed.
- **Hands:** MIDI can't tell which hand pressed a key, so "left hand" means notes below a **split point**. Fingering is shown as hints only and is never graded.

## 8. Teacher assignment builder

A teacher-only page that builds a **link** to paste into Google Classroom. All settings live in the URL, so the app stays stateless. Settings:

- **Everything is assignable.** Any lesson, Learn section, Practice setup or Challenge level (or a hand-picked set of
  levels) can be set from the Teacher button, along with every setting students could otherwise change (note names on the
  keys, sounds, tempo, and so on): fixed, a minimum, or "student chooses".
- Lesson, level, and assessment type
- Pattern (key, progression, texture, rhythm, voicing), or a custom progression the teacher types in (e.g. a song the class is covering)
- Minimum tempo and other minimum-difficulty settings
- **Notes on screen:** Off, Chord names only, or Full scroll, or "student chooses"
- **Key lock** on or off (§10)
- **Chord chart:** allowed, hidden, or student chooses (§5)
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

### MIDI import (practice)
- Students (or the teacher) can **import a .mid file** and practice playing along with it in the waterfall.
- **Playback speed** control (for example 50%–100%), with the waterfall and audio slowing together.
- Students choose which track of the file to show, and can mute it to play the part themselves or hear it to follow along.
- Notes outside the current 25-key range are flagged so students know when to shift octaves.
- Ungraded practice.

### Jam Room
- Choose a genre or track from a dropdown, choose a sound, see the progression, and play.
- Students can also **paste their own YouTube link**. In that case no progression appears, and the jam is ungraded. Students can pick a key themselves so Melody mode and Key lock still work.
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
| Grand Piano | Accurate-Salamander (5 velocity layers, hosted with the app), Salamander Grand (Tone.js copy) and Splendid Grand (smplr). All three still in, to compare on headphones and speakers. |
| Electric Piano | jRhodes3d (Rhodes Mark I, CC BY-NC), a reduced copy hosted with the app. The smplr electric piano sounded like an electric grand and was dropped. |
| Felt Piano | Accurate-Salamander's soft layer through a low-pass "felt" filter |
| Synth Keys | Built-in PianoLab synth presets (warm and bright), sharing SynthLab's synth engine, plus **Custom Synth**: SynthLab's Modern Synth panel in a pop-up (starters: Warm, Bright, West Coast lead, Plain saw), patches saved in the browser |
| SynthLab patch | Dropped after Phase 1 (not needed). |

- The "Compare versions" box is **for teacher testing only** and gets removed once a version is chosen for each category.
- **Mix panel** (behind a small faders icon at the top right of the Sound box, not always visible): a one-knob EQ, a one-knob compressor, and reverb with Length, Color, and Mix.
- A compact wood-block metronome: icon on/off, BPM box and slider, volume knob (100% default, up to 200%).
- **Licensing:** credit sample authors on an About screen. The app is educational and non-commercial. Never use samples rendered out of commercial DAW instruments.

## 14. Visual language

### Layout (see the Studio Warm v2 mockup)
- **Top bar (walnut wood):** the logo, mode tabs, MIDI status, and latency status.
- **Left panel:** the lesson and level, instructions, level progress, the "Make it easier or harder" controls, scores, and **Get my code**.
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
- Falling blocks in degree colors land on a brass hit line. Faint guide lines show key boundaries, with stronger lines at each C. Each bar is labeled with its chord, plus its numeral from Lesson 3 on.

## 15. Other features

- **Chord detector ("What am I playing?"):** live chord name, inversion, numeral in the current key, and function. Mr. Comiskey can use it on the projector while teaching. It's on in Practice, Learn, and Jam Room, and off in Identify and Build assessments.
- **Fingering hints**, especially for scales: numbers over the keys, with the thumb-under spot highlighted.
- **MIDI export:** download a performance or a recorded Practice session as a `.mid` file, for example to bring into Soundtrap.
- **MIDI import:** see §10.

## 16. Content as data

- Lessons, levels, patterns, backing tracks, and YouTube songs live in **data files** (JSON), separate from the app code.
- Adding a level, a progression, or a song means editing a list, which Mr. Comiskey can do from his phone.

## 17. Build phases

Each phase gets its own branch and a Vercel preview, and is tested on a real Chromebook with a 25-key keyboard. Merges to `main` happen **after class**, never while students are working.

1. **Foundation:** the piano with all three inputs, latency calibration, the audio engine with all sound versions and the Mix panel, Lesson 1 (white-key note names) with interactive Learn, codes, batch grading with the 50% floor, autosave, and the Studio Warm v2 layout. **Design the pattern data format now**, even though it isn't used until Phase 3.
2. **Chords:** Lessons 2–6 (white-key chords, roman numerals and function, black keys and half steps, major and minor chords anywhere, and inversions), the chord detector, Smooth Mover, and the chord strip.
3. **Time:** the pattern engine, metronome, waterfall, hit windows, Progression Play, Speed Round, Echo, the assignment builder, and Practice recording (the Sandbox already records and saves as a code, link or .mid).
4. **Music:** Lesson 7 (scales and the circle of 5ths with fingering), Jam Room, backing tracks, YouTube Play Along with the mixer, MIDI import with playback speed, the 7th-chord bonus, and the optional class record backend.

## 18. Open questions

- Confirm the subdomain: `pianolab.mrcomiskey.com`?
- Which sound version wins in each category (decided after Phase 1 testing).
- The specific levels in each lesson, and the pass mark for each.
- The first set of backing tracks and YouTube songs.
- The exact syncopated rhythm presets.
