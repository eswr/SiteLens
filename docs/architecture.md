# Architecture

SiteLens is an npm-workspaces monorepo.

## Stack

**Frontend** (`apps/web`)
React + TypeScript + Vite + MapLibre GL + Turf.js + Recharts + Material UI + Zustand

**Backend** (`apps/api`)
Fastify + TypeScript (run with `tsx`), `pg` for database access

**Database**
PostgreSQL + PostGIS (via Docker Compose)

**Shared** (`packages/shared`)
Shared TypeScript types (API envelopes, planning + analysis contracts)

## Data flow

Ingestion + read APIs:

```
GeoJSON files (apps/api/data/*.geojson)
  → ingestion script (ST_GeomFromGeoJSON, ST_Multi, parameterized upserts)
  → PostGIS spatial tables (geometry(MultiPolygon|Point, 4326), GIST indexes)
  → Fastify API (ST_AsGeoJSON) → JSON envelopes
```

AOI analysis (full-stack):

```
Frontend AOI polygon (MapLibre draw)
  → POST /api/analyze-area
  → PostGIS spatial SQL (ST_IsValid, ST_Area::geography, ST_Intersects, ST_DWithin, ST_Distance, aggregates)
  → { result, engine: "postgis" }
  → frontend analytics + AI summary
```

The frontend calls the API when `VITE_API_BASE_URL` is set; otherwise (or if the
API is unreachable) it uses local Turf.js analysis and marks the engine as
`turf-local` / `turf-fallback`. The web app's layers/search still read static
GeoJSON directly.

## Future data flow

```
… → PostGIS spatial SQL → Redis cache → frontend analytics
```

## Spatial schema

| Table | Geometry | Notes |
| ----- | -------- | ----- |
| `planning_layers` | — | Layer metadata + counts source |
| `parcels` | `MultiPolygon, 4326` | GIST + FTS + btree indexes |
| `zoning_overlays` | `MultiPolygon, 4326` | GIST index |
| `constraints` | `MultiPolygon, 4326` | GIST + btree(risk_level) |
| `transit_points` | `Point, 4326` | GIST + btree(mode) |
| `development_activity` | `Point, 4326` | GIST + FTS + btree(status) |

## Roadmap

- Done: frontend AOI analysis connects to backend PostGIS (`/api/analyze-area`).
- Later: Redis caching, backend planning summary, authentication, Stripe, Azure deployment.
