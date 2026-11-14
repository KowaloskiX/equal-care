"""Download the registry indicators from Sotkanet (THL) and normalise them into one table.

Usage: python src/fetch_sotkanet.py [--from 2015] [--to 2025]
Output:
  data/raw/sotkanet/<id>.json, regions.json   raw API responses (not committed)
  data/sotkanet.csv                           one row per indicator x region x year x gender (committed: the demo never
                                              calls the API live)
  data/regions.csv                            countries, wellbeing services counties and municipalities, with the county
                                              each municipality belongs to
  data/indicators.json                        registry + Sotkanet metadata (title, description, last update)

The API refuses Python's default User-Agent (HTTP 403), so requests sends its own.
"""
import argparse, json, sys, time
from pathlib import Path
import pandas as pd
import requests

sys.path.insert(0, str(Path(__file__).parent))
from indicators import INDICATORS

API = "https://sotkanet.fi/rest/1.1"
RAW = Path("data/raw/sotkanet")
LEVEL = {"MAA": "country", "HYVINVOINTIALUE": "county", "KUNTA": "municipality"}
S = requests.Session()
S.headers["User-Agent"] = "equal-care-junction/0.1"


def get(path, params=None, cache=None):
    if cache and cache.exists():
        return json.loads(cache.read_text())
    for attempt in range(3):
        r = S.get(f"{API}/{path}", params=params, timeout=60)
        if r.ok:
            data = r.json()
            if cache:
                cache.write_text(json.dumps(data, ensure_ascii=False))
            return data
        time.sleep(1 + attempt)
    r.raise_for_status()


def regions():
    rs = get("regions", cache=RAW / "regions.json")
    by_id = {r["id"]: r for r in rs}
    county_of = {}
    for r in rs:
        if r["category"] == "KUNTA":
            hv = [by_id[m] for m in r.get("memberOf", []) if by_id.get(m, {}).get("category") == "HYVINVOINTIALUE"]
            county_of[r["id"]] = hv[0]["code"] if hv else None
    rows = [{"region_id": r["id"], "level": LEVEL[r["category"]], "code": r["code"], "name": r["title"]["fi"],
             "name_en": r["title"].get("en") or r["title"]["fi"], "county_code": county_of.get(r["id"])}
            for r in rs if r["category"] in LEVEL]
    return pd.DataFrame(rows)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--from", dest="y0", type=int, default=2015)
    ap.add_argument("--to", dest="y1", type=int, default=2025)
    a = ap.parse_args()
    RAW.mkdir(parents=True, exist_ok=True)
    R = regions()
    keep = set(R.region_id)
    rows, meta = [], {}
    for ind in INDICATORS:
        m = get(f"indicators/{ind.sotkanet_id}", cache=RAW / f"meta_{ind.sotkanet_id}.json")
        meta[ind.key] = {**ind.__dict__, "url": ind.url, "api_url": ind.api_url, "title_fi": m["title"]["fi"],
                         "title_en": m["title"].get("en"), "description_en": (m.get("description") or {}).get("en"),
                         "data_updated": m.get("data-updated"), "source_org": "THL / Sotkanet"}
        params = [("indicator", ind.sotkanet_id)] + [("years", y) for y in range(a.y0, a.y1 + 1)] + \
                 [("genders", g) for g in ("total", "female", "male")]
        data = get("json", params=params, cache=RAW / f"{ind.sotkanet_id}_{a.y0}_{a.y1}.json")
        n = 0
        for x in data:
            if x["region"] in keep and x.get("value") is not None:
                rows.append({"key": ind.key, "indicator": ind.sotkanet_id, "region_id": x["region"], "year": x["year"],
                             "gender": x["gender"], "value": x["value"], "abs_value": x.get("absValue")})
                n += 1
        print(f"{ind.key:14s} {ind.sotkanet_id:>6d}  {n:6d} rows", flush=True)
    D = pd.DataFrame(rows).merge(R[["region_id", "level", "code", "name", "county_code"]], on="region_id")
    Path("data").mkdir(exist_ok=True)
    D.sort_values(["key", "level", "code", "year", "gender"]).to_csv("data/sotkanet.csv", index=False)
    R.to_csv("data/regions.csv", index=False)
    Path("data/indicators.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1))
    print(f"\n{len(D)} rows -> data/sotkanet.csv; {len(R)} regions -> data/regions.csv")


if __name__ == "__main__":
    main()
