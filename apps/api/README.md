# @sitelens/api

Fastify + TypeScript API foundation for SiteLens.

## Purpose

Provides a production-shaped HTTP API for the SiteLens platform, backed by
**PostgreSQL + PostGIS**. Layers, parcels, and search are served from spatial
tables; `analyze-area` and `planning-summary` remain typed, validated
placeholders (backend analysis arrives in a later step).

## Endpoints

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/health` | Health check (also at `/api/health`). |
| GET | `/api/health` | Health check. |
| GET | `/api/layers` | Layer metadata + feature counts (from PostGIS). |
| GET | `/api/parcels` | Parcels FeatureCollection via `ST_AsGeoJSON` (count meta). |
| GET | `/api/parcels/:id` | One parcel by `id` / `parcel_id` (404 if missing). |
| GET | `/api/search?q=` | Search across spatial tables with `ILIKE` (top 8, incl. bbox). |
| POST | `/api/analyze-area` | **PostGIS spatial analysis** of an AOI polygon (area, parcels, zoning, constraints, transit, development activity). |
| POST | `/api/planning-summary` | Validated placeholder → `501`. |

All responses use a consistent envelope: `{ data, meta? }` on success and
`{ error: { code, message, details? } }` on error. Every response includes an
`x-request-id` header. When the database is unavailable, DB-backed routes return
`503 SERVICE_UNAVAILABLE` (never a silent fallback).

## Database

PostGIS runs via Docker Compose (`infra/docker-compose.yml`). Spatial tables:
`planning_layers`, `parcels`, `zoning_overlays`, `constraints`,
`transit_points`, `development_activity`. Polygon layers use
`geometry(MultiPolygon, 4326)`; point layers use `geometry(Point, 4326)`. GIST
indexes exist on every geometry column, plus GIN full-text and btree lookup
indexes.

Data flow: `apps/api/data/*.geojson` → ingestion script (`ST_GeomFromGeoJSON` +
`ST_Multi` for polygons) → PostGIS tables → Fastify API (`ST_AsGeoJSON`).

`POST /api/analyze-area` runs the AOI analysis in PostGIS: it validates the
geometry (`ST_IsValid` → `400 INVALID_GEOMETRY` on failure), computes area with
`ST_Area(geom::geography)`, and uses `ST_Intersects` / `ST_DWithin` +
`ST_Distance` for parcels (count + avg development score), zoning breakdown,
intersecting constraints, transit within 1.5 km of the AOI centroid, and
development activity by status. Response: `{ data: { result, engine: "postgis" }, meta }`.

Smoke test:

```bash
curl -X POST http://localhost:4000/api/analyze-area \
  -H "content-type: application/json" \
  -d '{"geometry":{"type":"Polygon","coordinates":[[[151.205,-33.87],[151.215,-33.87],[151.215,-33.86],[151.205,-33.86],[151.205,-33.87]]]}}'
```

## Local development

Full backend setup from the repo root:

```bash
npm install
npm run db:up          # start PostgreSQL + PostGIS (port 54329)
npm run db:migrate     # apply SQL migrations
npm run ingest:geojson # load apps/api/data/*.geojson into PostGIS
npm run dev:api        # start on http://0.0.0.0:4000 (tsx watch)
```

Other scripts (from this directory):

```bash
npm run typecheck      # tsc --noEmit
npm run lint           # oxlint
npm run test           # vitest run (DB integration tests skipped by default)
npm run test:db        # RUN_DB_TESTS=true vitest run src/db (needs DB up)
npm run db:reset       # drop tables + re-run migrations (dev only)
```

Smoke tests:

```bash
curl http://localhost:4000/api/health
curl http://localhost:4000/api/layers
curl http://localhost:4000/api/parcels
curl "http://localhost:4000/api/search?q=central"
```

Configuration (env vars, with defaults — see `.env.example`):

- `PORT` (default `4000`)
- `NODE_ENV` (default `development`)
- `WEB_ORIGIN` (default `http://localhost:5173`) — allowed CORS origin.
- `DATABASE_URL` (default `postgres://sitelens:sitelens@localhost:54329/sitelens`)
- `DB_SSL` (default `false`)

## Current limitations

- `planning-summary` is still a typed/validated placeholder (`501`).
- Search uses `ILIKE`, not ranked full-text search yet.
- No cache, authentication, or external services.
- The API is run directly with `tsx`; there is no compiled build artifact yet.

## Next planned backend steps

- Redis caching for analysis/search.
- Authentication and access control.
- Azure deployment notes and CI.
