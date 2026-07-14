# Environment Variables

SiteLens runs with safe defaults and degrades gracefully. All variables are
optional for the **frontend-only** local demo; full-stack and deployed demos
need explicit env (see also [`docs/deploy-env-checklist.md`](deploy-env-checklist.md)).

## Modes

| Mode | Web | API / DB / Redis |
|------|-----|------------------|
| **Frontend-only** | omit `VITE_API_BASE_URL` | not required |
| **Full-stack (local)** | `VITE_API_BASE_URL=http://localhost:4000` | `apps/api/.env.local` + Docker |
| **Full-stack (deployed)** | bake `VITE_API_BASE_URL` + demo key at build | managed Postgres/PostGIS, Redis, API env (`apps/api/.env.production` for local verify) |

A deployed Vercel/static frontend **must** set `VITE_API_BASE_URL` for the
full-stack portfolio experience. Omitting it is valid only for frontend-only.
The documented portfolio stack is **Vercel + Fly.io + Neon (PostGIS) + Upstash**;
see [`docs/deployment.md`](deployment.md).

## Web (`apps/web`)

Set these in `apps/web/.env.local` (see `apps/web/.env.local.example`), or in the
static host’s build env for a deployed full-stack demo. For a local production
build, use `apps/web/.env.production` (see `.env.production.example`).

```txt
VITE_API_BASE_URL=http://localhost:4000
VITE_DEMO_API_KEY=demo-planner-key
```

- **`VITE_API_BASE_URL`** — base URL of the API. **Omit it** to run the frontend
  in local-only / frontend-only mode (Turf.js analysis + local deterministic
  summary, no backend calls). When set, the app calls the API and falls back
  locally on failure/403. Vite bakes this in at **build time**.
- **`VITE_DEMO_API_KEY`** — canonical browser demo API key sent as `x-api-key`.
  Use one of:
  - `demo-viewer-key` → Viewer role, Free plan
  - `demo-planner-key` → Planner role, Pro plan
  - `demo-admin-key` → Admin role, Enterprise plan

  The in-app **Demo access** control overrides this at runtime (persisted to
  `localStorage`).

  Smoke / deployed verify scripts (`smoke:fullstack`, `verify:deployed:api`) use
  the same Planner value via
  `PLANNER_KEY` → else `VITE_DEMO_API_KEY` → else `demo-planner-key`.
  Set `PLANNER_KEY` only when the script should differ from the web env.
  Deployed API verification (`verify:deployed:api`) requires `curl` and `jq`.

## API (`apps/api`)

Use **separate** files for local vs production (see `.env.example` for copy
instructions):

| File | Purpose |
|------|---------|
| `.env.local` | Local Docker PostGIS/Redis (`cp .env.local.example .env.local`) |
| `.env.production` | Deployed values + `API_BASE` for verify (`cp .env.production.example .env.production`) |

`src/loadEnv.ts` loads `.env.local` unless `NODE_ENV` / `APP_ENV` is
`production` (then `.env.production`). Override with `DOTENV_CONFIG_PATH`. On
Fly, set secrets with `fly secrets set` — do not commit real DB/Redis passwords.

Local example (`apps/api/.env.local`):

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
| `WEB_ORIGIN` | `http://localhost:5173` (non-prod) | Allowed CORS origin(s) — must **exactly** match the frontend origin(s). Comma-separated list supported (e.g. Vercel + `http://localhost:5173`). A Vite fallback port like `:5174` is a different origin and will fail with “Failed to fetch” unless listed. **Required in `NODE_ENV=production`** (startup throws if missing/blank; no allow-any fallback). |
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
| `OVERPASS_ENABLED` | `true` | Enables external planning-context builds via Overpass. |
| `OVERPASS_BASE_URL` | `https://overpass-api.de/api/interpreter` | Overpass interpreter URL (backend-only). |
| `OVERPASS_USER_AGENT` | same default as Nominatim UA | Identifying User-Agent for Overpass. Replace in production. |
| `OVERPASS_TIMEOUT_MS` | `15000` | Timeout for Overpass HTTP calls. |
| `OVERPASS_MIN_INTERVAL_MS` | `2500` | Process-local spacing between Overpass requests. |
| `EXTERNAL_CONTEXT_CACHE_TTL_SECONDS` | `604800` | Soft freshness window documentation; rebuild reuse uses `EXTERNAL_CONTEXT_REBUILD_AFTER_DAYS`. |
| `EXTERNAL_CONTEXT_MAX_BBOX_AREA_DEG2` | `0.01` | Max bbox area (deg²) accepted for Overpass extracts; larger place bboxes are clamped around the center. |
| `EXTERNAL_CONTEXT_REBUILD_AFTER_DAYS` | `7` | Reuse a ready PostGIS context without refetching Overpass when fresher than this. |
| `EXTERNAL_CONTEXT_SYNTHETIC_FALLBACK_ENABLED` | `false` | When Overpass is disabled or fails, build jobs can fall back to clearly labeled synthetic features (logged as `planning_context_build.synthetic_fallback`). Off by default; enable for deterministic CI/e2e. |
| `PLANNING_CONTEXT_WORKER_ENABLED` | `true` | Start the in-process build-job worker on API boot (`server.ts`). |
| `PLANNING_CONTEXT_WORKER_POLL_MS` | `750` | Interval between worker ticks when scanning for claimable jobs. |
| `PLANNING_CONTEXT_JOB_LOCK_MS` | `300000` | Lease duration (ms) while a job is `running` before it can be reclaimed. |
| `PLANNING_CONTEXT_JOB_HEARTBEAT_MS` | `lockMs / 3` | How often a long build extends its lease. Set `0` to disable heartbeat. |
| `PLANNING_CONTEXT_JOB_MAX_ATTEMPTS` | `3` | Max claim/reclaim attempts before the job and context are marked failed. |

### Worldwide place search (geocoding)

- The browser only calls the SiteLens API; the API proxies to **Nominatim /
  OpenStreetMap**. Repeated queries are served from Redis, and outbound requests
  are spaced by `GEOCODING_MIN_INTERVAL_MS` to respect the public-service policy.
- If public Nominatim returns 403/429 or is otherwise unavailable, development/
  demo mode can serve a clearly labeled **static-demo** fallback instead of
  failing the Places UI. Live and fallback responses use separate cache keys.
- Place search is **separate** from planning-feature search. Selecting a place
  does not change the active planning context; building an external context is
  an explicit user action.
- AOI analysis / planning-feature search are scoped to the selected
  **planning context** (Sydney Demo by default, or a generated external context).

### External planning contexts (Overpass)

- The browser never calls Overpass. Only `POST /api/planning-contexts/build`
  (Planner/Pro+) enqueues a live provider fetch via `planning_context_build_jobs`.
- An in-process demo worker (toggle via `PLANNING_CONTEXT_WORKER_ENABLED`) claims
  queued jobs or running jobs whose lease is null/expired, calls Overpass
  **without** holding a pool client, then commits features in a short
  transaction. A partial unique index enforces one active job per context;
  expired leases / max attempts recover stuck `running` jobs after a process
  crash. Poll `GET /api/planning-contexts/jobs/:jobId` until terminal.
- Overpass calls are process-local rate-spaced; production should use a
  distributed Redis-backed limiter/queue.
- Generated contexts are stored in PostGIS and reused when still fresh
  (`status: "succeeded", reused: true` with no Overpass call).
- Feature writes commit atomically (clear → insert → mark ready + job succeeded);
  Redis planning cache is invalidated only after commit. Concurrent POSTs for the
  same context return the existing active job.
- Builds are metered (`external-context:build`: Free `0` / Pro monthly /
  Enterprise unlimited). Quota is checked before enqueueing a live job; usage is
  recorded by the worker after a successful new build (not fresh reuse).
- External layers are open-map-derived urban context (sites/land use/constraints/
  transit/activity proxies) — **not** official zoning, cadastre, or DAs.
- The Places tab includes an autocomplete-style UX, but it does not call public
  Nominatim on every keystroke. Suggestions are local: bundled demo places,
  recent selections, and results from this session’s explicit searches. Live
  geocoding runs only when the user presses Enter/Search or chooses “Search live
  geocoder,” keeping the demo provider-friendly and compliant with public
  Nominatim usage limits.
- Set `NOMINATIM_USER_AGENT` to a real identifying value before deploying.
  Production options for true remote autocomplete: self-hosted Nominatim with
  your own policy, Pelias, Mapbox Search/Geocoding, Google Places, or a paid
  geocoding/autocomplete provider — plus a distributed Redis-backed rate
  limiter / circuit breaker (process-local cooldown is demo-oriented).

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
