#!/usr/bin/env bash
set -euo pipefail

# Full-stack smoke test: hits core API endpoints while the API is running.
# Usage: API_BASE=http://localhost:4000 npm run smoke:fullstack
API_BASE="${API_BASE:-http://localhost:4000}"

curl -fsS "$API_BASE/api/health" >/dev/null
curl -fsS "$API_BASE/api/layers" >/dev/null
curl -fsS "$API_BASE/api/search?q=central" >/dev/null

curl -fsS -X POST "$API_BASE/api/analyze-area" \
  -H "content-type: application/json" \
  -H "x-api-key: demo-planner-key" \
  -d '{"geometry":{"type":"Polygon","coordinates":[[[151.205,-33.87],[151.215,-33.87],[151.215,-33.86],[151.205,-33.86],[151.205,-33.87]]]}}' >/dev/null

# Worldwide place search hits live Nominatim, so it is opt-in only.
if [ "${SMOKE_GEOCODING:-false}" = "true" ]; then
  curl -fsS "$API_BASE/api/geocode/search?q=Sydney&limit=3" >/dev/null
fi

echo "Full-stack smoke test passed"
