#!/usr/bin/env bash
# Fail if web offline-demo GeoJSON drifts from the API source of truth.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/apps/api/data"
DEST="$ROOT/apps/web/public/data"

FILES=(
  parcels.geojson
  zoning.geojson
  constraints.geojson
  transit.geojson
  development-activity.geojson
)

status=0
for file in "${FILES[@]}"; do
  if [[ ! -f "$SRC/$file" ]]; then
    echo "error: missing source fixture: $SRC/$file" >&2
    status=1
    continue
  fi
  if [[ ! -f "$DEST/$file" ]]; then
    echo "error: missing web fixture: $DEST/$file (run npm run sync:web-fixtures)" >&2
    status=1
    continue
  fi
  if ! cmp -s "$SRC/$file" "$DEST/$file"; then
    echo "error: fixture drift: $file (apps/api/data vs apps/web/public/data)" >&2
    echo "       run: npm run sync:web-fixtures" >&2
    status=1
  fi
done

if [[ "$status" -ne 0 ]]; then
  exit "$status"
fi

echo "Web fixtures match apps/api/data"
