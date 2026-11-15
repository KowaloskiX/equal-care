"""Generated briefing + slide deck for one or more counties. Gemini writes the prose; every number comes from here.

1. facts(items)   -> flat FACTS dict built from the existing backend functions (recommend, datastore.pathway,
                     cached what-if, simulation validation, decomposition). Each fact carries value, unit, kind
                     (DATA | MODEL | SIMULATION | ROADMAP), label and source.
2. generate(...)  -> Gemini structured output (JSON schema). The model is told never to write a digit and to insert
                     {fact_key} placeholders instead.
3. render(raw)    -> every text field is checked: a digit outside a placeholder or an unknown key becomes a flag
                     (never silently fixed); placeholders are replaced with the formatted FACTS value.
4. cover()        -> one cover illustration from a Gemini image model (optional; failure means no image).

The model never computes: it only chooses which fact to cite. What-if results are used only when every answer is
already cached (whatif(..., cache_only=True)); the report never triggers simulation engine calls.
"""
import base64, concurrent.futures as cf, copy, hashlib, json, os, re, sys, time
from functools import lru_cache
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import datastore as ds
import recommend as rec
import strategy

ROOT = Path(__file__).resolve().parent.parent

DEFAULT_MODEL = "gemini-3.6-flash"
DEFAULT_IMAGE_MODEL = "gemini-3.1-flash-image-preview"
FALLBACK_IMAGE_MODEL = "gemini-2.5-flash-image"
TEXT_TIMEOUT_S = 40
IMAGE_TIMEOUT_S = 40
MAX_ITEMS = 6

SYSTEM_INSTRUCTION = """You write a short briefing for a Finnish wellbeing services county or a national cancer-care planner, from a FACTS JSON produced by the Equal Care Finland backend.
Rules:
1. Never write a digit. Whenever you need a number, insert its placeholder exactly as {fact_key}, using only keys that exist in FACTS. This includes years, percentages, people counts and roadmap action ids and pages.
2. Label evidence in words: say "public data" for DATA facts, "a statistical model" for MODEL facts, "simulation" for SIMULATION facts, "the national roadmap" for ROADMAP facts.
3. Every recommendation must cite a roadmap action through the placeholders of its id and page from FACTS.
4. Include the limitations from FACTS that apply to what you say.
5. Use neutral, non-shaming language about counties and residents.
6. Write in English, in plain words, for a non-technical decision-maker. Keep each bullet under 25 words.
7. The executive summary must state the main finding for each county in at most three sentences: where the gap is, how much of it who lives here explains, and the first action to try. Do not describe the document itself.
8. Each slide has a fixed visual chosen by its kind. Write the headline as the one-sentence takeaway of that visual, at most 12 words, and at most three bullets on what it means for the decision-maker.
9. Produce exactly one slide of each kind, in this order: title, where, why, who, what, pathway, limits, next.
"""

IMAGE_PROMPT = ("Abstract, calm editorial illustration for a public-health briefing about equal access to cancer "
                "screening across Finland: soft map-like shapes of lakes and forests, gentle teal and warm amber tones, "
                "no text, no numbers, no letters, no faces.")

LIMITATIONS = [
    "Screening attendance counts only the public programme; private screening counts as absence.",
    "Stage at diagnosis is not published by county.",
    "Simulated residents are a model, not a forecast; two engines disagree on how much of a gap is local.",
    "Oncology queue shares based on fewer than 30 patients are uncertain.",
]

SLIDE_KINDS = ["title", "where", "why", "who", "what", "pathway", "limits", "next"]
SCHEMA = {
    "type": "object",
    "required": ["title", "subtitle", "executive_summary", "slides", "recommendations"],
    "properties": {
        "title": {"type": "string"},
        "subtitle": {"type": "string"},
        "executive_summary": {"type": "string"},
        "slides": {
            "type": "array", "minItems": 6, "maxItems": 9,
            "items": {
                "type": "object",
                "required": ["kind", "headline", "bullets", "speaker_notes", "fact_refs"],
                "properties": {
                    "kind": {"type": "string", "enum": SLIDE_KINDS},
                    "headline": {"type": "string"},
                    "bullets": {"type": "array", "maxItems": 4, "items": {"type": "string"}},
                    "speaker_notes": {"type": "string"},
                    "fact_refs": {"type": "array", "items": {"type": "string"},
                                  "description": "FACTS keys (without braces) used on this slide."},
                },
            },
        },
        "recommendations": {
            "type": "array",
            "items": {
                "type": "object", "required": ["text", "action_ref"],
                "properties": {
                    "text": {"type": "string"},
                    "action_ref": {"type": "string",
                                   "description": "FACTS key (without braces) of the cited roadmap action id."},
                },
            },
        },
    },
}

PROG_WORDS = {"breast": "breast cancer screening", "bowel": "colorectal cancer screening"}
REASON_WORDS = {"time_work": "work or lack of time", "distance": "distance to the screening site",
                "language": "language of the invitation", "private": "screened privately instead",
                "fear": "fear or discomfort", "no_need": "feels no need"}
# Digit-free reasons for the pathway actions recommend.py attaches (its own "why" texts contain digits).
ACTION_REASON = {
    "2.4.1": "Attendance is at the national level, so the gap to the target is national; screening quality handbooks in procurement are the lever.",
    "2.4.5": "The part of the gap the population does not explain is larger than the part it does; monthly county screening data gives early warning.",
    "3.2.1": "Survival is below the national level, and stage at diagnosis is not published by county; a quality registry would locate the gap.",
    "3.2.2": "Survival is below the national level; peer comparison of quality-registry data between counties would show where care differs.",
    "2.5.2": "Oncology referrals are processed late more often than nationally; standardised referral criteria are the lever.",
    "3.1.2": "A larger share of oncology patients than nationally waits over ninety days; regional care pathways are the lever.",
    "3.1.4": "A larger share of oncology patients than nationally waits over ninety days; national quality targets and monitoring are the lever.",
}
QUEUE_LABEL = {"onc_wait_90": "share of oncology patients waiting over ninety days for treatment",
               "onc_ref_21": "share of oncology referrals processed in over twenty-one days"}
NO_GROUP_UNITS = {"year", "id", "page", "period"}


class Unconfigured(Exception):
    """GEMINI_API_KEY is not set (HTTP 503)."""


class ReportError(Exception):
    """Gemini call failed or timed out (HTTP 502)."""


def _load_env():
    p = ROOT / ".env"
    if p.exists():
        for line in p.read_text().splitlines():
            if "=" in line and not line.lstrip().startswith("#"):
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip().strip("\"'"))


_load_env()


# ---------------------------------------------------------------- formatting / placeholders

def fmt(value, unit=""):
    """'2 201', '74.3 %', '0.84', '2024'. Strings pass through."""
    if value is None:
        return "–"
    if isinstance(value, str):
        return value
    if isinstance(value, bool):
        return "yes" if value else "no"
    v = float(value)
    if unit in NO_GROUP_UNITS:
        return str(int(v)) if v == int(v) else str(value)
    if unit == "r":
        s = f"{v:.2f}"
    else:
        rv = round(v, 1)
        s = f"{round(v):,}".replace(",", " ") if abs(rv) >= 1000 or rv == int(rv) else f"{rv:.1f}"
    return f"{s} %" if unit == "%" else s


PH = re.compile(r"\{([A-Za-z][A-Za-z0-9_]*)\}")
DIGIT = re.compile(r"\d")


def digits_outside(text):
    """Digits left after removing well-formed {fact_key} placeholders."""
    return DIGIT.findall(PH.sub("", text or ""))


def render_text(text, facts, path, flags):
    if not isinstance(text, str):
        return text
    d = digits_outside(text)
    if d:
        flags.append({"path": path, "issue": "digit outside a placeholder", "text": text})

    def sub(m):
        k = m.group(1)
        f = facts.get(k)
        if not isinstance(f, dict) or "value" not in f:
            flags.append({"path": path, "issue": f"unknown fact key {{{k}}}", "text": text})
            return m.group(0)                      # left visible, not fixed
        return fmt(f["value"], f.get("unit", ""))
    return PH.sub(sub, text)


# ---------------------------------------------------------------- facts

def _akey(aid):
    return "a" + aid.replace(".", "_")


def _period(y):
    y = int(y)
    return f"{y // 100}-{y % 100:02d}" if y > 9999 else str(y)


def _flat_source(s):
    if not isinstance(s, dict):
        return None
    return {k: s.get(k) for k in ("title", "org", "url", "year", "period", "indicator", "updated", "page", "method", "note")
            if s.get(k) is not None}


def parse_items(spec):
    """'breast:90,bowel:07,breast:90:own_language+sms_reminder' -> [{prog, code, scenarios}]"""
    out = []
    for part in (spec or "").split(","):
        bits = [b.strip() for b in part.strip().split(":")]
        if len(bits) < 2 or not bits[0]:
            continue
        out.append({"prog": bits[0], "code": bits[1],
                    "scenarios": [s for s in bits[2].split("+") if s] if len(bits) > 2 else []})
    return out


def validate_items(items):
    if not items:
        raise ValueError("no items")
    if len(items) > MAX_ITEMS:
        raise ValueError(f"at most {MAX_ITEMS} items")
    norm = []
    for it in items:
        prog, code = it.get("prog"), str(it.get("code", ""))
        if prog not in PROG_WORDS:
            raise ValueError(f"unknown programme {prog!r} (breast | bowel)")
        if code not in ds.values(rec.PROGRAMMES[prog], "county")["values"]:
            raise ValueError(f"unknown county {code!r}")
        sc = sorted(set(it.get("scenarios") or []))
        bad = [s for s in sc if s not in rec.SCENARIO_ACTIONS]
        if bad:
            raise ValueError(f"unknown scenario(s) {bad}")
        norm.append({"prog": prog, "code": code, "scenarios": sc})
    return norm


class _Facts:
    def __init__(self):
        self.f = {}

    def add(self, key, value, unit, kind, label, source, **extra):
        if value is None:
            return
        if isinstance(value, float) and value != value:     # NaN
            return
        self.f[key] = {"value": value, "unit": unit, "kind": kind, "label": label,
                       "source": _flat_source(source), **{k: v for k, v in extra.items() if v is not None}}


def _roadmap_source(a):
    return {"title": strategy.DOCS["roadmap"][0], "org": "Ministry of Social Affairs and Health",
            "url": a.get("url") or strategy.DOCS["roadmap"][1], "page": a.get("page")}


def _add_action(F, a):
    k = _akey(a["id"])
    if f"{k}_id" in F.f:
        return f"{k}_id"
    src = _roadmap_source(a)
    F.add(f"{k}_id", a["id"], "id", "ROADMAP", "roadmap action number", src,
          title=a.get("title_en") or a.get("title"), url=a.get("url"), action_key=k)
    F.add(f"{k}_page", a["page"], "page", "ROADMAP", f"page of roadmap action {k}_id in the roadmap document", src)
    title = a.get("title_en") or a.get("title")
    if title and not DIGIT.search(title):
        F.add(f"{k}_title", title, "", "ROADMAP", f"title of roadmap action {k}_id", src)
    return f"{k}_id"


def _whatif_cached(prog, code, scenarios):
    """The combined what-if, only when every answer is already cached; never triggers engine calls."""
    try:
        import whatif
    except Exception:
        return None, "what-if module unavailable"
    try:
        r = whatif.whatif(prog, code, scenarios, cache_only=True)
    except TypeError:                         # signature changed: do not risk a live call
        return None, "what-if cache-only mode unavailable"
    except Exception as e:                    # Unavailable, KeyError, ...
        return None, f"what-if unavailable: {e}"
    if r is None:
        return None, "what-if combination is not fully cached; skipped (no live engine calls from the report)"
    return r, None


def build_facts(items):
    """-> (facts dict incl. 'limitations', per-item model context, notes). items must be validated."""
    F = _Facts()
    ctx_items, notes = [], []
    F.add("small_n_threshold", rec.SMALL_N, "patients", "DATA",
          "patient count below which an oncology queue share is treated as uncertain (app rule)",
          {"title": "Equal Care Finland small-number rule (src/recommend.py SMALL_N)"})
    sims_done, pathways_done = set(), set()
    for it in items:
        prog, code, scen = it["prog"], it["code"], it["scenarios"]
        p = f"c{code}_{prog}"
        r = rec.recommend(prog, code)
        name = r["name"]
        F.add(f"c{code}_name", name, "", "DATA", "county name", {"title": "Statistics Finland regions", "org": "Statistics Finland"})
        F.add(f"{p}_name", name, "", "DATA", f"county name for the {PROG_WORDS[prog]} item",
              {"title": "Statistics Finland regions", "org": "Statistics Finland"})
        ctx = {"programme": PROG_WORDS[prog], "county": name, "key_prefix": p, "county_prefix": f"c{code}",
               "suggested_actions": [], "scenario_keys": [], "whatif_key_prefix": None}

        # screening (DATA)
        sc = r.get("screening")
        ind = rec.PROGRAMMES[prog]
        v = ds.values(ind, "county")
        if sc:
            src = sc["source"]
            F.add(f"{p}_real", sc["rate"], "%", "DATA", f"{PROG_WORDS[prog]} attendance in {name}", src)
            F.add(f"{p}_year", src.get("year") or v["year"], "year", "DATA", f"year of the {PROG_WORDS[prog]} attendance figure", src)
            F.add(f"{p}_target", sc["target"], "%", "DATA",
                  "national strategy target for attendance in every wellbeing services county",
                  {"title": strategy.DOCS["strategy"][0], "url": strategy.DOCS["strategy"][1], "page": 5})
            F.add(f"{p}_missing", sc["missing_per_year"], "people per year", "DATA",
                  f"people a year missing to reach the target in {name} (invited x target minus attended)",
                  src | {"method": "invited = attended / rate; missing = target x invited - attended"})
            F.add(f"{p}_invited", sc["invited"], "people per year", "DATA", f"people invited per year in {name}", src)
        if v.get("national") is not None:
            F.add(f"{prog}_national", v["national"], "%", "DATA", f"{PROG_WORDS[prog]} attendance in Finland", v["source"])
        ranked = sorted(v["values"].items(), key=lambda kv: kv[1]["value"])
        rank = next((i + 1 for i, (c, _) in enumerate(ranked) if c == code), None)
        if rank:
            F.add(f"{p}_rank_low", rank, "rank", "DATA",
                  f"rank of {name} counted from the lowest attendance (one = lowest) among counties", v["source"])
            F.add(f"{prog}_n_counties", len(ranked), "counties", "DATA", "number of counties with attendance data", v["source"])

        # split (MODEL when it is the data decomposition, else SIMULATION)
        sp = r.get("split") or {}
        skind = "MODEL" if str(sp.get("note", "")).startswith("Data") else "SIMULATION"
        dsrc = sp.get("source") or {}
        split_src = ({"title": "Municipality-level weighted regression of attendance on population composition (src/decompose.py)",
                      "org": "Equal Care Finland, over THL Sotkanet data", "url": (dsrc.get("attendance") or {}).get("url"),
                      "year": (dsrc.get("attendance") or {}).get("year"), "method": sp.get("method")}
                     if skind == "MODEL" else {"title": "Simulated residents (src/simulate.py)", "note": sp.get("note")})
        real, nat = sp.get("real"), sp.get("national_real")
        if real is not None and nat is not None:
            F.add(f"{p}_vs_national", "below" if real < nat else "above" if real > nat else "equal to", "", "DATA",
                  f"whether {name} attendance is below or above Finland", v["source"])
        F.add(f"{p}_gap_pts", sp.get("total_pts"), "percentage points", "DATA",
              f"distance between {name} attendance and Finland", v["source"])
        F.add(f"{p}_comp_pts", sp.get("comp_pts"), "percentage points", skind,
              f"part of the distance to Finland that population composition (language, education, age, size) accounts for", split_src)
        F.add(f"{p}_other_pts", sp.get("other_pts"), "percentage points", skind,
              "part of the distance to Finland that population composition does not account for (services, private screening, other local factors)",
              split_src)
        if sp.get("r2_pct") is not None:
            F.add(f"{prog}_r2_pct", sp["r2_pct"], "%", "MODEL",
                  "share of the variation in attendance between municipalities that population composition accounts for", split_src)
            F.add(f"{prog}_n_munis", sp.get("n_municipalities"), "municipalities", "MODEL",
                  "municipalities used by the statistical model", split_src)
        driver_words = {"on_target": "the county is at or above the target", "national": "the gap is national, not local",
                        "services": "mostly factors other than population composition",
                        "population": "mostly population composition"}
        F.add(f"{p}_driver", driver_words.get(sp.get("driver")), "", skind, f"what mainly drives the gap in {name}", split_src)
        if f"{p}_driver" in F.f and sp.get("assumption") and not DIGIT.search(sp["assumption"]):
            F.f[f"{p}_driver"]["assumption"] = sp["assumption"]

        # survival (DATA, goal 3)
        sv = r.get("survival")
        if sv:
            F.add(f"{p}_surv", sv["value"], "%", "DATA", f"five-year relative survival, {prog} cancer, {name}", sv["source"])
            F.add(f"{prog}_surv_national", sv["national"], "%", "DATA", f"five-year relative survival, {prog} cancer, Finland", sv["source"])
            F.add(f"{prog}_surv_year", sv.get("year"), "year", "DATA", f"year of the {prog} cancer survival figures", sv["source"])
            F.add(f"{p}_surv_vs_national", "below" if sv["below_national"] else "at or above", "", "DATA",
                  f"whether {name} survival is below Finland", sv["source"])

        # scenarios (SIMULATION) with their roadmap actions (ROADMAP)
        for s in r.get("scenarios", []):
            k = f"{p}_sc_{s['scenario']}"
            acts = [_add_action(F, a) for a in s.get("actions", [])]
            src = {"title": "Simulated residents (src/simulate.py, data/sim)", "note": s.get("note")}
            F.add(f"{k}_extra", s.get("extra_people_per_year"), "people per year", "SIMULATION",
                  f"simulated extra people screened per year in {name} with: {s['label']}", src, actions=acts,
                  assumption=s.get("assumption") if s.get("assumption") and not DIGIT.search(s["assumption"]) else None)
            F.add(f"{k}_share", s.get("share_of_missing"), "%", "SIMULATION",
                  f"simulated share of the missing people this would reach: {s['label']}", src, actions=acts)
            ctx["scenario_keys"].append({"scenario": s["label"], "extra": f"{k}_extra", "share": f"{k}_share", "actions": acts})

        # pathway actions recommended by recommend.py (ROADMAP, digit-free reasons)
        for a in r.get("pathway_actions", []):
            key = _add_action(F, a)
            reason = ACTION_REASON.get(a["id"])
            if reason:
                ctx["suggested_actions"].append({"action": key, "page": f"{_akey(a['id'])}_page", "stage": a.get("stage"),
                                                 "reason": reason, "small_numbers": bool(a.get("small_numbers"))})

        # simulated barriers + validation (SIMULATION), once per programme
        s = rec._sim(prog)
        if s:
            row = s["levels"]["county"]["rows"].get(code) or {}
            reasons = row.get("reasons") or {}
            eng = rec.ENGINE_LABEL.get(s.get("engine"), s.get("engine"))
            ssrc = {"title": "Simulated residents (src/simulate.py, data/sim)", "note": f"Simulation · {eng}"}
            if reasons:
                top = max(reasons.items(), key=lambda kv: kv[1])
                F.add(f"{p}_sim_top_reason", REASON_WORDS.get(top[0], top[0]), "", "SIMULATION",
                      f"most common simulated reason for not attending in {name}", ssrc)
                F.add(f"{p}_sim_top_reason_share", round(100 * top[1], 1), "%", "SIMULATION",
                      f"share of simulated non-attendance in {name} with that reason", ssrc)
            if prog not in sims_done:
                sims_done.add(prog)
                val = (s.get("validation") or {}).get("counties_weighted") or {}
                F.add(f"sim_{prog}_engine", eng, "", "SIMULATION", "engine that answers for the simulated residents", ssrc)
                F.add(f"sim_{prog}_r", val.get("r"), "r", "SIMULATION",
                      f"correlation between simulated and real county attendance, {PROG_WORDS[prog]} (one = perfect)", ssrc)
                F.add(f"sim_{prog}_r_n", val.get("n"), "counties", "SIMULATION", "counties in that validation", ssrc)
                F.add(f"sim_{prog}_val_year", (s.get("validation") or {}).get("year"), "year", "SIMULATION",
                      "year the simulation is validated against", ssrc)

        # combined what-if, cached only
        if scen:
            w, note = _whatif_cached(prog, code, scen)
            if w:
                k = f"{p}_whatif"
                labels = " + ".join(rec.SCENARIO_ACTIONS[x]["short"] for x in scen)
                wsrc = _flat_source(w.get("source")) or {}
                wsrc = wsrc | {"note": w.get("note")}
                acts = [_add_action(F, a) for sc_ in w.get("scenarios", []) for a in sc_.get("actions", [])]
                F.add(f"{k}_label", labels, "", "SIMULATION", "interventions combined in the what-if", wsrc)
                F.add(f"{k}_extra", w.get("extra_people_per_year"), "people per year", "SIMULATION",
                      f"simulated extra people screened per year in {name} with the combination (upper bound)", wsrc,
                      actions=sorted(set(acts)))
                F.add(f"{k}_closed", w.get("gap_closed_pct"), "%", "SIMULATION",
                      "simulated share of the missing people the combination would reach (over a hundred means more than the gap)", wsrc)
                F.add(f"{k}_new_rate", w.get("new_rate"), "%", "SIMULATION", "simulated attendance with the combination", wsrc)
                ctx["whatif_key_prefix"] = k
            elif note:
                notes.append(f"{prog}:{code} {'+'.join(scen)}: {note}")

        # oncology queue (DATA, goal 3), once per county
        if code not in pathways_done:
            pathways_done.add(code)
            try:
                pw = ds.pathway(code)
            except Exception:
                pw = {"indicators": []}
            for q in pw["indicators"]:
                if q["key"] not in QUEUE_LABEL:
                    continue
                k = f"c{code}_{q['key']}"
                F.add(k, q["value"], "%", "DATA", f"{QUEUE_LABEL[q['key']]}, {name}", q["source"])
                F.add(f"{k}_national", q["national"], "%", "DATA", f"{QUEUE_LABEL[q['key']]}, Finland", q["source"])
                F.add(f"{k}_n", q.get("abs_value"), "patients", "DATA", f"patients behind that share, {name}", q["source"])
                F.add(f"{k}_period", _period(q["year"]), "period", "DATA", "month of the oncology queue figure", q["source"])
                if q.get("abs_value") is not None:
                    F.add(f"{k}_reliability",
                          "uncertain (fewer patients than the small-number threshold)" if q["abs_value"] < rec.SMALL_N else "based on enough patients",
                          "", "DATA", "how reliable that share is", q["source"])
                if q.get("shared_producer") and not DIGIT.search(q["shared_producer"]):
                    F.add(f"c{code}_queue_producer", q["shared_producer"], "", "DATA",
                          f"the queue figure for {name} is reported under this shared hospital producer", q["source"])
        ctx_items.append(ctx)

    facts = dict(F.f)
    facts["limitations"] = list(LIMITATIONS)
    return facts, ctx_items, notes


# ---------------------------------------------------------------- visuals (backend data for the fixed slide layouts; never sent to the model)

NEXT_STEPS = [
    "Pick the groups with the most expected non-attendance",
    "Send invitations and reminders in their own language",
    "Measure attendance against this baseline after one screening round",
]

_GEO = None


def _county_features():
    """All county polygons (data/geo/county.geojson is already a simplified set); together they draw Finland."""
    global _GEO
    if _GEO is None:
        gj = json.loads((ROOT / "data/geo/county.geojson").read_text())
        names = ds.short_names()
        _GEO = [{"code": f["properties"]["code"], "name": names.get(f["properties"]["code"], f["properties"]["name"]),
                 "geometry": f["geometry"]} for f in gj["features"]]
    return _GEO


def _combo_actions(r, combo):
    """Matcher-scored roadmap actions of the scenarios in a combo, best score per action id."""
    best = {}
    for s in r.get("scenarios", []):
        if s["scenario"] not in combo:
            continue
        for a in s.get("actions", []):
            if a["id"] not in best or (a.get("score") or 0) > (best[a["id"]].get("score") or 0):
                best[a["id"]] = a
    return sorted(({"id": a["id"], "title_en": a.get("title_en") or a.get("title"), "page": a.get("page"),
                    "score": a.get("score"), "confidence": a.get("confidence"),
                    "partial_match": a.get("partial_match"), "matched_by": a.get("matched_by")}
                   for a in best.values()), key=lambda x: -(x["score"] or 0))


def _pw_node_status(its):
    """Same status logic as the guided step-4 strip: gap / worse / better / close
    (ASSUMPTION shared with the UI: a |delta| < 1 point counts as close to Finland)."""
    def _cl(q):
        return q["unit"] == "%" and q.get("delta") is not None and abs(q["delta"]) < 1
    if not its:
        return "gap"
    if any(q.get("worse_than_national") and not _cl(q) for q in its):
        return "worse"
    if any(q.get("delta") not in (None, 0) and not _cl(q) for q in its):
        return "better"
    return "close"


def build_visuals(items):
    """-> visuals dict keyed 'c{code}_{prog}' (the FACTS key prefix): the fixed per-kind slide visuals,
    every value computed in code with its source. Nothing here is shown to the model and no live
    engine calls are made — what-if rows come from the cache only (whatif(cache_only=True))."""
    import decompose, replay, whatif
    names = ds.short_names()
    out = {}
    for it in items:
        prog, code, scen = it["prog"], it["code"], it["scenarios"]
        p = f"c{code}_{prog}"
        V = {"prog": prog, "code": code}
        try:
            r = rec.recommend(prog, code)
        except Exception as e:
            out[p] = {"prog": prog, "code": code, "error": str(e)}
            continue
        name = r["name"]
        ind = rec.PROGRAMMES[prog]
        sc = r.get("screening")

        # where — ranking + mini-map
        try:
            v = ds.values(ind, "county")
            ranked = sorted(v["values"].items(), key=lambda kv: kv[1]["value"])
            V["where"] = {
                "county": {"code": code, "name": name, "rate": sc["rate"] if sc else None,
                           "missing_per_year": sc["missing_per_year"] if sc else None},
                "ranking": [{"code": c, "name": names.get(c, c), "rate": x["value"],
                             "missing_per_year": (ds.screening_gap(ind, c) or {}).get("missing_per_year")}
                            for c, x in ranked[:5]],
                "target": sc["target"] if sc else v.get("target"), "national": v.get("national"), "unit": "%",
                "map": {"highlight": code, "features": _county_features()},
                "source": _flat_source(v["source"]),
            }
        except Exception as e:
            V["where"] = {"error": str(e)}

        # why — municipality-WLS decomposition
        try:
            d = decompose.decompose(prog)
            row = d["rows"].get(code) or {}
            V["why"] = {
                "real": row.get("real"), "expected": row.get("expected"),
                "composition_gap": row.get("composition_gap"),
                "composition_gap_90": row.get("composition_gap_90"),
                "unexplained_gap": row.get("unexplained_gap"), "total_gap": row.get("total_gap"),
                "national_real": d["national_real"], "r2_pct": round(100 * d["r2"]),
                "n_municipalities": d["n_municipalities"], "method": d["method"],
                "source": {"attendance": _flat_source(d["source"]["attendance"]),
                           "composition": {k: _flat_source(s) for k, s in d["source"]["composition"].items()}},
            }
        except Exception as e:
            V["why"] = {"error": str(e)}

        # who — baseline replay final (reads committed caches only, never asks)
        try:
            rep = replay.replay(prog, code)
            fin = rep["final"]
            V["who"] = {
                "groups": fin.get("groups"),
                "barriers": rep["rows"][-1]["cum_reasons"] if rep.get("rows") else {},
                "barrier_labels": replay.REASON_SHORT,
                "simulated_rate": fin.get("rate"), "real_rate": fin.get("real"),
                "expected_skip_per_100": round(100 - fin["rate"]) if fin.get("rate") is not None else None,
                "people_total": rep.get("people_total"), "per_dot": rep.get("per_dot"),
                "engine": rep.get("engine"), "note": rep.get("note"),
                "source": _flat_source(rep.get("source")),
            }
        except Exception as e:
            V["who"] = {"error": str(e)}

        # what — every intervention for this county: each single scenario from recommend (its own
        # simulated effect + cited actions) plus every combination the item carries; both engines,
        # cached answers only — the report never asks an engine live.
        try:
            gap = ds.screening_gap(ind, code)
            missing = (gap or {}).get("missing_per_year")
            combos = [[s["scenario"]] for s in r.get("scenarios", [])]
            if scen:
                combo = sorted(set(scen))
                if combo not in combos:                # a single-scenario item is already a single row
                    combos.append(combo)

            def _cached(combo, engine=None):
                try:
                    return whatif.whatif(prog, code, combo, engine=engine, cache_only=True)
                except Exception:
                    return None

            def _acts(acts):
                return [{"id": a["id"], "page": a.get("page"),
                         "title_en": a.get("title_en") or a.get("title"),
                         "score": a.get("score"), "partial": bool(a.get("partial_match"))}
                        for a in acts]

            rows = []
            for combo in combos:
                w = _cached(combo)
                if w and w.get("engine") == "jev":     # the deployed sim engine is Jev: it fills the jev side
                    w, jev_w = None, w
                else:
                    jev_w = (w or {}).get("other_engine") or _cached(combo, engine="jev")
                rec_s = next((s for s in r.get("scenarios", []) if s["scenario"] == combo[0]), None) \
                    if len(combo) == 1 else None
                row = {"label": " + ".join(rec.SCENARIO_ACTIONS[x]["short"] for x in combo),
                       "scenarios": combo, "missing": missing,
                       "gemini_extra": (rec_s["extra_people_per_year"] if rec_s
                                        else (w or {}).get("extra_people_per_year")),
                       "jev_extra": (jev_w or {}).get("extra_people_per_year"),
                       "gemini_pct": (rec_s["share_of_missing"] if rec_s
                                      else (w or {}).get("gap_closed_pct")),
                       "jev_pct": (jev_w or {}).get("gap_closed_pct"),
                       "actions": _acts(rec_s["actions"] if rec_s else _combo_actions(r, combo))}
                if row["gemini_extra"] is None and row["jev_extra"] is None:
                    row["note"] = "combination not cached — the report never asks the engine live"
                rows.append(row)
            rows.sort(key=lambda x: (x["gemini_extra"] is None, -(x["gemini_extra"] or 0)))
            V["what"] = {"missing_per_year": missing, "rows": rows,
                         "source": {"title": "Simulated residents (data/sim + src/whatif.py, cached answers only)"}}
        except Exception as e:
            V["what"] = {"error": str(e)}

        # pathway — 5-node statuses + onc_wait_90 monthly series for county and Finland
        try:
            surv_key = "surv_bowel" if prog == "bowel" else "surv_breast"
            NODES = [("detection", [ind]), ("referral", ["wait_6m", "onc_ref_21"]), ("diagnosis", []),
                     ("treatment", ["onc_wait_90"]), ("outcome", [surv_key])]
            by_key = {q["key"]: q for q in ds.pathway(code)["indicators"]}
            nodes = []
            for nid, keys in NODES:
                its = [by_key[k] for k in keys if k in by_key]
                pri = its[0] if its else None
                nodes.append({"id": nid, "status": _pw_node_status(its),
                              "value": pri["value"] if pri else None,
                              "national": pri["national"] if pri else None,
                              "unit": pri["unit"] if pri else None,
                              "abs_value": pri.get("abs_value") if pri else None,
                              "small_n": bool(pri and pri.get("abs_value") is not None
                                              and pri["abs_value"] < rec.SMALL_N)})
            queue = None
            try:
                tl = ds.timeline("onc_wait_90")
                queue = {"key": "onc_wait_90", "label": tl["label"], "unit": tl["unit"],
                         "periods": tl["periods"],
                         "county": {str(x): ((tl["values"].get(x, {}).get(code) or {}).get("value"))
                                    for x in tl["periods"]},
                         "finland": {str(x): tl["national"].get(x) for x in tl["periods"]},
                         "source": _flat_source(tl["source"])}
            except Exception:
                pass
            V["pathway"] = {"nodes": nodes, "queue": queue,
                            "source": _flat_source((by_key.get("onc_wait_90") or {}).get("source"))}
        except Exception as e:
            V["pathway"] = {"error": str(e)}

        # limits — the fixed limitation strings
        V["limits"] = list(LIMITATIONS)

        # next — first-ranked intervention's cited actions + the pilot steps
        first = (r.get("scenarios") or [None])[0]
        V["next"] = {"scenario": first["scenario"] if first else None,
                     "label": first["short"] if first else None,
                     "actions": _combo_actions(r, [first["scenario"]]) if first else [],
                     "steps": list(NEXT_STEPS)}

        out[p] = V
    return out


def _model_text(text, facts):
    """A FACTS string for the model with its numbers turned into placeholders; None if digits remain."""
    t = re.sub(r"\b(\d+\.\d+\.\d+)\b", lambda m: "{" + _akey(m.group(1)) + "_id}" if f"{_akey(m.group(1))}_id" in facts else m.group(0), text)
    t = t.replace(f"fewer than {rec.SMALL_N} ", "fewer than {small_n_threshold} ")
    return None if digits_outside(t) else t


def model_input(facts, ctx_items):
    """FACTS as the model sees them: no sources; a 'shown_as' string so it knows how each placeholder renders."""
    out = {}
    for k, f in facts.items():
        if k == "limitations":
            continue
        g = {x: f[x] for x in ("value", "unit", "kind", "label", "actions", "assumption") if x in f}
        if f.get("unit") == "id" and f.get("title") and not DIGIT.search(f["title"]):
            g["title"] = f["title"]
        g["shown_as"] = fmt(f["value"], f.get("unit", ""))
        out[k] = g
    return {"facts": out, "items": ctx_items,
            "limitations": [t for t in (_model_text(x, facts) for x in facts["limitations"]) if t]}


# ---------------------------------------------------------------- Gemini

_client = None


def client():
    global _client
    if not os.environ.get("GEMINI_API_KEY") and not os.environ.get("GOOGLE_API_KEY"):
        raise Unconfigured("GEMINI_API_KEY is not set")
    if _client is None:
        from google import genai
        _client = genai.Client()
    return _client


@lru_cache(maxsize=1)
def _models():
    """{short model id: supported actions} from models.list(), called once per process."""
    out = {}
    for m in client().models.list():
        out[(m.name or "").removeprefix("models/")] = list(getattr(m, "supported_actions", None) or [])
    return out


def _version(mid):
    m = re.search(r"gemini-(\d+(?:\.\d+)?)", mid)
    return float(m.group(1)) if m else 0.0


def pick_text_model():
    want = os.environ.get("REPORT_MODEL", DEFAULT_MODEL)
    try:
        M = _models()
    except Unconfigured:
        raise
    except Exception as e:
        return want, f"models.list() failed ({e}); using {want} unverified"
    if want in M:
        return want, None
    cands = [m for m, acts in M.items() if "flash" in m and re.match(r"gemini-\d", m)
             and not re.search(r"image|tts|audio|live|embed|native|robotics|computer", m)
             and (not acts or "generateContent" in acts)]
    if not cands:
        raise ReportError(f"model {want!r} not available and no flash text model found")
    best = sorted(cands, key=lambda m: (_version(m), "lite" not in m, not re.search(r"preview|exp", m), -len(m)))[-1]
    return best, f"{want} is not in models.list(); using newest flash text model {best}"


def pick_image_model():
    want = os.environ.get("REPORT_IMAGE_MODEL", DEFAULT_IMAGE_MODEL)
    try:
        M = _models()
    except Exception:
        return None
    for m in (want, FALLBACK_IMAGE_MODEL):
        if m in M:
            return m
    return None


def _with_timeout(fn, seconds):
    ex = cf.ThreadPoolExecutor(max_workers=1)
    fut = ex.submit(fn)
    try:
        return fut.result(timeout=seconds)
    except cf.TimeoutError:
        raise ReportError(f"Gemini did not answer within {seconds} s")
    finally:
        ex.shutdown(wait=False, cancel_futures=True)


def _usage(resp):
    u = getattr(resp, "usage_metadata", None)
    if not u:
        return None
    return {k: getattr(u, k, None) for k in ("prompt_token_count", "candidates_token_count", "thoughts_token_count",
                                              "total_token_count")}


def generate(payload, model):
    from google.genai import types
    c = client()

    def cfg(thinking):
        kw = dict(system_instruction=SYSTEM_INSTRUCTION, response_mime_type="application/json",
                  response_json_schema=SCHEMA,
                  http_options=types.HttpOptions(timeout=TEXT_TIMEOUT_S * 1000))
        if thinking and model.startswith("gemini-3"):
            kw["thinking_config"] = types.ThinkingConfig(thinking_level="low")
        return types.GenerateContentConfig(**kw)

    contents = "FACTS:\n" + json.dumps(payload, ensure_ascii=False)
    t0 = time.time()

    def call(thinking=True):
        return c.models.generate_content(model=model, contents=contents, config=cfg(thinking))
    try:
        try:
            resp = _with_timeout(call, TEXT_TIMEOUT_S)
        except ReportError:
            raise
        except Exception as e:                   # e.g. thinking_level not supported by this model: retry once without
            if "thinking" not in str(e).lower():
                raise
            resp = _with_timeout(lambda: call(False), max(5, TEXT_TIMEOUT_S - (time.time() - t0)))
    except (ReportError, Unconfigured):
        raise
    except Exception as e:
        raise ReportError(f"Gemini error ({model}): {e}")
    latency = round(time.time() - t0, 2)
    text = resp.text or ""
    try:
        raw = json.loads(text)
    except json.JSONDecodeError as e:
        raise ReportError(f"Gemini returned invalid JSON ({model}): {e}")
    return raw, _usage(resp), latency


# ---------------------------------------------------------------- grounding / rendering

def _resolve_action(ref, facts):
    k = (ref or "").strip().strip("{}")
    for cand in (k, f"{k.removesuffix('_page')}_id", f"{k}_id"):
        f = facts.get(cand)
        if isinstance(f, dict) and f.get("kind") == "ROADMAP" and f.get("unit") == "id":
            return cand, f
    for kk, ff in facts.items():                          # model gave the id itself instead of the key
        if isinstance(ff, dict) and ff.get("unit") == "id" and str(ff.get("value")) == k:
            return kk, ff
    return None, None


def render(raw, facts):
    """-> (rendered report, flags). Never silently fixes: problems stay visible and are listed in flags."""
    flags = []
    R = copy.deepcopy(raw)
    for fld in ("title", "subtitle", "executive_summary"):
        R[fld] = render_text(raw.get(fld, ""), facts, fld, flags)
    slides = raw.get("slides") or []
    if not 6 <= len(slides) <= 9:
        flags.append({"path": "slides", "issue": f"expected six to nine slides, got {len(slides)}"})
    for i, s in enumerate(slides):
        rs = R["slides"][i]
        rs["headline"] = render_text(s.get("headline", ""), facts, f"slides[{i}].headline", flags)
        rs["speaker_notes"] = render_text(s.get("speaker_notes", ""), facts, f"slides[{i}].speaker_notes", flags)
        bl = s.get("bullets") or []
        if len(bl) > 4:
            flags.append({"path": f"slides[{i}].bullets", "issue": f"more than four bullets ({len(bl)})"})
        rs["bullets"] = [render_text(b, facts, f"slides[{i}].bullets[{j}]", flags) for j, b in enumerate(bl)]
        refs = [str(x).strip().strip("{}") for x in (s.get("fact_refs") or [])]
        used = set(refs) | {m.group(1) for t in [s.get("headline", ""), s.get("speaker_notes", "")] + bl for m in PH.finditer(t or "")}
        unknown = [k for k in refs if k not in facts or k == "limitations"]
        if unknown:
            flags.append({"path": f"slides[{i}].fact_refs", "issue": f"unknown fact keys: {', '.join(unknown)}"})
        kinds = []
        for k in sorted(used):
            f = facts.get(k)
            if isinstance(f, dict) and f.get("kind") and f["kind"] not in kinds:
                kinds.append(f["kind"])
        rs["evidence"] = [k for k in ("DATA", "MODEL", "SIMULATION", "ROADMAP") if k in kinds]
        rs["fact_refs"] = refs
    for i, r in enumerate(raw.get("recommendations") or []):
        rr = R["recommendations"][i]
        text = r.get("text", "")
        rr["text"] = render_text(text, facts, f"recommendations[{i}].text", flags)
        keys = {m.group(1) for m in PH.finditer(text)}
        roadmap = [k for k in keys if isinstance(facts.get(k), dict) and facts[k].get("kind") == "ROADMAP"]
        if not any(k.endswith("_id") for k in roadmap) or not any(k.endswith("_page") for k in roadmap):
            flags.append({"path": f"recommendations[{i}].text",
                          "issue": "does not cite a roadmap action id and page through placeholders", "text": text})
        k, f = _resolve_action(r.get("action_ref"), facts)
        if not f:
            flags.append({"path": f"recommendations[{i}].action_ref", "issue": f"unknown roadmap action {r.get('action_ref')!r}"})
            rr["action"] = None
        else:
            ak = f.get("action_key") or k.removesuffix("_id")
            page = facts.get(f"{ak}_page", {}).get("value")
            rr["action"] = {"key": k, "id": f["value"], "page": page, "title": f.get("title"), "url": f.get("url")}
    return R, flags


# ---------------------------------------------------------------- public entry points

_CACHE: dict = {}
_COVER: dict = {}


def _hash(items, model):
    return hashlib.sha256(json.dumps({"items": items, "model": model, "v": 1}, sort_keys=True).encode()).hexdigest()[:16]


SCENE_SUFFIX = {"where": " Scene: a quiet overview of Finnish towns and lakes from above.",
                "next": " Scene: a sunrise over a Finnish town, a sense of a first step."}


def cover_cached(scene=None):
    """True when asking cover(scene) would hit the process cache (or no image model exists, so nothing
    is ever paid for). Used by the API's budget check."""
    m = pick_image_model()
    if not m:
        return True
    scene = scene if scene in SCENE_SUFFIX else None
    return (m, scene) in _COVER


def cover(scene=None):
    """{image: data URL | None, model, error?}; cached per process per scene.
    scene: None for the cover, 'where'/'next' for the two slide backdrops (same style prompt + a scene line)."""
    m = pick_image_model()
    if not m:
        return {"image": None, "model": None, "error": "no image model available"}
    if scene not in SCENE_SUFFIX:
        scene = None
    prompt = IMAGE_PROMPT + (SCENE_SUFFIX.get(scene) or "")
    if (m, scene) in _COVER:
        return _COVER[(m, scene)]
    from google.genai import types
    c = client()

    def call():
        return c.models.generate_content(
            model=m, contents=prompt,
            config=types.GenerateContentConfig(response_modalities=["TEXT", "IMAGE"],
                                               image_config=types.ImageConfig(aspect_ratio="16:9"),
                                               http_options=types.HttpOptions(timeout=IMAGE_TIMEOUT_S * 1000)))
    t0 = time.time()
    try:
        resp = _with_timeout(call, IMAGE_TIMEOUT_S)
        for part in (resp.candidates[0].content.parts or []):
            blob = getattr(part, "inline_data", None)
            if blob and blob.data:
                data = blob.data if isinstance(blob.data, bytes) else base64.b64decode(blob.data)
                out = {"image": f"data:{blob.mime_type or 'image/png'};base64,{base64.b64encode(data).decode()}",
                       "model": m, "latency_s": round(time.time() - t0, 2), "prompt": prompt, "scene": scene}
                _COVER[(m, scene)] = out
                return out
        return {"image": None, "model": m, "error": "image model returned no image"}
    except Exception as e:
        return {"image": None, "model": m, "error": str(e)}


def report(items, with_image=False):
    items = validate_items(items)
    model, model_note = pick_text_model()
    h = _hash(items, model)
    if h in _CACHE:
        out = dict(_CACHE[h], cached=True)
        if with_image and not out.get("image"):
            out["image"] = cover()
        return out
    facts, ctx, notes = build_facts(items)
    payload = model_input(facts, ctx)
    img_future, ex = None, None
    if with_image:
        ex = cf.ThreadPoolExecutor(max_workers=1)
        img_future = ex.submit(cover)
    raw, usage, latency = generate(payload, model)
    rendered, flags = render(raw, facts)
    out = {"report": rendered, "raw": raw, "facts": facts, "flags": flags, "items": items,
           "visuals": build_visuals(items),
           "model": model, "model_note": model_note, "usage": usage, "latency_s": latency, "notes": notes,
           "id": h, "cached": False}
    _CACHE[h] = out
    if img_future:
        try:
            out = dict(out, image=img_future.result(timeout=IMAGE_TIMEOUT_S))
        except Exception as e:
            out = dict(out, image={"image": None, "error": str(e)})
        ex.shutdown(wait=False)
    return out


def report_is_cached(items, with_image=False):
    """True when report(items, with_image) would be served entirely from the process cache —
    the API's budget check only charges uncached generations."""
    items = validate_items(items)
    model, _ = pick_text_model()
    if _hash(items, model) not in _CACHE:
        return False
    if with_image and not cover_cached():
        return False
    return True
