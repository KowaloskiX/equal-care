"""Checks for src/report.py.

Offline tests (no key needed):    .venv/bin/python src/check_report.py
Plus one real Gemini call:        .venv/bin/python src/check_report.py --live
"""
import json, sys, time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import report as rp


def test_fmt():
    assert rp.fmt(2201, "people per year") == "2 201", rp.fmt(2201, "people per year")
    assert rp.fmt(74.3, "%") == "74.3 %"
    assert rp.fmt(80.0, "%") == "80 %"
    assert rp.fmt(2024, "year") == "2024"
    assert rp.fmt(0.84, "r") == "0.84"
    assert rp.fmt(-2.82, "percentage points") == "-2.8"
    assert rp.fmt("1.3.1", "id") == "1.3.1"


def test_render():
    facts = {"x_rate": {"value": 74.3, "unit": "%", "kind": "DATA"},
             "x_missing": {"value": 2201, "unit": "people per year", "kind": "DATA"}}
    flags = []
    out = rp.render_text("Attendance is {x_rate}; {x_missing} people a year are missing.", facts, "t", flags)
    assert out == "Attendance is 74.3 %; 2 201 people a year are missing.", out
    assert flags == []
    flags = []
    out = rp.render_text("See {nope}.", facts, "t", flags)
    assert out == "See {nope}." and flags and "unknown" in flags[0]["issue"], (out, flags)


def test_digit_flag():
    assert rp.digits_outside("Rate {c90_breast_real} in {c90_breast_year}") == []
    assert rp.digits_outside("Rate was 74 % in {c90_breast_year}") == ["7", "4"]
    flags = []
    rp.render_text("About 2 000 women", {}, "slides[0].bullets[0]", flags)
    assert flags and flags[0]["issue"] == "digit outside a placeholder", flags
    raw = {"title": "T", "subtitle": "S", "executive_summary": "In 2024 ...",
           "slides": [{"kind": "title", "headline": "H", "bullets": [], "speaker_notes": "", "fact_refs": []}] * 6,
           "recommendations": [{"text": "Do it.", "action_ref": "a1_3_1_id"}]}
    _, flags = rp.render(raw, {"a1_3_1_id": {"value": "1.3.1", "unit": "id", "kind": "ROADMAP"}})
    issues = [f["issue"] for f in flags]
    assert "digit outside a placeholder" in issues, issues
    assert any("roadmap action id and page" in i for i in issues), issues


def test_parse_items():
    assert rp.parse_items("breast:90,bowel:07:own_language+sms_reminder") == [
        {"prog": "breast", "code": "90", "scenarios": []},
        {"prog": "bowel", "code": "07", "scenarios": ["own_language", "sms_reminder"]}]


def test_facts():
    items = rp.validate_items(rp.parse_items("breast:90,bowel:07,breast:90:own_language+sms_reminder"))
    facts, ctx, notes = rp.build_facts(items)
    assert facts["limitations"] == rp.LIMITATIONS
    missing = [k for k, f in facts.items() if k != "limitations" and not f.get("source")]
    assert not missing, f"facts without source: {missing}"
    kinds = {f["kind"] for k, f in facts.items() if k != "limitations"}
    assert kinds <= {"DATA", "MODEL", "SIMULATION", "ROADMAP"}, kinds
    assert "c90_breast_real" in facts and "c07_bowel_real" in facts
    payload = rp.model_input(facts, ctx)
    assert all("source" not in f for f in payload["facts"].values())
    for t in payload["limitations"]:
        assert not rp.digits_outside(t), t
    print(f"  facts: {len(facts) - 1} keys, kinds {sorted(kinds)}; notes: {notes}")
    return facts


def live():
    items = [{"prog": "breast", "code": "90"}, {"prog": "bowel", "code": "07"}]
    t0 = time.time()
    out = rp.report(items, with_image=True)
    print("model:", out["model"], "|", out.get("model_note"))
    print("usage:", out["usage"], "| text latency", out["latency_s"], "s | total", round(time.time() - t0, 1), "s")
    img = out.get("image") or {}
    print("image:", img.get("model"), "ok" if img.get("image") else f"none ({img.get('error')})", img.get("latency_s"))
    print("\nRAW summary:\n", out["raw"]["executive_summary"])
    print("\nRENDERED summary:\n", out["report"]["executive_summary"])
    print("\nslides:", [s["kind"] for s in out["report"]["slides"]])
    print("recommendations:", [(r["text"], (r.get("action") or {}).get("id")) for r in out["report"]["recommendations"]])
    print("\nflags:", json.dumps(out["flags"], indent=1, ensure_ascii=False))


if __name__ == "__main__":
    for t in (test_fmt, test_render, test_digit_flag, test_parse_items, test_facts):
        t(); print("ok", t.__name__)
    if "--live" in sys.argv:
        live()
