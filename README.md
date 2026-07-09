# SiteLens

**Geospatial Planning Intelligence Demo**

SiteLens is a demo dashboard for exploring geospatial planning data. It pairs
an interactive map with a professional analysis layout to showcase how planners
can inspect parcels, planning layers, and spatial insights in one place.

## What this demonstrates

- A full-viewport, professional dashboard shell (header, tools sidebar, map,
  and details panel).
- An interactive [MapLibre GL JS](https://maplibre.org/) map centered on
  Sydney, Australia.
- Lightweight, typed map/UI state management.

> This is an incremental build. GeoJSON layers, drawing tools, charts, an AI
> summary, and a backend are **not** part of this step — see the roadmap below.

## Tech stack

- [React](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- [Vite](https://vite.dev/) (dev server & build)
- [Material UI](https://mui.com/) (layout, theming, icons)
- [MapLibre GL JS](https://maplibre.org/) (interactive map)
- [Zustand](https://zustand.docs.pmnd.rs/) (map/UI state)
- [Turf.js](https://turfjs.org/) (feature bbox/centroid + spatial analysis)
- [Recharts](https://recharts.org/) (analytics charts)
- Deployable to [Vercel](https://vercel.com/) (later)

## Project status

**Step 1 — App shell & interactive map — ✅ complete.**

- React + TypeScript + Vite foundation.
- Polished, full-height dashboard layout using Material UI.
- MapLibre map with navigation controls, rendering the demo basemap.
- Zustand store tracking `center`, `zoom`, and the selected feature.
- Base TypeScript types (`LngLat`, `MapViewport`, `SelectedFeature`).

**Step 2 — GeoJSON planning layers & layer toggles — ✅ complete.**

- Mock planning GeoJSON datasets served from `public/data` (parcels, zoning,
  constraints, transit, development activity).
- Multiple MapLibre layers (polygon fill/outline + point circles) added once
  the map style loads, with no duplicate registration.
- Sidebar **Planning Layers** toggles that show/hide layers instantly, plus a
  compact legend. Default visible: parcels, zoning, transit. Default hidden:
  constraints, development activity.
- Feature selection: clicking a visible feature (priority parcels →
  development activity → transit → constraints → zoning) highlights it and
  shows its metadata in the details panel.
- Pointer cursor on hover over clickable features.

**Step 3 — Search, fly-to & polished inspection — ✅ complete.**

- Searchable feature index built from the mock GeoJSON (`src/utils/featureIndex.ts`),
  using Turf.js for each feature's bbox and centroid.
- Sidebar **Search** across parcels, zoning, constraints, transit, and
  development activity (site name, parcel ID, zone code/name, project name,
  transit name, constraint type, status) — case-insensitive, debounced, top 8
  results, with loading and error states.
- Selecting a search result selects the feature, makes its layer visible if
  hidden, and flies/fits the map to it (`fitBounds` for polygons, `flyTo` for
  points), padded so the details panel doesn't cover it.
- Details panel now shows prioritized "Key facts" per layer plus remaining
  metadata, with **Zoom to feature** and **Clear selection** actions.
- Stronger, professional selected-feature highlight for both polygons and
  points, plus a `Selected: <name>` chip in the header.

**Step 4 — Area of Interest & spatial analysis — ✅ complete.**

- Simple click-to-add-points draw workflow (custom MapLibre draw mode, no heavy
  drawing library) with draft points, a draft line, and a completed AOI polygon
  rendered above the planning layers.
- Turf.js spatial analysis (`src/utils/spatialAnalysis.ts`) against all mock
  layers: parcel count + average development score, zoning breakdown,
  intersecting constraints, transit within 1.5 km of the AOI centroid, and
  development-activity counts by status.
- Analysis store (`src/store/analysisStore.ts`) for drawing state, the AOI, and
  results; feature selection is disabled while drawing and restored afterward.
- Analysis summary UI (`src/components/analysis/AnalysisSummary.tsx`) shown in
  the sidebar and, when nothing is selected, in the details panel.

**Step 5 — Analytics dashboard & polish — ✅ complete.**

- [Recharts](https://recharts.org/) visualizations in `src/components/charts/`:
  zoning breakdown, development-activity by status, constraints by risk, and a
  development-score card — each with empty states.
- `AnalyticsDashboard` (`src/components/analysis/`) with headline metrics and
  the four charts in a responsive layout.
- Details panel now uses **Summary** / **Analytics** tabs for the AOI; a compact
  sidebar summary links through to the detailed analytics.
- Feature selection still takes priority; a `Back to AOI analysis` action clears
  only the selected feature. A non-blocking map status badge shows the current
  workflow state (Drawing area / Feature selected / Area analyzed / No selection).
- Visual polish and responsive widths for desktop and tablet.

> **Mock data note:** the datasets under `public/data` are small, hand-authored
> mock planning layers around the Sydney CBD, provided for portfolio/demo
> purposes only — they are not real cadastral or planning data. Spatial analysis
> and charts are likewise based on this mock data, not official planning records.

Planned for later steps: an AI-generated summary, and a backend.

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

## Project structure

```txt
public/
  data/                # mock planning GeoJSON (parcels, zoning, etc.)
src/
  app/
    App.tsx            # root: theme provider + shell
  components/
    layout/
      AppShell.tsx     # full-height dashboard layout
      HeaderBar.tsx    # top brand/title bar + selected-feature chip
      Sidebar.tsx      # search, analysis controls, layer toggles, legend
      DetailsPanel.tsx # right inspector (feature details or AOI analysis)
    map/
      SiteMap.tsx      # MapLibre GL map, planning layers + AOI draw mode
      MapStatusBadge.tsx # non-blocking workflow status overlay
    analysis/
      AnalysisSummary.tsx    # spatial-analysis result cards
      AnalyticsDashboard.tsx # Recharts analytics dashboard
    charts/            # Recharts chart components
  data/
    layers.ts          # typed planning-layer configuration
    featureDisplay.ts  # title / subtitle / priority-key helpers
  store/
    mapStore.ts        # Zustand map camera, selection + fly-to requests
    layerStore.ts      # Zustand layer visibility
    searchStore.ts     # Zustand search index + results
    analysisStore.ts   # Zustand AOI drawing + analysis results
    uiStore.ts         # Zustand UI state (details-panel tab)
  utils/
    featureIndex.ts    # builds the searchable feature index (Turf)
    spatialAnalysis.ts # Turf.js AOI spatial analysis
  types/
    map.ts             # shared geospatial types
    planning.ts        # planning feature property types
    analysis.ts        # AOI + spatial-analysis types
  theme/
    theme.ts           # Material UI theme
  main.tsx             # entry point
```
