# Deployment

## Frontend (Vercel)

The web app (`apps/web`) is a static Vite build and can be deployed to Vercel.

1. Push the repo to GitHub.
2. Import the repo in Vercel.
3. Framework preset: Vite.
4. Root directory: `apps/web` (or build from the monorepo root with
   `npm run build:web`).
5. Build command: `npm run build` (in `apps/web`) → output directory: `dist`.
6. No environment variables are required for the current demo.

Notes:

- The web app uses static GeoJSON files from `apps/web/public/data`.
- It does not call the API yet, so no backend is required to deploy the frontend.
- No paid map token is required (public MapLibre demo style).
- The AI summary is deterministic and local (no LLM).

## Backend database + cache (local, Docker)

The API (`apps/api`) is backed by PostgreSQL + PostGIS and an optional Redis
cache, both via Docker Compose. `npm run db:up` starts both services
(PostGIS on `54329`, Redis on `6389`).

```bash
npm install
npm run db:up          # start PostgreSQL + PostGIS (54329) and Redis (6389)
npm run db:migrate     # apply SQL migrations
npm run ingest:geojson # load apps/api/data/*.geojson into PostGIS (clears cache)
npm run dev:api        # start the API on :4000
```

Smoke tests:

```bash
curl http://localhost:4000/api/health
curl http://localhost:4000/api/layers
curl http://localhost:4000/api/parcels
curl "http://localhost:4000/api/search?q=central"
```

Reset / teardown:

```bash
npm run db:reset       # drop tables + re-run migrations (dev only), then re-ingest
npm run db:down        # stop and remove the container
```

Configuration is read from `apps/api/.env` (see `apps/api/.env.example`):
`DATABASE_URL`, `DB_SSL`, `PORT`, `WEB_ORIGIN`, `NODE_ENV`, `REDIS_URL`,
`CACHE_ENABLED`, `CACHE_DEFAULT_TTL_SECONDS`.

## Caching (Redis)

- Redis runs through Docker Compose on port `6389`.
- The API caches layers, parcels, search, and AOI analysis; responses include
  `meta.cache` (`hit` / `miss` / `disabled` / `error`).
- Caching is optional and degrades gracefully — the API returns DB results even
  if Redis is down. Ingestion clears the planning cache keys.
- The Azure equivalent is **Azure Cache for Redis**.

## Billing (Stripe-style, demo-safe)

- Plans (Free/Pro/Enterprise) + `subscriptions`/`usage_counters` live in Postgres
  (migration `004`; seed with `npm run db:seed:billing`).
- `POST /api/billing/webhook` verifies `STRIPE_WEBHOOK_SECRET` when set; the demo
  runs without real Stripe secrets.
- Production: Stripe Checkout + Customer Portal, webhook verification via the
  Stripe SDK using the raw request body, and org/team billing.

## Planning summary (deterministic, backend-owned)

- `POST /api/planning-summary` generates a deterministic summary from analysis
  metrics — no external LLM. Gated by `summary:generate`, metered in
  `usage_counters`, and Redis-cached with a plan-scoped key.
- Production: swap the deterministic generator for an LLM call (keeping source
  metrics + caveats), add evals + prompt/version logging, and human review for
  high-risk outputs.

## Roadmap

- Done: PostGIS spatial storage + backend AOI analysis; Redis response caching;
  demo auth/RBAC; Stripe-style billing + entitlements; backend-owned
  deterministic planning summary.
- Real Stripe Checkout/Portal, OAuth/SSO, real LLM summary, and Azure deployment
  are future steps.
