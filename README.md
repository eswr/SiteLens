# SiteLens — Geospatial Planning Intelligence Platform

## Reviewer Quickstart

Frontend-only demo (no backend needed):

```bash
npm install
npm run dev:web
```

Full-stack demo (PostGIS + Redis via Docker):

```bash
npm install
npm run db:up
npm run db:migrate
npm run db:seed:billing
npm run ingest:geojson
npm run dev:api
npm run dev:web
```

Quality checks:

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

Full-stack smoke test (while the API is running):

```bash
npm run smoke:fullstack
# Optional geocoding check (Nominatim or static-demo fallback):
SMOKE_GEOCODING=true SMOKE_GEOCODING_EXPECT_FALLBACK=true npm run smoke:fullstack
```

Deployed API verification:

```bash
API_BASE=https://<api-host> npm run verify:deployed:api
```

See [`docs/environment.md`](docs/environment.md) for env vars,
[`docs/deployment.md`](docs/deployment.md) for frontend-only vs full-stack deploy,
[`docs/deploy-env-checklist.md`](docs/deploy-env-checklist.md) for production/demo
env, [`docs/api-reference.md`](docs/api-reference.md) for endpoints, and
[`docs/case-study.md`](docs/case-study.md) for the employer-facing overview.

## What This Proves

- React + TypeScript geospatial frontend engineering
- MapLibre/Mapbox-style map layer UX
- AOI drawing and spatial analysis workflows
- Fastify backend API design
- PostgreSQL/PostGIS spatial queries and indexes
- GeoJSON ingestion pipeline
- Redis caching and cache-safe entitlement scopes
- Demo auth, roles, plans, and billing gates
- Backend-owned deterministic AI summary service
- Worldwide place search via a cached, rate-limited Nominatim/OSM backend proxy (with labeled static-demo fallback when public Nominatim is unavailable; Places autocomplete is local-only — live geocoding only on explicit Search)
- CI/CD and deployment-readiness

## Overview

SiteLens is a React + TypeScript geospatial planning app for exploring planning
data on an interactive map: toggle planning layers, search spatial features,
inspect a feature's metadata, draw an area of interest, run Turf.js spatial
analysis, view Recharts analytics, and generate a deterministic AI-assisted
planning summary.

It is organized as an **npm-workspaces monorepo** with a React/Vite web app, a
Fastify + TypeScript API, and a shared types package. The API is backed by
**PostgreSQL + PostGIS** — layers, parcels, and search come from spatial tables,
and AOI spatial analysis runs in PostGIS. When `VITE_API_BASE_URL` is set the
web app runs analysis through the API (with a local Turf.js fallback); otherwise
it runs fully client-side.

## Monorepo Structure

```txt
sitelens/
  apps/
    web/        # React + Vite frontend (the dashboard)
    api/        # Fastify + TypeScript API (mock-data endpoints + placeholders)
  packages/
    shared/     # @sitelens/shared — shared API/domain types
  docs/         # portfolio + backend docs
  package.json  # npm workspaces root
```

- **`apps/web`** (`@sitelens/web`) — the existing dashboard; unchanged behavior,
  still loads static GeoJSON from `apps/web/public/data`.
- **`apps/api`** (`@sitelens/api`) — Fastify API on port `4000`, backed by
  PostgreSQL + PostGIS, with health, layers, parcels, and search routes plus
  typed/validated placeholder analysis endpoints. See
  [`apps/api/README.md`](apps/api/README.md).
- **`packages/shared`** (`@sitelens/shared`) — shared TypeScript types (API
  envelopes, planning layer types, analysis request/response contracts).

## Live Demo

- **App:** https://sitelens-demo.vercel.app
- **API:** https://sitelens-api.fly.dev
- **Loom walkthrough:** _(placeholder — add your recording link; see [`docs/demo-checklist.md`](docs/demo-checklist.md))_

## Screenshots

> Placeholders — add real captures under `docs/screenshots/` (see [`docs/demo-checklist.md`](docs/demo-checklist.md)).

![Dashboard with planning layers](docs/screenshots/dashboard.png)
![Feature selection and details](docs/screenshots/feature-selection.png)
![Area of interest analysis](docs/screenshots/aoi-analysis.png)
![AI-assisted planning summary](docs/screenshots/ai-summary.png)

## Why I Built This

My production geospatial and spatial-interface work was done inside private
company products. SiteLens recreates the same engineering patterns in a public,
shareable portfolio project so the approach and code quality can be reviewed
without exposing proprietary work.

## What It Demonstrates

- React + TypeScript frontend architecture
- MapLibre/Mapbox-style map interactions and layer management
- GeoJSON layer rendering
- Search across spatial features
- Feature inspection
- Custom area-of-interest drawing
- Turf.js spatial analysis
- Recharts analytics
- Deterministic AI-assisted planning summary with visible source metrics
- Material UI dashboard UX and clean Zustand state management

## Features

- **Interactive map** — MapLibre GL JS centered on Sydney, navigation controls,
  resize-aware, non-blocking workflow status badge.
- **Planning layers** — parcels, zoning, constraints, transit, development
  activity; each toggleable, with a legend.
- **Search** — case-insensitive, debounced search across feature attributes;
  selecting a result reveals hidden layers and flies/fits the map to it.
- **Feature inspection** — prioritized "key facts" + metadata, with zoom/clear
  actions and a selected-feature highlight.
- **Area of Interest** — custom click-to-add-points draw mode (no heavy drawing
  library) with draft/complete rendering.
- **Spatial analysis** — Turf.js: area, intersecting parcels + average
  development score, zoning breakdown, constraints, nearby transit, and
  development activity by status.
- **Analytics** — Recharts dashboard (zoning, development activity, constraint
  risk, development-score card).
- **AI-assisted summary** — deterministic, on-device planning narrative
  generated from the analysis metrics, with the exact source metrics shown.

## Tech Stack

- [React](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- [Vite](https://vite.dev/) (dev server & build)
- [Material UI](https://mui.com/) (layout, theming, icons)
- [MapLibre GL JS](https://maplibre.org/) (interactive map)
- [Zustand](https://zustand.docs.pmnd.rs/) (state management)
- [Turf.js](https://turfjs.org/) (spatial analysis)
- [Recharts](https://recharts.org/) (analytics charts)
- [PostgreSQL + PostGIS](https://postgis.net/) (spatial database) and
  [Redis](https://redis.io/) (response cache), via Docker Compose

## Architecture

- **View layer:** React function components + Material UI. A three-column
  `AppShell` (sidebar / map / details panel) fills the viewport.
- **Map:** a single MapLibre instance (`SiteMap`) created once; planning sources
  and layers are added after style load, and camera / AOI / highlight are driven
  by store state via effects (UI requests actions such as fly-to; the map reacts).
- **State:** small, focused Zustand stores — `mapStore` (camera, selection,
  fly-to), `layerStore` (visibility), `searchStore` (index + results),
  `analysisStore` (drawing + analysis), `aiSummaryStore` (summary), and `uiStore`
  (active details tab).
- **Domain logic:** pure utilities — `featureIndex` (search index),
  `spatialAnalysis` (Turf calculations), and `mockPlanningSummary` (deterministic
  summary). All are frontend-only and read `/data/*.geojson`.

## Demo Walkthrough

1. Toggle planning layers.
2. Search for a parcel or transit feature.
3. Select a feature and inspect metadata.
4. Draw an area of interest.
5. Review spatial analysis.
6. Open analytics charts.
7. Generate an AI-assisted planning summary.

A recording checklist and talking points live in [`docs/demo-checklist.md`](docs/demo-checklist.md).

## Local Development

Requires Node.js 20+. Install once at the repo root (npm workspaces):

```bash
npm install        # install all workspaces
npm run dev:web    # web app  → http://localhost:5173
npm run dev:api    # API      → http://localhost:4000
npm run typecheck  # typecheck all workspaces
npm run lint       # lint all workspaces (oxlint)
npm run test       # run workspace tests (Vitest — API)
npm run build      # build all workspaces
```

`npm run dev` is a shortcut for `dev:web`. Web and API run independently.

### Backend database (PostgreSQL + PostGIS)

The API is backed by PostGIS via Docker Compose. Full backend setup:

```bash
npm install
npm run db:up          # start PostgreSQL + PostGIS (host port 54329)
npm run db:migrate     # apply SQL migrations
npm run ingest:geojson # load apps/api/data/*.geojson into PostGIS
npm run dev:api        # start the API on :4000
```

Smoke tests:

```bash
curl http://localhost:4000/api/health
curl http://localhost:4000/api/layers
curl http://localhost:4000/api/parcels
curl "http://localhost:4000/api/search?q=central"
```

See [`docs/architecture.md`](docs/architecture.md) and
[`apps/api/README.md`](apps/api/README.md) for schema and details.

### Full-stack analysis mode

`POST /api/analyze-area` runs the AOI spatial analysis in **PostGIS**. The
frontend uses it when `VITE_API_BASE_URL` is set, and falls back to local
Turf.js if the API is unreachable — the UI shows which engine was used
(`PostGIS API` / `Local Turf` / `Turf fallback`).

### Frontend-only vs full-stack

| Mode | Needs | Web env |
|------|--------|---------|
| **Frontend-only** | `npm run dev:web` (or static host) | omit `VITE_*` |
| **Full-stack** | API + PostGIS + Redis + seed/ingest | `VITE_API_BASE_URL` + optional `VITE_DEMO_API_KEY` |

Enable full-stack mode for the web app (required for PostGIS analysis, Places
search, Redis cache chips, and demo entitlements against a real API):

```bash
# apps/web/.env.local  (or Vercel project env for a deployed full-stack demo)
VITE_API_BASE_URL=http://localhost:4000
VITE_DEMO_API_KEY=demo-planner-key
```

A deployed frontend **without** `VITE_API_BASE_URL` stays frontend-only even if
an API exists. See [`docs/deployment.md`](docs/deployment.md).

Run everything, then draw an area of interest in the browser:

```bash
npm run db:up && npm run db:migrate && npm run ingest:geojson && npm run db:seed:billing
npm run dev:api
npm run dev:web
```

Analyze-area smoke test (run twice — first `cache: "miss"`, second `cache: "hit"`):

```bash
curl -X POST http://localhost:4000/api/analyze-area \
  -H "content-type: application/json" \
  -d '{"geometry":{"type":"Polygon","coordinates":[[[151.205,-33.87],[151.215,-33.87],[151.215,-33.86],[151.205,-33.86],[151.205,-33.87]]]}}'
```

### Caching (Redis)

`npm run db:up` also starts Redis (port `6389`). The API caches layers, parcels,
search, and AOI analysis, and reports the outcome in `meta.cache`
(`hit` / `miss` / `disabled` / `error`); the frontend shows it subtly
(e.g. `PostGIS API · cache hit`). Caching is optional and degrades gracefully —
if Redis is down the API still returns DB results (`cache: "error"`) and the app
keeps working. Ingestion clears the planning cache; `npm run cache:clear` clears
all keys.

### Demo auth & entitlements

The API supports **API-key demo auth** with roles (`viewer`, `planner`, `admin`)
and plans (`free`, `pro`, `enterprise`). Capabilities are derived from role/plan
and gate the API:

- Public: `GET /api/health`, `GET /api/layers`.
- Entitlement-limited: `GET /api/search` (5 results for free/anonymous, 8 for
  pro/enterprise) and `GET /api/parcels` (first 5 for free, full for pro+).
- Gated (`403` otherwise): `POST /api/analyze-area` and `POST /api/planning-summary`
  require a `planner`/`enterprise` account. Ingestion is `admin`-only.

`GET /api/me` returns the current user + capabilities. Cached responses are
scoped by entitlement (`…:free:` vs `…:pro:`) so lower tiers never receive
higher-tier data.

Run the web app in different demo roles (or use the **Demo access** switcher in
the sidebar footer at runtime):

```bash
VITE_DEMO_API_KEY=demo-planner-key npm run dev:web   # Planner · Pro
VITE_DEMO_API_KEY=demo-viewer-key  npm run dev:web   # Viewer · Free
VITE_DEMO_API_KEY=demo-admin-key   npm run dev:web   # Admin · Enterprise
```

If a viewer/free user runs analysis, the backend returns `403` and the frontend
falls back to local Turf.js with a clear entitlement warning.

> **Not production auth.** This is a portfolio demo. Production would use
> OAuth/SSO, JWT/session cookies, Passport-style strategies, and org/team
> membership.

### Stripe-style billing & plans

Capabilities are driven by a **billing plan catalog** — **Free** (limited
search/parcels), **Pro** (PostGIS analysis + AI summaries), **Enterprise**
(ingestion/admin) — persisted in DB (`demo_accounts`, `subscriptions`,
`usage_counters`). `GET /api/billing/plans` and `GET /api/billing/current`
expose it; `POST /api/billing/demo-plan` switches the demo plan; and a
Stripe-compatible `POST /api/billing/webhook` maps subscription events (safe
without real Stripe secrets). Successful backend analyses are metered.

The sidebar footer has a **Demo access** control to switch identity (role) and
plan at runtime; downgrading a planner to Free blocks backend analysis (`403`)
and the app falls back to local Turf with a plan-gated warning. Seed billing
with `npm run db:seed:billing`.

> Demo billing only — no live checkout. Production path: Stripe Checkout +
> Customer Portal, webhook signature verification via the Stripe SDK, and
> org/team billing.

### Current boundaries

- **Map layer rendering** still reads static GeoJSON from `public/data`. With
  `VITE_API_BASE_URL` set, analysis, planning search, Places geocode, billing,
  and planning summary call the API.
- `planning-summary` is a **backend-owned deterministic** summary (no LLM).
- Places search proxies Nominatim and may return labeled **static-demo**
  fallback when the public provider blocks the host — never a browser-side
  Nominatim call. Places autocomplete is local (demo places, recent
  selections, and this session’s explicit search results); live geocoding runs
  only on Search / “Search live geocoder,” not on every keystroke.
- If the database is unavailable, DB-backed routes return `503`; AOI analysis
  falls back to Turf with a warning. Redis degrades gracefully when down.
- Demo auth/billing keys are portfolio-only. Real Stripe Checkout/Portal and
  production auth remain future work.
- No paid map token is required (public MapLibre demotiles style).

## Project Structure

```txt
apps/
  web/                   # @sitelens/web — React + Vite dashboard
    public/data/         # mock planning GeoJSON (parcels, zoning, etc.)
    public/favicon.svg
    src/
      app/               # App root (theme + shell)
      components/        # layout, map, analysis, charts
      data/              # layer config + display helpers
      store/             # Zustand stores (map, layer, search, analysis, aiSummary, ui)
      utils/             # featureIndex, spatialAnalysis, mockPlanningSummary
      types/             # frontend TypeScript types
      theme/             # Material UI theme
  api/                   # @sitelens/api — Fastify + TypeScript API (PostGIS)
    data/                # source GeoJSON ingested into PostGIS
    db/
      migrations/        # 001 enable postgis, 002 tables, 003 indexes
      seeds/             # seed docs
    src/
      app.ts             # Fastify app factory (testable)
      server.ts          # startup (port 4000)
      config.ts          # env config (DATABASE_URL, DB_SSL) + API version
      plugins/           # requestLogger, errorHandler
      routes/            # health, layers, parcels, search, analysis, planningSummary
      lib/               # layerConfig, featureText, httpErrors
      db/                # pool, sql, migrate, reset, ingestGeojson, seed, spatialRepository
      test/              # Vitest API tests
packages/
  shared/                # @sitelens/shared — shared types (api, planning, analysis)
docs/
  demo-checklist.md      # recording walkthrough + talking points
  application-snippets.md# paste-ready job-application text
  deployment.md          # frontend-only vs full-stack deploy order
  deploy-env-checklist.md # production/demo API + web env vars
  frontend-deploy-verification.md # post-deploy UI checklist
  portfolio-blurb.md     # short portfolio description
  screenshots/           # README screenshot assets
```

## Data Model / Mock Data

All data is small, hand-authored **mock** GeoJSON under `public/data`, clustered
around the Sydney CBD — **not** real cadastral or planning data:

- `parcels.geojson` — polygons with `parcelId`, `zoning`, `currentUse`,
  `developmentScore`, `areaSqm`, `status`.
- `zoning.geojson` — polygons with `zoneCode`, `zoneName`, `description`.
- `constraints.geojson` — polygons with `constraintType`, `riskLevel`,
  `description`.
- `transit.geojson` — points with `name`, `mode`, `distanceCategory`.
- `development-activity.geojson` — points with `projectName`, `status`,
  `applicationType`, `lodgedMonth`.

Spatial analysis and charts are derived from this mock data, not official records.

## AI Summary Design

The planning summary is a **deterministic** generator with **no LLM**. It is now
**backend-owned**: the frontend POSTs the spatial-analysis metrics to
`/api/planning-summary`, which enforces the `summary:generate` entitlement,
meters usage, caches in Redis (plan-scoped), and returns source-transparent
planning text with severity-tagged sections and recommended next checks. The
frontend keeps an identical **local fallback** (`generateMockPlanningSummary`)
for `403` / API failure / no-API, and the panel shows the summary engine, cache
status, and the **exact source metrics** used. **Production path:** swap the
deterministic generator for an LLM call while keeping source metrics + caveats,
add evals + prompt/version logging, and human review for high-risk outputs.

## Limitations

- Mock GeoJSON only; not connected to authoritative planning/cadastral sources.
- Spatial analysis uses simple intersection and centroid-distance heuristics.
- The planning summary is deterministic template logic (backend-owned with a
  local fallback), not a real language model.
- No persistence, backend, authentication, or multi-user support.
- Basemap is the public MapLibre demo style (no paid token).

## Future Improvements

- Real basemap/tiles and richer cartography.
- Backend + database (e.g. PostGIS) for live planning datasets.
- Persisted areas of interest and shareable analysis links.
- Optional real LLM integration behind the same source-metric transparency UX.
- Deployment automation and CI.
