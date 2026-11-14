"""Synthetic residents of Finland aged 30-74, as weighted cells, built only from Statistics Finland tables.

A cell is: municipality x sex x age (5-year) x native language x settlement (urban / sparsely populated)
x education x main activity, with the number of real people it stands for. There is no random sampling, so the
same inputs always give the same population.

Inputs: data/statfin/*.csv (src/fetch_statfin.py).
Output: out/cells.parquet (rebuilt in seconds; not committed)

How the joint table is built:
  age x sex x municipality       exact (StatFin 11re)
  settlement                     exact share per municipality x sex x age (StatFin 15k6, 2025)
  language                       share per municipality, all ages
     ASSUMPTION: the language mix of 30-74 year olds equals that of the whole municipality. Foreign-language
     speakers are younger than average, so this overstates them among 60-74 year olds.
  education x activity           joint share per region (maakunta) x sex x age band 18-64 / 65+ (StatFin 115d)
     ASSUMPTION: within a region, education and activity do not depend on the municipality, language or settlement.
Everything else is independent within a municipality x sex x age group (ASSUMPTION).
"""
from functools import lru_cache
from pathlib import Path
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
SF = ROOT / "data/statfin"
OUT = ROOT / "out"

# foreign languages with their own persona; the rest are "another foreign language"
LANGS = {"fi": "Finnish", "sv": "Swedish", "ru": "Russian", "et": "Estonian", "ar": "Arabic", "so": "Somali", "en": "English"}
EDU = {"9_X": "basic education only", "3_4": "upper secondary or vocational", "5_6": "bachelor's or polytechnic degree",
       "7_8": "master's degree or higher"}
ACT = {"Employed": "employed", "Unemployed": "unemployed", "Pensioners": "retired / on pension",
       "Students, pupils": "student", "Other persons outside the labour force": "not working (home, care duties or other)",
       "Conscripts, persons in non-military service": "not working (home, care duties or other)"}
CAPITAL = {"091", "049", "092", "235"}   # Helsinki, Espoo, Vantaa, Kauniainen


def age5(a):
    lo = a - a % 5
    return f"{lo}-{lo + 4}"


@lru_cache
def municipality_type():
    """capital region / city 50k+ / town 10-50k / small municipality, by total population 30-74 (proxy for size)."""
    A = pd.read_csv(SF / "age_sex.csv", dtype={"muni": str})
    tot = A.groupby("muni").people.sum() * 2.2   # ASSUMPTION: total population ~ 2.2 x population aged 30-74 (only to bucket sizes)
    return {m: ("capital region" if m in CAPITAL else "city of 50 000+" if t >= 50000 else "town of 10 000-50 000" if t >= 10000
                else "small municipality under 10 000") for m, t in tot.items()}


def build():
    A = pd.read_csv(SF / "age_sex.csv", dtype={"muni": str})
    H = pd.read_csv(SF / "sparse.csv", dtype={"muni": str})
    L = pd.read_csv(SF / "language.csv", dtype={"muni": str})
    E = pd.read_csv(SF / "activity_edu.csv", dtype={"region": str})
    MR = pd.read_csv(SF / "municipality_region.csv", dtype={"muni": str, "region": str})

    A = A.merge(H, on=["muni", "sex", "age"], how="left").fillna({"people_sparse": 0})
    A["p_sparse"] = (A.people_sparse / A.people.where(A.people > 0)).clip(0, 1).fillna(0)
    A["age5"] = A.age.map(age5)
    # settlement split at single-year age, then aggregate to 5-year bands
    S = pd.concat([A.assign(settlement="sparsely populated area", w=A.people * A.p_sparse),
                   A.assign(settlement="urban settlement", w=A.people * (1 - A.p_sparse))])
    S = S.groupby(["muni", "sex", "age5", "settlement"], as_index=False).w.sum()

    L["lang"] = L.lang.where(L.lang.isin(LANGS), "other")
    L = L.groupby(["muni", "lang"], as_index=False).people.sum()
    L["p_lang"] = L.people / L.groupby("muni").people.transform("sum")
    S = S.merge(L[["muni", "lang", "p_lang"]], on="muni")
    S["w"] *= S.p_lang

    E = E[E.activity.isin(ACT)].copy()
    E["activity"] = E.activity.map(ACT)
    E = E.groupby(["region", "sex", "ageband", "activity", "edu"], as_index=False).people.sum()
    E["p_ea"] = E.people / E.groupby(["region", "sex", "ageband"]).people.transform("sum")
    S = S.merge(MR, on="muni", how="left")
    S["ageband"] = S.age5.map(lambda s: "65-" if int(s[:2]) >= 65 else "18-64")
    S = S.merge(E[["region", "sex", "ageband", "activity", "edu", "p_ea"]], on=["region", "sex", "ageband"])
    S["w"] *= S.p_ea
    S["muni_type"] = S.muni.map(municipality_type())
    S = S[S.w > 0.01][["muni", "region", "muni_type", "sex", "age5", "settlement", "lang", "edu", "activity", "w"]]
    OUT.mkdir(exist_ok=True)
    S.reset_index(drop=True).to_parquet(OUT / "cells.parquet")
    return S


@lru_cache
def cells():
    p = OUT / "cells.parquet"
    return pd.read_parquet(p) if p.exists() else build()


if __name__ == "__main__":
    S = build()
    A = pd.read_csv(SF / "age_sex.csv", dtype={"muni": str})
    print(f"{len(S):,} cells, {S.w.sum():,.0f} people (StatFin 30-74: {A.people.sum():,})")
    for c in ("lang", "settlement", "edu", "activity", "muni_type"):
        print(f"\n{c}:\n" + (S.groupby(c).w.sum() / S.w.sum()).round(3).sort_values(ascending=False).to_string())
