# SiteLens — Geospatial Planning Intelligence Demo

## Overview

SiteLens is a React + TypeScript single-page app for exploring planning data on
an interactive map. Users can toggle planning layers, search spatial features,
inspect a feature's metadata, draw an area of interest, run Turf.js spatial
analysis, view Recharts analytics, and generate a deterministic AI-assisted
planning summary — all in the browser against mock GeoJSON, with no backend.

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

Requires Node.js 20+.

```bash
npm install       # install dependencies
npm run dev       # start the dev server (http://localhost:5173)
npm run typecheck # TypeScript type checking (tsc -b)
npm run lint      # lint with oxlint
npm run build     # production build
npm run preview   # preview the production build
```

## Project Structure

```txt
public/
  data/                  # mock planning GeoJSON (parcels, zoning, etc.)
  favicon.svg
docs/
  demo-checklist.md      # recording walkthrough + talking points
  application-snippets.md# paste-ready job-application text
  deployment.md          # Vercel deployment notes
  portfolio-blurb.md     # short portfolio description
  screenshots/           # README screenshot assets
src/
  app/                   # App root (theme + shell)
  components/
    layout/              # AppShell, HeaderBar, Sidebar, DetailsPanel
    map/                 # SiteMap, MapStatusBadge
    analysis/            # AnalysisSummary, AnalyticsDashboard, PlanningSummaryPanel
    charts/              # Recharts chart components
  data/                  # layer config + display helpers
  store/                 # Zustand stores (map, layer, search, analysis, aiSummary, ui)
  utils/                 # featureIndex, spatialAnalysis, mockPlanningSummary
  types/                 # shared TypeScript types
  theme/                 # Material UI theme
  main.tsx               # entry point
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
