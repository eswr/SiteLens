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

Typical portfolio combo: **Vercel** (web) + **Render/Railway/Fly** (API) +
managed Postgres/PostGIS + managed Redis.

---

## Deployment order

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

Provider settings:

- **Root directory:** repository root
- **Start command:** `npm run start -w apps/api`
- **Env:** see [`docs/deploy-env-checklist.md`](deploy-env-checklist.md)

Set `WEB_ORIGIN` to the **exact** deployed frontend origin (scheme + host, no
trailing slash), e.g. `https://sitelens-demo.vercel.app`. A mismatch causes CORS
failures for `/api/me`, `/api/geocode/search`, `/api/analyze-area`, and
`/api/planning-summary`.

### Step C — Run migrations and seed

Against the **deployed** `DATABASE_URL` (same env as the API process / one-off
job with those vars):

```bash
npm run db:migrate -w apps/api
npm run db:seed:billing -w apps/api
npm run ingest:geojson -w apps/api
npm run cache:clear -w apps/api
```

### Step D — Verify API

```bash
API_BASE=https://<api-host> npm run verify:deployed:api
```

Optional geocoding smoke against the deployed host:

```bash
SMOKE_GEOCODING=true SMOKE_GEOCODING_EXPECT_FALLBACK=true \
  API_BASE=https://<api-host> npm run smoke:fullstack
```

`GEOCODING_STATIC_FALLBACK_ENABLED=true` is intentional for the public portfolio
demo: some cloud/shared networks are blocked by public Nominatim (403). The API
then returns clearly labeled `static-demo` places. Do **not** bypass Nominatim
restrictions.

### Step E — Deploy frontend

Provider settings (Vercel-style):

- **Root directory:** `apps/web`
- **Build command:** `npm run build`
- **Output directory:** `dist`

Frontend env (required for full-stack):

```txt
VITE_API_BASE_URL=https://<api-host>
VITE_DEMO_API_KEY=demo-planner-key
```

Vite bakes these in at build time — set them in the host before building.

### Step F — Verify frontend

Follow [`docs/frontend-deploy-verification.md`](frontend-deploy-verification.md).

If the browser reports CORS errors:

1. Fix API `WEB_ORIGIN` to match the frontend origin exactly.
2. Redeploy the API.
3. Hard-refresh the frontend.

---

## Frontend (Vercel) detail

1. Push the repo to GitHub and import it in Vercel.
2. Framework preset: Vite.
3. Root directory: `apps/web`.
4. Build command: `npm run build` → output: `dist`.
5. For **frontend-only**: omit `VITE_API_*` env vars.
6. For **full-stack**: set `VITE_API_BASE_URL` and `VITE_DEMO_API_KEY` as above.

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
