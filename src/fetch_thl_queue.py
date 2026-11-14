"""Oncology access to specialised care, from THL's "Hoitoon pääsy – erikoissairaanhoito" cube (Sampo pivot API).

Specialty Syöpätaudit (oncology), monthly situation by wellbeing services county, two indicators:
- share of patients waiting over 90 days for non-urgent treatment  (onc_wait_90)
- share of referrals processed in over 21 days since the start of the year  (onc_ref_21)

Human page: https://thl.fi/data-ja-tilastot/hoitoon-paasy/erikoissairaanhoito
Cube:  https://sampo.thl.fi/pivot/prod/fi/eshjono/jonotilanne/fact_eshjono_jonotilanne
JSON-stat 2.0; row=tuottaja-976329 returns the national root plus its 19 producer children (no trailing dot = node +
children); a set of leaf measures is selected with dots between the sids. Responses are cached under data/raw/thl_queue/.

Usage: python src/fetch_thl_queue.py [--from 2024-01]
Output:
  data/raw/thl_queue/dimensions.json, <sid>.json   raw API responses (not committed)
  data/thl_queue.csv                               same columns as data/sotkanet.csv + `shared` (committed)
  data/indicators.json                           meta entries for onc_wait_90 / onc_ref_21 merged in

Producer -> county: producers are named like the counties and are matched on the Finnish name in data/regions.csv.
ASSUMPTION: HUS is the specialised-care producer for the four Uusimaa counties (East, Central, West Uusimaa, Vantaa and
Kerava), so they all get the HUS value flagged shared="HUS". Helsinki's own producer row ("Helsingin sosiaali-, terveys-
ja pelastustoimi") has no oncology values at the months checked, so Helsinki gets the HUS value with the same flag.
Counties whose own producer reports nothing for a month (e.g. Pirkanmaa, Kainuu for the waiting measure) are left
missing for that month rather than invented. Åland has no producer in this cube at all.
"""
import argparse, json, re, sys, time
from datetime import date
from pathlib import Path
import pandas as pd
import requests

sys.path.insert(0, str(Path(__file__).parent))
from indicators import BY_KEY

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data/raw/thl_queue"
PAGE = "https://thl.fi/data-ja-tilastot/hoitoon-paasy/erikoissairaanhoito"
CUBE = "https://sampo.thl.fi/pivot/prod/fi/eshjono/jonotilanne/fact_eshjono_jonotilanne"
SPECIALTY = 1071303        # erikoisala: Syöpätaudit (oncology)
PRODUCER_ROOT = 976329     # tuottaja: Kaikki hyvinvointialueet (national + 19 producers as children)
MEASURES = [738214, 738219, 738220,          # Hoitoa odottaneet / yli 90 vrk / yli 90 vrk %
            980625, 980628, 980629]          # lähetteitä käsitelty / yli 21 vrk / yli 21 vrk %
KEYS = {"onc_wait_90": {"value": 738220, "abs": 738214},
        "onc_ref_21": {"value": 980629, "abs": 980625}}
# ASSUMPTION: producers serving more than their own county in specialised care. HUS serves the four Uusimaa counties;
# Helsinki's own producer row exists but is empty for Syöpätaudit, so Helsinki falls back to HUS.
SHARED_PRODUCER = {"HUS": ["01", "02", "03", "04"],
                   "Helsingin sosiaali-, terveys- ja pelastustoimi": ["90"]}
FALLBACK = {"90": "HUS"}
S = requests.Session()
S.headers["User-Agent"] = "equal-care-junction/0.1"


def get(url, cache, timeout=120):
    if cache.exists():
        return cache.read_text()
    for attempt in range(3):
        r = S.get(url, timeout=timeout)
        if r.ok:
            cache.write_text(r.text)
            return r.text
        time.sleep(2 + attempt)
    r.raise_for_status()


def dimensions():
    raw = get(CUBE + ".dimensions.json", RAW / "dimensions.json")
    data = json.loads(re.sub(r"^[^(]*\(|\)\s*;?\s*$", "", raw.strip()))
    return {d["id"]: d for d in data}


def months(dims, y0):
    """ajankohta members on/after y0, sorted by date. Labels are dd.mm.yyyy; monthly in the recent range."""
    out = []
    for t in dims["ajankohta"]["children"][0]["children"]:
        d = date(*(int(x) for x in t["label"].split(".")[::-1]))
        if d >= date(y0, 1, 1):
            out.append((d, int(t["sid"]), t["label"]))
    return sorted(out)


def fetch_month(sid):
    url = (f"{CUBE}.json?row=tuottaja-{PRODUCER_ROOT}"
           f"&column=measure-{'.'.join(map(str, MEASURES))}"
           f"&filter=erikoisala-{SPECIALTY}&filter=ajankohta-{sid}")
    return json.loads(get(url, RAW / f"{sid}.json"))["dataset"]


def order(cat):
    idx = cat["index"]
    return sorted(idx, key=idx.get) if isinstance(idx, dict) else list(idx)


def month_table(ds):
    """producer sid -> {measure sid: value} for one month."""
    dim = ds["dimension"]
    rows, cols = order(dim["tuottaja"]["category"]), order(dim["measure"]["category"])
    labels = dim["tuottaja"]["category"]["label"]
    v = ds["value"]; out = {}
    for i, sid in enumerate(rows):
        name = labels[sid] if isinstance(labels, dict) else labels[i]
        out[sid] = {"name": name, **{int(c): v.get(str(i * len(cols) + j)) for j, c in enumerate(cols)}}
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--from", dest="y0", type=int, default=2024)
    a = ap.parse_args()
    RAW.mkdir(parents=True, exist_ok=True)
    dims = dimensions()
    producers = {str(c["sid"]): c["label"] for c in dims["tuottaja"]["children"][0]["children"]}
    label_by_sid = {**producers, str(PRODUCER_ROOT): "Kaikki hyvinvointialueet"}

    R = pd.read_csv(ROOT / "data/regions.csv", dtype=str)
    counties = {r.code: r["name"] for _, r in R[R.level == "county"].iterrows()}
    country = R[R.level == "country"].iloc[0]
    # own producer per county by Finnish name; shared producers override the Uusimaa four and Helsinki
    own = {c: n for c, n in counties.items()}
    for c in SHARED_PRODUCER["HUS"]:
        own[c] = "HUS"
    own["90"] = "Helsingin sosiaali-, terveys- ja pelastustoimi"
    sid_of = {v: k for k, v in label_by_sid.items()}

    rows, missing = [], {}
    month_list = months(dims, a.y0)
    for d, sid, label in month_list:
        tab = month_table(fetch_month(sid))
        year = int(d.strftime("%Y%m"))
        for code, pname in own.items():
            prod_sid = sid_of.get(pname, "")
            prod = tab.get(prod_sid, {})
            shared = None
            if code in FALLBACK and all(prod.get(m) is None for m in MEASURES):
                prod_sid, prod, shared = sid_of[FALLBACK[code]], tab.get(sid_of[FALLBACK[code]], {}), FALLBACK[code]
            elif code in SHARED_PRODUCER["HUS"]:
                shared = "HUS"
            if not prod:
                missing.setdefault(label, []).append(code)
                continue
            for key, m in KEYS.items():
                if prod.get(m["value"]) is None:
                    missing.setdefault(label, []).append(code)
                    continue
                rows.append({"key": key, "indicator": m["value"], "region_id": prod_sid,
                             "year": year, "gender": "total", "value": prod[m["value"]], "abs_value": prod[m["abs"]],
                             "level": "county", "code": code, "name": counties[code], "county_code": "",
                             "shared": shared or ""})
        nat = tab.get(str(PRODUCER_ROOT), {})
        for key, m in KEYS.items():
            if nat.get(m["value"]) is None:
                missing.setdefault(label, []).append("358")
                continue
            rows.append({"key": key, "indicator": m["value"], "region_id": PRODUCER_ROOT, "year": year,
                         "gender": "total", "value": nat[m["value"]], "abs_value": nat[m["abs"]],
                         "level": "country", "code": str(country.code), "name": country["name"], "county_code": "",
                         "shared": ""})
        print(f"{label}: {len(tab) - 1} producers", flush=True)

    D = pd.DataFrame(rows).sort_values(["key", "level", "code", "year"])
    D.to_csv(ROOT / "data/thl_queue.csv", index=False)
    print(f"\n{len(D)} rows -> data/thl_queue.csv")

    last_label = month_list[-1][2]
    if missing.get(last_label):
        print(f"counties with no producer values at {last_label}: {sorted(set(missing[last_label]))}")

    meta_path = ROOT / "data/indicators.json"
    meta = json.loads(meta_path.read_text()) if meta_path.exists() else {}
    titles = {"onc_wait_90": ("Syöpätautien hoidon jonossa yli 90 vuorokautta odottaneiden osuus, %",
                              "Share of patients waiting over 90 days for non-urgent oncology treatment, %"),
              "onc_ref_21": ("Syöpätautien lähetteistä yli 21 vuorokaudessa käsiteltyjen osuus, %",
                             "Share of oncology referrals processed in over 21 days, %")}
    period = month_list[-1][2]
    for key, (fi, en) in titles.items():
        ind = BY_KEY[key]
        meta[key] = {**ind.__dict__, "url": ind.url, "api_url": ind.api_url, "title_fi": fi, "title_en": en,
                     "description_en": "THL care queue statistics, specialty Oncology (Syöpätaudit), by the "
                                       "specialised-care producer of each wellbeing services county.",
                     "data_updated": None, "source_org": "THL / Hoitoon pääsy", "cube_url": CUBE + ".json",
                     "period": period}
    meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=1))
    print(f"meta for {sorted(titles)} merged into data/indicators.json (period {period})")


if __name__ == "__main__":
    main()
