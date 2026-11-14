# Equal Care Across Finland

Where does the cancer care pathway fall behind, county by county? A map of Finland's 23 wellbeing services counties
built only from public data, with a source behind every number and recommendations tied to the national cancer
strategy roadmap. Junction 2026, AstraZeneca challenge.

## Data

| Source | What it gives |
|---|---|
| THL Sotkanet (Finnish Cancer Registry figures) | Screening attendance (breast, cervical, colorectal) by municipality and county; 5-year relative survival (breast, cervical, colorectal) and cancer morbidity index by county; waits for specialised care |
| Statistics Finland (geo.stat.fi) | County and municipality boundaries, CC BY 4.0 |
| Kansallinen syöpästrategia 2026–2035 and its roadmap 2026–2031 | Targets (80 % screening attendance in every county) and 73 numbered actions with responsible bodies, budgets and metrics |

Processed data is committed under `data/`. The app never calls Sotkanet live.

## First findings (`make findings`)

- Breast screening attendance is lowest in the capital region, not in the countryside: Helsinki 74.3 %, West Uusimaa 76.1 %, Vantaa and Kerava 76.7 % against a target of 80 % (2024). Helsinki misses about 2 200 women a year.
- Colorectal cancer survival (a goal 3 indicator) ranges from 63 % (Päijät-Häme) to 74 % (Central Uusimaa) against 68 % for Finland.
- At county level, screening attendance does not line up with survival (r between −0.24 and 0.03). The survival gap emerges later in the pathway, so it needs stage-at-diagnosis and time-to-treatment data.
- Limits: survival rates come without case counts, so small counties (Åland) are noisy. Screening attendance counts only the public programme, so private and occupational mammography count as absence.

## Run

```bash
make setup      # Python venv + web dependencies (Python 3.12, Node 20+)
make check      # API smoke test
make app        # API on http://localhost:8010
make web        # app on http://localhost:3010
make data       # re-fetch every source
```

## Repository

| Path | Contents |
|---|---|
| `src/indicators.py` | Indicator registry: care pathway stage, strategy goal, target, source |
| `src/fetch_sotkanet.py`, `fetch_geo.py`, `strategy.py` | Fetchers; `strategy.py actions` lists the roadmap actions |
| `src/datastore.py` | Values with sources, screening gap arithmetic, correlations |
| `src/residents.py`, `simulate.py` | Synthetic residents answered by a switchable decision engine (`SIM_ENGINE`: Jev/TypeSafe or Gemini Decisions), anchored and aggregated into `data/sim/` |
| `src/recommend.py` | Recommendations: gap split + scenarios mapped to cited roadmap actions (`/api/recommend`, `/api/brief`) |
| `src/grounding.py` | Flags numbers in generated text that do not come from the data (from krakow-sim) |
| `app/server.py` | FastAPI |
| `web/` | Next.js, deck.gl and MapLibre map |
