PY ?= .venv/bin/python
NODE_PATH_ADD = PATH=/opt/homebrew/bin:$$PATH

.PHONY: setup data sotkanet geo strategy findings app web check

setup:            ## Python venv and web dependencies
	test -d .venv || python3.12 -m venv .venv
	$(PY) -m pip install -q -r requirements.txt
	cd web && $(NODE_PATH_ADD) npm install --no-audit --no-fund

data: sotkanet geo strategy   ## re-fetch every public source (the results are committed; the demo never fetches live)

sotkanet:         ## THL Sotkanet indicators -> data/sotkanet.csv, data/regions.csv, data/indicators.json
	$(PY) src/fetch_sotkanet.py

geo:              ## Statistics Finland boundaries -> data/geo/*.geojson
	$(PY) src/fetch_geo.py

strategy:         ## cancer strategy + roadmap PDFs -> data/strategy/pages.jsonl
	$(PY) src/strategy.py fetch

findings:         ## print the data findings with their sources
	$(PY) src/findings.py

app:              ## API on http://localhost:8010
	$(PY) -m uvicorn app.server:app --reload --port 8010

web:              ## frontend on http://localhost:3010
	cd web && $(NODE_PATH_ADD) npm run dev -- --port 3010

check:            ## API smoke test
	$(PY) src/check.py
