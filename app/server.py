"""API for the web app. Read-only over the committed data; nothing here calls Sotkanet live.

Run: make app  (uvicorn on http://localhost:8010)
Every response that carries a number carries its source.
"""
import json, os, sys
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src"))
import datastore as ds, strategy
from indicators import INDICATORS, GOALS, STAGES

app = FastAPI(title="Equal Care Across Finland")
app.add_middleware(CORSMiddleware, allow_origins=os.environ.get("EC_ORIGINS", "*").split(","), allow_methods=["*"],
                   allow_headers=["*"])


@app.get("/api/meta")
def meta():
    _, _, m = ds.frames()
    return {"stages": STAGES, "goals": GOALS,
            "indicators": [{**i.__dict__, "url": i.url, "latest_year": ds.latest_year(i.key), "title_en": m[i.key]["title_en"],
                            "description": m[i.key]["description_en"], "updated": m[i.key]["data_updated"]} for i in INDICATORS]}


@app.get("/api/geo/{level}")
def geo(level: str):
    p = ROOT / "data/geo" / f"{level}.geojson"
    if not p.exists():
        raise HTTPException(404, f"no geometry for level {level!r}")
    return json.loads(p.read_text())


@app.get("/api/values")
def values(key: str, level: str = "county", year: int | None = None, county: str | None = None):
    if key not in ds.BY_KEY:
        raise HTTPException(404, f"unknown indicator {key!r}")
    return ds.values(key, level, year, county)


@app.get("/api/series")
def series(key: str, code: str):
    return ds.series(key, code)


@app.get("/api/region/{code}")
def region(code: str, year: int | None = None):
    try:
        return ds.pathway(code, year)
    except IndexError:
        raise HTTPException(404, f"unknown county {code!r}")


@app.get("/api/region/{code}/municipalities")
def municipalities(code: str, key: str, year: int | None = None):
    return ds.municipalities(code, key, year)


@app.get("/api/gap")
def gap(key: str, code: str, level: str = "county", year: int | None = None, target: float | None = None):
    g = ds.screening_gap(key, code, level, year, target)
    if not g:
        raise HTTPException(404, "no attendance counts for this region")
    return g


@app.get("/api/correlation")
def correlation(a: str, b: str, level: str = "municipality", year: int | None = None):
    return ds.correlation(a, b, level, year)


@app.get("/api/actions")
def actions(goal: int | None = None, q: str | None = None):
    A = strategy.actions()
    if goal:
        A = [a for a in A if a["goal"] == goal]
    if q:
        words = q.lower().split()
        A = [a for a in A if all(w in (a["title"] + " " + a["description"] + " " + a.get("metric", "")).lower() for w in words)]
    return {"source": {"title": strategy.DOCS["roadmap"][0], "url": strategy.DOCS["roadmap"][1]}, "actions": A}


@app.get("/api/strategy/search")
def strategy_search(q: str, doc: str | None = None):
    return {"hits": strategy.search(q, doc)}
