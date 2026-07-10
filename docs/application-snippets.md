# Application Snippets

## Short Project Description

SiteLens is a React + TypeScript geospatial planning intelligence demo. It uses MapLibre GL, GeoJSON, Turf.js, Material UI, Recharts, and Zustand to let users inspect planning layers, search spatial features, draw an area of interest, run spatial analysis, and generate a deterministic AI-assisted planning summary.

## Why I Built It

I built SiteLens as a public portfolio project because my production map-based and spatial-interface work was done inside private company products. It recreates the same engineering patterns in a shareable form: map layer management, feature selection, viewport state, spatial calculations, dashboard UX, and AI-assisted analysis with visible source metrics.

## Technical Ownership

I designed and implemented the full stack: the frontend workflow (dashboard layout, MapLibre integration, GeoJSON layers, layer visibility controls, search, feature inspection, custom AOI drawing, Recharts analytics, deterministic AI summary) and the backend (a Fastify + TypeScript API over PostgreSQL/PostGIS with SQL migrations, GeoJSON ingestion, spatial indexes, and a real AOI spatial-analysis endpoint). The frontend runs analysis through the PostGIS API when configured and falls back to local Turf.js otherwise.

## Full-Stack Spatial Engineering

SiteLens demonstrates an end-to-end spatial pipeline: a drawn area-of-interest polygon is sent to a Fastify endpoint, looked up in a Redis cache, analyzed in PostGIS on a miss with `ST_Intersects`/`ST_DWithin`/`ST_Area(::geography)` against parcels, zoning, constraints, transit, and development activity, cached with a TTL, and returned as a typed result (with cache metadata) that the frontend renders as analytics and a planning summary — with a client-side Turf.js fallback for robustness. It reflects real performance/scalability thinking for geospatial products: expensive spatial queries are cached, cache status is surfaced to the UI, and the system degrades gracefully when the cache or backend is unavailable.

## Relevant To Geospatial Roles

SiteLens demonstrates the kind of frontend engineering needed for urban analytics, planning, property intelligence, logistics, and spatial decision-support tools. It focuses on turning complex spatial data into an intuitive map-based product that non-technical users can understand quickly.
