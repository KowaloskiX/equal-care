"""Step 4 focus decision: which pathway stage should this county address first?

One Gemini Decisions `choice` per county + programme — a typed pick over the five pathway stages,
grounded in the county's real statistics (the engine only ranks; every number in the state comes
from datastore.py). Not a forecast and not a diagnosis — a labelled prioritisation aid, SIMULATION.

Cache (committed, so the demo needs no key): data/decisions/focus/<prog>_<code>.json
Usage: python src/focus.py breast 90        ask (cached) and print the pick
"""
import json, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import budget
import datastore as ds
import residents as js

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "data/decisions/focus"
PROG_SCREEN = {"breast": "screen_breast", "bowel": "screen_bowel"}
PROG_SURV = {"breast": "surv_breast", "bowel": "surv_bowel"}

STAGE_CRITERIA = {
    "detection": "People invited to the free public screening do not attend — attendance below the 80 % national target",
    "referral": "Referrals to specialised care take too long — oncology referrals processed in over 21 days, or long waits for specialised care",
    "diagnosis": "Stage at diagnosis is not published per county — a measurement gap hiding how early cancers are found",
    "treatment": "Cancer patients wait too long for treatment — share of oncology patients waiting over 90 days",
    "outcome": "Five-year relative cancer survival below the national level",
}

QUESTION = {"focus": {"type": "choice",
                      "instructions": "You advise a Finnish wellbeing services county on equal cancer care. "
                                      "Given each pathway stage's real statistics for this county versus Finland, "
                                      "which single stage should the county address first to reduce inequality?",
                      "criteria": STAGE_CRITERIA}}


def focus_state(prog, code):
    """The facts the engine sees: per-stage county value vs Finland, with denominators. All datastore numbers."""
    p = ds.pathway(code)
    ind = {i["key"]: i for i in p["indicators"]}

    def pct(key):
        i = ind.get(key)
        return None if not i or i["value"] is None else {
            "county": i["value"], "finland": i["national"], "unit": i["unit"],
            **({"patients": i["abs_value"], "note": "small numbers"} if i.get("abs_is_denominator") and i.get("abs_value") else {})}

    scr = pct(PROG_SCREEN[prog])
    state = {"county": p["name"], "programme": prog,
             "stages": {
                 "detection": scr and {**scr, "target_pct": 80.0},
                 "referral": {"oncology_referrals_over_21_days_pct": pct("onc_ref_21"),
                              "waited_over_6_months_specialist_per_10000": pct("wait_6m")},
                 "diagnosis": {"stage_at_diagnosis": "not published per county (measurement gap)"},
                 "treatment": {"oncology_patients_waiting_over_90_days_pct": pct("onc_wait_90")},
                 "outcome": {"five_year_relative_survival_pct": pct(PROG_SURV[prog])}}}
    return state


def focus(prog, code, engine=None, ip=None):
    """The engine's stage pick for one county: {top, probabilities, confidence} — cached, labelled simulation."""
    e = engine or js.ENGINE
    if prog not in PROG_SCREEN:
        raise KeyError(f"no focus decision for {prog!r}")
    if code not in set(ds.values(PROG_SCREEN[prog], "county")["values"]):
        raise KeyError(f"unknown county {code!r}")
    path = CACHE / f"{prog}_{code}.json"
    if path.exists():
        return {**json.loads(path.read_text()), "asked_live": 0}

    budget.take("decisions", ip)            # one live call — charged only on a cache miss
    state = focus_state(prog, code)
    if e == "jev":
        from typesafe_sdk import Choice, TypeSafeClient
        q = {"focus": Choice(instructions=QUESTION["focus"]["instructions"], criteria=STAGE_CRITERIA)}
        r = TypeSafeClient(timeout=40.0).system_one(state=state, questions=q)
        ch = r.choices["focus"]
        answer = {"choice": ch.choice, "probabilities": ch.probabilities}
    else:
        from google import genai
        client = genai.Client(http_options={"api_version": "v1beta"})
        r = client.decisions.create(model=js.MODEL,
                                    input=[{"type": "text", "text": json.dumps(state, ensure_ascii=False)}],
                                    questions=QUESTION)
        a = r.answers["focus"]
        answer = {"choice": a.choice, "probabilities": a.probabilities, "confidence": getattr(a, "confidence", None)}
    out = {"programme": prog, "code": code, "engine": js.engine_name(e), "state": state, "answer": answer}
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(out))
    return {**out, "asked_live": 1}


def main():
    prog, code = (sys.argv + ["breast", "90"])[1:3]
    f = focus(prog, code)
    probs = sorted(f["answer"]["probabilities"].items(), key=lambda kv: -kv[1])
    print(f"{f['state']['county']} · {prog} · {f['engine']} · asked_live={f['asked_live']}")
    for s, p in probs:
        print(f"  {s:<10} {round(p * 100):>3} %")


if __name__ == "__main__":
    main()
