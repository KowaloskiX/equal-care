"""Jev (TypeSafe System One) answers for synthetic residents: will this person take part in cancer screening, and why not?

Ported from krakow-sim (src/jev_sim.py, src/archetypes.py). Same rules:
- state = a small English JSON of facts about one person + the situation; no numbers for the model to compare
- typed questions (Noul = probability, Choice = distribution over reasons); no free text, no parsing
- archetypes: residents with the same decision-relevant traits share one Jev answer, so ~1-3 thousand calls cover Finland
- arithmetic in code: totals, municipality rates and the anchor are computed here, never by a model

Usage:
  python src/jev_sim.py breast                       ask every archetype (cached), validate against Sotkanet
  python src/jev_sim.py breast --scenario own_language
  python src/jev_sim.py breast --dry-run             print one request, no calls
Cache (committed, so the demo needs no API key): data/jev/<programme>_<scenario>_<hash>.jsonl
Key: TYPESAFE_API_KEY in .env. Price: $0.042 per million input tokens, output free.
"""
import argparse, asyncio, hashlib, json, os, sys
from pathlib import Path
import numpy as np, pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
import population as pop
import datastore as ds

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "data/jev"
PRICE_PER_MTOK = 0.042
KEY = ["sex", "age5", "settlement", "lang", "edu", "activity", "muni_type"]
MIN_PEOPLE = 15          # archetypes standing for fewer people borrow the answer of a coarser archetype (see fallback)

# ASSUMPTION: target ages and how the invitation works, per the national programmes in 2024 (THL / Finnish Cancer
# Registry). Breast 50-69 (extension to 74 is being phased in), cervical 30-64 (programme runs to 65), colorectal 56-74
# (rolled out from 2022; the 55-59 band stands in for 56-59).
PROGRAMMES = {
    "breast": {"indicator": "screen_breast", "sex": ["F"], "ages": ["50-54", "55-59", "60-64", "65-69"],
               "invitation": "a letter inviting her to the free public breast cancer screening (mammography). The letter gives a "
                             "pre-booked appointment time on a weekday, which can be changed by phone or online. Screening is every two years.",
               "action": "goes to the mammography appointment"},
    "cervix": {"indicator": "screen_cervix", "sex": ["F"], "ages": ["30-34", "35-39", "40-44", "45-49", "50-54", "55-59", "60-64"],
               "invitation": "a letter inviting her to the free public cervical cancer screening (a sample taken by a nurse). "
                             "She has to book the appointment herself. Screening is every five years.",
               "action": "books and goes to the screening appointment"},
    "bowel": {"indicator": "screen_bowel", "sex": ["F", "M"], "ages": ["55-59", "60-64", "65-69", "70-74"],
              "invitation": "a free home test kit for colorectal cancer screening sent by post: take a small stool sample at home and "
                            "post it back in the prepaid envelope. Screening is every two years.",
              "action": "takes the home test and posts it back"},
}
# ASSUMPTION: invitations are sent in Finnish or Swedish. Scenarios change one fact of the situation each; they are
# what-if estimates, shown as simulation, never as data.
SCENARIOS = {
    "baseline": {},
    "own_language": {"label": "Invitation and reminder in the person's own language",
                     "language_of_invitation": "the person's own native language, with a phone number for questions in that language"},
    "evening_slots": {"label": "Evening and Saturday appointments",
                      "appointment_times": "evening and Saturday appointment times are available as well as weekday ones"},
    "sms_reminder": {"label": "SMS reminder with one-tap rebooking",
                     "reminder": "a text message reminder a few days before, with a link to change the time in one tap"},
    "mobile_unit": {"label": "Mobile screening unit in the person's own village or district",
                    "location": "a mobile screening unit parks within a 10-minute trip from home on the appointment day"},
}
REASONS = {"time_work": "work, family duties or lack of time", "distance": "travel distance or travel time",
           "language": "understanding the invitation or the language", "private": "uses private or occupational health care instead",
           "fear": "fear, embarrassment, pain or discomfort", "no_need": "feels healthy and sees no need",
           "habit": "routine: always takes part when invited", "health_duty": "sense of responsibility for own health"}
LANG_EN = {"fi": "Finnish", "sv": "Swedish", "ru": "Russian", "et": "Estonian", "ar": "Arabic", "so": "Somali", "en": "English",
           "other": "another foreign language (not Finnish or Swedish)"}


def load_env():
    p = ROOT / ".env"
    if p.exists():
        for line in p.read_text().splitlines():
            if "=" in line and not line.lstrip().startswith("#"):
                k, v = line.split("=", 1); os.environ.setdefault(k.strip(), v.strip().strip("\"'"))


def eligible(prog):
    P = PROGRAMMES[prog]; C = pop.cells()
    return C[C.sex.isin(P["sex"]) & C.age5.isin(P["ages"])]


def state(key, prog, scenario="baseline"):
    k = dict(zip(KEY, key)); P = PROGRAMMES[prog]; S = SCENARIOS[scenario]
    person = {"age": k["age5"], "gender": "female" if k["sex"] == "F" else "male", "lives_in": f"Finland, {k['muni_type']}",
              "home_area": k["settlement"], "native_language": LANG_EN[k["lang"]], "education": pop.EDU[k["edu"]],
              "main_activity": k["activity"]}
    if k["activity"] == "employed":
        person["health_care"] = "has occupational health care through the employer"   # ASSUMPTION: most employees in Finland do
    situation = {"received": P["invitation"], "language_of_invitation": "Finnish and Swedish"}
    situation.update({x: y for x, y in S.items() if x != "label"})
    return {"person": person, "situation": situation}


def questions(prog):
    from typesafe_sdk import Choice, Noul
    P = PROGRAMMES[prog]
    return {"attend": Noul(instructions=f"This person {P['action']} this time.",
                           criteria={"true": "takes part this round", "false": "does not take part this round"}),
            "reason": Choice(instructions="Which single factor matters most for this person's decision about this screening?",
                             criteria=REASONS)}


def archetypes(prog):
    E = eligible(prog)
    A = E.groupby(KEY, as_index=False).w.sum()
    return A.sort_values("w", ascending=False).reset_index(drop=True)


def fallback(key):
    """Coarser versions of an archetype, tried in order when it has too few people to be asked on its own."""
    k = dict(zip(KEY, key))
    if k["lang"] not in ("fi", "sv", "other"):
        yield tuple({**k, "lang": "other"}[c] for c in KEY)
    for f, v in (("muni_type", "town of 10 000-50 000"), ("edu", "3_4"), ("settlement", "urban settlement"), ("activity", "employed")):
        k = {**k, f: v}
        yield tuple(k[c] for c in KEY)


def cache_path(prog, scenario):
    from typesafe_sdk import Noul  # noqa: F401  (import check)
    qjson = json.dumps({k: v.model_dump(exclude_none=True) for k, v in questions(prog).items()}, sort_keys=True)
    ref = json.dumps(state(tuple(archetypes(prog).iloc[0][KEY]), prog, scenario), sort_keys=True)
    tag = hashlib.sha1((qjson + ref).encode()).hexdigest()[:8]
    return CACHE / f"{prog}_{scenario}_{tag}.jsonl"


def read_cache(path):
    if not path.exists():
        return {}
    out = {}
    for line in path.read_text().splitlines():
        r = json.loads(line); out[tuple(r["key"])] = r
    return out


async def ask(items, prog, path, conc=40):
    from typesafe_sdk import AsyncTypeSafeClient, TypeSafeError
    qs = questions(prog); sem = asyncio.Semaphore(conc); stats = {"done": 0, "tokens": 0, "errors": 0}
    path.parent.mkdir(parents=True, exist_ok=True)
    async with AsyncTypeSafeClient(timeout=40.0) as client:
        with path.open("a") as f:
            async def one(key, st):
                async with sem:
                    try:
                        r = await client.system_one(state=st, questions=qs)
                    except TypeSafeError as e:
                        stats["errors"] += 1
                        if stats["errors"] <= 3: print("  !", type(e).__name__, str(e)[:120])
                        return
                row = {"key": list(key), "attend": r.nouls["attend"].noul, "reason": r.choices["reason"].choice,
                       "reasons": r.choices["reason"].probabilities}
                f.write(json.dumps(row) + "\n"); stats["done"] += 1
                stats["tokens"] += r.usage.input_tokens if r.usage else 0
                if stats["done"] % 250 == 0: print(f"  {stats['done']}/{len(items)}", flush=True); f.flush()
            await asyncio.gather(*(one(k, s) for k, s in items))
    print(f"  done {stats['done']}, errors {stats['errors']}, input tokens {stats['tokens']:,} ≈ ${stats['tokens'] * PRICE_PER_MTOK / 1e6:.3f}")


def run(prog, scenario="baseline", dry=False, conc=40, only=None):
    """Ask Jev for every archetype that has MIN_PEOPLE+ people (and, for scenarios, only those `only` selects)."""
    A = archetypes(prog)
    asked = A[A.w >= MIN_PEOPLE]
    if only is not None:
        asked = asked[asked.apply(only, axis=1)]
    path = cache_path(prog, scenario); have = read_cache(path)
    todo = [(tuple(r[KEY]), state(tuple(r[KEY]), prog, scenario)) for _, r in asked.iterrows() if tuple(r[KEY]) not in have]
    print(f"{prog}/{scenario}: {len(A)} archetypes, {len(asked)} asked ({asked.w.sum() / A.w.sum():.1%} of people), "
          f"{len(have)} cached, {len(todo)} to ask")
    if dry or not todo:
        if dry and todo: print(json.dumps({"state": todo[0][1], "questions": {k: v.model_dump(exclude_none=True) for k, v in questions(prog).items()}}, indent=1))
        return path
    load_env()
    if not os.environ.get("TYPESAFE_API_KEY"):
        sys.exit("TYPESAFE_API_KEY missing in .env")
    asyncio.run(ask(todo, prog, path, conc))
    return path


def answers(prog, scenario="baseline"):
    """Every eligible cell with its Jev probability (own archetype or the nearest coarser one that was asked)."""
    E = eligible(prog).copy()
    base = read_cache(cache_path(prog, "baseline"))
    got = {**base, **read_cache(cache_path(prog, scenario))} if scenario != "baseline" else base
    memo = {}
    def look(key):
        if key in memo: return memo[key]
        r = got.get(key)
        if r is None:
            r = next((got[k] for k in fallback(key) if k in got), None)
        memo[key] = r
        return r
    rows = [look(k) for k in E[KEY].itertuples(index=False, name=None)]
    E["p"] = [r["attend"] if r else np.nan for r in rows]
    E["reason"] = [r["reason"] if r else None for r in rows]
    return E


def anchor_shift(prog):
    """One logit shift c per programme so that the national attendance equals Sotkanet's national rate.
    It fixes Jev's overall level and leaves the ranking of people and municipalities unchanged."""
    E = answers(prog, "baseline"); E = E[E.p.notna()]
    target = ds.values(PROGRAMMES[prog]["indicator"], "country")["values"][ds.COUNTRY]["value"] / 100
    lg = np.log(E.p.clip(1e-3, 1 - 1e-3) / (1 - E.p.clip(1e-3, 1 - 1e-3)))
    lo, hi = -10.0, 10.0
    for _ in range(60):
        c = (lo + hi) / 2; m = np.average(1 / (1 + np.exp(-(lg + c))), weights=E.w)
        lo, hi = (c, hi) if m < target else (lo, c)
    return c, target, float(np.average(E.p, weights=E.w))


def by_municipality(prog, scenario="baseline", anchored=True):
    E = answers(prog, scenario); E = E[E.p.notna()]
    if anchored:
        c, _, _ = anchor_shift(prog)
        lg = np.log(E.p.clip(1e-3, 1 - 1e-3) / (1 - E.p.clip(1e-3, 1 - 1e-3))); E["p"] = 1 / (1 + np.exp(-(lg + c)))
    E["pw"] = E.p * E.w
    M = E.groupby("muni").agg(pw=("pw", "sum"), w=("w", "sum"))
    M["sim"] = 100 * M.pw / M.w
    return M


def validate(prog):
    """Simulated vs real attendance (Sotkanet, latest year) by municipality and by county."""
    ind = PROGRAMMES[prog]["indicator"]; M = by_municipality(prog)
    real = ds.values(ind, "municipality")
    R = pd.DataFrame([{"muni": c, "real": v["value"], "name": v["name"], "attended": v["abs_value"]} for c, v in real["values"].items()])
    J = M.join(R.set_index("muni"), how="inner")
    big = J[J.attended >= 300]   # rates of tiny municipalities are noisy (few dozen invitees)
    _, _, Rr = ds.frames()[0], None, None
    regions = pd.read_csv(ROOT / "data/regions.csv", dtype=str)
    cmap = dict(zip(regions[regions.level == "municipality"].code, regions[regions.level == "municipality"].county_code))
    J["county"] = J.index.map(cmap)
    Cty = J.assign(pr=J.real * J.w, ps=J.sim * J.w).groupby("county").agg(pr=("pr", "sum"), ps=("ps", "sum"), w=("w", "sum"))
    Cty["real"], Cty["sim"] = Cty.pr / Cty.w, Cty.ps / Cty.w
    c, target, raw = anchor_shift(prog)
    out = {"programme": prog, "year": real["year"], "raw_national": round(100 * raw, 1), "real_national": round(100 * target, 1),
           "anchor_logit_shift": round(c, 2),
           "municipalities": {"n": len(J), "r": round(J.sim.corr(J.real), 2), "mae": round(float((J.sim - J.real).abs().mean()), 1)},
           "municipalities_300plus": {"n": len(big), "r": round(big.sim.corr(big.real), 2)},
           "counties_weighted": {"n": len(Cty), "r": round(Cty.sim.corr(Cty.real), 2)},
           "source": real["source"]}
    return out, J


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("programme", choices=list(PROGRAMMES))
    ap.add_argument("--scenario", default="baseline", choices=list(SCENARIOS))
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--concurrency", type=int, default=40)
    a = ap.parse_args()
    run(a.programme, a.scenario, a.dry_run, a.concurrency)
    if a.dry_run:
        return
    if a.scenario == "baseline":
        v, J = validate(a.programme)
        print(json.dumps(v, indent=1, ensure_ascii=False))
        print("\nlargest municipalities, real vs simulated:")
        print(J.sort_values("attended", ascending=False).head(12)[["name", "real", "sim"]].round(1).to_string())
        E = answers(a.programme)
        print("\nmain reason (share of people):\n" + (E.groupby("reason").w.sum() / E.w.sum()).round(3).sort_values(ascending=False).to_string())


if __name__ == "__main__":
    main()
