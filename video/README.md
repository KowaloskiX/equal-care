# Equal Care Finland — pitch + product demo video

A 120 s, 1920×1080, 30 fps video of the Equal Care Finland app (this repo, one level up), edited in Remotion from real
recordings of the running app. Output: `out/demo.mp4` (the rendered cut is committed as `video/equal-care-demo.mp4`). Run `npm ci` first.
`public/footage/` (recordings) and `public/music/` (score) are not committed: re-create them with `capture/record.mjs` +
`capture/encode.mjs` and `audio/make_music.py`, then `tts/clean.py` for the ducked music. Voiceover script with timecodes: `VOICEOVER.md`.

## Edit and render

```bash
npm run dev                                   # Remotion Studio: "Demo" plus one composition per scene
npx tsc --noEmit
node scripts/stills.mjs check 3 16 30 60 90   # contact sheets in out/stills/check
npx remotion render Demo out/demo.mp4 --codec=h264 --crf=16 --jpeg-quality=95 --color-space=bt709
# final loudness pass (−17.5 LUFS, true peak ≤ −1.5 dBTP), video copied untouched:
ffmpeg -i out/demo.mp4 -c:v copy -af "loudnorm=I=-17.5:TP=-1.5:LRA=11" -ar 48000 -c:a aac -b:a 256k out/demo-final.mp4
```

- `src/theme.ts` — palette, fonts (Geist, as in the app) and the master timeline `SECTION`.
- `src/scenes/*` — one component per scene. Every trim or speed change is one `Cut {at, src, rate}` line.
- `src/data/vo-placement.json` — where each narration line starts. After changing it run `node scripts/build-vo.mjs`.

## How the footage was made

Real recordings of the production build, taken through the Chrome DevTools screencast at 2880×1620.

```bash
cd .. && make app                         # API on :8010
cd ../web && npm run build && npm run start -- -p 3011
APP_BASE=http://localhost:3011 node capture/record.mjs   # PARTS=tour,journey,report,valid
node capture/encode.mjs                                  # public/footage/*.mp4 + src/footage/meta.json
```

`capture/record.mjs` marks every beat (`rec.mark`), and the edit syncs to those names. The app repo was not changed
for the video.

## Voice, subtitles, music

- Narration: Gemini TTS (`gemini-3.8-flash-tts`, voice `Charon`, run with `TTS_STYLE=0 TTS_MODEL=gemini-3.8-flash-tts`), one clip per sentence (`tts/generate.py`,
  key read from the repo root `.env`).
- `tts/detail.py` cuts the ~0.16 s noise burst that `gemini-3.8-flash-tts` appends to every clip (the crackle).
- `tts/clean.py` low-passes the clips at 11 kHz (removes resampling artifacts that crackled) and pre-ducks the music
  under the narration with a smooth envelope. Run it after `generate.py` and `build-vo.mjs`.
- `tts/align.py` transcribes each clip with Whisper (`small.en`) for word timings; `scripts/build-vo.mjs` turns them
  into `src/data/captions.json` and `VOICEOVER.md`.
- Music: an original track synthesised with numpy (`audio/make_music.py`). SFX: `audio/make_sfx.py` plus
  `mouse-click`, `switch`, `page-turn` from Remotion's free set, stored in `public/sfx`.

## What is simulated, cached or sped up

- Resident dots and intervention effects are simulation (Gemini Decisions), replayed from answers committed in the
  app repo. The video labels them on screen.
- The generated briefing in the last scene was served from the API's in-process cache of an earlier Gemini run.
- Recordings are sped up or slowed per cut (×0.55 to ×3.2); the longer ones are labelled on screen.
