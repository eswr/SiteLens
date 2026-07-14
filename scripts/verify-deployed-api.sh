#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="${API_ENV_FILE:-$REPO_ROOT/apps/api/.env.production}"

# Prefer an explicit API_BASE; otherwise load allowed keys from .env.production.
# Parse KEY=value safely — no eval / no shell expansion of file contents.
if [[ -z "${API_BASE:-}" && -f "$ENV_FILE" ]]; then
  while IFS= read -r line || [[ -n "$line" ]]; do
    case "$line" in
      ''|\#*) continue ;;
    esac
    key="${line%%=*}"
    value="${line#*=}"
    # Strip optional matching surrounding quotes.
    if [[ ${#value} -ge 2 ]]; then
      first="${value:0:1}"
      last="${value: -1}"
      if [[ "$first" == "$last" && ( "$first" == '"' || "$first" == "'" ) ]]; then
        value="${value:1:${#value}-2}"
      fi
    fi
    case "$key" in
      API_BASE|PLANNER_KEY|VIEWER_KEY|VITE_DEMO_API_KEY)
        printf -v "$key" '%s' "$value"
        ;;
    esac
  done < "$ENV_FILE"
fi

API_BASE="${API_BASE:?Set API_BASE (e.g. in apps/api/.env.production or API_BASE=https://sitelens-api.fly.dev)}"
# Same demo Planner key as the web client; PLANNER_KEY overrides VITE_DEMO_API_KEY.
PLANNER_KEY="${PLANNER_KEY:-${VITE_DEMO_API_KEY:-demo-planner-key}}"
VIEWER_KEY="${VIEWER_KEY:-demo-viewer-key}"

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required. Install it (e.g. brew install jq) then re-run." >&2
  exit 1
fi

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

# Opt-in async external context build (public Overpass may rate-limit).
if [ "${SMOKE_CONTEXT_BUILD:-false}" = "true" ]; then
  echo "Checking planning contexts + async Bengaluru build..."
  curl -fsS "$API_BASE/api/planning-contexts" -H "x-api-key: $PLANNER_KEY" | jq '.data | length'

  BUILD_RESPONSE="$(curl -fsS -X POST "$API_BASE/api/planning-contexts/build" \
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
  echo "$BUILD_RESPONSE" | jq '.data'

  JOB_ID="$(echo "$BUILD_RESPONSE" | jq -r '.data.jobId')"
  CONTEXT_ID="$(echo "$BUILD_RESPONSE" | jq -r '.data.contextId')"
  STATUS="queued"
  for _ in $(seq 1 60); do
    JOB_RESPONSE="$(curl -fsS "$API_BASE/api/planning-contexts/jobs/$JOB_ID" \
      -H "x-api-key: $PLANNER_KEY")"
    STATUS="$(echo "$JOB_RESPONSE" | jq -r '.data.job.status')"
    if [ "$STATUS" = "succeeded" ] || [ "$STATUS" = "failed" ]; then
      echo "$JOB_RESPONSE" | jq '.data.job | {status, attempts, errorMessage, reused}'
      break
    fi
    sleep 2
  done

  if [ "$STATUS" != "succeeded" ]; then
    echo "Expected async build to succeed, got status=$STATUS"
    exit 1
  fi

  curl -fsS "$API_BASE/api/planning-contexts/$CONTEXT_ID" \
    -H "x-api-key: $PLANNER_KEY" | jq '.data.context.status, .data.counts'

  GEN_ANALYSIS="$(curl -fsS -X POST "$API_BASE/api/analyze-area" \
    -H "content-type: application/json" \
    -H "x-api-key: $PLANNER_KEY" \
    -d "{\"planningContextId\":\"$CONTEXT_ID\",\"geometry\":{\"type\":\"Polygon\",\"coordinates\":[[[77.58,12.96],[77.61,12.96],[77.61,12.99],[77.58,12.99],[77.58,12.96]]]}}")"
  echo "$GEN_ANALYSIS" | jq '.data.engine, .meta.planningContextId'

  echo "$GEN_ANALYSIS" | jq '{analysisResult: .data.result, context: {sourceEngine: "postgis", planningContextId: .meta.planningContextId}}' \
    | curl -fsS -X POST "$API_BASE/api/planning-summary" \
        -H "content-type: application/json" \
        -H "x-api-key: $PLANNER_KEY" \
        -d @- \
    | jq '.data.engine, (.data.summary.sections | length)'
fi

echo "Deployed API verification passed"
