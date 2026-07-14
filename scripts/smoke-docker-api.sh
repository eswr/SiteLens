#!/usr/bin/env bash
# Build the production API image and smoke-test the compiled Node runtime.
# Usage (from repo root):
#   npm run smoke:docker:api
# Optional migrate check against local compose PostGIS when RUN_MIGRATE_CHECK=1.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

IMAGE="${SMOKE_DOCKER_IMAGE:-sitelens-api:smoke}"
NAME="${SMOKE_DOCKER_NAME:-sitelens-api-smoke}"
PORT="${SMOKE_DOCKER_PORT:-4000}"
WEB_ORIGIN="${WEB_ORIGIN:-http://localhost:5173}"

cleanup() {
  docker rm -f "$NAME" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "==> docker build -t $IMAGE ."
docker build -t "$IMAGE" .

cleanup
echo "==> docker run (NODE_ENV=production, WEB_ORIGIN required)"
docker run -d --name "$NAME" \
  -p "${PORT}:4000" \
  -e NODE_ENV=production \
  -e PORT=4000 \
  -e WEB_ORIGIN="$WEB_ORIGIN" \
  -e ENABLE_DEMO_BILLING=true \
  -e GEOCODING_ENABLED=false \
  -e OVERPASS_ENABLED=false \
  -e PLANNING_CONTEXT_WORKER_ENABLED=false \
  -e CACHE_ENABLED=false \
  "$IMAGE"

echo "==> waiting for /health"
ok=0
for _ in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:${PORT}/health" >/dev/null 2>&1; then
    ok=1
    break
  fi
  sleep 1
done
if [[ "$ok" -ne 1 ]]; then
  echo "error: /health did not become ready" >&2
  docker logs "$NAME" >&2 || true
  exit 1
fi

curl -fsS "http://127.0.0.1:${PORT}/health" | tee /dev/stderr | grep -q '"status":"ok"'
echo "health ok"

if [[ "${RUN_MIGRATE_CHECK:-0}" == "1" ]]; then
  DATABASE_URL="${DATABASE_URL:-postgres://sitelens:sitelens@host.docker.internal:54329/sitelens}"
  echo "==> db:migrate:check:prod against $DATABASE_URL"
  docker run --rm \
    -e NODE_ENV=production \
    -e WEB_ORIGIN="$WEB_ORIGIN" \
    -e DATABASE_URL="$DATABASE_URL" \
    -e DB_SSL="${DB_SSL:-false}" \
    "$IMAGE" \
    npm run db:migrate:check:prod -w apps/api
fi

echo "Docker API smoke passed"
