# syntax=docker/dockerfile:1
# One container for the whole demo: FastAPI on 127.0.0.1:8010, Next.js on $PORT.
# Next's /api rewrites are resolved from API_ORIGIN when next.config.ts is evaluated at build.

FROM node:24.22.1-bookworm-slim AS web
WORKDIR /build
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ .
ENV API_ORIGIN=http://localhost:8010
RUN npm run build && npm prune --omit=dev

FROM python:3.12.16-slim-bookworm
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 API_ORIGIN=http://localhost:8010
COPY --from=ghcr.io/astral-sh/uv:0.13.7 /uv /usr/local/bin/uv
WORKDIR /app
COPY requirements.txt ./
RUN uv pip install --system -r requirements.txt
COPY app ./app
COPY src ./src
COPY data ./data
RUN python src/population.py          # prebuild out/cells.parquet so cold start is fast
COPY --from=web /usr/local/bin/node /usr/local/bin/node
COPY --from=web /build/node_modules ./web/node_modules
COPY --from=web /build/.next ./web/.next
COPY --from=web /build/public ./web/public
COPY web/next.config.ts web/package.json ./web/
COPY deploy/start.sh ./deploy/start.sh
EXPOSE 10000
CMD ["bash", "deploy/start.sh"]
