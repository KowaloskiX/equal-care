"""Smoke test of the API and the data invariants. Usage: python src/check.py (exit code 1 on failure)."""
import json, sys
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
b5 = c.get("/api/brief?prog=breast&n=5").json()["programmes"]
check("brief n=5: up to five rows, all short of target, missing desc, programme-level national/target",
      len(b5) == 1 and 1 <= len(b5[0]["counties"]) <= 5 and
      all(x["screening"]["missing_per_year"] > 0 for x in b5[0]["counties"]) and b5[0]["national"] is not None and b5[0]["target"] is not None and
      [x["screening"]["missing_per_year"] for x in b5[0]["counties"]] ==
      sorted((x["screening"]["missing_per_year"] for x in b5[0]["counties"]), reverse=True))
check("scenarios carry share_of_missing consistent with missing_per_year",
      all(s["share_of_missing"] == round(100 * s["extra_people_per_year"] / r["screening"]["missing_per_year"])
          for s in r["scenarios"] if s["extra_people_per_year"]))
# oncology care-queue indicators (THL Hoitoon pääsy, specialty Syöpätaudit)
nat = c.get("/api/values?key=onc_wait_90&level=country").json()["values"]["358"]
check("oncology queue anchor reproduced: 486 waiting, 3.5 % over 90 d",
      nat["abs_value"] == 486 and nat["value"] == 3.5)
import datastore as ds
qD, qR, _ = ds.frames()
allc = set(qR[qR.level == "county"].code)
qcodes = set(qD[(qD.level == "county") & qD.key.isin(("onc_wait_90", "onc_ref_21"))].code)
check("queue producer mapping covers 22 counties; only Åland lacks a producer",
      len(allc - {"91"}) == 22 and allc - qcodes <= {"91", "20"} and "91" not in qcodes)
qw = c.get("/api/values?key=onc_wait_90").json()
check("queue values carry denominator and shared-producer flag",
      all("abs_value" in r and "shared_producer" in r for r in qw["values"].values()) and
      any(r["shared_producer"] == "HUS" for r in qw["values"].values()))
worst_w = max(qw["values"], key=lambda c: qw["values"][c]["value"])
r = c.get(f"/api/recommend/breast/{worst_w}").json()
check("worse-than-national oncology waiting adds 3.1.2 + 3.1.4",
      {"3.1.2", "3.1.4"} <= {a["id"] for a in r["pathway_actions"]})
qr = c.get("/api/values?key=onc_ref_21").json()
worst_r = max(qr["values"], key=lambda c: qr["values"][c]["value"])
r = c.get(f"/api/recommend/bowel/{worst_r}").json()
worse_r = qr["values"][worst_r]["value"] - qr["national"] >= 1.0
check("over-21-day referrals add 2.5.2 only when >= 1 pt worse than Finland",
      ("2.5.2" in {a["id"] for a in r["pathway_actions"]}) == worse_r)
# live what-if: a single scenario must reproduce the committed sim row; the all-four combo must not underperform it
w = c.get("/api/whatif?prog=breast&code=90&s=own_language").json()
sim_row = json.load(open(ROOT / "data/sim/breast.json"))["scenarios"]["own_language"]["levels"]["county"]["90"]
check("what-if single scenario equals the sim file row",
      w["delta_points"] == sim_row["delta_points"] and w["extra_people_per_year"] == sim_row["extra_people_per_year"])
singles = [c.get(f"/api/whatif?prog=breast&code=90&s={s}").json()["extra_people_per_year"]
           for s in ("own_language", "sms_reminder", "evening_slots", "mobile_unit")]
all4 = c.get("/api/whatif?prog=breast&code=90&s=own_language,sms_reminder,evening_slots,mobile_unit").json()
check("what-if all-four combo >= best single scenario",
      all4["extra_people_per_year"] >= max(singles))
print(f"\n{len(fails)} failed" if fails else "\nall passed")
sys.exit(1 if fails else 0)
