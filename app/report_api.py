"""Generated briefing / slide deck endpoints (src/report.py). Include in app/server.py with:

    from app.report_api import router as report_router; app.include_router(report_router)

POST /api/report        {items: [{prog, code, scenarios?}], image?: bool}  -> rendered report + raw + facts + flags
GET  /api/report/facts  ?items=breast:90,bowel:07                          -> FACTS only (no Gemini call)
GET  /api/report/cover                                                     -> {image: data URL | null, model}
503 when GEMINI_API_KEY is missing, 502 on a Gemini error or timeout, 400 on bad items.
"""
import sys
from pathlib import Path
from fastapi import APIRouter, HTTPException
from fastapi.concurrency import run_in_threadpool

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))
import report as rp

router = APIRouter()


@router.post("/api/report")
async def report_endpoint(body: dict):
    items = body.get("items")
    if isinstance(items, str):
        items = rp.parse_items(items)
    try:
        return await run_in_threadpool(rp.report, items or [], bool(body.get("image", False)))
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
async def report_cover():
    try:
        return await run_in_threadpool(rp.cover)
    except rp.Unconfigured as e:
        raise HTTPException(503, str(e))
