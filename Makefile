PY ?= .venv/bin/python
NODE_PATH_ADD = PATH=/opt/homebrew/bin:$$PATH

.PHONY: setup data sotkanet geo strategy statfin population sim-residents sim findings app web demo stop check

setup:            ## Python venv and web dependencies
	test -d .venv || python3.12 -m venv .venv
	$(PY) -m pip install -q -r requirements.txt
	cd web && $(NODE_PATH_ADD) npm install --no-audit --no-fund

data: sotkanet geo strategy statfin thl-queue   ## re-fetch every public source (the results are committed; the demo never fetches live)

sotkanet:         ## THL Sotkanet indicators -> data/sotkanet.csv, data/regions.csv, data/indicators.json
	$(PY) src/fetch_sotkanet.py

geo:              ## Statistics Finland boundaries -> data/geo/*.geojson
	$(PY) src/fetch_geo.py

strategy:         ## cancer strategy + roadmap PDFs -> data/strategy/pages.jsonl
	$(PY) src/strategy.py fetch

thl-queue:      ## THL Hoitoon pääsy oncology care-queue data -> data/thl_queue.csv
	$(PY) src/fetch_thl_queue.py

statfin:          ## Statistics Finland population tables -> data/statfin/*.csv
	$(PY) src/fetch_statfin.py

population:       ## synthetic residents as weighted cells -> out/cells.parquet
	$(PY) src/population.py

sim-residents:    ## resident answers for every archetype, 3 programmes (engine via SIM_ENGINE: jev|gemini; cached in data/)
	for p in breast cervix bowel; do SIM_ENGINE=$${SIM_ENGINE:-jev} $(PY) src/residents.py $$p; done

sim:              ## what-if scenarios + summaries -> data/sim/*.json
	$(PY) src/simulate.py --scenarios

findings:         ## print the data findings with their sources
	$(PY) src/findings.py

app:              ## API on http://localhost:8010
	$(PY) -m uvicorn app.server:app --reload --port 8010

web:              ## frontend on http://localhost:3010
	cd web && $(NODE_PATH_ADD) npm run dev -- --port 3010

demo:             ## API + web together; Ctrl-C stops both. http://localhost:3010
	@trap 'kill 0 2>/dev/null; sleep 1; kill -9 0 2>/dev/null' INT TERM EXIT; \
	$(PY) -m uvicorn app.server:app --reload --port 8010 & \
	sleep 2; \
	echo "API:  http://localhost:8010"; \
	echo "App:  http://localhost:3010"; \
	cd web && $(NODE_PATH_ADD) npm run dev -- --port 3010

stop:             ## free ports 8010 and 3010
	@-lsof -ti:8010 | xargs kill 2>/dev/null; lsof -ti:3010 | xargs kill 2>/dev/null; \
	sleep 1; \
	lsof -ti:8010 | xargs kill -9 2>/dev/null; lsof -ti:3010 | xargs kill -9 2>/dev/null; true

check:            ## API smoke test
	$(PY) src/check.py
