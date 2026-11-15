"""Generated briefing / slide deck endpoints (src/report.py). Include in app/server.py with:

    from app.report_api import router as report_router; app.include_router(report_router)

POST /api/report        {items: [{prog, code, scenarios?}], image?: bool}  -> rendered report + raw + facts + flags
GET  /api/report/facts  ?items=breast:90,bowel:07                          -> FACTS only (no Gemini call)
GET  /api/report/cover                                                     -> {image: data URL | null, model}
503 when GEMINI_API_KEY is missing, 502 on a Gemini error or timeout, 400 on bad items.
"""
import sys
from pathlib import Path
from fastapi import APIRouter, HTTPException, Request
from fastapi.concurrency import run_in_threadpool

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))
import budget
import report as rp

router = APIRouter()


def _client_ip(request: Request) -> str:
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[0].strip()
    return request.client.host if request.client else ""


@router.post("/api/report")
async def report_endpoint(request: Request, body: dict):
    items = body.get("items")
    if isinstance(items, str):
        items = rp.parse_items(items)
    try:
        # budget is charged only on a cache miss — a report already in the process cache is free
        if not rp.report_is_cached(items or [], bool(body.get("image", False))):
            budget.take("report", _client_ip(request))
        return await run_in_threadpool(rp.report, items or [], bool(body.get("image", False)))
    except budget.Exceeded as e:
        raise HTTPException(429, str(e))
    except ValueError as e:
        raise HTTPException(400, str(e))
    except rp.Unconfigured as e:
        raise HTTPException(503, str(e))
    except rp.ReportError as e:
        raise HTTPException(502, str(e))
    except Exception as e:          # surface anything else as a Gemini/upstream failure, never fake text
        raise HTTPException(502, f"{type(e).__name__}: {e}")


@router.get("/api/report/facts")
async def report_facts(items: str):
    try:
        norm = rp.validate_items(rp.parse_items(items))
        facts, ctx, notes = await run_in_threadpool(rp.build_facts, norm)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return {"items": norm, "facts": facts, "context": ctx, "notes": notes}


@router.get("/api/report/cover")
async def report_cover(request: Request, scene: str | None = None):
    """scene: 'where' | 'next' for the two slide backdrops; anything else = the cover.
    A scene already in the process cache is free; a new image generation counts as a report call."""
    try:
        if not rp.cover_cached(scene):
            budget.take("report", _client_ip(request))
        return await run_in_threadpool(rp.cover, scene)
    except budget.Exceeded as e:
        raise HTTPException(429, str(e))
    except rp.Unconfigured as e:
        raise HTTPException(503, str(e))
