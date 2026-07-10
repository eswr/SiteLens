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

## Current data flow

```
GeoJSON files (apps/api/data/*.geojson)
  → ingestion script (ST_GeomFromGeoJSON, ST_Multi, parameterized upserts)
  → PostGIS spatial tables (geometry(MultiPolygon|Point, 4326), GIST indexes)
  → Fastify API (ST_AsGeoJSON) → JSON envelopes
```

The **frontend still reads static GeoJSON directly** from `apps/web/public/data`
and does not call the API yet. The API is DB-backed and independently usable.

## Future data flow

```
Frontend AOI polygon
  → Fastify POST /api/analyze-area
  → PostGIS spatial SQL (ST_Intersects, ST_DWithin, aggregates)
  → Redis cache
  → frontend analytics
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

- Step 10: connect frontend AOI analysis to backend PostGIS.
- Later: Redis caching, authentication, Stripe, Azure deployment.
