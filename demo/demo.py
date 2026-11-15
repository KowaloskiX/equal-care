"""End-to-end <=2-minute pitch video for Equal Care Across Finland.

Follows the hackathon-demo-video workflow:
  1. `vo`         — Gemini TTS (`gemini-3.1-flash-tts-preview`, voice `Sulafat` on `v1beta`) + automatic
                    transcription QA via `gemini-3.5-flash` to catch any mangled words/numbers.
  2. `rehearse`   — Warms the FastAPI in-process report & cover caches and verifies every live number.
  3. `record`     — Drives the standalone `next start` build via Playwright with a 60Hz FrameTicker so
                    screencast emits continuous frames with zero static-gap drift, logging exact tap coords.
  4. `compose`    — Renders 1920x1080 H.264/AAC pitch video (`equal-care-pitch.mp4`), silent live-voiceover
                    copy (`equal-care-pitch-silent.mp4`), loudness check, and verification contact sheets.
  5. `transcript` — Writes timestamped `demo/TRANSCRIPT.md`.

Run from repo root:
  uv run --with pillow --with google-genai python demo/demo.py vo
  uv run --with pillow --with google-genai python demo/demo.py rehearse
  uv run --with pillow --with google-genai python demo/demo.py record
  uv run --with pillow --with google-genai python demo/demo.py compose
  uv run --with pillow --with google-genai python demo/demo.py transcript
"""

from __future__ import annotations

import json
import math
import os
import re
import subprocess
import sys
import urllib.request
import wave
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEMO_DIR = Path(__file__).resolve().parent
OUT = DEMO_DIR / "out"
VO_DIR = OUT / "vo"

sys.path.insert(0, str(ROOT / "src"))
import residents as _residents  # noqa: E402,F401 — populates os.environ from .env without printing secrets

TTS_MODEL = os.environ.get("TTS_MODEL", "gemini-3.1-flash-tts-preview")
QA_MODEL = os.environ.get("QA_MODEL", "gemini-3.5-flash")
VOICE = os.environ.get("TTS_VOICE", "Sulafat")
API_BASE = os.environ.get("DEMO_API_URL", "http://localhost:8010")
WEB_BASE = os.environ.get("DEMO_APP_URL", "http://localhost:3011")

FONT_PATH = Path("/System/Library/Fonts/SFNS.ttf")
FONT_MONO = Path("/System/Library/Fonts/SFNSMono.ttf")

PAD = 0.40       # breathing room after each voice-over clip
LEAD_IN = 0.90   # picture lead-in before first spoken word
MAX_TOTAL = 120.0

# 1920x1080 stage geometry: 1360x880 browser scaled to 1292x836 inside a sleek framed window on the right
STAGE_W, STAGE_H = 1920, 1080
APP_W, APP_H = 1292, 836
BAR_H = 34
WIN_W, WIN_H = APP_W, APP_H + BAR_H
WIN_X, WIN_Y = 576, 96
APP_X, APP_Y = WIN_X, WIN_Y + BAR_H

# Accent colours (RGBA) matching the Equal Care Finland evidence system
CORAL = (251, 113, 133, 255)
SKY = (56, 189, 248, 255)
EMERALD = (52, 211, 153, 255)
AMBER = (251, 191, 36, 255)

SEGMENTS = [
    {
        "id": "hook",
        "kicker": "01 / 06  ·  PUBLIC DATA",
        "title": "Equal Care\nFinland",
        "sub": "Helsinki breast screening: 74.3 %\nTarget: 80 %  ·  Finland: 81.6 %\n~2 201 women missing each year",
        "accent": CORAL,
        "vo": (
            "Finland aims for eighty percent cancer screening attendance in every county. "
            "Yet on breast mammography, the furthest behind isn't rural — it's Helsinki, "
            "at seventy-four point three percent: about two thousand two hundred women missing each year."
        ),
        "actions": [],
    },
    {
        "id": "why_data",
        "kicker": "02 / 06  ·  STATISTICAL MODEL",
        "title": "People or\nservices?",
        "sub": "7.3-pt gap across 291 municipalities\n4.7 pts demographics  ·  2.6 pts local\nWeighted regression — zero AI maths",
        "accent": SKY,
        "vo": (
            "In step two, we split Helsinki's seven point three point gap to Finland without AI, "
            "using weighted regression across two hundred and ninety-one municipalities. "
            "Four point seven points come from demographics, leaving two point six points unexplained locally."
        ),
        "actions": [(0.25, "click_next")],
    },
    {
        "id": "why_sim",
        "kicker": "03 / 06  ·  GEMINI DECISIONS API",
        "title": "771 resident\narchetypes",
        "sub": "Top barrier: language (54 %)\nValidated vs real counties: r = 0.84\nEvery dot reveals its exact prompt",
        "accent": SKY,
        "vo": (
            "Next, we ask seven hundred and seventy-one synthetic resident types built from Statistics Finland tables. "
            "Gemini Decisions estimates who attends and why not, matching real county rates at r equals zero point eight four. "
            "Language leads at fifty-four percent — and clicking any dot exposes the exact prompt."
        ),
        "actions": [
            (0.25, "click_ask_residents"),
            (13.20, "click_resident_dot"),
            (14.80, "click_see_asked"),
        ],
    },
    {
        "id": "whatif",
        "kicker": "04 / 06  ·  NATIONAL ROADMAP",
        "title": "What closes\nthe gap",
        "sub": "Own-language outreach  ·  1.3.1 (p.33)\n+992 to +2 093 women / yr (2 models)\n45–95 % of gap  ·  upper bound",
        "accent": EMERALD,
        "vo": (
            "In step three, we test national roadmap actions on those same residents. "
            "Invitations in the person's own language — roadmap action one point three point one, page thirty-three — "
            "bring nine hundred and ninety-two to two thousand and ninety-three women a year across two independent models."
        ),
        "actions": [
            (0.25, "click_next"),
            (1.15, "click_own_language"),
            (2.05, "click_run_sim"),
        ],
    },
    {
        "id": "pathway",
        "kicker": "05 / 06  ·  STRATEGY GOAL 3",
        "title": "Beyond\nscreening",
        "sub": "Satakunta wait >90d: 37.5 % vs 3.5 %\nFlagged n = 8  ·  Action 3.1.2 (p.56)\nDiagnosis stage: county data gap",
        "accent": AMBER,
        "vo": (
            "Step four tracks Strategy Goal Three across the full care pathway, where Gemini prioritises which stage "
            "to address first and flags missing county diagnosis-stage data. Selecting Satakunta county reveals thirty-seven "
            "point five percent of oncology patients waiting over ninety days — with an explicit small-numbers warning."
        ),
        "actions": [
            (0.25, "click_next"),
            (10.50, "click_satakunta"),
            (11.80, "click_treatment"),
            (13.20, "click_play_queue"),
        ],
    },
    {
        "id": "briefing",
        "kicker": "06 / 06  ·  GROUNDED BRIEFING",
        "title": "Ready for\na pilot",
        "sub": "Session briefing + 16:9 slide deck\nEvery figure verified against FACTS\nEqual Care Across Finland",
        "accent": EMERALD,
        "vo": (
            "Finally, one click turns your session into a cited briefing and slide deck. "
            "Gemini writes the prose, while deterministic code inserts and checks every figure. "
            "Public data, honest limits, and procurement-ready roadmap actions — Equal Care Across Finland."
        ),
        "actions": [
            (0.25, "click_generate_report_top"),
            (1.60, "click_generate_submit"),
            (5.80, "click_slides_tab"),
            (9.50, "click_slide_where"),
            (13.20, "click_slide_what"),
        ],
    },
]


def wav_len(p: Path) -> float:
    with wave.open(str(p)) as w:
        return w.getnframes() / w.getframerate()


def durations() -> list[float]:
    return [wav_len(VO_DIR / f"{i:02d}-{s['id']}.wav") + PAD for i, s in enumerate(SEGMENTS)]


def load_font(size: int, variation: bytes = b"Regular", mono: bool = False):
    from PIL import ImageFont

    f = ImageFont.truetype(str(FONT_MONO if mono else FONT_PATH), size)
    if not mono and hasattr(f, "set_variation_by_name"):
        try:
            f.set_variation_by_name(variation)
        except Exception:
            pass
    return f


def cmd_vo() -> None:
    from google import genai
    from google.genai import types

    VO_DIR.mkdir(parents=True, exist_ok=True)
    client = genai.Client(
        api_key=os.environ["GEMINI_API_KEY"],
        http_options=types.HttpOptions(api_version="v1beta"),
    )
    style = (
        "Read this as the voice-over of a crisp, authoritative two-minute health-policy product pitch: "
        "warm, clear, calm, confident, brisk (~140 words per minute), like a Nordic design & research team presenting. "
        "Pronounce Finnish place names naturally. "
        "Read ONLY the text after the colon, with no intro or outro. Text: "
    )
    qa_out = {}
    for i, s in enumerate(SEGMENTS):
        p = VO_DIR / f"{i:02d}-{s['id']}.wav"
        if not p.exists() or "--force" in sys.argv:
            r = client.models.generate_content(
                model=TTS_MODEL,
                contents=style + s["vo"],
                config=types.GenerateContentConfig(
                    response_modalities=["AUDIO"],
                    speech_config=types.SpeechConfig(
                        voice_config=types.VoiceConfig(
                            prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name=VOICE)
                        )
                    ),
                ),
            )
            pcm = r.candidates[0].content.parts[0].inline_data.data
            with wave.open(str(p), "wb") as w:
                w.setnchannels(1)
                w.setsampwidth(2)
                w.setframerate(24000)
                w.writeframes(pcm)
            print(f"generated {p.name}: {wav_len(p):.2f}s")

        # QA every clip by transcribing it back with a full non-lite model (skill section 3)
        wav_bytes = p.read_bytes()
        tr = client.models.generate_content(
            model=QA_MODEL,
            contents=[
                types.Part.from_bytes(data=wav_bytes, mime_type="audio/wav"),
                "Transcribe this audio verbatim in English, including numbers. Output plain text only.",
            ],
        )
        heard = (tr.text or "").strip()
        qa_out[s["id"]] = {"expected": s["vo"], "heard": heard, "seconds": round(wav_len(p), 2)}
        print(f"  [{s['id']}] {wav_len(p):.2f}s | heard: {heard}")

    (OUT / "vo_qa.json").write_text(json.dumps(qa_out, indent=2))
    d = durations()
    total = LEAD_IN + sum(d) + 0.6
    print(f"\nTotal video duration: {total:.1f}s (limit {MAX_TOTAL:.0f}s)")
    if total > MAX_TOTAL:
        sys.exit(f"TOO LONG ({total:.1f}s > {MAX_TOTAL:.0f}s) — shorten the VO")


def _http_json(url: str, payload: dict | None = None) -> dict:
    if payload is None:
        req = urllib.request.Request(url)
    else:
        data = json.dumps(payload).encode()
        req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read().decode())


def cmd_rehearse() -> None:
    """Verify live numbers & warm every cache on :8010 so recording has zero wait."""
    OUT.mkdir(parents=True, exist_ok=True)
    rec90 = _http_json(f"{API_BASE}/api/recommend/breast/90")
    assert rec90["screening"]["rate"] == 74.3 and rec90["screening"]["missing_per_year"] == 2201
    assert rec90["split"]["comp_pts"] == 4.7 and rec90["split"]["other_pts"] == 2.6
    assert rec90["sim_split"]["validation"]["counties_weighted"]["r"] == 0.84

    wi90 = _http_json(f"{API_BASE}/api/whatif?prog=breast&code=90&s=own_language")
    assert wi90["extra_people_per_year"] == 2093 and wi90["other_engine"]["extra_people_per_year"] == 992

    reg06 = _http_json(f"{API_BASE}/api/region/06")
    w90 = next(i for i in reg06["indicators"] if i["key"] == "onc_wait_90")
    assert w90["value"] == 37.5 and w90["national"] == 3.5 and w90["abs_value"] == 8.0

    # Warm baseline & scenario replays + focus + report + covers
    _http_json(f"{API_BASE}/api/residents/breast/90")
    _http_json(f"{API_BASE}/api/residents/breast/90?s=own_language")
    _http_json(f"{API_BASE}/api/focus/breast/90")
    _http_json(f"{API_BASE}/api/focus/breast/06")
    rep = _http_json(f"{API_BASE}/api/report", {"items": "breast:06,breast:90:own_language", "image": False})
    print("Report warmed — flags:", len(rep.get("flags", [])), "cached:", rep.get("cached"))
    for sc in ("", "?scene=where", "?scene=next"):
        c = _http_json(f"{API_BASE}/api/report/cover{sc}")
        print(f"Cover {sc or 'main'}: image={bool(c.get('image'))}")
    print("All API assertions & caches verified.")


def cmd_record() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    d = durations()
    plan = {
        "lead_in": LEAD_IN,
        "segments": [{"id": s["id"], "dur": dur, "actions": s["actions"]} for s, dur in zip(SEGMENTS, d)],
    }
    plan_path = OUT / "plan.json"
    plan_path.write_text(json.dumps(plan, indent=2))
    env = {**os.environ, "DEMO_APP_URL": WEB_BASE}
    subprocess.run(["node", str(DEMO_DIR / "record_browser.cjs"), str(plan_path)], check=True, env=env)

    # Skill section 5: verify continuous frame timestamps (no static-screen frame drops > 0.35s)
    raw_mp4 = OUT / "screen.mp4"
    pr = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "frame=pts_time", "-of", "csv=p=0", str(raw_mp4)],
        capture_output=True, text=True, check=True,
    )
    pts = [float(x.rstrip(",")) for x in pr.stdout.strip().splitlines() if x.strip()]
    marks = json.loads((OUT / "marks.json").read_text())
    lead = marks["record_lead"]
    active_pts = [t for t in pts if t >= lead]
    gaps = [b - a for a, b in zip(active_pts, active_pts[1:])]
    max_gap = max(gaps) if gaps else 999.0
    print(f"ffprobe frames: {len(pts)} total, {len(active_pts)} active, max frame gap: {max_gap:.4f}s")
    if max_gap > 0.10:
        print("WARNING: frame gap > 0.10s detected!")


def _render_assets(total: float) -> None:
    from PIL import Image, ImageDraw, ImageFilter

    # 1. Stage background (1920x1080) with subtle dark-aurora depth
    bg = Image.new("RGBA", (STAGE_W, STAGE_H), (7, 9, 15, 255))
    glow = Image.new("RGBA", (STAGE_W, STAGE_H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse([-220, 560, 620, 1320], fill=(244, 63, 94, 24))
    gd.ellipse([780, -180, 1980, 920], fill=(56, 189, 248, 22))
    gd.ellipse([980, 480, 1960, 1220], fill=(16, 185, 129, 18))
    glow = glow.filter(ImageFilter.GaussianBlur(120))
    bg = Image.alpha_composite(bg, glow)
    bg.convert("RGB").save(OUT / "bg.png")

    # 2. Browser window shadow + chrome header bar + rounded alpha mask for the app video
    sh = Image.new("RGBA", (WIN_W + 140, WIN_H + 140), (0, 0, 0, 0))
    ImageDraw.Draw(sh).rounded_rectangle([70, 82, WIN_W + 70, WIN_H + 82], radius=22, fill=(0, 0, 0, 175))
    ImageDraw.Draw(sh).rounded_rectangle([69, 69, WIN_W + 71, WIN_H + 71], radius=20, outline=(255, 255, 255, 34), width=2)
    sh = sh.filter(ImageFilter.GaussianBlur(24))
    # Crisp 1px window border on top of shadow
    bd = ImageDraw.Draw(sh)
    bd.rounded_rectangle([69, 69, WIN_W + 70, WIN_H + 70], radius=19, fill=(13, 16, 23, 255), outline=(255, 255, 255, 36), width=1)
    # macOS traffic lights + URL bar inside top BAR_H
    for idx, col in enumerate([(248, 113, 113, 190), (251, 191, 36, 190), (52, 211, 153, 190)]):
        cx = 70 + 18 + idx * 18
        cy = 70 + BAR_H // 2
        bd.ellipse([cx - 5, cy - 5, cx + 5, cy + 5], fill=col)
    f_url = load_font(13, b"Medium")
    bd.rounded_rectangle([70 + WIN_W // 2 - 140, 70 + 6, 70 + WIN_W // 2 + 140, 70 + BAR_H - 6],
                         radius=6, fill=(255, 255, 255, 12), outline=(255, 255, 255, 18))
    bd.text((70 + WIN_W // 2 - 78, 70 + 9), "equal-care-finland.app", font=f_url, fill=(248, 250, 252, 155))
    sh.save(OUT / "win_frame.png")

    # Rounded bottom corners mask for the 1292x836 video area
    mask = Image.new("L", (APP_W, APP_H), 0)
    md = ImageDraw.Draw(mask)
    md.rounded_rectangle([0, -24, APP_W - 1, APP_H - 1], radius=18, fill=255)
    mask.save(OUT / "app_mask.png")

    # 3. Tap indicator ring (96x96)
    ring = Image.new("RGBA", (96, 96), (0, 0, 0, 0))
    rd = ImageDraw.Draw(ring)
    rd.ellipse([6, 6, 90, 90], fill=(56, 189, 248, 48), outline=(125, 211, 252, 240), width=4)
    rd.ellipse([34, 34, 62, 62], fill=(255, 255, 255, 190))
    ring.save(OUT / "tap.png")

    # 4. Left-rail segment cards (490x560)
    f_kick = load_font(16, b"Semibold", mono=False)
    f_title = load_font(62, b"Bold")
    f_sub = load_font(24, b"Medium")
    for i, s in enumerate(SEGMENTS):
        card = Image.new("RGBA", (500, 560), (0, 0, 0, 0))
        cd = ImageDraw.Draw(card)
        acc = s["accent"]
        # Kicker pill
        cd.rounded_rectangle([0, 0, 286, 32], radius=7, fill=(acc[0], acc[1], acc[2], 28),
                             outline=(acc[0], acc[1], acc[2], 105), width=1)
        cd.text((12, 7), s["kicker"], font=f_kick, fill=acc)
        # 2-line display title
        y = 54
        for line in s["title"].split("\n"):
            cd.text((0, y), line, font=f_title, fill=(248, 250, 252, 255))
            y += 70
        # Accent bar
        y += 14
        cd.rounded_rectangle([2, y, 78, y + 5], radius=2, fill=acc)
        # Key figures & source lines
        y += 28
        for j, line in enumerate(s["sub"].split("\n")):
            col = (241, 245, 249, 238) if j < 2 else (148, 163, 184, 215)
            cd.text((2, y), line, font=f_sub, fill=col)
            y += 40
        card.save(OUT / f"card-{i:02d}.png")

    # 5. Footer
    foot = Image.new("RGBA", (1800, 44), (0, 0, 0, 0))
    fd = ImageDraw.Draw(foot)
    f_foot = load_font(19, b"Medium")
    fd.ellipse([2, 13, 12, 23], fill=CORAL)
    fd.text(
        (22, 7),
        "Junction 2026  ·  AstraZeneca: Equal Care Across Finland  ·  THL Public Data + Gemini Decisions API",
        font=f_foot,
        fill=(148, 163, 184, 200),
    )
    foot.save(OUT / "foot.png")


def _measure_volume(mp4: Path) -> tuple[float, float]:
    r = subprocess.run(
        ["ffmpeg", "-i", str(mp4), "-af", "volumedetect", "-f", "null", "-"],
        capture_output=True, text=True,
    )
    m_mean = re.search(r"mean_volume:\s*([-\d.]+)\s*dB", r.stderr)
    m_max = re.search(r"max_volume:\s*([-\d.]+)\s*dB", r.stderr)
    return (float(m_mean.group(1)) if m_mean else -20.0, float(m_max.group(1)) if m_max else -1.5)


def _make_contact_sheets(mp4: Path, total: float, taps: list[dict]) -> None:
    from PIL import Image, ImageDraw

    frames_dir = OUT / "frames_check"
    frames_dir.mkdir(parents=True, exist_ok=True)
    # Periodic contact sheet every 6s
    times = [round(t, 1) for t in [1.5 + 6.0 * k for k in range(int(total // 6) + 1)] if t < total - 0.3]
    thumbs = []
    f_lbl = load_font(18, b"Semibold")
    for idx, ts in enumerate(times):
        fp = frames_dir / f"t_{idx:02d}.jpg"
        subprocess.run(
            ["ffmpeg", "-y", "-ss", f"{ts:.2f}", "-i", str(mp4), "-frames:v", "1", "-q:v", "3", str(fp)],
            capture_output=True, check=True,
        )
        im = Image.open(fp).resize((640, 360))
        d = ImageDraw.Draw(im)
        d.rectangle([8, 8, 108, 36], fill=(0, 0, 0, 190))
        d.text((16, 11), f"t={ts:04.1f}s", font=f_lbl, fill=(255, 255, 255))
        thumbs.append(im)
    cols = 3
    rows = math.ceil(len(thumbs) / cols)
    sheet = Image.new("RGB", (cols * 640, rows * 360), (10, 12, 18))
    for i, im in enumerate(thumbs):
        sheet.paste(im, ((i % cols) * 640, (i // cols) * 360))
    sheet.save(OUT / "contact-sheet.jpg", quality=88)

    # Tap verification sheet (one frame right at each recorded tap!)
    if taps:
        t_thumbs = []
        for idx, tp in enumerate(taps):
            ts = min(total - 0.2, tp["t"] + 0.08)
            fp = frames_dir / f"tap_{idx:02d}.jpg"
            subprocess.run(
                ["ffmpeg", "-y", "-ss", f"{ts:.2f}", "-i", str(mp4), "-frames:v", "1", "-q:v", "3", str(fp)],
                capture_output=True, check=True,
            )
            im = Image.open(fp).resize((640, 360))
            d = ImageDraw.Draw(im)
            d.rectangle([8, 8, 340, 36], fill=(0, 0, 0, 190))
            d.text((14, 11), f"{tp['t']:04.1f}s · {tp['action']}", font=f_lbl, fill=(125, 211, 252))
            t_thumbs.append(im)
        t_rows = math.ceil(len(t_thumbs) / cols)
        tsheet = Image.new("RGB", (cols * 640, t_rows * 360), (10, 12, 18))
        for i, im in enumerate(t_thumbs):
            tsheet.paste(im, ((i % cols) * 640, (i // cols) * 360))
        tsheet.save(OUT / "taps-sheet.jpg", quality=88)


def cmd_compose() -> None:
    d = durations()
    starts, t = [], LEAD_IN
    for x in d:
        starts.append(t)
        t += x
    total = t + 0.6
    if total > MAX_TOTAL:
        sys.exit(f"Refusing to compose: {total:.2f}s exceeds {MAX_TOTAL:.0f}s limit")

    _render_assets(total)
    marks = json.loads((OUT / "marks.json").read_text())
    lead = marks["record_lead"]
    taps = marks.get("taps", [])

    # Audio filter: delay each WAV to its segment start, mix without attenuation, gentle limiter
    inputs, filt, a_labels = [], [], []
    for i, s in enumerate(SEGMENTS):
        inputs += ["-i", str(VO_DIR / f"{i:02d}-{s['id']}.wav")]
        ms = int(round(starts[i] * 1000))
        filt.append(f"[{i + 1}:a]adelay={ms}|{ms},apad[a{i}]")
        a_labels.append(f"[a{i}]")
    filt.append(
        "".join(a_labels)
        + f"amix=inputs={len(SEGMENTS)}:normalize=0,volume=0.82,alimiter=limit=0.84,atrim=0:{total:.2f}[aud]"
    )

    # Video inputs after [0:v]=screen.webm and [1..N:a]=VO wavs:
    ni = len(SEGMENTS) + 1
    inputs += [
        "-loop", "1", "-t", f"{total:.2f}", "-i", str(OUT / "bg.png"),         # ni + 0
        "-loop", "1", "-t", f"{total:.2f}", "-i", str(OUT / "win_frame.png"),  # ni + 1
        "-loop", "1", "-t", f"{total:.2f}", "-i", str(OUT / "app_mask.png"),   # ni + 2
        "-loop", "1", "-t", f"{total:.2f}", "-i", str(OUT / "tap.png"),        # ni + 3
        "-loop", "1", "-t", f"{total:.2f}", "-i", str(OUT / "foot.png"),       # ni + 4
    ]
    cards_in = ni + 5
    for i in range(len(SEGMENTS)):
        inputs += ["-loop", "1", "-t", f"{total:.2f}", "-i", str(OUT / f"card-{i:02d}.png")]

    # Resample both screen stream and mask to constant 30 fps BEFORE alphamerge (skill section 6!)
    v = [
        f"[0:v]trim=start={lead:.3f},setpts=PTS-STARTPTS,fps=30,scale={APP_W}:{APP_H}:flags=lanczos,format=rgba[apps]",
        f"[{ni + 2}:v]fps=30,format=gray,scale={APP_W}:{APP_H}[msk]",
        "[apps][msk]alphamerge[app]",
        f"[{ni + 0}:v][{ni + 1}:v]overlay=x={WIN_X - 70}:y={WIN_Y - 70}:shortest=1[stg0]",
        f"[stg0][app]overlay=x={APP_X}:y={APP_Y}:shortest=0[stg1]",
        f"[stg1][{ni + 4}:v]overlay=x=54:y=1016:shortest=1[base0]",
    ]
    cur = "base0"

    # Overlay tap rings at exact recorded Playwright bounding-box centers & timestamps
    for k, tp in enumerate(taps):
        at = tp["t"]
        rx = APP_X + tp["fx"] * APP_W - 48
        ry = APP_Y + tp["fy"] * APP_H - 48
        v.append(f"[{ni + 3}:v]format=rgba[ring{k}]")
        v.append(
            f"[{cur}][ring{k}]overlay=x={rx:.0f}:y={ry:.0f}:"
            f"enable='between(t\\,{max(0.0, at - 0.18):.2f}\\,{at + 0.48:.2f})'[tp{k}]"
        )
        cur = f"tp{k}"

    # Overlay left-rail segment title cards with smooth fade in/out
    for i in range(len(SEGMENTS)):
        a, b = starts[i], starts[i] + d[i]
        v.append(
            f"[{cards_in + i}:v]format=rgba,"
            f"fade=t=in:st={a:.2f}:d=0.35:alpha=1,"
            f"fade=t=out:st={b - 0.28:.2f}:d=0.28:alpha=1[c{i}]"
        )
        v.append(f"[{cur}][c{i}]overlay=x=54:y=236:enable='between(t\\,{a:.2f}\\,{b:.2f})'[cc{i}]")
        cur = f"cc{i}"

    v.append(f"[{cur}]null[vid]")
    graph = ";".join(v + filt)

    out_mp4 = OUT / "equal-care-pitch.mp4"
    cmd = [
        "ffmpeg", "-y", "-i", str(OUT / "screen.mp4"), *inputs,
        "-filter_complex", graph,
        "-map", "[vid]", "-map", "[aud]",
        "-t", f"{total:.2f}", "-r", "30",
        "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart",
        str(out_mp4),
    ]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode:
        print(r.stderr[-3500:])
        sys.exit(1)

    # Silent copy for live stage narration (skill section 6)
    silent_mp4 = OUT / "equal-care-pitch-silent.mp4"
    subprocess.run(["ffmpeg", "-y", "-i", str(out_mp4), "-an", "-c:v", "copy", str(silent_mp4)], check=True, capture_output=True)

    mean_db, max_db = _measure_volume(out_mp4)
    dur_probe = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", str(out_mp4)],
        capture_output=True, text=True, check=True,
    ).stdout.strip()
    print(f"Wrote {out_mp4} ({float(dur_probe):.2f}s, mean={mean_db:.1f} dB, peak={max_db:.1f} dB)")
    print(f"Wrote {silent_mp4} (silent live-pitch track)")

    _make_contact_sheets(out_mp4, float(dur_probe), taps)
    print(f"Wrote {OUT / 'contact-sheet.jpg'} and {OUT / 'taps-sheet.jpg'}")


def cmd_transcript() -> None:
    d = durations()
    t = LEAD_IN
    lines = ["# Equal Care Across Finland — 2-Minute Pitch Transcript", ""]
    for s, x in zip(SEGMENTS, d):
        end = t + x - PAD
        lines.append(f"**{int(t // 60)}:{t % 60:04.1f} – {int(end // 60)}:{end % 60:04.1f} · {s['title'].replace(chr(10), ' ')}**  ")
        lines.append(s["vo"])
        lines.append("")
        t += x
    lines.append(f"_Total video length: {t + 0.6:.1f} s (limit: 120 s)_")
    dst = DEMO_DIR / "TRANSCRIPT.md"
    dst.write_text("\n".join(lines) + "\n")
    print("Wrote", dst)


if __name__ == "__main__":
    cmds = {
        "vo": cmd_vo,
        "rehearse": cmd_rehearse,
        "record": cmd_record,
        "compose": cmd_compose,
        "transcript": cmd_transcript,
    }
    cmds[sys.argv[1]]()
