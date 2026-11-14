"""Roadmap matcher: which numbered roadmap action addresses which gap? One typed score question
per (action, gap) asked of the Gemini Decisions API; answers are cached in
data/decisions/matcher_<hash>.jsonl and committed, so the demo needs no key and never invents
a citation. recommend.py reads ranked(gap) instead of hand-mapped action lists.

Question wording is verbatim from the spec; changing it changes the cache hash and re-asks.

Run:  .venv/bin/python src/matcher.py            (asks every action x gap once, needs GEMINI_API_KEY)
      .venv/bin/python src/matcher.py --report   (print the ranked table from the cache, no calls)
"""
import argparse, asyncio, hashlib, json, random, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import datastore as ds, strategy
import residents as js                     # engine plumbing: MODEL, API_KEY, cache dir, price table

ROOT = Path(__file__).resolve().parent.parent
PAGES = ROOT / "data/strategy/pages.jsonl"
CONC = 10                                 # same Tier-1 budget as the resident migration

# gap_text verbatim from the spec — do not reword (it is what the model scored against)
GAPS = {
    "lang_barrier": "Residents whose native language is not Finnish or Swedish take part in cancer screening less often than others, and the invitation language is a barrier.",
    "screening_service": "Cancer screening attendance in a county is lower than its population composition would predict, pointing to how screening is organised or reached locally.",
    "screening_reminders": "People invited to cancer screening miss appointments because of work, time or the fixed appointment time, and are not reminded or offered easy rebooking.",
    "screening_distance": "People in sparsely populated areas take part in cancer screening less because of travel distance.",
    "onc_queue": "A large share of oncology patients wait more than 90 days for treatment in a county.",
    "referral_delay": "Oncology referrals are processed slowly in a county.",
    "survival_gap": "Five-year cancer survival in a county is lower than in Finland as a whole.",
    "stage_data_gap": "Stage at diagnosis is not recorded for most cancers, so regional differences in early detection cannot be measured.",
}
CRITERIA = ["Unrelated: the action does not concern this gap.",
            "Related topic only: the action touches the area but would not change this gap.",
            "Partly: the action would contribute to closing this gap among other aims.",
            "Directly: closing this gap is a main purpose of the action."]


def _question(gap):
    return {"type": "score",
            "instructions": f"How directly would carrying out this roadmap action address the gap described below?\n\nGap: {GAPS[gap]}",
            "criteria": CRITERIA}


def _page_texts():
    out = {}
    for line in PAGES.read_text().splitlines():
        r = json.loads(line)
        if r["doc"] == "roadmap":
            out[r["page"]] = r["text"]
    return out


def _payload(action, gap, pages):
    return {"action": {"id": action["id"], "title": action["title"], "title_en": _title_en(action["id"]),
                       "description": action["description"], "metric": action.get("metric"),
                       "responsible": action.get("responsible")},
            "page_text": pages.get(action["page"], "")}


def _title_en(aid):
    import recommend
    return recommend.TITLE_EN.get(aid)


def cache_path():
    ref = json.dumps({"model": js.MODEL, "state_version": js.STATE_VERSION,
                      "gaps": GAPS, "criteria": CRITERIA}, sort_keys=True, ensure_ascii=False)
    return js.CACHE["gemini"] / f"matcher_{hashlib.sha1(ref.encode()).hexdigest()[:8]}.jsonl"


def read_cache():
    p = cache_path(); out = {}
    if p.exists():
        for line in p.read_text().splitlines():
            r = json.loads(line); out[tuple(r["key"])] = r
    return out


async def _ask(items, path, conc=CONC):
    """items: [(key=(action_id, gap_id), payload_dict)] — same retry discipline as residents._ask_gemini."""
    from google import genai
    from google.genai import errors as gerr
    sem = asyncio.Semaphore(conc); stats = {"done": 0, "tokens": 0, "errors": 0}
    path.parent.mkdir(parents=True, exist_ok=True)
    client = genai.Client(http_options={"api_version": "v1beta"})
    with path.open("a") as f:
        async def one(key, payload):
            qs = {"fit": _question(key[1])}
            async with sem:
                r = None
                for attempt in range(6):
                    try:
                        r = await client.aio.decisions.create(
                            model=js.MODEL, input=[{"type": "text", "text": json.dumps(payload, ensure_ascii=False)}],
                            questions=qs)
                        break
                    except gerr.APIError as e:
                        if getattr(e, "code", 0) in (429,) or getattr(e, "code", 0) >= 500:
                            if attempt < 5:
                                await asyncio.sleep(min(2 ** attempt, 30) + random.random())
                                continue
                        stats["errors"] += 1
                        if stats["errors"] <= 3: print("  !", type(e).__name__, str(e)[:120])
                        return
                    except Exception as e:
                        stats["errors"] += 1
                        if stats["errors"] <= 3: print("  !", type(e).__name__, str(e)[:120])
                        return
            a = r.answers["fit"]
            row = {"key": list(key), "score": a.score,
                   "probabilities": getattr(a, "probabilities", None),
                   "confidence": getattr(a, "confidence", None)}
            f.write(json.dumps(row) + "\n"); stats["done"] += 1
            stats["tokens"] += (r.usage.total_input_tokens or 0) if r.usage else 0
            if stats["done"] % 100 == 0: print(f"  {stats['done']}/{len(items)}", flush=True); f.flush()
        await asyncio.gather(*(one(k, s) for k, s in items))
    print(f"  done {stats['done']}, errors {stats['errors']}, input tokens {stats['tokens']:,} "
          f"≈ ${stats['tokens'] * js.PRICE_PER_MTOK['gemini'] / 1e6:.3f}")


def run(dry=False):
    actions = strategy.actions(); pages = _page_texts(); path = cache_path(); have = read_cache()
    todo = [((a["id"], g), _payload(a, g, pages)) for a in actions for g in GAPS if (a["id"], g) not in have]
    print(f"matcher: {len(actions)} actions x {len(GAPS)} gaps, {len(have)} cached, {len(todo)} to ask -> {path.name}")
    if not todo or dry:
        return
    if not __import__("os").environ.get(js.API_KEY["gemini"]):
        sys.exit("GEMINI_API_KEY missing in .env")
    asyncio.run(_ask(todo, path))


def ranked(gap_id, min_score=2.0):
    """Actions for one gap, best first: [{id, score, confidence}] with score >= min_score."""
    rows = [r for (aid, g), r in read_cache().items() if g == gap_id and r.get("score") is not None]
    rows.sort(key=lambda r: -r["score"])
    return [{"id": r["key"][0], "score": round(r["score"], 2), "confidence": r.get("confidence")}
            for r in rows if r["score"] >= min_score]


def score_for(gap_id, action_id):
    r = read_cache().get((action_id, gap_id))
    return r.get("score") if r else None


def report():
    for g in GAPS:
        top = ranked(g, min_score=1.5)
        print(f"\n{g}: {GAPS[g][:60]}…")
        for r in top:
            print(f"  {r['id']:8} score {r['score']:>4} conf {r['confidence']}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--report", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    if a.report:
        report()
    else:
        run(dry=a.dry_run)
