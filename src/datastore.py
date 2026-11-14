"""Read access to the normalised data. Every value leaves this module with its source attached.

Rules (see CLAUDE.md): arithmetic happens here, in code; nothing downstream (UI, Gemini) computes or invents numbers.
"""
import json, math
from functools import lru_cache
from pathlib import Path
import pandas as pd

from indicators import BY_KEY, INDICATORS, STAGES

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
COUNTRY = "358"   # Sotkanet code of "Koko maa"
ABSOLUTE_UNITS = {"people", "visits"}


@lru_cache
def frames():
    D = pd.read_csv(DATA / "sotkanet.csv", dtype={"code": str, "county_code": str})
    queue = DATA / "thl_queue.csv"        # oncology care-queue indicators from fetch_thl_queue.py
    if queue.exists():
        D = pd.concat([D, pd.read_csv(queue, dtype={"code": str, "county_code": str})], ignore_index=True)
    if "shared" not in D.columns:
        D["shared"] = None
    R = pd.read_csv(DATA / "regions.csv", dtype={"code": str, "county_code": str})
    meta = json.loads((DATA / "indicators.json").read_text())
    return D, R, meta


@lru_cache
def short_names():
    """code -> short English name for the UI: 'Päijät-Häme', 'Helsinki', 'Åland'; municipalities keep their own name."""
    _, R, _ = frames()
    return {r.code: str(r.name_en).replace(" wellbeing services county", "").replace("City of ", "") for _, r in R.iterrows()}


def source(key, year=None):
    _, _, meta = frames(); m = meta[key]
    s = {"indicator": m["sotkanet_id"], "title": m["title_en"] or m["title_fi"], "url": m["url"], "year": year,
         "org": m["source_org"], "updated": m["data_updated"]}
    for f in ("cube_url", "period"):           # non-Sotkanet sources (THL care queue) carry their own reference fields
        if m.get(f) is not None:
            s[f] = m[f]
    return s


def _rows(key, level):
    D, _, _ = frames(); ind = BY_KEY[key]
    X = D[(D.key == key) & (D.level == level)]
    # prefer the indicator's gender; some female-only indicators are published as "total"
    for g in (ind.gender, "total", "female"):
        if (X.gender == g).any():
            return X[X.gender == g]
    return X


def latest_year(key, level="county"):
    X = _rows(key, level)
    return int(X.year.max()) if len(X) else None


def values(key, level="county", year=None, county=None):
    """-> {"year", "values": {code: {name, value, abs_value}}, "national", "target", "source"}"""
    X = _rows(key, level)
    if county:
        X = X[X.county_code == county]
    year = year or (int(X.year.max()) if len(X) else None)
    X = X[X.year == year]
    nat = _rows(key, "country"); nat = nat[nat.year == year]
    ind = BY_KEY[key]
    return {"key": key, "label": ind.label, "unit": ind.unit, "level": level, "year": year,
            "higher_is_better": ind.higher_is_better, "target": ind.target, "target_note": ind.target_note,
            "national": float(nat.value.iloc[0]) if len(nat) else None,
            "values": {r.code: {"name": short_names().get(r.code, r["name"]), "name_fi": r["name"], "value": float(r.value),
                                "abs_value": None if pd.isna(r.abs_value) else float(r.abs_value),
                                "shared_producer": None if pd.isna(r.shared) or r.shared == "" else r.shared}
                       for _, r in X.iterrows()},
            "source": source(key, year)}


def series(key, code):
    D, _, _ = frames()
    level = "country" if code == COUNTRY else ("county" if len(code) == 2 else "municipality")
    X = _rows(key, level); X = X[X.code == code].sort_values("year")
    return {"key": key, "code": code, "points": [[int(r.year), float(r.value)] for _, r in X.iterrows()], "source": source(key)}


def screening_gap(key, code, level="county", year=None, target=None):
    """People missing to reach the target attendance. attended = Sotkanet absValue (people who attended);
    invited = attended / rate. Both come from the same row, so the gap is exact up to Sotkanet's rounding of the rate."""
    ind = BY_KEY[key]; target = target or ind.target
    v = values(key, level, year)
    r = v["values"].get(code)
    if not r or not r["abs_value"] or not r["value"]:
        return None
    attended = r["abs_value"]; invited = attended * 100 / r["value"]
    missing = max(0, math.ceil(target / 100 * invited - attended))
    return {"key": key, "code": code, "name": r["name"], "year": v["year"], "rate": r["value"], "target": target,
            "attended": int(attended), "invited": int(round(invited)), "missing_per_year": missing,
            "method": "invited = attended / rate; missing = target x invited - attended", "source": v["source"]}


def _trend(ind, code):
    """The indicator's time series for one county (yearly or YYYYMM monthly) and, for monthly series, how many of
    the latest consecutive months moved in the worse direction — the 'early warning' count."""
    X = _rows(ind.key, "county"); X = X[X.code == code].sort_values("year")
    pts = [[int(r.year), float(r.value)] for _, r in X.iterrows()]
    rising = 0
    monthly = pts and pts[-1][0] > 9999          # periods are stored as YYYYMM ints
    if monthly and ind.higher_is_better is not None:
        for i in range(len(pts) - 1, 0, -1):
            worsened = pts[i][1] > pts[i - 1][1] if ind.higher_is_better is False else pts[i][1] < pts[i - 1][1]
            if pts[i][1] == pts[i - 1][1] or not worsened:
                break
            rising += 1
    return pts[-36:], rising


def pathway(code, year=None):
    """One county along the care pathway: each indicator against Finland and its rank among the 23 counties."""
    out = []
    for ind in INDICATORS:
        v = values(ind.key, "county", year)
        r = v["values"].get(code)
        if not r:
            continue
        vals = sorted((x["value"] for x in v["values"].values()), reverse=bool(ind.higher_is_better))
        rank = vals.index(r["value"]) + 1 if ind.higher_is_better is not None else None
        nat = v["national"]
        absolute = ind.unit in ABSOLUTE_UNITS   # a county count against the national count says nothing
        delta = None if nat is None or absolute else round(r["value"] - nat, 1)
        worse = None if delta is None or ind.higher_is_better is None else (delta < 0) == ind.higher_is_better and delta != 0
        trend, rising = _trend(ind, code)
        out.append({"key": ind.key, "label": ind.label, "stage": ind.stage, "goal": ind.goal, "unit": ind.unit,
                    "value": r["value"], "national": nat, "delta": delta, "worse_than_national": worse,
                    "rank": rank, "of": len(vals), "target": ind.target, "year": v["year"], "source": v["source"],
                    "abs_value": r["abs_value"], "abs_is_denominator": ind.abs_is_denominator,
                    "shared_producer": r.get("shared_producer"), "trend": trend, "rising_months": rising})
    out.sort(key=lambda x: STAGES.index(x["stage"]))
    _, R, _ = frames()
    name_fi = R[(R.level == "county") & (R.code == code)].name.iloc[0]
    return {"code": code, "name": short_names()[code], "name_fi": name_fi, "indicators": out}


def timeline(key, level="county"):
    """All periods of one indicator for every county + Finland, for the queue time-lapse.
    THL care-queue periods are YYYYMM ints; missing stays missing."""
    ind = BY_KEY[key]
    X = _rows(key, level); N = _rows(key, "country")
    periods = sorted(int(y) for y in X.year.unique())
    values = {}
    for _, r in X.iterrows():
        p = int(r.year)
        values.setdefault(p, {})[r.code] = {"value": float(r.value),
                                            "abs_value": None if pd.isna(r.abs_value) else float(r.abs_value),
                                            "shared": None if pd.isna(r.shared) or r.shared == "" else r.shared}
    return {"key": key, "label": ind.label, "unit": ind.unit, "level": level, "periods": periods,
            "higher_is_better": ind.higher_is_better,
            "national": {int(r.year): float(r.value) for _, r in N.iterrows()},
            "values": values, "source": source(key)}


def municipalities(county, key, year=None):
    v = values(key, "municipality", year, county=county)
    rows = sorted(({"code": c, **r} for c, r in v["values"].items()), key=lambda r: r["value"])
    return {**{k: v[k] for k in ("key", "label", "unit", "year", "target", "national", "source")}, "rows": rows}


def correlation(key_a, key_b, level="municipality", year=None):
    """Pearson r between two indicators across regions of one level (same year). For the 'is it X?' checks."""
    if year is None:   # latest year both indicators have, so the two sides describe the same moment
        common_years = set(_rows(key_a, level).year) & set(_rows(key_b, level).year)
        year = int(max(common_years)) if common_years else None
    a, b = values(key_a, level, year), values(key_b, level, year)
    common = [c for c in a["values"] if c in b["values"]]
    if len(common) < 5:
        return None
    s = pd.DataFrame({"a": [a["values"][c]["value"] for c in common], "b": [b["values"][c]["value"] for c in common]})
    return {"a": key_a, "b": key_b, "level": level, "year": a["year"], "n": len(common), "r": round(float(s.a.corr(s.b)), 2),
            "sources": [a["source"], b["source"]]}
