"""Live what-if: combined interventions over the simulated residents, computed per county on request.

The archetype cache is national, so asking for a county only needs the archetypes that occur among that county's
eligible residents. Cached combos answer instantly; uncached ones trigger real engine calls (Jev by default) that are
appended to the same data/<engine>/<prog>_<a+b>_<hash>.jsonl cache, so every live run also pre-warms later requests.

County arithmetic reuses simulate.py's anchor and aggregation, so a single-scenario what-if reproduces the county
row in data/sim/<prog>.json exactly. Answers are never invented: without an API key and missing answers this raises
Unavailable, which the API turns into HTTP 503.
"""
import asyncio, os
from pathlib import Path
import pandas as pd

import residents as js
import simulate
import datastore as ds
import recommend as rec

ROOT = Path(__file__).resolve().parent.parent


class Unavailable(Exception):
    """The combo needs new engine answers but the engine's API key is not configured."""


def _county_map():
    R = pd.read_csv(ROOT / "data/regions.csv", dtype=str)
    return dict(zip(R[R.level == "municipality"].code, R[R.level == "municipality"].county_code))


def _county_frame(prog, scenario, c, county_of, code):
    E = simulate.frame(prog, scenario, c, county_of)
    return E[E.county == code]


def whatif(prog, code, scenarios, engine=None, cache_only=False):
    """cache_only=True -> return None instead of asking when the combo is not fully cached
    (used to attach the other engine's cached result without ever calling it live)."""
    e = engine or js.ENGINE
    scenarios = sorted(set(scenarios))
    if prog not in js.PROGRAMMES:
        raise KeyError(f"unknown programme {prog!r}")
    unknown = [s for s in scenarios if s not in js.SCENARIOS or s == "baseline"]
    if unknown:
        raise KeyError(f"unknown scenario(s) {unknown}")
    if not scenarios:
        raise KeyError("no scenarios selected")
    name = js.combo_name(scenarios)

    # archetypes that occur among this county's eligible residents and that at least one scenario can change
    county_of = _county_map()
    E0 = js.eligible(prog)
    in_county = {tuple(k) for k, m in zip(E0[js.KEY].itertuples(index=False, name=None), E0.muni)
               if county_of.get(m) == code}
    if not in_county:
        raise KeyError(f"unknown county {code!r}")
    A = js.archetypes(prog)
    affected = A.apply(lambda r: any(simulate.TARGETS[s](r) for s in scenarios), axis=1)
    asked = A[(A.w >= js.MIN_PEOPLE) & affected & A[js.KEY].apply(tuple, axis=1).isin(in_county)]

    path = js.cache_path(prog, name, e)
    have = js.read_cache(path)
    todo = [(tuple(r[js.KEY]), js.combo_state(tuple(r[js.KEY]), prog, scenarios, e))
            for _, r in asked.iterrows() if tuple(r[js.KEY]) not in have]
    asked_live = len(todo)
    if todo:
        if cache_only:
            return None
        if not os.environ.get(js.API_KEY[e]):
            raise Unavailable(f"{len(todo)} archetype answers are not cached and {js.API_KEY[e]} is not set")
        asyncio.run(js.ask(todo, prog, path, engine=e))

    c, _, _ = js.anchor_shift(prog, e)
    base = _county_frame(prog, "baseline", c, county_of, code)
    new = _county_frame(prog, name, c, county_of, code)
    wb, wn = base.w.sum(), new.w.sum()
    base_rate = 100 * float((base.pa * base.w).sum() / wb) if wb else None
    new_rate = 100 * float((new.pa * new.w).sum() / wn) if wn else None
    # simulate.py rounds each rate to 2 decimals before differencing; do the same so a single scenario
    # reproduces the county row in data/sim/<prog>.json exactly.
    delta = round(new_rate, 2) - round(base_rate, 2) if base_rate is not None and new_rate is not None else None

    gap = ds.screening_gap(js.PROGRAMMES[prog]["indicator"], code)
    invited = gap["invited"] if gap else None
    extra = round(delta / 100 * invited) if delta is not None and invited else None
    share = round(100 * extra / gap["missing_per_year"], 1) if extra and gap and gap["missing_per_year"] else None

    s = rec._sim(prog)
    validation = s["validation"] if s else None
    by_id = rec._actions_by_id()
    engine_label = rec.ENGINE_LABEL.get(js.engine_name(e), js.engine_name(e))
    out = {"programme": prog, "engine": js.engine_name(e), "code": code,
            "name": ds.short_names().get(code, code), "scenarios_selected": scenarios,
            "baseline_rate": round(base_rate, 2) if base_rate is not None else None,
            "new_rate": round(new_rate, 2) if new_rate is not None else None,
            "delta_points": round(delta, 2) if delta is not None else None,
            "extra_people_per_year": extra, "invited": invited,
            "missing_per_year": gap["missing_per_year"] if gap else None,
            "gap_closed_pct": share,
            "asked_live": asked_live, "from_cache": len(asked) - asked_live,
            "validation": validation, "note": f"Simulation · {engine_label}",
            "scenarios": [{"scenario": sc, "label": js.SCENARIOS[sc]["label"],
                           "actions": rec._matched(rec.SCENARIO_ACTIONS[sc]["gap"],
                                                   rec.SCENARIO_ACTIONS[sc]["actions"], by_id=by_id),
                           "assumption": None} for sc in scenarios],
            "source": (s or {}).get("levels", {}).get("county", {}).get("source")}
    # two-model range: if the Jev cache already covers this combo, attach its result — no live Jev calls
    if e != "jev":
        try:
            alt = whatif(prog, code, scenarios, engine="jev", cache_only=True)
        except (Unavailable, KeyError):
            alt = None
        if alt:
            out["other_engine"] = {"engine": alt["engine"], "new_rate": alt["new_rate"],
                                   "extra_people_per_year": alt["extra_people_per_year"],
                                   "gap_closed_pct": alt["gap_closed_pct"]}
    return out
