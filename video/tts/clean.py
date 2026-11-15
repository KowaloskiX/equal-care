"""Remove the resampling images from the narration (content above 11 kHz cannot exist in 24 kHz TTS)
and pre-duck the music with a smooth, sample-accurate envelope (no per-frame volume steps).
Run from repo root: uv run --python 3.12 --with numpy --with scipy --with soundfile python tts/clean.py"""
import glob, json, numpy as np, soundfile as sf
from scipy import signal
sos = signal.butter(10, 11000, "low", fs=48000, output="sos")
for f in glob.glob("public/vo/*.wav"):
    x, sr = sf.read(f, dtype="float64")
    y = signal.sosfiltfilt(sos, x)
    y = y / max(1e-6, np.abs(y).max()) * 0.89
    sf.write(f, y.astype(np.float32), sr, subtype="PCM_16")
FULL, BED, SR = 0.38, 0.135, 48000
m, sr = sf.read("public/music/theme.wav", dtype="float64")
t = np.arange(len(m)) / sr
d = np.full(len(m), np.inf)
for l in json.load(open("src/data/vo.json"))["lines"]:
    a, b = l["start"] - 0.05, l["start"] + l["duration"]
    d = np.minimum(d, np.where(t < a, a - t, np.where(t > b, t - b, 0.0)))
g = np.clip(d / 0.55, 0, 1); g = g * g * (3 - 2 * g)
vol = BED + (FULL - BED) * g
m = m * (vol[:, None] if m.ndim > 1 else vol)
sf.write("public/music/theme-ducked.wav", m.astype(np.float32), sr, subtype="PCM_16")
print("ok")
