"""Replay the recorded engine answers for one county: one row per resident archetype, ordered so a
step-through animation can reveal them, with cumulative people / rate / reasons after each row.

Every number traces back to a line in data/<engine>/*.jsonl — file and 1-based line are on each row.
Nothing is recomputed differently from simulate.py: the anchored county rate after the last row equals
the committed data/sim/<prog>.json county row exactly. Baseline replay makes zero engine calls; a
scenario replay first goes through whatif.whatif, which asks the engine only for answers not yet cached
(asked_live counts them) and raises Unavailable -> HTTP 503 when that is not possible.
"""
import json, sys
from pathlib import Path
import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
import population as pop
import residents as js
import simulate
import datastore as ds
import recommend as rec
import whatif as wi

ROOT = Path(__file__).resolve().parent.parent
REPLAY_PROGS = ("breast", "bowel")          # cervix is out of the story (weak validation, r = 0.24)

SEX = {"F": "Woman", "M": "Man"}
LANG_SHORT = {"fi": "Finnish", "sv": "Swedish", "en": "English"}
REASON_SHORT = {"time_work": "work / time", "distance": "distance", "language": "language",
                "private": "private care", "fear": "fear / discomfort", "no_need": "feels no need",
                "habit": "habit", "health_duty": "health duty"}


def _county_of():
    R = (ROOT / "data/regions.csv")
    import pandas as pd
    r = pd.read_csv(R, dtype=str)
    return dict(zip(r[r.level == "municipality"].code, r[r.level == "municipality"].county_code))


def _groups(prog, scenario, c, county_of, code):
    """simulate.frame filtered to the county, collapsed to one row per archetype key (w summed)."""
    E = simulate.frame(prog, scenario, c, county_of)
    E = E[E.county == code]
    return E.groupby(js.KEY, as_index=False).agg(
        w=("w", "sum"), p=("p", "first"), pa=("pa", "first"), reason=("reason", "first"),
        reasons=("reasons", "first"), akey=("akey", "first"))


def _line_index(path):
    """cache key -> 1-based line number inside one jsonl file."""
    idx = {}
    if path.exists():
        for i, line in enumerate(path.read_text().splitlines(), 1):
            idx[tuple(json.loads(line)["key"])] = i
    return idx


def _key_labels(k):
    d = dict(zip(js.KEY, k))
    return {**d, "sex_label": SEX.get(d["sex"], d["sex"]),
            "lang_label": js.LANG_EN[d["lang"]], "lang_short": LANG_SHORT.get(d["lang"], "another language"),
            "edu_label": pop.EDU[d["edu"]]}


def _files(*paths):
    out = []
    for p in paths:
        if p.exists():
            out.append({"path": str(p.relative_to(ROOT)), "answers": sum(1 for _ in p.open())})
    return out


def _row(k, g, akey, idx, file_rel, people, cum_people, cum_rate, extra=None):
    return {"key": _key_labels(k), "people": int(round(people)),
            "jev_attend": round(float(g["p"]), 4),
            "reason": g["reason"], "reason_label": js.REASONS.get(g["reason"]),
            "reason_short": REASON_SHORT.get(g["reason"]),
            "reasons": {r: round(float(x), 3) for r, x in (g["reasons"] or {}).items()},
            "borrowed": tuple(akey) != tuple(k), "answer_key": list(akey),
            "file": file_rel, "line": idx.get(tuple(akey)),
            "cum_people": cum_people, "cum_rate": cum_rate, **(extra or {})}


def replay(prog, code, scenarios=None, engine=None):
    e = engine or js.ENGINE
    if prog not in REPLAY_PROGS:
        raise KeyError(f"no resident replay for {prog!r}")
    scenarios = sorted(set(scenarios or []))
    unknown = [s for s in scenarios if s not in js.SCENARIOS or s == "baseline"]
    if unknown:
        raise KeyError(f"unknown scenario(s) {unknown}")
    county_of = _county_of()
    if code not in set(county_of.values()):
        raise KeyError(f"unknown county {code!r}")

    wres = None
    if scenarios:                                   # fills any missing combo answers (or raises Unavailable)
        wres = wi.whatif(prog, code, scenarios, engine=e)
    name = js.combo_name(scenarios) if scenarios else "baseline"

    c, _, _ = js.anchor_shift(prog, e)
    G0 = _groups(prog, "baseline", c, county_of, code)
    if not len(G0):
        raise KeyError(f"unknown county {code!r}")
    bpath = js.cache_path(prog, "baseline", e)
    bidx = _line_index(bpath)
    brel = str(bpath.relative_to(ROOT))

    s = rec._sim(prog)
    ind = js.PROGRAMMES[prog]["indicator"]
    v = ds.values(ind, "county")
    real = (v["values"].get(code) or {}).get("value")
    base = {"programme": prog, "code": code, "name": ds.short_names().get(code, code),
            "engine": js.engine_name(e), "mode": "scenario" if scenarios else "baseline",
            "scenarios_selected": scenarios,
            "anchor": {"logit_shift": round(c, 3),
                       "real_national": (s or {}).get("anchor", {}).get("real_national")},
            "validation": (s or {}).get("validation"),
            "note": f"Simulation · {rec.ENGINE_LABEL.get(js.engine_name(e), js.engine_name(e))}",
            "source": (s or {}).get("levels", {}).get("county", {}).get("source")}

    if not scenarios:
        rows, cum_w, cum_pa, skip, skip_tot = [], 0.0, 0.0, {}, 0.0
        for _, g in G0.sort_values("w", ascending=False).iterrows():
            k = tuple(g[js.KEY]); w = float(g.w)
            cum_w += w; cum_pa += float(g.pa) * w
            skip[g.reason] = skip.get(g.reason, 0.0) + (1 - float(g.pa)) * w
            skip_tot += (1 - float(g.pa)) * w
            rows.append(_row(k, g, g.akey, bidx, brel, w, int(round(cum_w)),
                             round(100 * cum_pa / cum_w, 2),
                             {"cum_reasons": {r: round(x / skip_tot, 3) for r, x in
                                              sorted(skip.items(), key=lambda kv: -kv[1])}}))
        base.update({"people_total": int(round(float(G0.w.sum()))), "rows": rows,
                     "files": _files(bpath), "asked_live": 0,
                     "final": {"rate": rows[-1]["cum_rate"] if rows else None, "real": real,
                               "national_real": v["national"], "target": v["target"]},
                     "reason_labels": js.REASONS, "reason_shorts": REASON_SHORT})
        return base

    # scenario: compare baseline vs combo anchored p cell by cell (per key group), keep the changed groups
    spath = js.cache_path(prog, name, e)
    sidx = _line_index(spath)
    G1 = _groups(prog, name, c, county_of, code)
    M = G0.merge(G1[js.KEY + ["p", "pa", "reason", "reasons", "akey"]], on=js.KEY, suffixes=("", "_new"))
    M = M[M.pa_new != M.pa]
    W = float(G0.w.sum()); base_sum = float((G0.pa * G0.w).sum())
    rows, cum_w, cum_d = [], 0.0, 0.0
    for _, g in M.sort_values("w", ascending=False).iterrows():
        k = tuple(g[js.KEY]); w = float(g.w)
        cum_w += w; cum_d += (float(g.pa_new) - float(g.pa)) * w
        akey = tuple(g.akey_new) if g.akey_new else tuple(k)
        in_combo = akey in sidx
        rows.append(_row(k, {"p": g.p_new, "reason": g.reason_new, "reasons": g.reasons_new}, akey,
                         sidx if in_combo else bidx,
                         str((spath if in_combo else bpath).relative_to(ROOT)), w, int(round(cum_w)),
                         round(100 * (base_sum + cum_d) / W, 2),
                         {"jev_attend_before": round(float(g.p), 4)}))
    base.update({"people_total": int(round(float(M.w.sum()))), "rows": rows,
                 "files": _files(spath, bpath), "asked_live": wres["asked_live"],
                 "final": {"rate": wres["new_rate"], "real": real,
                           "national_real": v["national"], "target": v["target"],
                           "baseline_rate": wres["baseline_rate"]},
                 "reason_labels": js.REASONS, "reason_shorts": REASON_SHORT,
                 "whatif": wres})
    return base


def answer(prog, key, scenarios=None, engine=None):
    """The exact state and questions sent to the engine for one recorded answer, plus the raw cache line."""
    e = engine or js.ENGINE
    if prog not in REPLAY_PROGS:
        raise KeyError(f"no resident replay for {prog!r}")
    scenarios = sorted(set(scenarios or []))
    unknown = [s for s in scenarios if s not in js.SCENARIOS or s == "baseline"]
    if unknown:
        raise KeyError(f"unknown scenario(s) {unknown}")
    key = tuple(key)
    if len(key) != len(js.KEY):
        raise KeyError("key must have the archetype fields")
    name = js.combo_name(scenarios) if scenarios else "baseline"
    candidates = [js.cache_path(prog, name, e)] if scenarios else []
    candidates.append(js.cache_path(prog, "baseline", e))
    for path in candidates:
        if not path.exists():
            continue
        for i, line in enumerate(path.read_text().splitlines(), 1):
            r = json.loads(line)
            if tuple(r["key"]) == key:
                st = js.state(key, prog, name)
                if e == "jev":
                    qs = {k: v.model_dump(exclude_none=True) for k, v in js._questions_jev(prog).items()}
                else:
                    qs = js._questions_gemini(prog)
                return {"state": st, "questions": qs, "answer": r,
                        "file": str(path.relative_to(ROOT)), "line": i}
    raise KeyError("answer not in cache")
