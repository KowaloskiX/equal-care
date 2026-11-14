"""The national cancer strategy 2026-2035 and its implementation roadmap 2026-2031, page by page, for citations.

Usage: python src/strategy.py fetch            download the PDFs from the challenge resources and extract text
       python src/strategy.py search "seulon"  pages that mention a phrase
Output: data/strategy/pages.jsonl, one line per page: {doc, title, url, page, text}
Recommendations in the app quote these pages; a recommendation without a page reference is not shown.
"""
import io, json, re, sys
from functools import lru_cache
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data/strategy/pages.jsonl"
DOCS = {
    "strategy": ("Kansallinen syöpästrategia 2026–2035",
                 "https://files.hackjunction.app/resources/Kansallinen_syopastrategia_2026_2035_FINAL.pdf"),
    "roadmap": ("Kansallisen syöpästrategian toimeenpanon tiekartta 2026–2031",
                "https://files.hackjunction.app/resources/Kansallinen_syopastrategia_toimeenpanon_tiekartta_2026_2031.pdf"),
}


def fetch():
    import requests, pypdf
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("w") as f:
        for doc, (title, url) in DOCS.items():
            pdf = pypdf.PdfReader(io.BytesIO(requests.get(url, timeout=120).content))
            for i, p in enumerate(pdf.pages, 1):
                text = re.sub(r"[ \t]+", " ", (p.extract_text() or "").replace("­", "")).strip()
                f.write(json.dumps({"doc": doc, "title": title, "url": f"{url}#page={i}", "page": i, "text": text},
                                   ensure_ascii=False) + "\n")
            print(doc, len(pdf.pages), "pages")


@lru_cache
def pages():
    return [json.loads(l) for l in OUT.read_text().splitlines()]


def search(query, doc=None, limit=10):
    """Pages containing every word of the query (case-insensitive, Finnish stems work: 'seulon' matches 'seulonta')."""
    words = [w.lower() for w in query.split()]
    hits = []
    for p in pages():
        if doc and p["doc"] != doc:
            continue
        t = p["text"].lower()
        if all(w in t for w in words):
            i = t.find(words[0])
            hits.append({**{k: p[k] for k in ("doc", "title", "url", "page")},
                         "snippet": p["text"][max(0, i - 200): i + 400], "count": sum(t.count(w) for w in words)})
    return sorted(hits, key=lambda h: -h["count"])[:limit]


FIELDS = {"Vastuutaho": "responsible", "Resurssi": "resource", "Aikataulu": "schedule", "Mittari": "metric"}


@lru_cache
def actions():
    """Numbered actions of the roadmap ("Toimenpide 1.3.1 ..."): title, description, responsible bodies, budget,
    schedule and metric, with the page each one starts on. Parsed from the text; fields are verbatim Finnish."""
    text, starts = "", []
    for p in pages():
        if p["doc"] == "roadmap":
            starts.append((len(text), p["page"])); text += p["text"] + "\n"
    page_at = lambda pos: max(pg for s, pg in starts if s <= pos)
    heads = list(re.finditer(r"Toimenpide (\d+\.\d+\.\d+)\s+", text))
    out = {}
    for k, m in enumerate(heads):
        aid = m.group(1)
        if aid in out:      # the budget table at the end repeats the ids; keep the first (descriptive) occurrence
            continue
        body = text[m.end(): heads[k + 1].start() if k + 1 < len(heads) else len(text)]
        body = re.sub(r"Kansallinen syöpästrategia 2026–2035: ?\nToimeenpanon tiekartta vuosille 2026–2031\n", "", body)
        body = re.sub(r"\n\d{1,3}\n", "\n", body)                       # page numbers
        parts = re.split(r"\n(Vastuutaho|Resurssi|Aikataulu|Mittari):\s*", "\n" + body)
        head = parts[0].strip()
        # the title runs until the first line that starts a sentence of the description (capital letter after a full line)
        lines = head.split("\n"); t_lines = [lines[0]]
        for ln in lines[1:]:
            if ln[:1].islower() or len(" ".join(t_lines)) < 40:
                t_lines.append(ln)
            else:
                break
        ws = lambda s: re.sub(r"\s+", " ", s).strip()
        a = {"id": aid, "goal": int(aid[0]), "title": ws(" ".join(t_lines)),
             "description": ws(" ".join(lines[len(t_lines):])), "page": page_at(m.start()),
             "url": f"{DOCS['roadmap'][1]}#page={page_at(m.start())}"}
        for i in range(1, len(parts) - 1, 2):
            a.setdefault(FIELDS[parts[i]], re.sub(r"\s+", " ", parts[i + 1]).strip())
        out[aid] = a
    return list(out.values())


if __name__ == "__main__":
    if sys.argv[1:2] == ["fetch"]:
        fetch()
    elif sys.argv[1:2] == ["actions"]:
        for a in actions():
            print(f"{a['id']:6s} p.{a['page']:<3d} {a['title'][:90]}\n        vastuu: {a.get('responsible', '-')[:90]}\n"
                  f"        resurssi: {a.get('resource', '-')[:70]}")
    else:
        for h in search(" ".join(sys.argv[2:] or sys.argv[1:])):
            print(f"{h['doc']} p.{h['page']} ({h['count']}): {h['snippet'][:300]!r}\n")
