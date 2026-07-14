#!/usr/bin/env bash
# Regenerate pgtyped outputs and fail if committed query modules drift.
# Requires a reachable Postgres matching apps/api/pgtyped.json (local compose
# on :54329 by default) with migrations applied.
#
# CI (Postgres on 5432): set PGTYPED_PORT so we patch a temp config instead of
# mutating the committed apps/api/pgtyped.json.
#   PGTYPED_PORT=5432 npm run check:db-codegen
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -n "${PGTYPED_PORT:-}" ]]; then
  CFG="$(mktemp "${TMPDIR:-/tmp}/pgtyped.ci.XXXXXX.json")"
  cleanup() { rm -f "$CFG"; }
  trap cleanup EXIT
  cp apps/api/pgtyped.json "$CFG"
  node scripts/patch-pgtyped-port.mjs "$CFG" "$PGTYPED_PORT"
  # srcDir in pgtyped.json is relative; run from apps/api.
  (cd apps/api && npx pgtyped -c "$CFG")
else
  npm run db:codegen -w apps/api
fi

git diff --exit-code -- \
  apps/api/src/billing/queries/billing.queries.ts \
  apps/api/src/externalData/queries/buildJobs.queries.ts

echo "pgtyped query modules are in sync"
