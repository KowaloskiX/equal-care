"""Smoke test of the API and the data invariants. Usage: python src/check.py (exit code 1 on failure)."""
import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
sys.path[:0] = [str(ROOT / "src"), str(ROOT)]
from fastapi.testclient import TestClient
from app.server import app
import grounding

c = TestClient(app); fails = []


def check(name, ok):
    print(("ok   " if ok else "FAIL ") + name)
    if not ok: fails.append(name)


m = c.get("/api/meta").json()
check("meta lists indicators", len(m["indicators"]) >= 10)
check("goal 3 indicator present", any(i["goal"] == 3 and i["stage"] == "outcome" for i in m["indicators"]))
g = c.get("/api/geo/county").json()
check("23 county shapes", len(g["features"]) == 23)
for i in m["indicators"]:
    v = c.get(f"/api/values?key={i['key']}").json()
    codes = {f["properties"]["code"] for f in g["features"]}
    check(f"{i['key']}: county values match shapes and carry a source",
          set(v["values"]) <= codes and len(v["values"]) >= 18 and v["source"]["url"].startswith("https://"))
p = c.get("/api/region/90").json()
check("pathway for Helsinki", len(p["indicators"]) >= 8)
gap = c.get("/api/gap?key=screen_breast&code=90").json()
check("gap arithmetic", abs(gap["attended"] + gap["missing_per_year"] - 0.8 * gap["invited"]) <= 1)
a = c.get("/api/actions?goal=3").json()["actions"]
check("roadmap goal 3 actions parsed with pages", len(a) >= 15 and all(x["page"] > 0 for x in a))
check("grounding flags an invented number", grounding.unverified("74.3 % and 1234 more", [{"r": 74.3}]) == [1234.0])
s = c.get("/api/sim").json()
check("simulation summaries for 3 programmes, each with validation", len(s["programmes"]) == 3 and all("validation" in p for p in s["programmes"]))
h = c.get("/api/sim/breast/region/90").json()
check("Helsinki breast gap splits into composition + other",
      abs(h["composition_gap"] + h["other_gap"] - (h["real"] - h["national_real"])) < 0.05 and len(h["scenarios"]) == 4)
import recommend as rec
action_ids = {x["id"] for x in c.get("/api/actions").json()["actions"]}
need = {aid for m in rec.SCENARIO_ACTIONS.values() for aid in m["actions"]} | {rec.MONITORING_ACTION} | set(rec.GOAL3_ACTIONS)
check("all cited roadmap action ids resolve", need <= action_ids)
r = c.get("/api/recommend/breast/90").json()
check("Helsinki breast driver is services", r["split"]["driver"] == "services")
r2 = c.get("/api/recommend/bowel/05").json()
check("Southwest Finland bowel driver is national", r2["split"]["driver"] == "national" and
      r2["split"]["assumption"] and any(a["id"] == rec.NATIONAL_ACTION for a in r2["pathway_actions"]))
check("every scenario cites an action with a page",
      all(s["actions"] and all(a["page"] > 0 for a in s["actions"]) for s in r["scenarios"]))
b = c.get("/api/brief").json()
check("brief: 3 counties per programme, missing desc",
      len(b["programmes"]) == 2 and all(len(p["counties"]) == 3 for p in b["programmes"]) and
      all([x["screening"]["missing_per_year"] for x in p["counties"]] ==
          sorted((x["screening"]["missing_per_year"] for x in p["counties"]), reverse=True) for p in b["programmes"]))
print(f"\n{len(fails)} failed" if fails else "\nall passed")
sys.exit(1 if fails else 0)
