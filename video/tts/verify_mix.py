"""QA: transcribe the FINAL mixed soundtrack (voice + music + sfx) and compare each
narration line's detected start with where the edit places it."""
import json, sys, numpy as np, soundfile as sf
from faster_whisper import WhisperModel
x, sr = sf.read(sys.argv[1], dtype="float32")
vo = json.load(open("../src/data/vo.json"))["lines"]
model = WhisperModel("small.en", device="cpu", compute_type="int8")
segs, _ = model.transcribe(x, word_timestamps=True, beam_size=5, vad_filter=True,
                           initial_prompt=json.load(open("script.json")).get("vocabulary", ""))
words = [w for s in segs for w in s.words]
print("words heard:", len(words))
norm = lambda s: "".join(c for c in s.lower() if c.isalnum())
worst = 0
for l in vo:
    first = norm(l["text"].split()[0])
    cands = [w for w in words if abs(w.start - l["start"]) < 1.5 and norm(w.word)[:3] == first[:3]]
    heard = " ".join(w.word.strip() for w in words if l["start"] - 0.3 <= w.start < l["start"] + l["duration"] + 0.1)
    d = (min(cands, key=lambda w: abs(w.start - l["start"])).start - l["start"]) if cands else None
    if d is not None: worst = max(worst, abs(d))
    print(f"{l['id']:7s} planned {l['start']:6.2f}  offset {'%+.2f' % d if d is not None else '  ?  '} | {heard}")
print("worst offset", round(worst, 2))
# speech vs bed level
def rms(a, b):
    s = x[int(a * sr): int(b * sr)]; return 20 * np.log10(np.sqrt((s ** 2).mean()) + 1e-9)
sp = [rms(l["start"], l["start"] + l["duration"]) for l in vo]
gaps = [(vo[i]["start"] + vo[i]["duration"] + 0.3, vo[i + 1]["start"] - 0.3) for i in range(len(vo) - 1)]
gp = [rms(a, b) for a, b in gaps if b - a > 0.6]
print(f"level while speaking {np.mean(sp):.1f} dB (min {min(sp):.1f}, max {max(sp):.1f}) · music-only gaps {np.mean(gp):.1f} dB (n={len(gp)})")
