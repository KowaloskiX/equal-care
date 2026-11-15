#!/usr/bin/env bash
# One-container demo: uvicorn serves the API on 127.0.0.1:8010, next start serves the web on $PORT
# and proxies /api to it. The container exits as soon as either process dies.
set -uo pipefail
cd "$(dirname "$0")/.."

uvicorn app.server:app --host 127.0.0.1 --port 8010 --workers 1 &
api=$!
(cd web && exec node node_modules/next/dist/bin/next start -H 0.0.0.0 -p "${PORT:-10000}") &
web=$!

wait -n "$api" "$web"
kill "$api" "$web" 2>/dev/null
wait "$api" "$web" 2>/dev/null
exit 1
