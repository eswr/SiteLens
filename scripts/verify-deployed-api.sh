#!/usr/bin/env bash
set -euo pipefail

API_BASE="${API_BASE:?Set API_BASE, e.g. https://sitelens-api.example.com}"
PLANNER_KEY="${PLANNER_KEY:-demo-planner-key}"
VIEWER_KEY="${VIEWER_KEY:-demo-viewer-key}"

echo "Checking health..."
curl -fsS "$API_BASE/api/health" | jq .

echo "Checking identity..."
curl -fsS "$API_BASE/api/me" -H "x-api-key: $PLANNER_KEY" | jq .

echo "Checking layers..."
curl -fsS "$API_BASE/api/layers" | jq '.data | length'

echo "Checking local planning search..."
curl -fsS "$API_BASE/api/search?q=park" -H "x-api-key: $PLANNER_KEY" | jq '.data | length'

echo "Checking worldwide place search..."
curl -fsS "$API_BASE/api/geocode/search?q=Bengaluru&limit=3" | jq .

echo "Checking geocoding cache hit..."
curl -fsS "$API_BASE/api/geocode/search?q=Bengaluru&limit=3" | jq '.meta.cache, .data.provider, .data.fallback'

echo "Checking PostGIS analysis..."
ANALYSIS_RESPONSE="$(curl -fsS -X POST "$API_BASE/api/analyze-area" \
  -H "content-type: application/json" \
  -H "x-api-key: $PLANNER_KEY" \
  -d '{"geometry":{"type":"Polygon","coordinates":[[[151.205,-33.87],[151.215,-33.87],[151.215,-33.86],[151.205,-33.86],[151.205,-33.87]]]}}')"

echo "$ANALYSIS_RESPONSE" | jq '.data.engine, .meta.cache, .data.result.parcelCount'

echo "Checking deterministic planning summary..."
echo "$ANALYSIS_RESPONSE" | jq '{analysisResult: .data.result, context: {sourceEngine: "postgis"}}' \
  | curl -fsS -X POST "$API_BASE/api/planning-summary" \
      -H "content-type: application/json" \
      -H "x-api-key: $PLANNER_KEY" \
      -d @- \
  | jq '.data.engine, .meta.cache, (.data.summary.sections | length)'

echo "Checking Viewer/Free gate..."
VIEWER_STATUS="$(curl -s -o /tmp/sitelens-viewer-analysis.json -w "%{http_code}" -X POST "$API_BASE/api/analyze-area" \
  -H "content-type: application/json" \
  -H "x-api-key: $VIEWER_KEY" \
  -d '{"geometry":{"type":"Polygon","coordinates":[[[151.205,-33.87],[151.215,-33.87],[151.215,-33.86],[151.205,-33.86],[151.205,-33.87]]]}}')"

if [ "$VIEWER_STATUS" != "403" ]; then
  echo "Expected Viewer/Free analyze-area to return 403, got $VIEWER_STATUS"
  cat /tmp/sitelens-viewer-analysis.json
  exit 1
fi

echo "Deployed API verification passed"
