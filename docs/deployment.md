# Deployment

SiteLens supports two demo modes. Choose the right one and set env vars
accordingly.

## Frontend-only demo

Works with **no backend**. Static GeoJSON under `apps/web/public/data`, local
Turf analysis, and no place-search geocoding proxy.

```bash
npm run dev:web
# or deploy apps/web with no VITE_* vars
```

MapLibre uses the public demotiles style (no paid map token).

## Full-stack demo

Requires a Fastify API, managed PostgreSQL/PostGIS, managed Redis, seeded demo
data, and a frontend build that points at the API:

```txt
VITE_API_BASE_URL=https://<api-host>
VITE_DEMO_API_KEY=demo-planner-key
```

Without `VITE_API_BASE_URL`, the deployed frontend stays in frontend-only mode
even if the API is running. See [`docs/deploy-env-checklist.md`](deploy-env-checklist.md)
for the full API env set, including geocoding + static-demo fallback.

---

## Recommended portfolio path

Do **not** hardcode a single cloud vendor into the app. Any stack that provides
the following works:

| Role | Examples |
|------|----------|
| Static frontend | Vercel, Netlify, Cloudflare Pages |
| Node 20 API | Render, Railway, Fly.io, Azure App Service |
| PostgreSQL + **PostGIS** | Neon (PostGIS), Supabase, Railway, Azure Flexible Server + PostGIS |
| Redis | Upstash, Redis Cloud, Render Redis, Azure Cache for Redis |

**Documented portfolio combo for this repo:** **Vercel** (web) + **Fly.io**
(API) + **Neon** PostGIS (via Vercel Marketplace) + **Upstash** Redis.
Configs: root [`Dockerfile`](../Dockerfile), [`fly.toml`](../fly.toml),
root [`vercel.json`](../vercel.json).

---

## Portfolio deploy: Vercel + Fly + Neon + Upstash

Follow this order. Full env values:
[`docs/deploy-env-checklist.md`](deploy-env-checklist.md).

### 1. Provision Neon (PostGIS)

1. Create a Neon Postgres database (Vercel Marketplace / Integration, or
   `npx neonctl projects create --name sitelens --region-id aws-us-west-2`).
2. Enable **PostGIS** (`CREATE EXTENSION IF NOT EXISTS postgis;` — migration
   `001` also enables it).
3. Copy the `DATABASE_URL` (TLS). You will set `DB_SSL=true`.

### 2. Provision Upstash Redis

Easiest with the Fly Upstash integration (same org as the API):

```bash
fly redis create --name sitelens-redis --org personal --region sjc \
  --enable-eviction --no-replicas --enable-prodpack=false
```

Copy the **private** Redis URL from the command output
(`redis://…@fly-<name>.upstash.io:…`). That hostname resolves **only from Fly
machines** in the same org — not from your laptop. Local `npm run cache:clear`
(or any script using that URL) will fail with `ENOTFOUND`; that is expected.
Migrations and GeoJSON/billing seed need only `DATABASE_URL` locally. To clear
cache after seed, either run `npm run cache:clear` inside `fly ssh console`, or
provision a public Upstash URL (`rediss://…`) for local ops. The Fly API process
itself should use the private URL.

You can also create Redis in the Upstash or Vercel Marketplace dashboards and
set `REDIS_URL` manually (`rediss://…` TLS is fine; `ioredis` accepts it).

### 3. Deploy the API on Fly.io

Prerequisites: [flyctl](https://fly.io/docs/flyctl/install/) logged in (`fly auth login`).

```bash
# From the repository root (first time)
fly apps create sitelens-api   # skip if fly.toml app already exists
fly secrets set \
  NODE_ENV=production \
  DB_SSL=true \
  DATABASE_URL='postgres://…' \
  REDIS_URL='rediss://…' \
  WEB_ORIGIN='https://<exact-vercel-host>' \
  ENABLE_DEMO_BILLING=true \
  GEOCODING_ENABLED=true \
  NOMINATIM_BASE_URL=https://nominatim.openstreetmap.org \
  NOMINATIM_USER_AGENT='SiteLens/0.1 (portfolio-demo; contact: easwarendra.ece@gmail.com)' \
  GEOCODING_MIN_INTERVAL_MS=1100 \
  GEOCODING_CACHE_TTL_SECONDS=86400 \
  GEOCODING_STATIC_FALLBACK_ENABLED=true \
  GEOCODING_UPSTREAM_ERROR_COOLDOWN_MS=900000 \
  GEOCODING_STATIC_FALLBACK_TTL_SECONDS=3600

fly deploy
```

- Image builds from the root `Dockerfile` (multi-stage: `tsc` → `node dist/server.js`; no `tsx` in runtime).
- Health check: `GET /health` (also `/api/health`).
- **Docker runtime smoke** (compiled `node dist/server.js`, not `tsx`):

```bash
# Requires Docker. Sets WEB_ORIGIN (required in production).
npm run smoke:docker:api

# Optional: also run db:migrate:check:prod against local compose PostGIS
RUN_MIGRATE_CHECK=1 npm run smoke:docker:api
```

  Manual CI gate: dispatch the **Docker API smoke** job in
  [`.github/workflows/ci.yml`](../.github/workflows/ci.yml).
- [`fly.toml`](../fly.toml) uses a **single** machine (`[[vm]] count = 1`,
  `min_machines_running = 1`) so the portfolio demo stays warm without an HA
  replica. If a deploy ever creates a second machine: `fly scale count app=1`.
- If the Vercel hostname is not known yet, set a provisional `WEB_ORIGIN`, deploy
  the frontend, then `fly secrets set WEB_ORIGIN=https://<exact-origin>` and
  restart (`fly apps restart sitelens-api`).

### 4. Migrate and seed (managed database)

**Local/dev** uses `tsx` scripts (`db:migrate`, `db:seed:billing`,
`ingest:geojson`, `cache:clear`). **Production image / Fly SSH** has no `tsx` —
use the `:prod` scripts that run compiled `dist/` entrypoints instead.

Run migrate / billing seed / GeoJSON ingest against the managed `DATABASE_URL`
from a local shell (export `DATABASE_URL` + `DB_SSL=true`) with the **tsx**
scripts after `npm ci` (dev deps present). Or from inside the API image / Fly:

```bash
# From laptop (dev deps + source available):
export DATABASE_URL='postgres://…'
export DB_SSL=true
npm run db:migrate -w apps/api
npm run db:seed:billing -w apps/api
npm run ingest:geojson -w apps/api

# From production image / fly ssh console (no tsx — use dist):
npm run db:migrate:prod -w apps/api
npm run db:seed:billing:prod -w apps/api
npm run ingest:geojson:prod -w apps/api
# cache:clear:prod — or a public REDIS_URL from laptop; not fly-*.upstash.io
```

### 5. Verify the deployed API

Requires **`jq`** locally (`brew install jq` on macOS). Set `API_BASE` in
[`apps/api/.env.production`](../apps/api/.env.production.example) or pass it
inline:

```bash
API_BASE=https://sitelens-api.fly.dev npm run verify:deployed:api
```

The script checks health, identity, layers, local planning search, geocoding
(plus cache hit), PostGIS analysis, planning summary, and Free/Viewer 403 gating.

Optional geocoding smoke (expects static fallback when Nominatim is blocked):

```bash
SMOKE_GEOCODING=true SMOKE_GEOCODING_EXPECT_FALLBACK=true \
  API_BASE=https://sitelens-api.fly.dev npm run smoke:fullstack
```

`GEOCODING_STATIC_FALLBACK_ENABLED=true` is intentional for the public portfolio
demo: some cloud/shared networks are blocked by public Nominatim (403). The API
then returns clearly labeled `static-demo` places. Do **not** bypass Nominatim
restrictions. Replace the Nominatim User-Agent contact before going public
(production refuses the placeholder).

### 6. Deploy the frontend on Vercel

`@sitelens/web` depends on `@sitelens/shared` at build time. Deploy from the
**repository root** so workspaces resolve correctly. Do **not** use an
`apps/web`-only CLI upload unless shared is published or vendored.

1. Import the GitHub repo in Vercel.
2. **Root Directory:** repository root (`.`) — leave blank / unset in the UI.
3. **Install:** `npm ci` · **Build:** `npm run build:web` · **Output:**
   `apps/web/dist` (also set in root [`vercel.json`](../vercel.json)).
4. Framework: Vite. SPA fallback rewrite is in root `vercel.json`.
5. Environment (Production) — baked in at **build** time:

```txt
VITE_API_BASE_URL=https://sitelens-api.fly.dev
VITE_DEMO_API_KEY=demo-planner-key
```

6. Deploy (e.g. `vercel deploy --prod` from the **repo root**). Prefer a stable
   alias such as `https://sitelens-demo.vercel.app`, then set Fly `WEB_ORIGIN`
   to that **exact** origin (scheme + host, no trailing slash).
7. For a **public** portfolio demo, disable Vercel Deployment Protection SSO
   (`vercel project protection disable --sso`); otherwise `.vercel.app` aliases
   may redirect to Vercel login.

### 7. Verify the UI

Follow [`docs/frontend-deploy-verification.md`](frontend-deploy-verification.md).

If the browser reports CORS errors:

1. Fix API `WEB_ORIGIN` to match the frontend origin exactly.
2. Redeploy / restart the Fly app.
3. Hard-refresh the frontend.

---

## Generic deployment order

Use this when targeting a different vendor mix than Fly + Vercel.

### Step A — Provision services

1. Create a managed PostgreSQL instance and **enable PostGIS**.
2. Create a managed Redis instance.
3. Create an API host (Node 20) and a static frontend host.
4. Collect: `DATABASE_URL`, `REDIS_URL`, API public HTTPS URL, frontend origin.

### Step B — Deploy API first

From the **repo root**:

```bash
npm ci
npm run build -w apps/api
npm run start -w apps/api
```

Provider settings (non-Docker hosts):

- **Root directory:** repository root
- **Start command:** `npm run start -w apps/api`
- **Env:** see [`docs/deploy-env-checklist.md`](deploy-env-checklist.md)

On Fly, prefer `fly deploy` (Docker) instead of a bare start command.

Set `WEB_ORIGIN` to allowed frontend origin(s) — a single origin or a
comma-separated list (scheme + host, no trailing slash). In
`NODE_ENV=production` the API **requires** a non-empty `WEB_ORIGIN` at
startup (fail closed; there is no allow-any CORS fallback). Example:
`https://sitelens-demo.vercel.app,http://localhost:5173` for Vercel + local
Vite. A mismatch causes CORS failures for `/api/me`, `/api/geocode/search`,
`/api/analyze-area`, and `/api/planning-summary`.

### Step C — Run migrations and seed

Against the **deployed** `DATABASE_URL` (same env as the API process / one-off
job with those vars). Prefer **`:prod`** scripts when running inside the Docker
image / `fly ssh` (no `tsx`). From a laptop checkout with `npm ci`, the plain
tsx scripts also work.

```bash
# Production image / Fly SSH:
npm run db:migrate:prod -w apps/api
npm run db:seed:billing:prod -w apps/api
npm run ingest:geojson:prod -w apps/api
npm run cache:clear:prod -w apps/api
```

### Step D — Verify API

Requires **`jq`** (`brew install jq`).

```bash
API_BASE=https://<api-host> npm run verify:deployed:api
```

### Step E — Deploy frontend

Provider settings (Vercel-style):

- **Root directory:** repository root (`.`)
- **Install command:** `npm ci`
- **Build command:** `npm run build:web`
- **Output directory:** `apps/web/dist`

Frontend env (required for full-stack):

```txt
VITE_API_BASE_URL=https://<api-host>
VITE_DEMO_API_KEY=demo-planner-key
```

Vite bakes these in at build time — set them in the host before building.

### Step F — Verify frontend

Follow [`docs/frontend-deploy-verification.md`](frontend-deploy-verification.md).

---

## Frontend (Vercel) detail

1. Push the repo to GitHub and import it in Vercel.
2. Framework preset: Vite.
3. Root directory: repository root (`.`). `apps/web` imports `@sitelens/shared`,
   so builds must run from the monorepo root (`npm run build:web`).
4. Install / build / output: see root [`vercel.json`](../vercel.json)
   (`npm ci` → `npm run build:web` → `apps/web/dist`).
5. SPA fallback: root `vercel.json` rewrites (legacy
   [`apps/web/vercel.json`](../apps/web/vercel.json) kept for local reference).
6. For **frontend-only**: omit `VITE_API_*` env vars.
7. For **full-stack**: set `VITE_API_BASE_URL` and `VITE_DEMO_API_KEY` as above.

Notes:

- No paid map token is required (public MapLibre demo style).
- Planning layers still ship as static GeoJSON for the map; analysis/search/
  summary/geocode hit the API when `VITE_API_BASE_URL` is set.
- The browser must never call `nominatim.openstreetmap.org` directly — only the
  SiteLens API.

---

## Backend local (Docker) — development

```bash
npm install
npm run db:up          # PostGIS :54329 + Redis :6389
npm run db:migrate
npm run ingest:geojson
npm run db:seed:billing
npm run dev:api        # :4000
npm run dev:web        # :5173 with apps/web/.env.local

# Optional release smoke (API + web + PostGIS seeded):
# npm run test:e2e:smoke
# Manual CI: workflow_dispatch → E2E demo smoke / Docker API smoke
```

Reset / teardown:

```bash
npm run db:reset
npm run db:down
```

---

## Caching (Redis)

- Responses report `meta.cache` (`hit` / `miss` / `disabled` / `error`).
- Caching is optional and degrades gracefully if Redis is down.
- Place-search keys are provider-scoped (`nominatim` vs `static-demo`).
- Ingestion / `npm run cache:clear` refresh planning/geocode cache as needed.

## Billing (Stripe-style, demo-safe)

- Seed with `npm run db:seed:billing`.
- `ENABLE_DEMO_BILLING=true` is **portfolio-only**; real production should
  disable demo plan switching and use real auth/Stripe.

## Planning summary

- `POST /api/planning-summary` is deterministic (no external LLM), entitlement-
  gated, and Redis-cached.

---

## Related docs

- [`docs/deploy-env-checklist.md`](deploy-env-checklist.md) — production/demo env vars
- [`docs/frontend-deploy-verification.md`](frontend-deploy-verification.md) — UI checklist
- [`docs/environment.md`](environment.md) — local + CI env reference
- [`docs/demo-checklist.md`](demo-checklist.md) — live demo walkthrough
