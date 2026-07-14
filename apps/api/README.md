# @sitelens/api

Fastify + TypeScript API foundation for SiteLens.

## Purpose

Provides a production-shaped HTTP API for the SiteLens platform, backed by
**PostgreSQL + PostGIS** with an optional **Redis cache**. Layers, parcels,
search, and AOI analysis are served from spatial tables and cached in Redis.
`planning-summary` is a backend-owned **deterministic** summary service (no
external LLM), gated by plan features, metered, and Redis-cached.

## Endpoints

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/health` | Health check (also at `/api/health`). |
| GET | `/api/health` | Health check. |
| GET | `/api/layers` | Layer metadata + feature counts (from PostGIS). |
| GET | `/api/parcels` | Parcels FeatureCollection via `ST_AsGeoJSON` (count meta). |
| GET | `/api/parcels/:id` | One parcel by `id` / `parcel_id` (404 if missing). |
| GET | `/api/search?q=&planningContextId=` | Search across spatial tables with `ILIKE` (scoped to a planning context). |
| GET | `/api/layers/:layerId/geojson?planningContextId=` | Layer GeoJSON for map/index loading. |
| GET | `/api/geocode/search?q=&limit=` | **Worldwide place search** via a Nominatim/OSM backend proxy (Redis-cached, rate-spaced, static-demo fallback). |
| GET | `/api/planning-contexts` | List Sydney Demo + generated external contexts. |
| GET | `/api/planning-contexts/jobs/:jobId` | Poll async planning-context build job status. |
| POST | `/api/planning-contexts/build` | **Enqueue external OSM planning context build** for a selected place (job → Overpass → PostGIS; Pro+). |
| POST | `/api/analyze-area` | **PostGIS spatial analysis** of an AOI polygon (scoped by `planningContextId`). |
| POST | `/api/planning-summary` | **Deterministic planning summary** from analysis metrics (gated by `summary:generate`, metered, cached). |

All responses use a consistent envelope: `{ data, meta? }` on success and
`{ error: { code, message, details? } }` on error. Every response includes an
`x-request-id` header. When the database is unavailable, DB-backed routes return
`503 SERVICE_UNAVAILABLE` (never a silent fallback).

## Auth & entitlements (demo)

Demo **API-key** auth (not production). Provide a key via `x-api-key` or
`Authorization: Bearer <key>`; missing/unknown keys are treated as anonymous.

| Key | Role | Plan |
| --- | ---- | ---- |
| `demo-viewer-key` | viewer | free |
| `demo-planner-key` | planner | pro |
| `demo-admin-key` | admin | enterprise |

Capabilities (role + plan) gate the API:

- `GET /api/me` — current user + capabilities.
- `GET /api/layers` / `GET /api/health` — public.
- `GET /api/search` — 5 results for free/anonymous, 8 for pro/enterprise (`meta.access.limited`).
- `GET /api/parcels` — first 5 for free/anonymous, full FeatureCollection for pro+.
- `POST /api/analyze-area`, `POST /api/planning-summary` — require a paid plan
  (`planner`/`enterprise`), else `403 FORBIDDEN`. `401` is used only when auth is
  required but missing.

Cache keys are scoped by entitlement (`sitelens:parcels:v1:free` vs `…:pro`,
`sitelens:search:v1:<scope>:<hash>`, `sitelens:analysis:v1:<scope>:<hash>`) so
lower tiers can't receive higher-tier data from the cache.

**Production extension path:** OAuth/SSO, JWT/session cookies, Passport
strategies, and organization/team membership — never hard-coded keys.

## Billing & entitlements (Stripe-style, demo-safe)

Plans (`packages/shared/planCatalog.ts`): **Free** (search 5, parcels 5, no
analysis), **Pro** (search 8, full parcels, analysis + summaries), **Enterprise**
(search 20, unlimited, ingestion/admin). Capabilities now derive from **billing
plan features** (product access) plus **role** (admin gating), stored in DB.

Endpoints:

- `GET /api/billing/plans` — plan catalog (public).
- `GET /api/billing/current` — current billing context + capabilities.
- `POST /api/billing/demo-plan` — switch the demo user's plan (auth required;
  disabled in production unless `ENABLE_DEMO_BILLING=true`).
- `POST /api/billing/webhook` — Stripe-compatible webhook. Verifies the
  `stripe-signature` (`t=…,v1=…` HMAC over `${t}.${payload}`) when
  `STRIPE_WEBHOOK_SECRET` is set; in non-production without a secret it accepts
  demo payloads. Maps `customer.subscription.*` / `invoice.payment_failed`.

Route gates use plan **features**: `analyze-area` → `analysis:run`,
`planning-summary` → `summary:generate`; search/parcels use plan **limits**;
successful backend analyses and summaries are metered via `usage_counters`.
Cache keys are scoped by plan (`free`/`pro`/`enterprise`).

## Planning summary (deterministic, backend-owned)

`POST /api/planning-summary` accepts a `{ analysisResult, context? }` body,
validates it, checks the `summary:generate` entitlement + monthly usage limit,
then returns a deterministic planning summary (`generatePlanningSummary`) with
`engine: "deterministic-backend"`. Summaries are Redis-cached with a plan-scoped
key (`sitelens:summary:v1:<plan>:<hash>` — the raw analysis is never embedded in
the key). Redis failures still return a freshly generated summary
(`meta.cache: "error"`). No external LLM is called. **Production extension
path:** swap the deterministic generator for an LLM call while keeping the
source metrics + caveats, add evals + prompt/version logging, and add human
review for high-risk outputs.

DB: `demo_accounts`, `billing_customers`, `subscriptions`, `usage_counters`
(migration `004`). Seed with `npm run db:seed:billing`. If the billing DB is
unavailable, the API falls back to the demo user's default plan (logged).

**Production extension path:** Stripe Checkout + Customer Portal, real webhook
signature verification via the Stripe SDK with the raw body, org/team billing,
and usage metering.

## Worldwide place search (Nominatim proxy)

`GET /api/geocode/search?q=&limit=` proxies to **Nominatim / OpenStreetMap** —
the browser never calls Nominatim directly. The service validates the query
(min 3 chars), clamps `limit` to 1–10, serves repeats from Redis
(`sitelens:place-search:v1:<provider>:<limit>:<hash>` — provider-scoped; the raw
query is hashed), and on a live miss spaces the outbound request
(`GEOCODING_MIN_INTERVAL_MS`, ~1 req/sec) before calling Nominatim with the
configured `NOMINATIM_USER_AGENT`.

When public Nominatim returns 403/429 or is otherwise unavailable, development/
demo mode can return a clearly labeled bundled **static-demo** dataset
(`GEOCODING_STATIC_FALLBACK_ENABLED`, on by default outside production) and
enter a process-local cooldown (`GEOCODING_UPSTREAM_ERROR_COOLDOWN_MS`) so
retries do not keep hammering the provider. Fallback responses include
`fallback: { active, reason, message }` and are never labeled as Nominatim.

Errors when fallback is disabled: `400` short query, `503` disabled/
misconfigured/cooldown, `502` upstream, `504` timeout. A Redis failure still
returns fresh results when the chosen provider path succeeds. This is
independent of local planning search and does not trigger AOI analysis.

The single-process request spacer + cooldown is fine for the demo; a
horizontally-scaled deployment should use a distributed Redis-backed
limiter/circuit breaker. Production alternatives to public Nominatim:
self-hosted Nominatim, Mapbox Geocoding, Pelias, or a commercial provider.

## Caching (Redis)

Layers, parcels, parcel detail, search, and `analyze-area` are cached in Redis
(via Docker Compose, port `6389`). Responses report the cache outcome in
`meta.cache` (`hit` / `miss` / `disabled` / `error` / `none`) plus a safe
`meta.cacheKey` (the `analyze-area` key is a SHA-256 of the geometry — no raw
coordinates). TTLs: layers 10m, parcels 5m, parcel detail 10m, search 2m,
analysis 5m.

Caching is optional and degrades gracefully: if `REDIS_URL` is unset caching is
`disabled`; if Redis is unreachable the route still returns the DB result with
`meta.cache = "error"` (Redis failures never break a valid response). Running
`npm run ingest:geojson` clears the planning cache keys; `npm run cache:clear`
clears all `sitelens:*` keys. The Azure equivalent is Azure Cache for Redis.

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
npm run db:migrate     # apply SQL migrations (tsx; local/dev)
npm run ingest:geojson # load apps/api/data/*.geojson into PostGIS
npm run dev:api        # start on http://0.0.0.0:4000 (tsx watch)
```

Other scripts (from this directory):

```bash
npm run typecheck      # tsc --noEmit
npm run lint           # oxlint
npm run test           # vitest run (DB/Redis integration tests skipped by default)
npm run test:db        # RUN_DB_TESTS=true vitest run src/db (needs DB up)
npm run test:redis     # RUN_REDIS_TESTS=true vitest run src/cache (needs Redis up + REDIS_URL)
npm run db:reset       # drop tables + re-run migrations (dev only)
npm run cache:clear    # clear all sitelens:* cache keys (tsx)
# Production image / Fly SSH (no tsx — compiled dist):
npm run db:migrate:prod
npm run db:migrate:check:prod
npm run db:seed:billing:prod
npm run ingest:geojson:prod
npm run cache:clear:prod
```

`npm run db:up` starts both PostgreSQL/PostGIS (`54329`) and Redis (`6389`).

Smoke tests:

```bash
curl http://localhost:4000/api/health
curl http://localhost:4000/api/layers
curl http://localhost:4000/api/parcels
curl "http://localhost:4000/api/search?q=central"
```

Configuration (env vars, with defaults — see `.env.local.example` /
`.env.production.example`):
- Local: copy `.env.local.example` → `.env.local`
- Production reference / verify: copy `.env.production.example` → `.env.production`
  (Fly still uses `fly secrets set` for real secrets)

- `PORT` (default `4000`)
- `NODE_ENV` (default `development`)
- `WEB_ORIGIN` (default `http://localhost:5173`) — allowed CORS origin.
- `DATABASE_URL` (default `postgres://sitelens:sitelens@localhost:54329/sitelens`)
- `DB_SSL` (default `false`)
- `REDIS_URL` (e.g. `redis://localhost:6389`) — caching is disabled when unset.
- `CACHE_ENABLED` (default `true` when `REDIS_URL` is set)
- `CACHE_DEFAULT_TTL_SECONDS` (default `300`)
- `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` (empty in demo)
- `ENABLE_DEMO_BILLING` (default `true`; required to allow demo plan switching in production)
- `GEOCODING_ENABLED` (default `true`), `NOMINATIM_BASE_URL`, `NOMINATIM_USER_AGENT` (replace the placeholder for production), `GEOCODING_MIN_INTERVAL_MS` (default `1100`), `GEOCODING_CACHE_TTL_SECONDS` (default `86400`)

## Current limitations

- `planning-summary` is deterministic (no real LLM yet); production would swap
  in an LLM call while keeping source metrics + caveats.
- Search uses `ILIKE`, not ranked full-text search yet.
- No authentication or external services.
- Production runs compiled `dist/server.js` via Node (`npm start`). Local `dev`
  still uses `tsx watch`.

## Next planned backend steps

- Authentication and access control.
- Deploy with Fly.io + managed PostGIS/Redis — see [`docs/deployment.md`](../../docs/deployment.md).
