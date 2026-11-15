"""Verify the narration with Whisper and extract word-level timestamps for subtitles.
Writes tts/words.json: { id: [ {word, start, end}, ... ] } (seconds, relative to each clip)."""
import json, numpy as np, soundfile as sf
from faster_whisper import WhisperModel
script = json.load(open("script.json"))
model = WhisperModel("small.en", device="cpu", compute_type="int8")
out = {}
for line in script["lines"]:
    x, sr = sf.read(f"../public/vo/{line['id']}.wav", dtype="float32")
    x16 = np.interp(np.arange(0, len(x), sr / 16000), np.arange(len(x)), x).astype(np.float32)
    segs, _ = model.transcribe(x16, word_timestamps=True, beam_size=5,
                               initial_prompt=script.get("vocabulary", ""))  # product / people names, e.g. "OtaPath, Matti, Dr. Lindqvist."
    words = [{"word": w.word.strip(), "start": round(w.start, 3), "end": round(w.end, 3)} for s in segs for w in s.words]
    out[line["id"]] = words
    print(f"{line['id']:8s} | {' '.join(w['word'] for w in words)}")
json.dump(out, open("words.json", "w"), indent=1)
