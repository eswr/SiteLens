#!/usr/bin/env bash
set -euo pipefail

# Full-stack smoke test: hits core API endpoints while the API is running.
# Usage:
#   API_BASE=http://localhost:4000 npm run smoke:fullstack
#   SMOKE_GEOCODING=true API_BASE=https://<api-host> npm run smoke:fullstack
#   SMOKE_GEOCODING=true SMOKE_GEOCODING_EXPECT_FALLBACK=true API_BASE=https://<api-host> npm run smoke:fullstack
#   SMOKE_CONTEXT_BUILD=true API_BASE=http://localhost:4000 npm run smoke:fullstack
API_BASE="${API_BASE:-http://localhost:4000}"
# Same demo Planner key as the web client; PLANNER_KEY overrides VITE_DEMO_API_KEY.
PLANNER_KEY="${PLANNER_KEY:-${VITE_DEMO_API_KEY:-demo-planner-key}}"

curl -fsS "$API_BASE/api/health" >/dev/null
curl -fsS "$API_BASE/api/layers" >/dev/null
curl -fsS "$API_BASE/api/search?q=central" >/dev/null

curl -fsS -X POST "$API_BASE/api/analyze-area" \
  -H "content-type: application/json" \
  -H "x-api-key: $PLANNER_KEY" \
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

# Async external planning-context build is opt-in (public Overpass may rate-limit).
if [ "${SMOKE_CONTEXT_BUILD:-false}" = "true" ]; then
  echo "Checking planning contexts list..."
  curl -fsS "$API_BASE/api/planning-contexts" \
    -H "x-api-key: $PLANNER_KEY" >/dev/null

  echo "Enqueueing Bengaluru planning-context build..."
  BUILD_BODY="$(curl -fsS -X POST "$API_BASE/api/planning-contexts/build" \
    -H "content-type: application/json" \
    -H "x-api-key: $PLANNER_KEY" \
    -d '{
      "source": "external-osm",
      "place": {
        "id": "static-demo-bengaluru",
        "label": "Bengaluru, Karnataka, India",
        "displayName": "Bengaluru, Karnataka, India",
        "latitude": 12.9716,
        "longitude": 77.5946,
        "boundingBox": [12.7, 13.2, 77.3, 77.9],
        "provider": "static-demo"
      }
    }')"

  JOB_ID="$(node -e 'const d=JSON.parse(process.argv[1]); if (!d?.data?.jobId) process.exit(2); process.stdout.write(d.data.jobId)' "$BUILD_BODY")"
  CONTEXT_ID="$(node -e 'const d=JSON.parse(process.argv[1]); process.stdout.write(d.data.contextId)' "$BUILD_BODY")"
  echo " jobId=$JOB_ID contextId=$CONTEXT_ID"

  STATUS="queued"
  DEADLINE=$((SECONDS + 120))
  while [ "$SECONDS" -lt "$DEADLINE" ]; do
    JOB_BODY="$(curl -fsS "$API_BASE/api/planning-contexts/jobs/$JOB_ID" \
      -H "x-api-key: $PLANNER_KEY")"
    STATUS="$(node -e 'const d=JSON.parse(process.argv[1]); process.stdout.write(d.data.job.status)' "$JOB_BODY")"
    if [ "$STATUS" = "succeeded" ] || [ "$STATUS" = "failed" ]; then
      break
    fi
    sleep 2
  done

  if [ "$STATUS" != "succeeded" ]; then
    echo "Async planning-context build did not succeed (status=$STATUS)" >&2
    echo "$JOB_BODY" >&2
    exit 1
  fi

  echo "Checking built context detail..."
  curl -fsS "$API_BASE/api/planning-contexts/$CONTEXT_ID" \
    -H "x-api-key: $PLANNER_KEY" >/dev/null

  echo "Checking AOI analysis on built context..."
  ANALYSIS_RESPONSE="$(curl -fsS -X POST "$API_BASE/api/analyze-area" \
    -H "content-type: application/json" \
    -H "x-api-key: $PLANNER_KEY" \
    -d "{\"planningContextId\":$(node -e 'process.stdout.write(JSON.stringify(process.argv[1]))' "$CONTEXT_ID"),\"geometry\":{\"type\":\"Polygon\",\"coordinates\":[[[77.58,12.96],[77.61,12.96],[77.61,12.99],[77.58,12.99],[77.58,12.96]]]}}")"

  echo "Checking planning summary on built context..."
  echo "$ANALYSIS_RESPONSE" | node -e '
    const fs = require("fs");
    const analysis = JSON.parse(fs.readFileSync(0, "utf8"));
    const body = {
      analysisResult: analysis.data.result,
      context: { sourceEngine: "postgis", planningContextId: analysis.meta.planningContextId },
    };
    process.stdout.write(JSON.stringify(body));
  ' | curl -fsS -X POST "$API_BASE/api/planning-summary" \
      -H "content-type: application/json" \
      -H "x-api-key: $PLANNER_KEY" \
      -d @- >/dev/null

  echo "Async planning-context build smoke passed"
fi

echo "Full-stack smoke test passed"
