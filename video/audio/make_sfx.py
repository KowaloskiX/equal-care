"""Original UI sound effects, synthesised with numpy (no samples).
Run:  uv run --python 3.12 --with numpy --with scipy --with soundfile python make_sfx.py"""
import numpy as np, soundfile as sf
from scipy import signal
SR = 48000
rng = np.random.default_rng(3)

def save(name, x, peak=0.8):
    x = x / np.abs(x).max() * peak
    f = int(0.004 * SR); x[:f] *= np.linspace(0, 1, f); x[-f:] *= np.linspace(1, 0, f)
    sf.write(f"../public/sfx/{name}.wav", x.astype(np.float32), SR, subtype="PCM_16")

def sweep_noise(dur, f0, f1, q=0.6, shape=lambda p: np.sin(np.pi * p) ** 1.6):
    n = int(dur * SR); nz = rng.standard_normal(n + 4096); out = np.zeros(n); seg = 1024
    for i in range(0, n, seg):
        p = min(1.0, (i + seg / 2) / n); fc = f0 * (f1 / f0) ** p
        sos = signal.butter(2, [fc * (1 - q / 2), min(fc * (1 + q), SR / 2.1)], "band", fs=SR, output="sos")
        j0 = max(0, i - 2048); c = signal.sosfilt(sos, nz[j0:i + seg])
        out[i:i + seg] = c[i - j0:i - j0 + seg][: n - i]
    return out * shape(np.arange(n) / n)

# airy transition whoosh (rises then falls)
save("whoosh-soft", sweep_noise(0.75, 500, 5200) + 0.6 * sweep_noise(0.75, 5200, 900)[::-1], 0.7)
# quick upward swish for cards / callouts
save("swish", sweep_noise(0.32, 900, 7000, shape=lambda p: np.sin(np.pi * p) ** 2.4), 0.6)

def blip(f0, f1, dur, decay):
    n = int(dur * SR); t = np.arange(n) / SR
    f = f0 * (f1 / f0) ** (t / dur)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * decay) * np.minimum(1, t / 0.003)

save("pop", blip(420, 900, 0.16, 26) + 0.3 * blip(840, 1800, 0.16, 40), 0.7)
save("tick", blip(1900, 1500, 0.035, 120) + 0.25 * rng.standard_normal(int(0.035 * SR)) * np.exp(-np.arange(int(0.035 * SR)) / SR * 300), 0.45)

def note(f, dur, decay):
    n = int(dur * SR); t = np.arange(n) / SR
    return (np.sin(2 * np.pi * f * t) + 0.3 * np.sin(2 * np.pi * 2 * f * t) * np.exp(-t * 8)
            + 0.12 * np.sin(2 * np.pi * 3.01 * f * t) * np.exp(-t * 14)) * np.exp(-t * decay) * np.minimum(1, t / 0.004)

# warm two-note "it arrived" chime (A5 → D6)
ch = np.zeros(int(1.5 * SR)); a = note(880, 1.2, 5); b = note(1174.66, 1.3, 4)
ch[: len(a)] += a; i = int(0.13 * SR); ch[i:i + len(b)] += b[: len(ch) - i]
save("chime", ch, 0.75)
# success sparkle (D major arpeggio)
sp = np.zeros(int(1.6 * SR))
for k, f in enumerate([587.33, 739.99, 880.0, 1174.66, 1479.98]):
    x = note(f, 1.0, 5.5); i = int(k * 0.07 * SR); sp[i:i + len(x)] += x[: len(sp) - i] * (0.9 - 0.08 * k)
save("sparkle", sp, 0.7)
# low "thud" for hard cuts / stat slams
n = int(0.6 * SR); t = np.arange(n) / SR
save("thud", np.sin(2 * np.pi * np.cumsum(50 + 110 * np.exp(-t * 26)) / SR) * np.exp(-t * 9)
     + 0.5 * signal.sosfilt(signal.butter(2, 500, "low", fs=SR, output="sos"), rng.standard_normal(n)) * np.exp(-t * 40), 0.85)
print("ok")
