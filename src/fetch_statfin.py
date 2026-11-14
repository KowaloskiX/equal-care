"""Population tables from Statistics Finland (StatFin PxWeb API) for the synthetic residents.

Usage: python src/fetch_statfin.py [--year 2024]
Output (data/statfin/, committed):
  age_sex.csv         municipality x sex x age (30-74), people         table vaerak/11re
  language.csv        municipality x language, people (all ages)      table vaerak/11rm
  sparse.csv          municipality x sex x age: people in sparsely populated areas (outside urban settlements),
                      table vaerak/15k6 (2025 only; used as a share, so the year mismatch is small)
  activity_edu.csv    region (maakunta) x sex x age band x main activity x education, people   table tyokay/115d
  municipality_region.csv  municipality code -> region (maakunta) code, from Sotkanet regions
Licence CC BY 4.0, Statistics Finland. https://pxdata.stat.fi/PxWeb/pxweb/en/StatFin/
"""
import argparse, json, time
from pathlib import Path
import pandas as pd
import requests

API = "https://pxdata.stat.fi/PxWeb/api/v1/en/StatFin"
OUT = Path("data/statfin")
S = requests.Session(); S.headers["User-Agent"] = "equal-care-junction/0.1"
AGES = [f"{a:03d}" for a in range(30, 75)]


def meta(table):
    return S.get(f"{API}/{table}", timeout=60).json()


def query(table, sel):
    """sel: {variable code: [values]}. Returns a long DataFrame with one column per variable + value."""
    body = {"query": [{"code": k, "selection": {"filter": "item", "values": v}} for k, v in sel.items()],
            "response": {"format": "json-stat2"}}
    for attempt in range(4):
        r = S.post(f"{API}/{table}", json=body, timeout=180)
        if r.ok:
            break
        time.sleep(2 + 3 * attempt)
    r.raise_for_status()
    js = r.json()
    dims = js["id"]; sizes = js["size"]
    cats = [list(js["dimension"][d]["category"]["index"].keys()) for d in dims]
    import itertools
    rows = [(*combo, v) for combo, v in zip(itertools.product(*cats), js["value"])]
    return pd.DataFrame(rows, columns=dims + ["value"])


def var(m, prefix):
    return next(v for v in m["variables"] if v["code"].startswith(prefix))


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--year", default="2024"); a = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)

    m = meta("vaerak/11re.px"); area = var(m, "alue"); munis = [c for c in area["values"] if c.startswith("KU")]
    D = query("vaerak/11re.px", {area["code"]: munis, var(m, "ikaryhma")["code"]: AGES, var(m, "sukupuoli")["code"]: ["1", "2"],
                                 "timeperiod_y": [a.year]})
    D.columns = ["muni", "age", "sex", "year", "_", "people"]
    D = D.assign(muni=D.muni.str[2:], age=D.age.astype(int), sex=D.sex.map({"1": "M", "2": "F"}))[["muni", "sex", "age", "people"]]
    D.to_csv(OUT / "age_sex.csv", index=False); print("age_sex", len(D), int(D.people.sum()))

    m = meta("vaerak/11rm.px"); area = var(m, "alue"); lang = var(m, "kieli")
    langs = [c for c in lang["values"] if c not in ("SSS", "01", "02")]
    L = query("vaerak/11rm.px", {area["code"]: [c for c in area["values"] if c.startswith("KU")], lang["code"]: langs,
                                 var(m, "sukupuoli")["code"]: ["SSS"], "timeperiod_y": [a.year]})
    L.columns = ["muni", "lang", "_s", "year", "_", "people"]
    names = dict(zip(lang["values"], lang["valueTexts"]))
    L = L[L.people > 0].assign(muni=lambda x: x.muni.str[2:], language=lambda x: x.lang.map(names))[["muni", "lang", "language", "people"]]
    L.to_csv(OUT / "language.csv", index=False); print("language", len(L))

    m = meta("vaerak/15k6.px"); area = var(m, "taajama")
    haja = [c for c in area["values"] if c.startswith("KU") and c.endswith("HAJA")]
    H = query("vaerak/15k6.px", {"timeperiod_y": ["2025"], area["code"]: haja, var(m, "sukupuoli")["code"]: ["1", "2"],
                                 var(m, "ikaryhma")["code"]: AGES})
    H.columns = ["year", "muni", "sex", "age", "_", "people_sparse"]
    H = H.assign(muni=H.muni.str[2:5], age=H.age.astype(int), sex=H.sex.map({"1": "M", "2": "F"}))[["muni", "sex", "age", "people_sparse"]]
    H.to_csv(OUT / "sparse.csv", index=False); print("sparse", len(H), int(H.people_sparse.sum()))

    m = meta("tyokay/115d.px"); area = var(m, "alue")
    A = query("tyokay/115d.px", {area["code"]: [c for c in area["values"] if c.startswith("MK")],
                                 var(m, "paaasial")["code"]: [c for c in var(m, "paaasial")["values"] if c not in ("SSS", "11+12", "21-99")],
                                 var(m, "koulutusaste")["code"]: [c for c in var(m, "koulutusaste")["values"] if c != "SSS"],
                                 var(m, "sukupuoli")["code"]: ["1", "2"], var(m, "ikaryhma")["code"]: ["18-64", "65-"],
                                 "timeperiod_y": [a.year]})
    A.columns = ["region", "activity", "edu", "sex", "ageband", "year", "_", "people"]
    act = dict(zip(var(m, "paaasial")["values"], var(m, "paaasial")["valueTexts"]))
    A = A.assign(region=A.region.str[2:], activity=A.activity.map(act), sex=A.sex.map({"1": "M", "2": "F"}))
    A[["region", "sex", "ageband", "activity", "edu", "people"]].to_csv(OUT / "activity_edu.csv", index=False)
    print("activity_edu", len(A), sorted(A.activity.unique()))

    rs = json.loads(Path("data/raw/sotkanet/regions.json").read_text()); by = {r["id"]: r for r in rs}
    mr = [{"muni": r["code"], "region": next((by[x]["code"] for x in r.get("memberOf", []) if by.get(x, {}).get("category") == "MAAKUNTA"), None)}
          for r in rs if r["category"] == "KUNTA"]
    pd.DataFrame(mr).to_csv(OUT / "municipality_region.csv", index=False); print("municipality_region", len(mr))


if __name__ == "__main__":
    main()
