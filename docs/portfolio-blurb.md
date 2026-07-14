# SiteLens — Portfolio Blurb

A short, paste-ready description of SiteLens for portfolios, résumés, and job
applications.

## Short description

SiteLens is a full-stack geospatial planning intelligence platform. It combines
a React + MapLibre frontend with a Fastify API, PostgreSQL/PostGIS spatial
analysis, Redis caching, async Overpass-backed planning-context build jobs,
demo auth/billing gates, and backend-owned deterministic planning summaries.
SiteLens ships with a bundled Sydney Demo context and can build external
open-map-derived planning contexts for selected worldwide places through an
async backend Overpass job pipeline — without pretending that data is official
zoning or cadastre.

## Tech stack

- React + TypeScript + Vite
- MapLibre GL JS (interactive map)
- Fastify + TypeScript API
- PostgreSQL + PostGIS (spatial storage + AOI analysis)
- Redis (response caching)
- Async planning-context build jobs (in-process worker + PostGIS job table)
- Overpass / OSM external context pipeline (backend-proxied)
- GeoJSON (demo layers + API payloads)
- Turf.js (local spatial analysis fallback)
- Material UI (dashboard UX)
- Recharts (analytics charts)
- Zustand (state management)

## What it demonstrates

- Map layer management and viewport/state handling
- Feature selection and inspection
- Search across spatial features
- Custom area-of-interest drawing
- Spatial calculations (area, intersections, distances) in PostGIS and Turf
- Worldwide place search via a Nominatim proxy (local autocomplete; live search only on explicit submit)
- Explicit async external planning-context builds with job polling and Health UI
- Frontend polling of `queued` / `running` / `succeeded` jobs without blocking the API
- Analytics dashboard UX
- Demo auth, roles, plans, and billing gates
- AI-assisted analysis with visible source metrics (trustworthy AI UX)

## Suggested application answer

> SiteLens is a full-stack geospatial planning intelligence platform. It combines
> a React + MapLibre frontend with a Fastify API, PostgreSQL/PostGIS spatial
> analysis, Redis caching, async Overpass-backed planning-context build jobs,
> demo auth/billing gates, and backend-owned deterministic planning summaries.
>
> I built it as a public portfolio project because my production mapping/spatial
> work was done inside private company products. It demonstrates the same
> engineering patterns: map layer management, feature selection, viewport state,
> spatial calculations, dashboard UX, and AI-assisted analysis with visible
> source metrics — plus a real backend data pipeline for on-demand urban context.
