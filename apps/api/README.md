# @sitelens/api

Fastify + TypeScript API foundation for SiteLens.

## Purpose

Provides a production-shaped HTTP API for the SiteLens platform. In this step it
serves **mock GeoJSON** endpoints and typed, validated placeholders for the
spatial-analysis and planning-summary contracts. There is **no database yet** —
data is read from static files in `apps/api/data`.

## Endpoints

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/health` | Health check (also at `/api/health`). |
| GET | `/api/health` | Health check. |
| GET | `/api/layers` | Layer metadata + feature counts. |
| GET | `/api/parcels` | Parcels FeatureCollection (with count meta). |
| GET | `/api/parcels/:id` | One parcel by feature id / `parcelId` (404 if missing). |
| GET | `/api/search?q=` | Search across mock features (top 8). |
| POST | `/api/analyze-area` | Validated placeholder → `501` (PostGIS later). |
| POST | `/api/planning-summary` | Validated placeholder → `501`. |

All responses use a consistent envelope: `{ data, meta? }` on success and
`{ error: { code, message, details? } }` on error. Every response includes an
`x-request-id` header.

## Local development

From the repo root:

```bash
npm run dev:api     # start on http://0.0.0.0:4000 (tsx watch)
```

Or from this directory:

```bash
npm run dev         # tsx watch src/server.ts
npm run typecheck   # tsc --noEmit
npm run lint        # oxlint
npm run test        # vitest run
```

Configuration (env vars, with defaults):

- `PORT` (default `4000`)
- `NODE_ENV` (default `development`)
- `WEB_ORIGIN` (default `http://localhost:5173`) — allowed CORS origin.

## Current limitations

- Data is static mock GeoJSON copied into `apps/api/data`; no persistence.
- `analyze-area` and `planning-summary` are typed/validated placeholders only.
- No database, cache, authentication, or external services.
- The API is run directly with `tsx`; there is no compiled build artifact yet.

## Next planned backend steps

- PostgreSQL/PostGIS with GeoJSON ingestion.
- Backend spatial analysis (replacing the placeholder).
- Redis caching for analysis/search.
- Authentication and access control.
- Azure deployment notes and CI.
