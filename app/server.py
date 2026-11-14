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
import datastore as ds, strategy, recommend as rec
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


# ---------------- simulation (synthetic residents; precomputed by src/simulate.py, never computed per request)
ENGINE_WHO = {"jev": "Jev (TypeSafe)", "gemini-decision-1": "the Gemini Decisions API (gemini-decision-1)"}


def sim_note(engine):
    who = ENGINE_WHO.get(engine, engine or "the decision model")
    return ("Simulation, not data: synthetic residents built from Statistics Finland tables answer through "
            f"{who}. Anchored so Finland matches the real national rate. See validation for how well it tracks reality.")


SIM_NOTE = sim_note("jev")   # fallback when a sim file predates the engine field


def _sim(prog):
    p = ROOT / "data/sim" / f"{prog}.json"
    if not p.exists():
        raise HTTPException(404, f"no simulation for {prog!r}; run src/simulate.py")
    return json.loads(p.read_text())


@app.get("/api/sim")
def sim_index():
    import residents
    out = []
    engine = None
    for prog, P in residents.PROGRAMMES.items():
        try:
            s = _sim(prog)
        except HTTPException:
            continue
        engine = engine or s.get("engine")
        out.append({"programme": prog, "indicator": P["indicator"], "label": s["label"], "validation": s["validation"],
                    "scenarios": {k: v["label"] for k, v in s["scenarios"].items()}})
    return {"note": sim_note(engine or "jev"), "programmes": out}


@app.get("/api/sim/{prog}")
def sim_level(prog: str, level: str = "county", scenario: str | None = None):
    s = _sim(prog); L = s["levels"][level]
    rows = L["rows"]
    if scenario:
        sc = s["scenarios"].get(scenario)
        if not sc:
            raise HTTPException(404, f"no scenario {scenario!r}")
        rows = {c: {**r, **sc["levels"][level].get(c, {})} for c, r in rows.items()}
    return {"programme": prog, "engine": s.get("engine"), "label": s["label"], "level": level, "year": L["year"], "national_real": L["national_real"],
            "national_expected": L["national_expected"], "rows": rows, "validation": s["validation"], "anchor": s["anchor"],
            "scenario": scenario, "note": sim_note(s.get("engine")), "source": L["source"]}


@app.get("/api/sim/{prog}/region/{code}")
def sim_region(prog: str, code: str, level: str = "county"):
    s = _sim(prog); r = s["levels"][level]["rows"].get(code)
    if r is None:
        raise HTTPException(404, f"no simulated row for {code!r}")
    sc = {k: {"label": v["label"], **v["levels"][level].get(code, {})} for k, v in s["scenarios"].items()}
    return {"programme": prog, "engine": s.get("engine"), "code": code, "name": ds.short_names().get(code, code), **r, "scenarios": sc,
            "national_real": s["levels"][level]["national_real"], "validation": s["validation"], "note": sim_note(s.get("engine")),
            "source": s["levels"][level]["source"]}


# ---------------- recommendations (cited roadmap actions; see src/recommend.py)


@app.get("/api/whatif")
def whatif_endpoint(prog: str, code: str, s: str):
    """Live combined-intervention run over the simulated residents for one county (503 when answers are not cached
    and the engine key is not set — never fakes a result)."""
    import whatif
    try:
        return whatif.whatif(prog, code, [x.strip() for x in s.split(",") if x.strip()])
    except whatif.Unavailable as e:
        raise HTTPException(503, str(e))
    except KeyError as e:
        raise HTTPException(404, str(e))


@app.get("/api/recommend/{prog}/{code}")
def recommend_endpoint(prog: str, code: str):
    if prog not in rec.PROGRAMMES:
        raise HTTPException(404, f"unknown programme {prog!r}")
    if code not in ds.values(rec.PROGRAMMES[prog], "county")["values"]:
        raise HTTPException(404, f"unknown county {code!r}")
    return rec.recommend(prog, code)


@app.get("/api/brief")
def brief_endpoint(prog: str | None = None, n: int = 3):
    progs = (prog,) if prog else ("breast", "bowel")   # cervix is out of the story: much testing happens privately
    for p in progs:
        if p not in rec.PROGRAMMES:
            raise HTTPException(404, f"unknown programme {p!r}")
    return rec.brief(progs, max(1, min(n, 23)))
