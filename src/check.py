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
check("simulation summaries for breast+bowel (cervix out of the story), each with validation",
      {p["programme"] for p in s["programmes"]} == {"breast", "bowel"} and all("validation" in p for p in s["programmes"]))
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
tl = c.get("/api/timeline?key=onc_wait_90").json()
check("timeline: 202609 national onc_wait_90 is 3.5",
      tl["national"].get("202609") == 3.5 and tl["periods"] == sorted(tl["periods"]))
check("timeline: every county value carries abs_value",
      all("abs_value" in v for p in tl["values"].values() for v in p.values()))
check("timeline: only queue indicators (others 404)",
      c.get("/api/timeline?key=screen_breast").status_code == 404)
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
# resident replay: rows must add up exactly to the committed sim county rate / the live what-if rate
rb = c.get("/api/residents/breast/90")
check("replay Helsinki breast baseline: 200 OK, rows, 0 live calls",
      rb.status_code == 200 and len(rb.json()["rows"]) > 0 and rb.json()["asked_live"] == 0)
rb = rb.json()
sim90 = json.load(open(ROOT / "data/sim/breast.json"))["levels"]["county"]["rows"]["90"]
check("replay final rate equals sim expected (Helsinki breast)",
      abs(rb["final"]["rate"] - sim90["expected"]) <= 0.01)
check("replay last cum_rate equals final rate", rb["rows"][-1]["cum_rate"] == rb["final"]["rate"])
rb2 = c.get("/api/residents/bowel/03").json()
sim03 = json.load(open(ROOT / "data/sim/bowel.json"))["levels"]["county"]["rows"]["03"]
check("replay final rate equals sim expected (West Uusimaa bowel)",
      abs(rb2["final"]["rate"] - sim03["expected"]) <= 0.01)
rs = c.get("/api/residents/breast/90?s=own_language,sms_reminder").json()
check("scenario replay last cum_rate equals whatif new_rate",
      rs["rows"][-1]["cum_rate"] == rs["whatif"]["new_rate"] and rs["asked_live"] == 0)
_lines = {}
def _file_line(path, n):
    if path not in _lines:
        _lines[path] = (ROOT / path).read_text().splitlines()
    return json.loads(_lines[path][n - 1])
check("every replay row's file/line resolves to its answer_key",
      all(_file_line(r["file"], r["line"])["key"] == r["answer_key"] for r in rb["rows"] + rs["rows"]))
check("replay answer endpoint returns the asked state and raw line",
      c.get(f"/api/residents/breast/answer?key={json.dumps(rb['rows'][0]['answer_key'])}").json()["answer"]["key"]
      == rb["rows"][0]["answer_key"])
# map dots: one dot per `per_dot` people of a row's municipality share; scenario uses the baseline's per_dot
check("baseline replay carries per_dot and row munis/dots",
      rb.get("per_dot") and all(r.get("munis") and "dots" in r and "p_cal" in r for r in rb["rows"]))
ndots = sum(k for r in rb["rows"] for _, k in r["dots"])
check("dots x per_dot tracks people_total within one per_dot per row",
      abs(ndots * rb["per_dot"] - rb["people_total"]) <= rb["per_dot"] * len(rb["rows"]))
check("scenario replay uses the baseline's per_dot and carries p_cal_before",
      rs["per_dot"] == rb["per_dot"] and all("p_cal" in r and "p_cal_before" in r for r in rs["rows"]))
check("cervix replay is out of the story (404)", c.get("/api/residents/cervix/90").status_code == 404)
big = c.get("/api/residents/bowel/90")
check("largest replay payload stays under ~1.5 MB", len(big.content) < 1_500_000)

# analyst: tool functions return real, source-carrying data; the tool-use loop works on a fake client (no network)
import analyst
gaps = analyst.list_screening_gaps("breast", 3)
check("analyst list_screening_gaps: counties with real rates + missing/yr",
      len(gaps["counties"]) == 3 and all("missing_per_year" in co["screening"] for co in gaps["counties"])
      and gaps["national"] > 0)
fc = analyst.find_county("Helsinki")
check("analyst find_county resolves Helsinki", any(x["code"] == "90" for x in fc["counties"]))
pw = analyst.county_pathway("90")
check("analyst county_pathway: sourced indicators", len(pw["indicators"]) >= 10
      and all(i["source"].get("url") for i in pw["indicators"]))
ex = analyst.explain_county("breast", "90")
check("analyst explain_county: split + cited scenarios",
      ex["split"]["driver"] in ("services", "population")
      and all(s["actions"] for s in ex["scenarios"]))
sw = analyst.simulate_interventions("breast", "90", ["own_language", "sms_reminder"])
check("analyst simulate_interventions: rates + actions", sw["new_rate"] > sw["baseline_rate"]
      and all(a["page"] for s in sw["scenarios"] for a in s["actions"]))
rk = analyst.indicator_ranking("onc_wait_90")
check("analyst indicator_ranking: worst first with national + source",
      rk["counties_worst_first"][0]["value"] >= rk["counties_worst_first"][-1]["value"]
      and rk["national"] > 0 and rk["source"]["url"])
rm = analyst.search_roadmap("screening")
check("analyst search_roadmap: actions with ids + pages",
      len(rm["actions"]) > 0 and all(a["id"] and a["page"] for a in rm["actions"]))

class _Block:
    def __init__(self, **kw): self.__dict__.update(kw)
class _Resp:
    def __init__(self, content): self.content = content; self.usage = _Block(input_tokens=11, output_tokens=7)
class _FakeMsgs:
    def __init__(self): self.n = 0
    def create(self, **kw):
        self.n += 1
        if self.n == 1:
            return _Resp([_Block(type="tool_use", id="t1", name="explain_county",
                                 input={"programme": "breast", "code": "90"})])
        return _Resp([_Block(type="text", text="Helsinki sits at 74.3 %; the split is mostly services.")])
class _Fake:
    def __init__(self): self.messages = _FakeMsgs()
ans = analyst.ask("why is Helsinki behind?", "breast", "90", client=_Fake())
check("analyst loop: tool_use then text, tools + focus returned",
      ans["text"].startswith("Helsinki") and ans["tools"] == [{"name": "explain_county",
      "args": {"programme": "breast", "code": "90"}}] and ans["focus"] == {"prog": "breast", "code": "90"}
      and ans["run"] is None and ans["usage"]["input_tokens"] == 22)
check("analyst grounding flags an invented number",
      grounding.unverified("Attendance is 99.9 %.", [{"rate": 74.3, "missing_per_year": 2205}], ""))
print(f"\n{len(fails)} failed" if fails else "\nall passed")
sys.exit(1 if fails else 0)
