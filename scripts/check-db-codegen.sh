#!/usr/bin/env bash
# Regenerate pgtyped outputs and fail if committed query modules drift.
# Requires a reachable Postgres matching apps/api/pgtyped.json (local compose
# on :54329 by default) with migrations applied.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

npm run db:codegen -w apps/api

git diff --exit-code -- \
  apps/api/src/billing/queries/billing.queries.ts \
  apps/api/src/externalData/queries/buildJobs.queries.ts

echo "pgtyped query modules are in sync"
