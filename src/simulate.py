"""Turn Jev answers into the numbers the app shows, and save them (data/sim/<programme>.json, committed).

Usage: python src/simulate.py [breast cervix bowel] [--scenarios]   (--scenarios asks Jev for the what-if runs first)

For each programme, county and municipality:
- real:      attendance from Sotkanet (data)
- expected:  what the simulated residents predict from who lives there (age, sex, language, education, activity,
             settlement, municipality size), anchored so Finland matches the real national rate (simulation)
- composition_gap = expected - national: how far the county should sit from Finland given its population alone
- other_gap       = (real - national) - composition_gap: the part of the gap its population does NOT explain,
                    i.e. where local services, access or organisation are the likelier cause
- reasons:   share of eligible people by Jev's main reason (among those the simulation expects to skip)
- scenarios: change of the expected rate when one fact changes (own-language invitation, evening slots, SMS
             reminder, mobile unit) and the extra people per year that means, using the real number invited
"""
import json, sys
from pathlib import Path
import numpy as np, pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
import jev_sim as js
import datastore as ds

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data/sim"

# which archetypes a scenario can change; the others keep their baseline answer (fewer calls, same result)
TARGETS = {
    "own_language": lambda r: r["lang"] not in ("fi", "sv"),
    "evening_slots": lambda r: r["activity"] == "employed",
    "sms_reminder": lambda r: True,
    "mobile_unit": lambda r: r["settlement"] == "sparsely populated area" or r["muni_type"] == "small municipality under 10 000",
}


def anchored(E, c):
    lg = np.log(E.p.clip(1e-3, 1 - 1e-3) / (1 - E.p.clip(1e-3, 1 - 1e-3)))
    return 1 / (1 + np.exp(-(lg + c)))


def frame(prog, scenario, c, county_of):
    E = js.answers(prog, scenario); E = E[E.p.notna()].copy()
    E["pa"] = anchored(E, c); E["county"] = E.muni.map(county_of)
    return E


def rate(E, by):
    g = E.assign(x=E.pa * E.w).groupby(by).agg(x=("x", "sum"), w=("w", "sum"))
    return (100 * g.x / g.w).round(2)


def summarise(prog, scenarios=True):
    P = js.PROGRAMMES[prog]; ind = P["indicator"]
    R = pd.read_csv(ROOT / "data/regions.csv", dtype=str)
    county_of = dict(zip(R[R.level == "municipality"].code, R[R.level == "municipality"].county_code))
    c, target, raw = js.anchor_shift(prog)
    E = frame(prog, "baseline", c, county_of)
    nat_sim = 100 * float(np.average(E.pa, weights=E.w))
    out = {"programme": prog, "indicator": ind, "label": ds.BY_KEY[ind].label, "anchor": {"logit_shift": round(c, 3),
           "raw_national": round(100 * raw, 1), "real_national": round(100 * target, 1)},
           "validation": js.validate(prog)[0], "levels": {}}
    out["validation"].pop("source", None)
    for level, by in (("county", "county"), ("municipality", "muni")):
        real = ds.values(ind, level)
        exp = rate(E, by)
        skip = E.assign(s=(1 - E.pa) * E.w)
        reasons = (skip.groupby([by, "reason"]).s.sum() / skip.groupby(by).s.sum()).round(3)
        rows = {}
        for code, e in exp.items():
            rv = real["values"].get(code)
            r = {"expected": float(e), "composition_gap": round(float(e) - nat_sim, 2),
                 "reasons": {k: float(v) for k, v in reasons[code].sort_values(ascending=False).items()} if code in reasons.index.get_level_values(0) else {}}
            if rv:
                r["real"] = rv["value"]; r["attended"] = rv["abs_value"]
                r["invited"] = round(rv["abs_value"] * 100 / rv["value"]) if rv["abs_value"] and rv["value"] else None
                r["other_gap"] = round(rv["value"] - real["national"] - r["composition_gap"], 2) if real["national"] else None
            rows[code] = r
        out["levels"][level] = {"year": real["year"], "national_real": real["national"], "national_expected": round(nat_sim, 2),
                                "rows": rows, "source": real["source"]}
    out["scenarios"] = {}
    if scenarios:
        for sc, label in ((k, v["label"]) for k, v in js.SCENARIOS.items() if k != "baseline"):
            if not js.read_cache(js.cache_path(prog, sc)):
                continue
            S = frame(prog, sc, c, county_of)
            res = {"label": label, "levels": {}}
            for level, by in (("county", "county"), ("municipality", "muni")):
                base, new = rate(E, by), rate(S, by)
                rows = {}
                for code in base.index:
                    d = float(new.get(code, base[code]) - base[code])
                    inv = out["levels"][level]["rows"].get(code, {}).get("invited")
                    rows[code] = {"delta_points": round(d, 2), "extra_people_per_year": round(d / 100 * inv) if inv else None}
                res["levels"][level] = rows
            res["national_delta_points"] = round(100 * float(np.average(S.pa, weights=S.w)) - nat_sim, 2)
            out["scenarios"][sc] = res
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / f"{prog}.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")))
    return out


def main():
    args = sys.argv[1:]
    progs = [a for a in args if a in js.PROGRAMMES] or list(js.PROGRAMMES)
    for prog in progs:
        if "--scenarios" in args:
            for sc, f in TARGETS.items():
                js.run(prog, sc, only=f)
        o = summarise(prog)
        v = o["validation"]
        print(f"\n{prog}: municipalities r={v['municipalities']['r']} (n={v['municipalities']['n']}), counties r={v['counties_weighted']['r']}")
        rows = o["levels"]["county"]["rows"]; names = ds.short_names()
        print("  county             real  expected  composition_gap  other_gap")
        for code, r in sorted(rows.items(), key=lambda kv: kv[1].get("real", 99))[:8]:
            print(f"  {names.get(code, code)[:18]:18s} {r.get('real', '-'):>5} {r['expected']:>9} {r['composition_gap']:>16} {r.get('other_gap', '-'):>10}")
        for sc, s in o["scenarios"].items():
            tot = sum(x["extra_people_per_year"] or 0 for x in s["levels"]["county"].values())
            print(f"  scenario {sc:14s} Finland {s['national_delta_points']:+.2f} pts, ~{tot:,} more people per year")


if __name__ == "__main__":
    main()
