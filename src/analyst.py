"""The analyst drawer: Claude answers questions with tool calls over the app's own data functions.

Same rules as the rest of the app: numbers come from datastore/recommend/whatif — the model only
chooses and explains. After the final text, grounding.unverified() flags any number not present in
the tool results; the UI underlines those values.
"""
import json, os, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import datastore as ds, strategy, recommend as rec, whatif as wi, grounding
import residents as _residents   # noqa: F401 — its load_env() populates .env (ANTHROPIC_API_KEY) on import

ROOT = Path(__file__).resolve().parent.parent
MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-haiku-5-5")
MAX_TURNS = 6
MAX_TOKENS = 1500   # Haiku's thinking blocks share this budget — 600 truncated mid-sentence

SYSTEM = """
You are the analyst inside Equal Care Finland, a decision-support tool for Finnish wellbeing services counties and national cancer-care planners. You answer questions about regional gaps in cancer screening and in the later cancer-care pathway.

Rules:
1. Every number in your answer must be copied from a tool result in this conversation. Never calculate, re-round, estimate or recall numbers yourself. If a number is not in a tool result, do not state it.
2. Say which kind of evidence a number is: public data (THL Sotkanet, THL care-access data, Statistics Finland) or simulation (simulated residents answering through the Gemini Decisions API). When you use a simulated number, say it is simulated and give its validation r from the tool result.
3. A recommendation must name a roadmap action id and page from a tool result (for example "roadmap action 1.3.1, p. 33"). Do not recommend anything no tool result supports.
4. When it matters, say plainly what the data cannot show: stage at diagnosis is not published by county; screening attendance counts only the public programme; queue percentages based on fewer than 30 patients are uncertain.
5. Use neutral, non-shaming language about counties and residents.
6. Answer in English in at most 5 short sentences for a non-technical decision-maker. No headings, no tables, no lists.
7. Simulation exists only for breast screening (mammography) and bowel screening (colorectal home test). There is no cervical simulation.
8. If the question is outside this scope, say so in one sentence.
"""

PROG_ENUM = {"type": "string", "enum": ["breast", "bowel"]}
SCEN_ENUM = {"type": "string", "enum": ["own_language", "evening_slots", "sms_reminder", "mobile_unit"]}
IND_ENUM = {"type": "string", "enum": ["screen_breast", "screen_bowel", "screen_cervix", "wait_6m",
                                       "onc_ref_21", "onc_wait_90", "surv_breast", "surv_bowel",
                                       "surv_cervix", "cancer_index"]}

TOOLS = [
    {"name": "list_screening_gaps",
     "description": "Counties furthest from the 80 % screening attendance target for one programme: "
                    "real attendance rate, people missing per year, and Finland's rate. Public data (THL Sotkanet).",
     "input_schema": {"type": "object",
                      "properties": {"programme": PROG_ENUM,
                                     "n": {"type": "integer", "minimum": 1, "maximum": 23, "default": 5}},
                      "required": ["programme"]}},
    {"name": "find_county",
     "description": "Look up a wellbeing services county code by its English or Finnish name.",
     "input_schema": {"type": "object", "properties": {"name": {"type": "string"}}, "required": ["name"]}},
    {"name": "county_pathway",
     "description": "All care-pathway indicators for one county against Finland (screening, referral, oncology "
                    "queues, survival), each with its source and period. Public data.",
     "input_schema": {"type": "object", "properties": {"code": {"type": "string"}}, "required": ["code"]}},
    {"name": "explain_county",
     "description": "Why one county's screening attendance differs from Finland: the simulated split into what "
                    "its population explains and what it does not, the main reasons simulated residents give, "
                    "single-intervention effects in people per year, and the roadmap actions linked to them. "
                    "Simulation (Gemini Decisions), with its validation.",
     "input_schema": {"type": "object", "properties": {"programme": PROG_ENUM, "code": {"type": "string"}},
                      "required": ["programme", "code"]}},
    {"name": "simulate_interventions",
     "description": "Run one county's simulated residents again with one or more interventions combined. Returns "
                    "simulated attendance before and after, extra people per year, the share of the gap closed, "
                    "and the roadmap actions for each intervention. Simulation (Gemini Decisions); may make new Gemini Decisions calls if "
                    "this combination has not been run before.",
     "input_schema": {"type": "object",
                      "properties": {"programme": PROG_ENUM, "code": {"type": "string"},
                                     "interventions": {"type": "array", "items": SCEN_ENUM, "minItems": 1}},
                      "required": ["programme", "code", "interventions"]}},
    {"name": "indicator_ranking",
     "description": "One indicator for all counties, worst first, with Finland's value, the period and the "
                    "source. Public data.",
     "input_schema": {"type": "object", "properties": {"key": IND_ENUM}, "required": ["key"]}},
    {"name": "search_roadmap",
     "description": "Search the national cancer strategy implementation roadmap; returns matching action ids, "
                    "pages, titles, responsible parties and metrics.",
     "input_schema": {"type": "object", "properties": {"query": {"type": "string"}}, "required": ["query"]}},
]


def find_county(name):
    q = name.strip().lower()
    _, R, _ = ds.frames()
    out = []
    for _, r in R[R.level == "county"].iterrows():
        short = ds.short_names().get(r.code, "")
        if q in str(r["name"]).lower() or q in short.lower():
            out.append({"code": r.code, "name": short, "name_fi": r["name"]})
    return {"counties": out[:8]}


def list_screening_gaps(programme, n=5):
    b = rec.brief((programme,), max(1, min(int(n), 23)))["programmes"][0]
    return {"programme": programme, "national": b["national"], "target": b["target"], "note": b["note"],
            "validation": b["validation"],
            "counties": [{"code": c["code"], "name": c["name"], "screening": c["screening"],
                          "split": c["split"], "top_scenario": c["top_scenario"], "survival": c["survival"]}
                         for c in b["counties"]]}


def county_pathway(code):
    p = ds.pathway(code)
    inds = [{k: i[k] for k in ("key", "label", "stage", "goal", "unit", "value", "national", "delta",
                              "worse_than_national", "rank", "of", "target", "year", "abs_value",
                              "shared_producer", "source")} for i in p["indicators"]]
    return {"code": p["code"], "name": p["name"], "indicators": inds}


def explain_county(programme, code):
    return rec.recommend(programme, code)


def simulate_interventions(programme, code, interventions):
    try:
        return wi.whatif(programme, code, interventions)
    except wi.Unavailable as e:
        return {"error": f"503: {e}"}            # tool error text — the model relays it, nothing is faked
    except KeyError as e:
        return {"error": f"404: {e}"}


def indicator_ranking(key):
    if key not in ds.BY_KEY:
        return {"error": f"unknown indicator {key!r}"}
    v = ds.values(key, "county")
    better = v["higher_is_better"]
    rows = sorted(({"code": c, "name": r["name"], "value": r["value"], "abs_value": r["abs_value"],
                    "shared_producer": r.get("shared_producer")} for c, r in v["values"].items()),
                  key=lambda r: r["value"], reverse=(better is False))
    return {"key": key, "label": v["label"], "unit": v["unit"], "year": v["year"],
            "higher_is_better": better, "national": v["national"], "target": v["target"],
            "counties_worst_first": rows, "source": v["source"]}


def search_roadmap(query):
    words = query.lower().split()
    hits = [a for a in strategy.actions()
            if all(w in (a["title"] + " " + a["description"] + " " + (a.get("metric") or "")).lower() for w in words)]
    return {"source": {"title": strategy.DOCS["roadmap"][0], "url": strategy.DOCS["roadmap"][1]},
            "actions": [{"id": a["id"], "page": a["page"], "url": a["url"], "title": a["title"],
                         "title_en": rec.TITLE_EN.get(a["id"]), "responsible": a.get("responsible"),
                         "metric": a.get("metric")} for a in hits[:8]]}


TOOL_FNS = {t["name"]: globals()[t["name"]] for t in TOOLS}


def ask(question, prog=None, code=None, client=None):
    """One analyst turn: tool-use loop until Claude writes text, then ground it. Returns the /api/ask payload."""
    if client is None:
        key = os.environ.get("ANTHROPIC_API_KEY")
        if not key:
            raise RuntimeError("ANTHROPIC_API_KEY is not set")
        import anthropic
        client = anthropic.Anthropic(api_key=key, timeout=30)
    name = ds.short_names().get(code, code) if code else None
    messages = [{"role": "user", "content":
                 f"Context: the user is looking at programme {prog or 'not chosen'}, "
                 f"county {name or 'not chosen'} ({code or '-'}).\n\nQuestion: {question}"}]
    tools_used, results, focus, run = [], [], None, None
    usage = {"input_tokens": 0, "output_tokens": 0}
    text = ""
    for turn in range(MAX_TURNS):
        kwargs = {"model": MODEL, "max_tokens": MAX_TOKENS, "system": SYSTEM,
                  "tools": TOOLS, "messages": messages}
        if turn == MAX_TURNS - 1:
            kwargs["tool_choice"] = {"type": "none"}   # last turn must produce final text
        r = client.messages.create(**kwargs)
        usage["input_tokens"] += getattr(r.usage, "input_tokens", 0)
        usage["output_tokens"] += getattr(r.usage, "output_tokens", 0)
        calls = [b for b in r.content if getattr(b, "type", None) == "tool_use"]
        if not calls:
            text = "".join(getattr(b, "text", "") for b in r.content if getattr(b, "type", None) == "text")
            break
        messages.append({"role": "assistant", "content": r.content})
        out = []
        for c in calls:
            tools_used.append({"name": c.name, "args": dict(c.input)})
            res = TOOL_FNS[c.name](**c.input)
            results.append(res)
            out.append({"type": "tool_result", "tool_use_id": c.id,
                        "content": json.dumps(res, ensure_ascii=False, default=str)})
            if c.name in ("explain_county", "simulate_interventions"):
                focus = {"prog": c.input.get("programme"), "code": c.input.get("code")}
                if c.name == "simulate_interventions" and "error" not in res:
                    run = {"prog": c.input["programme"], "code": c.input["code"],
                           "scenarios": c.input["interventions"]}
        messages.append({"role": "user", "content": out})
    return {"text": text, "unverified": grounding.unverified(text, results, question),
            "tools": tools_used, "focus": focus, "run": run, "model": MODEL, "usage": usage}
