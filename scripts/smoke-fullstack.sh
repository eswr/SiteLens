#!/usr/bin/env bash
set -euo pipefail

# Full-stack smoke test: hits core API endpoints while the API is running.
# Usage:
#   API_BASE=http://localhost:4000 npm run smoke:fullstack
#   SMOKE_GEOCODING=true API_BASE=https://<api-host> npm run smoke:fullstack
#   SMOKE_GEOCODING=true SMOKE_GEOCODING_EXPECT_FALLBACK=true API_BASE=https://<api-host> npm run smoke:fullstack
API_BASE="${API_BASE:-http://localhost:4000}"

curl -fsS "$API_BASE/api/health" >/dev/null
curl -fsS "$API_BASE/api/layers" >/dev/null
curl -fsS "$API_BASE/api/search?q=central" >/dev/null

curl -fsS -X POST "$API_BASE/api/analyze-area" \
  -H "content-type: application/json" \
  -H "x-api-key: demo-planner-key" \
  -d '{"geometry":{"type":"Polygon","coordinates":[[[151.205,-33.87],[151.215,-33.87],[151.215,-33.86],[151.205,-33.86],[151.205,-33.87]]]}}' >/dev/null

# Worldwide place search is opt-in (may hit live Nominatim or static-demo fallback).
# Default CI/smoke does not enable this unless SMOKE_GEOCODING=true.
if [ "${SMOKE_GEOCODING:-false}" = "true" ]; then
  body="$(curl -fsS "$API_BASE/api/geocode/search?q=Bengaluru&limit=3")"
  if [ "${SMOKE_GEOCODING_EXPECT_FALLBACK:-false}" = "true" ]; then
    echo "$body" | grep -q '"provider":"static-demo"'
    echo "$body" | grep -q '"fallback"'
  else
    # Accept either live Nominatim or transparent static-demo fallback.
    echo "$body" | grep -Eq '"provider":"(nominatim|static-demo)"'
  fi
fi

echo "Full-stack smoke test passed"
