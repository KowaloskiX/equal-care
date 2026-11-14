"""Boundaries of wellbeing services counties and municipalities from Statistics Finland (geo.stat.fi WFS).

Usage: python src/fetch_geo.py [--year 2025]
Output: data/geo/county.geojson, data/geo/municipality.geojson (WGS84, 1:4.5M generalisation, small enough for the browser)
Each feature keeps only {code, name}; codes match the Sotkanet region codes in data/regions.csv
(counties "01".."23" plus Helsinki and Åland, municipalities "005", "009", ...).
Licence: CC BY 4.0, Statistics Finland.
"""
import argparse, json
from pathlib import Path
import requests

WFS = "https://geo.stat.fi/geoserver/tilastointialueet/wfs"
LAYERS = {"county": "hyvinvointialue4500k_{y}", "municipality": "kunta4500k_{y}"}


def fetch(layer):
    r = requests.get(WFS, params={"service": "WFS", "version": "2.0.0", "request": "GetFeature",
                                  "typeName": f"tilastointialueet:{layer}", "outputFormat": "application/json",
                                  "srsName": "EPSG:4326"}, timeout=120, headers={"User-Agent": "equal-care-junction/0.1"})
    r.raise_for_status()
    return r.json()


def rnd(c):
    return [rnd(x) for x in c] if isinstance(c[0], list) else [round(c[0], 4), round(c[1], 4)]


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--year", type=int, default=2025); a = ap.parse_args()
    out = Path("data/geo"); out.mkdir(parents=True, exist_ok=True)
    for level, tmpl in LAYERS.items():
        fc = fetch(tmpl.format(y=a.year))
        p0 = fc["features"][0]["properties"]
        code_f = next(k for k in p0 if k in ("hyvinvointialue", "kunta"))
        name_f = "nimi" if "nimi" in p0 else "name"
        feats = [{"type": "Feature", "properties": {"code": f["properties"][code_f], "name": f["properties"][name_f]},
                  "geometry": {"type": f["geometry"]["type"], "coordinates": rnd(f["geometry"]["coordinates"])}}
                 for f in fc["features"]]
        path = out / f"{level}.geojson"
        path.write_text(json.dumps({"type": "FeatureCollection", "features": feats}, ensure_ascii=False, separators=(",", ":")))
        print(f"{level:13s} {len(feats):4d} features  {path.stat().st_size // 1024} kB  fields {code_f}/{name_f}")


if __name__ == "__main__":
    main()
