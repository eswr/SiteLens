# Environment Variables

SiteLens runs with safe defaults and degrades gracefully. All variables are
optional for the **frontend-only** local demo; full-stack and deployed demos
need explicit env (see also [`docs/deploy-env-checklist.md`](deploy-env-checklist.md)).

## Modes

| Mode | Web | API / DB / Redis |
|------|-----|------------------|
| **Frontend-only** | omit `VITE_API_BASE_URL` | not required |
| **Full-stack (local)** | `VITE_API_BASE_URL=http://localhost:4000` | `apps/api/.env` + Docker |
| **Full-stack (deployed)** | bake `VITE_API_BASE_URL` + demo key at build | managed Postgres/PostGIS, Redis, API env |

A deployed Vercel/static frontend **must** set `VITE_API_BASE_URL` for the
full-stack portfolio experience. Omitting it is valid only for frontend-only.

## Web (`apps/web`)

Set these in `apps/web/.env.local` (see `apps/web/.env.example`), or in the
static host’s build env for a deployed full-stack demo.

```txt
VITE_API_BASE_URL=http://localhost:4000
VITE_DEMO_API_KEY=demo-planner-key
```

- **`VITE_API_BASE_URL`** — base URL of the API. **Omit it** to run the frontend
  in local-only / frontend-only mode (Turf.js analysis + local deterministic
  summary, no backend calls). When set, the app calls the API and falls back
  locally on failure/403. Vite bakes this in at **build time**.
- **`VITE_DEMO_API_KEY`** — demo API key sent as `x-api-key`. Use one of:
  - `demo-viewer-key` → Viewer role, Free plan
  - `demo-planner-key` → Planner role, Pro plan
  - `demo-admin-key` → Admin role, Enterprise plan

  The in-app **Demo access** control overrides this at runtime (persisted to
  `localStorage`).

## API (`apps/api`)

Set these in `apps/api/.env` (see `apps/api/.env.example`).

```txt
NODE_ENV=development
PORT=4000
WEB_ORIGIN=http://localhost:5173
DATABASE_URL=postgres://sitelens:sitelens@localhost:54329/sitelens
DB_SSL=false
REDIS_URL=redis://localhost:6389
CACHE_ENABLED=true
CACHE_DEFAULT_TTL_SECONDS=300
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
ENABLE_DEMO_BILLING=true
```

| Variable | Default | Notes |
| --- | --- | --- |
| `NODE_ENV` | `development` | `production` enables prod behavior (e.g. gates demo billing). |
| `PORT` | `4000` | API listen port. |
| `WEB_ORIGIN` | `http://localhost:5173` | Allowed CORS origin — must **exactly** match the frontend origin when deployed. |
| `DATABASE_URL` | `postgres://sitelens:sitelens@localhost:54329/sitelens` | PostgreSQL/PostGIS connection string. |
| `DB_SSL` | `false` | Set `true` for managed Postgres requiring TLS. |
| `REDIS_URL` | _(empty)_ | **Optional.** Caching is disabled when unset; the API still works. |
| `CACHE_ENABLED` | `true` | Only effective when `REDIS_URL` is set. |
| `CACHE_DEFAULT_TTL_SECONDS` | `300` | Default cache TTL. |
| `STRIPE_SECRET_KEY` | _(empty)_ | **Optional.** Not required for the demo. |
| `STRIPE_WEBHOOK_SECRET` | _(empty)_ | **Optional.** When set, the webhook verifies signatures. |
| `ENABLE_DEMO_BILLING` | `true` | Allows demo plan switching. **Do not enable in production** unless intentionally configured. |
| `GEOCODING_ENABLED` | `true` | Enables `GET /api/geocode/search`; when `false` the route returns `503`. |
| `NOMINATIM_BASE_URL` | `https://nominatim.openstreetmap.org` | Nominatim base URL (point at a self-hosted instance for production). |
| `NOMINATIM_USER_AGENT` | `SiteLens/0.1 (portfolio-demo; contact: replace-with-your-email@example.com)` | Identifying User-Agent required by Nominatim. **Must be replaced** with a real contact in production (the server refuses the default placeholder in production). |
| `GEOCODING_MIN_INTERVAL_MS` | `1100` | Minimum spacing between outbound Nominatim requests (~1 req/sec policy). |
| `GEOCODING_CACHE_TTL_SECONDS` | `86400` | TTL for cached live Nominatim place-search results in Redis. |
| `GEOCODING_STATIC_FALLBACK_ENABLED` | `true` (non-prod) / `false` (prod) | When live Nominatim is blocked/unavailable, return bundled static-demo places. Production must opt in explicitly. |
| `GEOCODING_UPSTREAM_ERROR_COOLDOWN_MS` | `900000` | After 403/429/timeout/outage, skip Nominatim for this long (process-local circuit breaker). |
| `GEOCODING_STATIC_FALLBACK_TTL_SECONDS` | `3600` | TTL for cached static-demo place-search results. |

### Worldwide place search (geocoding)

- The browser only calls the SiteLens API; the API proxies to **Nominatim /
  OpenStreetMap**. Repeated queries are served from Redis, and outbound requests
  are spaced by `GEOCODING_MIN_INTERVAL_MS` to respect the public-service policy.
- If public Nominatim returns 403/429 or is otherwise unavailable, development/
  demo mode can serve a clearly labeled **static-demo** fallback instead of
  failing the Places UI. Live and fallback responses use separate cache keys.
- Place search is **separate** from local planning-feature search and does not
  affect AOI analysis (which stays on the local PostGIS dataset).
- Set `NOMINATIM_USER_AGENT` to a real identifying value before deploying.
  Production options: self-host Nominatim, or switch to Mapbox Geocoding /
  Pelias / a commercial provider, plus a distributed Redis-backed rate limiter /
  circuit breaker (process-local cooldown is demo-oriented).

### Public Nominatim returns 403

Some cloud, VPN, or shared networks may be blocked by the public Nominatim
service. This is expected provider behavior, not a SiteLens proxy bug.

For local portfolio demos, enable:

```txt
GEOCODING_STATIC_FALLBACK_ENABLED=true
```

The API will transparently return bundled static-demo places and mark the
response with `provider: "static-demo"` and fallback metadata.

For production, use a self-hosted Nominatim instance or a commercial geocoding
provider.

### Notes

- **Stripe secrets are optional** — the billing demo runs without them; the
  webhook accepts demo payloads in non-production and verifies signatures when a
  secret is configured.
- **Redis is optional** and degrades gracefully — cache reads report `disabled`
  and every request still computes a fresh result.
- **Demo billing** (`ENABLE_DEMO_BILLING`) should not be left on in production;
  `POST /api/billing/demo-plan` is refused in production unless it is explicitly
  set to `true`.

### CI

GitHub Actions (`.github/workflows/ci.yml`) runs the `quality` job with **no**
services (defaults apply), and the `integration` job with PostGIS + Redis using:

```txt
DATABASE_URL=postgres://sitelens:sitelens@localhost:5432/sitelens
REDIS_URL=redis://localhost:6379
```
