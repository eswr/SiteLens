# SiteLens

**Geospatial Planning Intelligence Demo** — a React + TypeScript single-page app
for exploring planning data on an interactive map: inspect planning layers,
search spatial features, draw an area of interest, run spatial analysis, view
analytics charts, and generate a deterministic AI-assisted planning summary.

Everything runs in the browser against mock GeoJSON — no backend required.

## Why I Built This

My production geospatial and spatial-interface work was done inside private
company products. SiteLens recreates the same engineering patterns in a public,
shareable portfolio project so the approach and code quality can be reviewed
without exposing proprietary work.

## What It Demonstrates

- React + TypeScript frontend architecture
- MapLibre/Mapbox-style map interactions
- GeoJSON layer rendering
- Search across spatial features
- Feature inspection
- Custom area drawing
- Turf.js spatial analysis
- Recharts analytics
- Deterministic AI-assisted planning summary (with visible source metrics)
- Material UI dashboard UX
- Clean state management (Zustand)

## Demo Walkthrough

1. Toggle planning layers.
2. Search for a parcel or transit feature.
3. Select a feature and inspect metadata.
4. Draw an area of interest.
5. Review spatial analysis.
6. Open analytics charts.
7. Generate an AI-assisted planning summary.

## Screenshots

> Suggested captures for a portfolio README (save under `docs/screenshots/`):
>
> - `dashboard.png` — full dashboard with planning layers visible.
> - `search.png` — sidebar search with results across layers.
> - `feature.png` — a selected parcel with its details panel.
> - `aoi-analysis.png` — a drawn AOI with the spatial-analysis summary.
> - `analytics.png` — the Analytics tab with Recharts charts.
> - `ai-summary.png` — the AI Summary tab with the generated summary.

<!-- ![SiteLens dashboard](docs/screenshots/dashboard.png) -->

## Features

- **Interactive map** — MapLibre GL JS centered on Sydney, navigation controls,
  resize-aware.
- **Planning layers** — parcels, zoning, constraints, transit, development
  activity, each toggleable, with a legend.
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
  generated from the analysis metrics, with the exact source metrics shown for
  transparency.

## Architecture Summary

- **View layer:** React function components + Material UI. A three-column
  `AppShell` (sidebar / map / details panel) fills the viewport.
- **Map:** a single MapLibre instance (`SiteMap`) created once; planning sources
  and layers are added after style load, and camera/AOI/highlight are driven by
  store state via effects.
- **State:** small, focused Zustand stores — `mapStore` (camera, selection,
  fly-to), `layerStore` (visibility), `searchStore` (index + results),
  `analysisStore` (drawing + analysis), `aiSummaryStore` (summary), and a tiny
  `uiStore` (active details tab). Stores are decoupled from the map instance;
  UI requests actions (e.g. fly-to) and the map reacts.
- **Domain logic:** pure utilities — `featureIndex` (search index),
  `spatialAnalysis` (Turf calculations), and `mockPlanningSummary` (deterministic
  summary). All are frontend-only and read `/data/*.geojson`.

## Tech stack

- [React](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- [Vite](https://vite.dev/) (dev server & build)
- [Material UI](https://mui.com/) (layout, theming, icons)
- [MapLibre GL JS](https://maplibre.org/) (interactive map)
- [Zustand](https://zustand.docs.pmnd.rs/) (state management)
- [Turf.js](https://turfjs.org/) (feature bbox/centroid + spatial analysis)
- [Recharts](https://recharts.org/) (analytics charts)
- Deployable to [Vercel](https://vercel.com/) (later)

## Local setup

Requires Node.js 20+.

```bash
npm install     # install dependencies
npm run dev     # start the dev server (http://localhost:5173)
```

Other useful scripts:

```bash
npm run typecheck   # TypeScript type checking (tsc -b)
npm run lint        # lint with oxlint
npm run build       # production build
npm run preview     # preview the production build
```

## Build status

Built incrementally across six steps:

1. **App shell & interactive map** — Vite + React + TS, Material UI dashboard,
   MapLibre map.
2. **GeoJSON planning layers & toggles** — five mock layers, hover, click
   selection, details panel.
3. **Search, fly-to & inspection** — searchable index, fly-to, prioritized
   metadata, stronger highlighting.
4. **Area of Interest & spatial analysis** — custom draw mode + Turf.js
   analysis.
5. **Analytics dashboard & polish** — Recharts charts, Summary/Analytics tabs,
   status badge, responsive polish.
6. **AI-assisted planning summary & portfolio polish — ✅ current.** Deterministic
   on-device planning summary (`AI Summary` tab) generated from analysis
   metrics, with visible source metrics and caveats; favicon and README/demo
   polish.

> **Mock data note:** the datasets under `public/data` are small, hand-authored
> mock planning layers around the Sydney CBD, for portfolio/demo purposes only —
> not real cadastral or planning data. Spatial analysis, charts, and the AI
> summary are likewise based on this mock data, not official planning records.
> The "AI summary" is generated deterministically on-device; no external LLM is
> called.

Planned next: a backend and deployment automation.

## Project structure

```txt
public/
  data/                  # mock planning GeoJSON (parcels, zoning, etc.)
  favicon.svg
docs/
  portfolio-blurb.md     # paste-ready portfolio description
src/
  app/
    App.tsx              # root: theme provider + shell
  components/
    layout/
      AppShell.tsx       # full-height dashboard layout
      HeaderBar.tsx      # top brand/title bar + selected-feature chip
      Sidebar.tsx        # search, analysis controls, layer toggles, legend
      DetailsPanel.tsx   # right inspector (feature details or AOI tabs)
    map/
      SiteMap.tsx        # MapLibre GL map, planning layers + AOI draw mode
      MapStatusBadge.tsx # non-blocking workflow status overlay
    analysis/
      AnalysisSummary.tsx      # spatial-analysis result cards
      AnalyticsDashboard.tsx   # Recharts analytics dashboard
      PlanningSummaryPanel.tsx # AI-assisted summary panel
    charts/              # Recharts chart components
  data/
    layers.ts            # typed planning-layer configuration
    featureDisplay.ts    # title / subtitle / priority-key helpers
  store/
    mapStore.ts          # Zustand map camera, selection + fly-to requests
    layerStore.ts        # Zustand layer visibility
    searchStore.ts       # Zustand search index + results
    analysisStore.ts     # Zustand AOI drawing + analysis results
    aiSummaryStore.ts     # Zustand AI summary generation state
    uiStore.ts           # Zustand UI state (details-panel tab)
  utils/
    featureIndex.ts      # builds the searchable feature index (Turf)
    spatialAnalysis.ts   # Turf.js AOI spatial analysis
    mockPlanningSummary.ts # deterministic planning-summary generator
  types/
    map.ts               # shared geospatial types
    planning.ts          # planning feature property types
    analysis.ts          # AOI + spatial-analysis types
    aiSummary.ts         # AI summary types
  theme/
    theme.ts             # Material UI theme
  main.tsx               # entry point
```
