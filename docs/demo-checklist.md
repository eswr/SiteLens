# SiteLens Demo Checklist

## 2-Minute Walkthrough

1. Open the dashboard and explain the product: geospatial planning intelligence demo.
2. Toggle zoning, constraints, transit, and development activity layers.
3. Search for a parcel or transit feature.
4. Select a feature and inspect metadata in the right panel.
5. Draw an Area of Interest.
6. Review spatial analysis metrics.
7. Open Analytics and show Recharts visualizations.
8. Generate the deterministic AI Summary.
9. Point out source metrics and demo-data caveats.

## Access / Entitlement Demo

Use the sidebar **Demo access** switcher (or `VITE_DEMO_API_KEY`) to show roles
and plans:

1. Switch to **Viewer · Free**: search is capped at 5 results; drawing an AOI
   falls back to local Turf with an entitlement warning (backend returns 403).
2. Switch to **Planner · Pro**: AOI analysis runs on the backend (PostGIS API),
   search returns up to 8 results.
3. Switch to **Admin · Enterprise**: same as planner, plus admin-only ingestion
   capability (`/api/me` shows `canIngestData`).
4. Point out the header chip (e.g. "Demo Planner · Pro") and that cache keys are
   scoped by entitlement so lower tiers can't receive higher-tier cached data.

## Talking Points

- React + TypeScript architecture
- MapLibre/Mapbox-style layer management
- GeoJSON rendering
- Turf.js spatial analysis
- Recharts analytics
- AI-assisted UX with visible source metrics
- Built as a public recreation of private geospatial/spatial-interface experience
