# SiteLens — Geospatial Planning Intelligence Platform

## Overview

SiteLens is a React + TypeScript geospatial planning app for exploring planning
data on an interactive map: toggle planning layers, search spatial features,
inspect a feature's metadata, draw an area of interest, run Turf.js spatial
analysis, view Recharts analytics, and generate a deterministic AI-assisted
planning summary.

It is organized as an **npm-workspaces monorepo** with a React/Vite web app, a
Fastify + TypeScript API, and a shared types package. The API is backed by
**PostgreSQL + PostGIS** (layers, parcels, and search come from spatial tables).
In the current step the **frontend still runs entirely on static mock GeoJSON**;
connecting it to the backend arrives in the next step.

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

- **App:** https://sitelens-demo.vercel.app _(placeholder — update after deploying; see [`docs/deployment.md`](docs/deployment.md))_
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

### Current boundaries

- The **frontend still uses static mock GeoJSON** in this step — it does not yet
  call the API. Step 10 will connect the AOI analysis to backend PostGIS.
- The **API reads layers/parcels/search from PostGIS**; `analyze-area` and
  `planning-summary` remain typed/validated `501` placeholders.
- If the database is unavailable, DB-backed routes return `503` (no silent
  fallback).
- **Redis** caching, auth, Stripe, and Azure deployment are future steps.
- No real LLM API and no paid map token are used anywhere.

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
  deployment.md          # Vercel deployment notes
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

The "AI Summary" is a **deterministic, on-device** generator — there is **no LLM
and no network call**. `generateMockPlanningSummary` maps the spatial-analysis
metrics (average development score, constraint count/risk, nearby transit,
development activity, zoning mix) to professional, cautious planning-style text
with severity-tagged sections and recommended next checks. The panel always
shows the **exact source metrics** used, so the output is transparent and
reproducible rather than a black box. A short delay is simulated purely for UX.

## Limitations

- Mock GeoJSON only; not connected to authoritative planning/cadastral sources.
- Spatial analysis uses simple intersection and centroid-distance heuristics.
- The AI summary is deterministic template logic, not a real language model.
- No persistence, backend, authentication, or multi-user support.
- Basemap is the public MapLibre demo style (no paid token).

## Future Improvements

- Real basemap/tiles and richer cartography.
- Backend + database (e.g. PostGIS) for live planning datasets.
- Persisted areas of interest and shareable analysis links.
- Optional real LLM integration behind the same source-metric transparency UX.
- Deployment automation and CI.
