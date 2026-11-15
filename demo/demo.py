"""End-to-end <=2-minute pitch video for Equal Care Across Finland.

Follows the hackathon-demo-video workflow:
  1. `vo`         — Gemini TTS (`gemini-3.1-flash-tts-preview`, voice `Charon` on `v1beta`) + automatic
                    verbatim QA transcription via `gemini-3.5-flash`.
  2. `rehearse`   — Warms the FastAPI in-process report & cover caches and verifies every live number.
  3. `record`     — Drives the standalone `next start` build via Playwright with lossless PNG screencast
                    frames (zero JPEG shimmer, zero static-gap drift), logging exact tap coordinates.
  4. `compose`    — Renders 1920x1080 30fps CFR H.264/AAC pitch video (`equal-care-pitch.mp4`), silent
                    track (`equal-care-pitch-silent.mp4`), loudness check, flicker check & contact sheets.
  5. `transcript` — Writes timestamped `demo/TRANSCRIPT.md` crediting Gemini TTS + Gemini 3.5 Flash QA.
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
import residents as _residents  # noqa: E402,F401 — loads .env into os.environ without printing secrets

TTS_MODEL = os.environ.get("TTS_MODEL", "gemini-3.1-flash-tts-preview")
QA_MODEL = os.environ.get("QA_MODEL", "gemini-3.5-flash")
VOICE = os.environ.get("TTS_VOICE", "Charon")
API_BASE = os.environ.get("DEMO_API_URL", "http://localhost:8010")
WEB_BASE = os.environ.get("DEMO_APP_URL", "http://localhost:3011")

FONT_PATH = Path("/System/Library/Fonts/SFNS.ttf")
FONT_MONO = Path("/System/Library/Fonts/SFNSMono.ttf")

PAD = 0.35
LEAD_IN = 0.80
MAX_TOTAL = 120.0

# 1920x1080 stage geometry: enlarged 1396x904 app stage (73% width, 87% height) so the map shines
STAGE_W, STAGE_H = 1920, 1080
APP_W, APP_H = 1396, 904
BAR_H = 32
WIN_W, WIN_H = APP_W, APP_H + BAR_H
WIN_X, WIN_Y = 492, 50
APP_X, APP_Y = WIN_X, WIN_Y + BAR_H

CORAL = (251, 113, 133, 255)
SKY = (56, 189, 248, 255)
EMERALD = (52, 211, 153, 255)
AMBER = (251, 191, 36, 255)
VIOLET = (167, 139, 250, 255)

SEGMENTS = [
    {
        "id": "hook",
        "kicker": "01 / 06  ·  MAP & GUIDED TOUR",
        "title": "Equal Care\nFinland",
        "sub": "Helsinki breast screening: 74.3 %\nTarget: 80 %  ·  ~2 201 missing / yr\nTHL Sotkanet #3621 across 23 counties",
        "badge": "SPOTLIGHT WALKTHROUGH  ·  PUBLIC THL DATA",
        "accent": CORAL,
        "vo": (
            "Finland targets eighty percent cancer screening in every county, mapped live with a built-in spotlight guide. "
            "Surprisingly, breast screening lags most in Helsinki at seventy-four point three percent — "
            "two thousand two hundred women missing each year."
        ),
        "actions": [
            (2.80, "open_tour"),
            (5.10, "tour_next"),
            (7.60, "tour_next"),
            (10.00, "tour_skip"),
            (11.00, "sweep_map"),
        ],
    },
    {
        "id": "why_data",
        "kicker": "02 / 06  ·  DETERMINISTIC STATS",
        "title": "People or\nservices?",
        "sub": "7.3-pt gap across 291 municipalities\n4.7 pts demographics  ·  2.6 pts local\nR² = 60 % weighted least-squares",
        "badge": "ZERO LLM ARITHMETIC  ·  291-MUNI WLS",
        "accent": SKY,
        "vo": (
            "In step two, plain weighted regression across two hundred and ninety-one municipalities splits "
            "Helsinki's seven point three point gap without AI: four point seven points from demographics, "
            "and two point six points unexplained locally."
        ),
        "actions": [(0.25, "click_next")],
    },
    {
        "id": "why_sim",
        "kicker": "03 / 06  ·  GEMINI ROLE #1",
        "title": "771 resident\narchetypes",
        "sub": "Top barrier: language (54 %)\nValidated vs real counties: r = 0.84\nClick any map dot for exact prompt",
        "badge": "GEMINI DECISIONS API  ·  RESIDENT SIMULATION",
        "accent": SKY,
        "vo": (
            "Next, Gemini Decisions evaluates seven hundred and seventy-one census resident types on the map, "
            "matching real county attendance at r equals zero point eight four. Language is the top barrier at "
            "fifty-four percent — and every dot reveals the exact prompt."
        ),
        "actions": [
            (0.25, "click_ask_residents"),
            (11.40, "click_resident_dot"),
            (13.00, "click_see_asked"),
        ],
    },
    {
        "id": "whatif",
        "kicker": "04 / 06  ·  GEMINI ROLES #1 & #2",
        "title": "What closes\nthe gap",
        "sub": "Own-language outreach  ·  1.3.1 (p.33)\n+992 to +2 093 women / yr (2 models)\nGemini matches 73 roadmap actions",
        "badge": "GEMINI COUNTERFACTUALS + ROADMAP MATCHER",
        "accent": EMERALD,
        "vo": (
            "In step three, Gemini also matches barriers against all seventy-three national roadmap actions. "
            "Re-running Helsinki's residents with own-language invitations — action one point three point one, "
            "page thirty-three — brings nine hundred and ninety-two to two thousand and ninety-three women a year."
        ),
        "actions": [
            (0.10, "close_popover"),
            (0.35, "click_next"),
            (1.25, "click_own_language"),
            (2.15, "click_run_sim"),
        ],
    },
    {
        "id": "pathway",
        "kicker": "05 / 06  ·  GEMINI ROLE #3 + GOAL 3",
        "title": "Beyond\nscreening",
        "sub": "Satakunta wait >90d: 37.5 % vs 3.5 %\nFlagged n = 8  ·  Action 3.1.2 (p.56)\nGemini picks top-priority stage",
        "badge": "GEMINI STAGE PRIORITISATION  ·  THL QUEUES",
        "accent": AMBER,
        "vo": (
            "Step four covers Strategy Goal Three across the care pathway. Gemini Decisions ranks which stage "
            "each county should fix first and flags missing diagnosis-stage data, while Satakunta's monthly map "
            "shows thirty-seven point five percent waiting over ninety days — with small-number warnings."
        ),
        "actions": [
            (0.25, "click_next"),
            (8.80, "click_satakunta"),
            (10.10, "click_treatment"),
            (11.40, "click_play_queue"),
        ],
    },
    {
        "id": "briefing",
        "kicker": "06 / 06  ·  GEMINI ROLES #4 & #5",
        "title": "Grounded\nbriefing",
        "sub": "Prose + cover art by Gemini\nEvery figure verified by code (0 flags)\nVO & QA transcript by Gemini Audio",
        "badge": "GEMINI BRIEFING + IMAGE + TTS VOICE & QA",
        "accent": VIOLET,
        "vo": (
            "Finally, Gemini turns your session into an illustrated briefing and slide deck, with every number "
            "inserted and verified by code — and Gemini even voiced and transcribed this pitch. "
            "Equal Care Across Finland."
        ),
        "actions": [
            (0.25, "click_generate_report_top"),
            (1.50, "click_generate_submit"),
            (4.80, "click_slides_tab"),
            (7.80, "click_slide_where"),
            (10.60, "click_slide_what"),
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
        "Read this as the voice-over of a crisp, engaging two-minute product pitch: "
        "warm, clear, confident, brisk (~145 words per minute), like a Nordic design and health-tech founder. "
        "Pronounce Finnish place names naturally. "
        "Read ONLY the text after the colon, with no intro or outro. Text: "
    )
    qa_out = {"tts_model": TTS_MODEL, "tts_voice": VOICE, "qa_model": QA_MODEL, "segments": {}}
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
            print(f"generated {p.name} ({VOICE}): {wav_len(p):.2f}s")

        wav_bytes = p.read_bytes()
        tr = client.models.generate_content(
            model=QA_MODEL,
            contents=[
                types.Part.from_bytes(data=wav_bytes, mime_type="audio/wav"),
                "Transcribe this audio verbatim in English, including numbers. Output plain text only.",
            ],
        )
        heard = (tr.text or "").strip()
        qa_out["segments"][s["id"]] = {"expected": s["vo"], "heard": heard, "seconds": round(wav_len(p), 2)}
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

    # 1. Stage background (1920x1080)
    bg = Image.new("RGBA", (STAGE_W, STAGE_H), (7, 9, 15, 255))
    glow = Image.new("RGBA", (STAGE_W, STAGE_H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse([-220, 560, 560, 1320], fill=(244, 63, 94, 22))
    gd.ellipse([700, -180, 1980, 920], fill=(56, 189, 248, 22))
    gd.ellipse([980, 480, 1960, 1220], fill=(16, 185, 129, 18))
    glow = glow.filter(ImageFilter.GaussianBlur(120))
    bg = Image.alpha_composite(bg, glow)
    bg.convert("RGB").save(OUT / "bg.png")

    # 2. Browser window shadow + header chrome
    sh = Image.new("RGBA", (WIN_W + 120, WIN_H + 120), (0, 0, 0, 0))
    ImageDraw.Draw(sh).rounded_rectangle([60, 72, WIN_W + 60, WIN_H + 72], radius=20, fill=(0, 0, 0, 180))
    sh = sh.filter(ImageFilter.GaussianBlur(22))
    bd = ImageDraw.Draw(sh)
    bd.rounded_rectangle([59, 59, WIN_W + 60, WIN_H + 60], radius=18, fill=(13, 16, 23, 255),
                         outline=(255, 255, 255, 38), width=1)
    for idx, col in enumerate([(248, 113, 113, 190), (251, 191, 36, 190), (52, 211, 153, 190)]):
        cx = 60 + 18 + idx * 17
        cy = 60 + BAR_H // 2
        bd.ellipse([cx - 5, cy - 5, cx + 5, cy + 5], fill=col)
    f_url = load_font(12, b"Medium")
    bd.rounded_rectangle([60 + WIN_W // 2 - 145, 60 + 6, 60 + WIN_W // 2 + 145, 60 + BAR_H - 6],
                         radius=6, fill=(255, 255, 255, 12), outline=(255, 255, 255, 18))
    bd.text((60 + WIN_W // 2 - 76, 60 + 9), "equal-care-finland.app", font=f_url, fill=(248, 250, 252, 160))
    sh.save(OUT / "win_frame.png")

    mask = Image.new("L", (APP_W, APP_H), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, -24, APP_W - 1, APP_H - 1], radius=17, fill=255)
    mask.save(OUT / "app_mask.png")

    # 3. Smooth tap indicator ring (88x88)
    ring = Image.new("RGBA", (88, 88), (0, 0, 0, 0))
    rd = ImageDraw.Draw(ring)
    rd.ellipse([6, 6, 82, 82], fill=(56, 189, 248, 44), outline=(125, 211, 252, 235), width=3)
    rd.ellipse([32, 32, 56, 56], fill=(255, 255, 255, 185))
    ring.save(OUT / "tap.png")

    # 4. Left-rail segment cards (440x580) with explicit Gemini/Method role badge
    f_kick = load_font(14, b"Semibold")
    f_title = load_font(54, b"Bold")
    f_sub = load_font(21, b"Medium")
    f_badge = load_font(12, b"Semibold")
    for i, s in enumerate(SEGMENTS):
        card = Image.new("RGBA", (444, 600), (0, 0, 0, 0))
        cd = ImageDraw.Draw(card)
        acc = s["accent"]
        cd.rounded_rectangle([0, 0, 310, 30], radius=6, fill=(acc[0], acc[1], acc[2], 28),
                             outline=(acc[0], acc[1], acc[2], 105), width=1)
        cd.text((11, 7), s["kicker"], font=f_kick, fill=acc)

        y = 50
        for line in s["title"].split("\n"):
            cd.text((0, y), line, font=f_title, fill=(248, 250, 252, 255))
            y += 62

        y += 14
        cd.rounded_rectangle([2, y, 72, y + 4], radius=2, fill=acc)

        y += 26
        for j, line in enumerate(s["sub"].split("\n")):
            col = (241, 245, 249, 240) if j < 2 else (148, 163, 184, 215)
            cd.text((2, y), line, font=f_sub, fill=col)
            y += 35

        # Explicit tech/Gemini provenance pill under each card
        y += 20
        cd.rounded_rectangle([0, y, 424, y + 32], radius=7, fill=(255, 255, 255, 11),
                             outline=(acc[0], acc[1], acc[2], 80), width=1)
        cd.ellipse([12, y + 11, 20, y + 19], fill=acc)
        cd.text((28, y + 9), s["badge"], font=f_badge, fill=(226, 232, 240, 235))
        card.save(OUT / f"card-{i:02d}.png")

    # 5. Footer bar crediting both AstraZeneca challenge + full Gemini stack (including TTS & QA!)
    foot = Image.new("RGBA", (1840, 44), (0, 0, 0, 0))
    fd = ImageDraw.Draw(foot)
    f_foot = load_font(16, b"Medium")
    f_gem = load_font(14, b"Semibold")
    fd.ellipse([2, 14, 11, 23], fill=CORAL)
    fd.text(
        (20, 9),
        "Junction 2026  ·  AstraZeneca: Equal Care Across Finland",
        font=f_foot,
        fill=(148, 163, 184, 215),
    )
    # Right-aligned Gemini stack pill (Decisions + Matcher + Focus + Report/Image + TTS Voice & QA)
    gx = 760
    fd.rounded_rectangle([gx, 4, 1836, 34], radius=7, fill=(56, 189, 248, 20), outline=(56, 189, 248, 80), width=1)
    fd.text(
        (gx + 14, 10),
        f"GEMINI STACK:  Decisions API (Residents · Roadmap Matcher · Stage Focus)  ·  Briefing & Cover Art  ·  Voice ({VOICE}) & QA Transcript (Gemini 3.5 Flash)",
        font=f_gem,
        fill=(186, 230, 253, 235),
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

    # Every -loop 1 image gets explicit -framerate 30 so all streams share identical 30.000 fps PTS (zero 25/30 judder)
    ni = len(SEGMENTS) + 1
    inputs += [
        "-loop", "1", "-framerate", "30", "-t", f"{total:.2f}", "-i", str(OUT / "bg.png"),         # ni + 0
        "-loop", "1", "-framerate", "30", "-t", f"{total:.2f}", "-i", str(OUT / "win_frame.png"),  # ni + 1
        "-loop", "1", "-framerate", "30", "-t", f"{total:.2f}", "-i", str(OUT / "app_mask.png"),   # ni + 2
        "-loop", "1", "-framerate", "30", "-t", f"{total:.2f}", "-i", str(OUT / "tap.png"),        # ni + 3
        "-loop", "1", "-framerate", "30", "-t", f"{total:.2f}", "-i", str(OUT / "foot.png"),       # ni + 4
    ]
    cards_in = ni + 5
    for i in range(len(SEGMENTS)):
        inputs += ["-loop", "1", "-framerate", "30", "-t", f"{total:.2f}", "-i", str(OUT / f"card-{i:02d}.png")]

    v = [
        f"[0:v]trim=start={lead:.3f},setpts=PTS-STARTPTS,fps=30,scale={APP_W}:{APP_H}:flags=lanczos,format=rgba[apps]",
        f"[{ni + 2}:v]fps=30,format=gray,scale={APP_W}:{APP_H}[msk]",
        "[apps][msk]alphamerge[app]",
        f"[{ni + 0}:v][{ni + 1}:v]overlay=x={WIN_X - 60}:y={WIN_Y - 60}:shortest=1[stg0]",
        f"[stg0][app]overlay=x={APP_X}:y={APP_Y}:shortest=0[stg1]",
        f"[stg1][{ni + 4}:v]overlay=x=42:y=1022:shortest=1[base0]",
    ]
    cur = "base0"

    # Split tap.png cleanly across all tap overlays (never consume one input pad multiple times without split!)
    if taps:
        split_out = "".join(f"[traw{k}]" for k in range(len(taps)))
        v.append(f"[{ni + 3}:v]format=rgba,split={len(taps)}{split_out}")
        for k, tp in enumerate(taps):
            at = tp["t"]
            t_in = max(0.0, at - 0.14)
            t_out = at + 0.34
            rx = APP_X + tp["fx"] * APP_W - 44
            ry = APP_Y + tp["fy"] * APP_H - 44
            v.append(
                f"[traw{k}]fade=t=in:st={t_in:.2f}:d=0.12:alpha=1,"
                f"fade=t=out:st={t_out:.2f}:d=0.22:alpha=1[ring{k}]"
            )
            v.append(
                f"[{cur}][ring{k}]overlay=x={rx:.0f}:y={ry:.0f}:"
                f"enable='between(t\\,{t_in:.2f}\\,{t_out + 0.24:.2f})'[tp{k}]"
            )
            cur = f"tp{k}"

    for i in range(len(SEGMENTS)):
        a, b = starts[i], starts[i] + d[i]
        v.append(
            f"[{cards_in + i}:v]format=rgba,"
            f"fade=t=in:st={a:.2f}:d=0.32:alpha=1,"
            f"fade=t=out:st={b - 0.28:.2f}:d=0.28:alpha=1[c{i}]"
        )
        v.append(f"[{cur}][c{i}]overlay=x=38:y=220:enable='between(t\\,{a:.2f}\\,{b:.2f})'[cc{i}]")
        cur = f"cc{i}"

    v.append(f"[{cur}]null[vid]")
    graph = ";".join(v + filt)

    out_mp4 = OUT / "equal-care-pitch.mp4"
    cmd = [
        "ffmpeg", "-y", "-i", str(OUT / "screen.mp4"), *inputs,
        "-filter_complex", graph,
        "-map", "[vid]", "-map", "[aud]",
        "-t", f"{total:.2f}", "-r", "30",
        "-c:v", "libx264", "-preset", "medium", "-crf", "17", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart",
        str(out_mp4),
    ]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode:
        print(r.stderr[-3500:])
        sys.exit(1)

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
    lines = [
        "# Equal Care Across Finland — 2-Minute Pitch Transcript",
        "",
        f"> **Audio & Transcript Provenance:** Voice-over synthesized with **Gemini TTS** (`{TTS_MODEL}`, voice `{VOICE}`) "
        f"and automatically QA-transcribed verbatim with **Gemini** (`{QA_MODEL}`).",
        "> **Gemini Stack in the Product:**",
        "> 1. **Gemini Decisions API (`gemini-decision-1`)** — 771+ synthetic census resident archetypes (attendance + barriers, `r = 0.84`) & live counterfactual interventions (`src/residents.py`, `src/whatif.py`).",
        "> 2. **Gemini Decisions API** — Semantic matching & scoring (`0–3`) of barriers against all 73 National Cancer Strategy Roadmap actions (`src/matcher.py`).",
        "> 3. **Gemini Decisions API (`choice`)** — Step 4 care-pathway stage prioritisation from sourced county indicators (`src/focus.py`).",
        "> 4. **Gemini Text & Image (`gemini-2.5-flash` / `gemini-2.5-flash-image`)** — `{fact}`-placeholder executive briefing, 8-slide deck & Nordic editorial cover/scene illustrations (`src/report.py`), verified by `src/grounding.py`.",
        "",
    ]
    for s, x in zip(SEGMENTS, d):
        end = t + x - PAD
        lines.append(f"**{int(t // 60)}:{t % 60:04.1f} – {int(end // 60)}:{end % 60:04.1f} · {s['title'].replace(chr(10), ' ')}** _({s['badge']})_  ")
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
