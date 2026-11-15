"""Cut the TTS tail artifact: gemini-3.8-flash-tts ends every clip with a ~0.16 s broadband noise burst after a
silence gap. Keeps everything up to that gap (plus 80 ms), fades out, re-normalises the speech, updates manifest.json.
Run from repo root: uv run --python 3.12 --with numpy --with soundfile python tts/detail.py"""
import glob, json, numpy as np, soundfile as sf
man = json.load(open("tts/manifest.json"))
for f in sorted(glob.glob("public/vo/*.wav")):
    i = f.split("/")[-1][:-4]
    x, sr = sf.read(f, dtype="float64"); w = int(0.01 * sr)
    n = len(x) // w
    rms = 20 * np.log10(np.sqrt((x[: n * w].reshape(n, w) ** 2).mean(1)) + 1e-9)
    on = np.where(rms > -40)[0]
    # last burst: the voiced frames after the final silence gap of >= 120 ms, if they span <= 300 ms
    gaps = np.where(np.diff(on) >= 12)[0]
    k = gaps[-1] + 1 if len(gaps) else 0
    start, gap = on[k], (on[k] - on[k - 1]) if k > 0 else 0
    if gap >= 12 and (on[-1] - start + 1) <= 30:
        cut = (on[k - 1] + 1 + 8) * w
        y = x[:cut].copy()
        f_ = int(0.03 * sr); y[-f_:] *= np.linspace(1, 0, f_)
        y = y / max(1e-6, np.abs(y).max()) * 0.89
        sf.write(f, y.astype(np.float32), sr, subtype="PCM_16")
        man[i] = round(len(y) / sr, 3)
        print(f"{i:7s} cut tail burst at {start*0.01:.2f}s -> {man[i]}s")
    else:
        print(f"{i:7s} no tail burst")
json.dump(man, open("tts/manifest.json", "w"), indent=1)
