#!/usr/bin/env bash
# Copy Sydney demo GeoJSON from the API source of truth into the web offline demo.
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

mkdir -p "$DEST"
for file in "${FILES[@]}"; do
  if [[ ! -f "$SRC/$file" ]]; then
    echo "error: missing source fixture: $SRC/$file" >&2
    exit 1
  fi
  cp "$SRC/$file" "$DEST/$file"
  echo "synced $file"
done

echo "Web fixtures synced from apps/api/data → apps/web/public/data"
