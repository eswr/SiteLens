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
- [Turf.js](https://turfjs.org/) (feature bbox/centroid for search & fly-to)
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

> **Mock data note:** the datasets under `public/data` are small, hand-authored
> mock planning layers around the Sydney CBD, provided for portfolio/demo
> purposes only — they are not real cadastral or planning data.

Planned for later steps: drawing tools, charts, an AI-generated summary, and a
backend.

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
      HeaderBar.tsx    # top brand/title bar
      Sidebar.tsx      # planning-layer toggles, legend, placeholder tools
      DetailsPanel.tsx # right inspector panel (selected feature details)
    map/
      SiteMap.tsx      # MapLibre GL map + planning layers
  data/
    layers.ts          # typed planning-layer configuration
    featureDisplay.ts  # title / subtitle / priority-key helpers
  store/
    mapStore.ts        # Zustand map camera, selection + fly-to requests
    layerStore.ts      # Zustand layer visibility
    searchStore.ts     # Zustand search index + results
  utils/
    featureIndex.ts    # builds the searchable feature index (Turf)
  types/
    map.ts             # shared geospatial types
    planning.ts        # planning feature property types
  theme/
    theme.ts           # Material UI theme
  main.tsx             # entry point
```
