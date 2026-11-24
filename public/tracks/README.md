# Jam Room backing tracks

Put audio files (MP3 is smallest) here, then add a line for each one to `src/data/tracks.json`:

```json
{ "id": "pop-c-96", "title": "Pop in C (96 BPM)", "url": "/tracks/pop-c-96.mp3", "bpm": 96, "key": "C", "mode": "major", "progression": ["I", "V", "vi", "IV"], "offset": 0.0 }
```

- `id`: never change it once students have used it.
- `progression`: Roman numerals, one per bar, repeating.
- `offset`: seconds from the start of the file to beat 1 (so the chord chart lines up).
- Keep files small: every Chromebook downloads the file when a student picks it.
