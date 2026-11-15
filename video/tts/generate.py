"""Generate the narration with Gemini TTS (cloud; key read from the repo root .env, never printed).
One WAV per sentence → public/vo/<id>.wav, plus tts/manifest.json with durations.
Run from tts/:  uv run --python 3.12 --with google-genai --with numpy --with soundfile python generate.py [ids…]"""
import json, os, sys, time, numpy as np, soundfile as sf
from scipy.signal import resample_poly
from pathlib import Path
from google import genai
from google.genai import types

for ln in (Path(__file__).resolve().parents[2] / ".env").read_text().splitlines():
    if "=" in ln and not ln.strip().startswith("#"):
        k, v = ln.split("=", 1); os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))

MODEL = os.environ.get("TTS_MODEL", "gemini-3.1-flash-tts-preview")
script = json.load(open("script.json"))
client = genai.Client(api_key=os.environ["GEMINI_API_KEY"], http_options=types.HttpOptions(api_version="v1beta"))
STYLE = ("Read this as the voice-over of a short product pitch: warm, clear, confident, brisk, "
         "like a Nordic health-tech founder. Pronounce Finnish place names naturally. "
         "Read ONLY the text after the colon. Text: ")
only = set(sys.argv[1:])
manifest = json.load(open("manifest.json")) if os.path.exists("manifest.json") else {}
for line in script["lines"]:
    if only and line["id"] not in only:
        continue
    if not only and line["id"] in manifest and os.path.exists(f"../public/vo/{line['id']}.wav"):
        continue
    for attempt in range(5):
        try:
            r = client.models.generate_content(
                model=MODEL, contents=(STYLE if os.environ.get("TTS_STYLE", "1") == "1" else "") + line["say"],
                config=types.GenerateContentConfig(
                    response_modalities=["AUDIO"],
                    speech_config=types.SpeechConfig(voice_config=types.VoiceConfig(
                        prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name=line.get("voice", script["voice"]))))))
            pcm = r.candidates[0].content.parts[0].inline_data.data
            break
        except Exception as e:
            print("retry", line["id"], str(e)[:80]); time.sleep(8)
    else:
        sys.exit(f"TTS failed for {line['id']}")
    sr = 24000
    s = np.frombuffer(pcm, dtype=np.int16).astype(np.float32) / 32768
    # trim leading/trailing silence, keep a short natural tail
    idx = np.where(np.abs(s) > 0.012)[0]
    a = max(0, idx[0] - int(0.03 * sr)); b = min(len(s), idx[-1] + int(0.12 * sr))
    s = s[a:b]
    s = s / max(1e-6, np.max(np.abs(s))) * 0.89
    fade = int(0.01 * sr); s[:fade] *= np.linspace(0, 1, fade); s[-fade:] *= np.linspace(1, 0, fade)
    x = resample_poly(s, 2, 1).astype(np.float32)  # band-limited 24 → 48 kHz (linear interp left audible images)
    sf.write(f"../public/vo/{line['id']}.wav", x, 48000, subtype="PCM_16")
    manifest[line["id"]] = round(len(x) / 48000, 3)
    print(line["id"], manifest[line["id"]])
    json.dump(manifest, open("manifest.json", "w"), indent=1)
sec = {}
for line in script["lines"]:
    sec[line["section"]] = sec.get(line["section"], 0) + manifest.get(line["id"], 0)
print({k: round(v, 2) for k, v in sec.items()}, "total", round(sum(sec.values()), 2))
