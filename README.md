# Equal Care Across Finland

Where does the cancer care pathway fall behind, county by county? A map of Finland's 23 wellbeing services counties
built only from public data, with a source behind every number and recommendations tied to the national cancer
strategy roadmap. Junction 2026, AstraZeneca challenge.

## Features

- **Care-pathway map** — indicators from detection through referral and treatment to outcome, per county, each with a
  source, a trend sparkline and an early-warning flag on worsening monthly series.
- **2-minute brief** — the three counties with the largest gap per screening programme, the gap split into population
  composition vs services, and the top cited action.
- **Recommendations** — every suggestion cites a numbered action of the national roadmap (id + page, English and
  Finnish titles), with assumptions marked explicitly.
- **Live "What if"** — combine interventions for one county; the simulated residents answer again (live calls where
  the cache misses), and the result is given in people per year and share of the county's gap closed.
- **Goal 3 oncology queue** — monthly THL "Hoitoon pääsy" data for Syöpätaudit: referrals processed in over 21 days
  and patients waiting over 90 days, with absolute n and small-number flags.
- **Data / Simulation toggle** — the map can show measured values or the unexplained part of the gap from the
  simulation. Simulated numbers are always labelled and carry their validation.
- **`/story`** — a seven-slide presentation of the pitch, all numbers fetched live from the API.

## Data

| Source | What it gives |
|---|---|
| THL Sotkanet (Finnish Cancer Registry figures) | Screening attendance (breast, cervical, colorectal) by municipality and county; 5-year relative survival (breast, cervical, colorectal) and cancer morbidity index by county; waits for specialised care |
| THL Hoitoon pääsy – erikoissairaanhoito | Monthly oncology (Syöpätaudit) queue: referrals processed in over 21 days, patients waiting over 90 days — per specialised-care producer, mapped to counties (HUS shared by the Uusimaa counties and Helsinki) |
| Statistics Finland (geo.stat.fi) | County and municipality boundaries and population tables, CC BY 4.0 |
| Kansallinen syöpästrategia 2026–2035 and its roadmap 2026–2031 | Targets (80 % screening attendance in every county) and 73 numbered actions with responsible bodies, budgets and metrics |

Processed data and simulated-resident answers are committed under `data/`. The app never calls Sotkanet live.

## Run

```bash
make setup          # Python venv + web dependencies (Python 3.12, Node 20+)
make check          # API smoke test
make app            # API on http://localhost:8010
make web            # app on http://localhost:3010
make data           # re-fetch every source
make thl-queue      # refresh only the THL oncology queue data
make sim-residents  # re-ask the simulated residents (needs the engine key)
```

The demo needs no keys: committed caches cover every scenario shown. The simulation engine is chosen by `SIM_ENGINE`
in `.env` (`jev` or `gemini`, default `jev`) or `--engine`; `TYPESAFE_API_KEY` / `GEMINI_API_KEY` are needed only when
questions or resident states change (the cache invalidates and new calls run). A what-if combination outside the cache
needs the active engine's key or the API returns 503 — simulated numbers are never fabricated.

## API

`GET /api/meta` · `/api/values?key=` · `/api/series?key=&code=` · `/api/region/{code}` · `/api/gap` ·
`/api/correlation?a=&b=` · `/api/actions` · `/api/strategy/search` · `/api/sim` · `/api/sim/{prog}` ·
`/api/sim/{prog}/region/{code}` · `/api/recommend/{prog}/{code}` · `/api/brief` ·
`/api/whatif?prog=&code=&s=a,b` (live combined-intervention simulation)

## Limits

- Screening attendance counts only the public programme; private and occupational mammography count as absence.
- Sotkanet survival rates come without case counts, so small counties (Åland) are noisy.
- Oncology queue data covers non-urgent care and is reported per producer, so it is a proxy for capacity, not time
  from diagnosis to treatment; Kainuu and Åland are not covered.
- Stage at diagnosis is published only as a chart, not a county table — the known gap is itself a finding.

## Repository

| Path | Contents |
|---|---|
| `src/indicators.py` | Indicator registry: care pathway stage, strategy goal, target, source |
| `src/fetch_sotkanet.py`, `fetch_thl_queue.py`, `fetch_geo.py`, `strategy.py` | Fetchers; `strategy.py actions` lists the roadmap actions |
| `src/datastore.py` | Values with sources, screening gap arithmetic, correlations, trends |
| `src/residents.py`, `simulate.py`, `whatif.py` | Synthetic residents answered by a switchable decision engine (`SIM_ENGINE`: Jev/TypeSafe or Gemini Decisions), anchored and aggregated into `data/sim/`; `whatif.py` runs live combined scenarios |
| `src/recommend.py` | Recommendations: gap split + scenarios mapped to cited roadmap actions (`/api/recommend`, `/api/brief`) |
| `src/grounding.py` | Flags numbers in generated text that do not come from the data (from krakow-sim) |
| `app/server.py` | FastAPI |
| `web/` | Next.js, deck.gl and MapLibre map; `/story` presentation route |
