"""How much of a county's screening gap does its population explain? Answered from public data only, no model.

Municipality-level weighted least squares (weights = women/people invited, attended / rate) of screening attendance
(Sotkanet, latest year) on the composition of the municipality (Sotkanet context indicators, latest year):
foreign-language share, education level, share aged 65+, log population.

For a county:  expected = invited-weighted mean of its municipalities' fitted values
               composition_gap = expected - Finland's invited-weighted mean of the fitted values
               unexplained_gap = (real - Finland real) - composition_gap
A 90 % interval for composition_gap comes from a municipality bootstrap.

ASSUMPTION: an ecological model (municipalities, not people) — it says how attendance tracks composition across
municipalities, not why one person skips. Context indicators are for the whole population and their latest year may
differ from the attendance year; R2 is reported so the UI can say how much the composition explains at all.
"""
import sys
from functools import lru_cache
from pathlib import Path
import numpy as np, pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
import datastore as ds

ROOT = Path(__file__).resolve().parent.parent
PREDICTORS = ["foreign_lang", "edu_level", "age65_share", "population"]
PROG_KEY = {"breast": "screen_breast", "bowel": "screen_bowel"}
BOOT = 500


def _frame(key):
    v = ds.values(key, "municipality")
    rows = {c: {"y": x["value"], "attended": x["abs_value"]} for c, x in v["values"].items() if x["abs_value"] and x["value"]}
    F = pd.DataFrame(rows).T
    ctx = {}
    for k in PREDICTORS:
        cv = ds.values(k, "municipality")
        F[k] = pd.Series({c: x["value"] for c, x in cv["values"].items()})
        ctx[k] = cv["year"]
    F = F.dropna().astype(float)
    F["population"] = np.log(F["population"])
    F["invited"] = F.attended * 100 / F.y
    R = pd.read_csv(ROOT / "data/regions.csv", dtype=str)
    m = R[R.level == "municipality"]
    F["county"] = F.index.map(dict(zip(m.code, m.county_code)))
    return F.dropna(subset=["county"]), v, ctx


def _fit(F):
    X = np.column_stack([np.ones(len(F))] + [F[k].values for k in PREDICTORS])
    sw = np.sqrt(F.invited.values)
    b, *_ = np.linalg.lstsq(X * sw[:, None], F.y.values * sw, rcond=None)
    return b, X @ b


def _county_expected(F, pred):
    G = F.assign(p=pred * F.invited, yi=F.y * F.invited).groupby("county")[["p", "yi", "invited"]].sum()
    return G.p / G.invited, float((pred * F.invited).sum() / F.invited.sum())


@lru_cache
def decompose(prog):
    key = PROG_KEY[prog]
    F, v, ctx = _frame(key)
    b, pred = _fit(F)
    y, w = F.y.values, F.invited.values
    ybar = np.average(y, weights=w)
    r2 = 1 - np.sum(w * (y - pred) ** 2) / np.sum(w * (y - ybar) ** 2)
    exp_c, exp_fi = _county_expected(F, pred)
    rng = np.random.default_rng(0)
    boot = []
    for _ in range(BOOT):
        S = F.iloc[rng.integers(0, len(F), len(F))]
        bb, _ = _fit(S)
        Xall = np.column_stack([np.ones(len(F))] + [F[k].values for k in PREDICTORS])
        e_c, e_fi = _county_expected(F, Xall @ bb)
        boot.append(e_c - e_fi)
    B = pd.DataFrame(boot)
    nat = v["national"]
    rows = {}
    for code, e in exp_c.items():
        real = (v["values"].get(code) if code in v["values"] else None)
        cv = ds.values(key, "county")["values"].get(code)
        if not cv:
            continue
        comp = float(e - exp_fi)
        rows[code] = {"real": cv["value"], "expected": round(float(e), 2), "composition_gap": round(comp, 2),
                      "composition_gap_90": [round(float(B[code].quantile(0.05)), 2), round(float(B[code].quantile(0.95)), 2)],
                      "unexplained_gap": round(cv["value"] - nat - comp, 2), "total_gap": round(cv["value"] - nat, 2)}
    return {"programme": prog, "indicator": key, "year": v["year"], "national_real": nat,
            "method": "municipality WLS on composition, weights = invited; county = invited-weighted mean",
            "predictors": {k: ctx[k] for k in PREDICTORS}, "n_municipalities": int(len(F)), "r2": round(float(r2), 2),
            "coefficients": dict(zip(["intercept"] + PREDICTORS, [round(float(x), 4) for x in b])),
            "rows": rows,
            "source": {"attendance": v["source"], "composition": {k: ds.source(k) for k in PREDICTORS}}}


if __name__ == "__main__":
    for p in PROG_KEY:
        d = decompose(p)
        print(p, "R2", d["r2"], "n", d["n_municipalities"], d["predictors"])
        for c in ("90", "02", "07", "03"):
            if c in d["rows"]:
                print(" ", ds.short_names().get(c, c), d["rows"][c])
