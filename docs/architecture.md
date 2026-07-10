# Architecture

SiteLens is an npm-workspaces monorepo.

## System diagram

```txt
React / MapLibre / MUI / Recharts
        |
        | VITE_API_BASE_URL
        v
Fastify API
        |
        | Auth + billing gates
        |
        +--> Redis cache
        |
        +--> PostgreSQL + PostGIS
        |
        +--> Deterministic planning summary service
```

## Data flow diagrams

### Spatial analysis

```txt
AOI polygon
  -> /api/analyze-area
  -> entitlement check
  -> Redis analysis cache
  -> PostGIS spatial SQL
  -> typed SpatialAnalysisResult
  -> frontend charts + AI summary source metrics
```

### Planning summary

```txt
SpatialAnalysisResult
  -> /api/planning-summary
  -> entitlement + usage check
  -> Redis summary cache
  -> deterministic backend generator
  -> source-transparent PlanningSummary
  -> frontend summary panel
```

## Stack

**Frontend** (`apps/web`)
React + TypeScript + Vite + MapLibre GL + Turf.js + Recharts + Material UI + Zustand

**Backend** (`apps/api`)
Fastify + TypeScript (run with `tsx`), `pg` for database access

**Database**
PostgreSQL + PostGIS (via Docker Compose)

**Cache**
Redis (via Docker Compose, port 6389; Azure Cache for Redis equivalent)

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

AOI analysis (full-stack, with cache):

```
Frontend AOI polygon (MapLibre draw)
  → POST /api/analyze-area
  → Redis cache lookup (key = sha256(geometry))
  → PostGIS spatial SQL on cache miss (ST_IsValid, ST_Area::geography, ST_Intersects, ST_DWithin, ST_Distance, aggregates)
  → Redis cache write (TTL)
  → { result, engine: "postgis" } + meta.cache (hit|miss|disabled|error)
  → frontend analytics + AI summary (shows cache status)
```

Layers, parcels, parcel detail, and search follow the same read-through cache
pattern. Redis is optional: if unset the API returns `cache: "disabled"`; if
unreachable it returns the DB result with `cache: "error"`. Ingestion clears the
planning cache keys.

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

## Auth & entitlements (demo)

API-key demo auth attaches an `AuthContext` to each request. Capabilities are
derived from role (`viewer`/`planner`/`admin`) + plan (`free`/`pro`/`enterprise`)
and enforced per route: analysis/summary require a paid plan; ingestion is
admin-only; search/parcels are limited for free/anonymous. Cache keys are scoped
by entitlement so lower tiers never receive higher-tier data. Production would
swap API keys for OAuth/SSO + JWT/session cookies + org membership.

## Billing & entitlements (Stripe-style)

A plan catalog (Free / Pro / Enterprise) plus DB-backed `subscriptions` and
`usage_counters` drive entitlements. Capabilities are derived from **plan
features** (product access) and **role** (admin gating). Route gates check
features (`analysis:run`, `summary:generate`), search/parcels use plan limits,
cache keys are plan-scoped, and successful analyses are metered. A
Stripe-compatible webhook maps subscription events; `POST /api/billing/demo-plan`
switches the demo plan. Production swaps this for Stripe Checkout/Portal +
signed webhooks.

## Planning summary (backend-owned, deterministic)

`POST /api/planning-summary` is a Fastify-owned deterministic summary service:
source metrics → entitlement check (`summary:generate`) → usage limit → Redis
cache (plan-scoped) → typed response (`engine: "deterministic-backend"`). No LLM
is called. The frontend uses it when the API + plan allow and falls back to an
identical local deterministic summary on `403` / failure / no API, surfacing the
engine, cache status, and source metrics. Production would swap the generator
for an LLM (keeping metrics + caveats, evals, prompt/version logging, human
review) without changing the surrounding architecture.

## Roadmap

- Done: frontend AOI analysis connects to backend PostGIS (`/api/analyze-area`).
- Done: Redis caching for layers/parcels/search/analysis/summary with cache metadata.
- Done: demo API-key auth, RBAC roles, and plan-based entitlement gates.
- Done: Stripe-style billing catalog, DB subscriptions, usage metering, webhook.
- Done: backend-owned deterministic planning summary (gated, metered, cached).
- Done: GitHub Actions CI (quality + PostGIS/Redis integration), deployment docs.

## Future improvements

- OpenAPI/Swagger generation for the API
- Vector tiles for large spatial datasets
- Production SSO (OAuth/OIDC) + org/team membership
- Real Stripe Checkout / Customer Portal
- Azure deployment (App Service / Container Apps + managed Postgres/Redis)
- Observability stack (structured logs, metrics, tracing, error tracking)
- Real LLM planning summary with prompt/version logging + eval set
