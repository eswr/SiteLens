#!/usr/bin/env bash
set -euo pipefail

# Run the local Vite web app against the production Fly API.
# Useful for Places/autocomplete UI checks without bringing up Docker/Postgres.
#
# Usage:
#   npm run dev:web:prod-api
#   API_BASE=https://sitelens-api.fly.dev npm run dev:web:prod-api
#
# Uses Vite --strictPort so the origin stays http://localhost:5173
# (production WEB_ORIGIN allows 5173; alternate ports like 5174 are CORS-blocked
# unless WEB_ORIGIN is expanded).

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

API_BASE="${API_BASE:-https://sitelens-api.fly.dev}"
DEMO_KEY="${VITE_DEMO_API_KEY:-demo-planner-key}"
WEB_PORT="${WEB_PORT:-5173}"

if lsof -nP -iTCP:"${WEB_PORT}" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Port ${WEB_PORT} is already in use."
  echo "Stop the other Vite process (or set WEB_PORT) before continuing."
  echo "Production CORS allows http://localhost:5173 — do not silently fall"
  echo "back to 5174/5175 or live geocode will fail with \"Failed to fetch\"."
  exit 1
fi

echo "Checking production API health at ${API_BASE}…"
curl -fsS "${API_BASE}/api/health" >/dev/null
echo "API healthy."

echo "Starting local web → ${API_BASE}"
echo "Open http://localhost:${WEB_PORT} (Places tab)."
echo "(Local suggestions need no network; live geocode still hits ${API_BASE}.)"

export VITE_API_BASE_URL="${API_BASE}"
export VITE_DEMO_API_KEY="${DEMO_KEY}"

npm run dev -w apps/web -- --port "${WEB_PORT}" --strictPort
