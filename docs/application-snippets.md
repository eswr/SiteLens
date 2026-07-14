# Application Snippets

## Short Project Description

SiteLens is a React + TypeScript geospatial planning intelligence demo. It uses MapLibre GL, GeoJSON, Turf.js, Material UI, Recharts, and Zustand to let users inspect planning layers, search spatial features, draw an area of interest, run spatial analysis, and generate a deterministic AI-assisted planning summary.

## Why I Built It

I built SiteLens as a public portfolio project because my production map-based and spatial-interface work was done inside private company products. It recreates the same engineering patterns in a shareable form: map layer management, feature selection, viewport state, spatial calculations, dashboard UX, and AI-assisted analysis with visible source metrics.

## Technical Ownership

I designed and implemented the full stack: the frontend workflow (dashboard layout, MapLibre integration, GeoJSON layers, layer visibility controls, search, feature inspection, custom AOI drawing, Recharts analytics, deterministic AI summary) and the backend (a Fastify + TypeScript API over PostgreSQL/PostGIS with SQL migrations, GeoJSON ingestion, spatial indexes, and a real AOI spatial-analysis endpoint). The frontend runs analysis through the PostGIS API when configured and falls back to local Turf.js otherwise.

## Enterprise SaaS Design

SiteLens models enterprise access patterns for a geospatial product: role-based access control (viewer / planner / admin), subscription-tier entitlements (free / pro / enterprise), capability-gated endpoints (analysis and summary require a paid plan; ingestion is admin-only), entitlement-limited responses (free tiers get capped search/parcels), and entitlement-scoped caching so lower tiers can't receive higher-tier data from the cache. It's a demo API-key implementation with a clear production path to OAuth/SSO, JWT/session cookies, and org/team membership.

## Backend-Owned Planning Summary

SiteLens includes a backend-owned deterministic planning summary service. The frontend sends spatial analysis metrics to a Fastify API, the API enforces Pro/Enterprise entitlements, applies usage metering, caches summaries in Redis, and returns a source-transparent planning summary. The frontend preserves a local fallback so the demo remains usable without backend access.

## Stripe-Style Billing

SiteLens includes a Stripe-style entitlement layer with Free, Pro, and Enterprise plans. Backend routes enforce feature access for spatial analysis and summaries, search/parcel limits are plan-aware, cache keys are entitlement-scoped to avoid cross-plan data leakage, and the API includes a webhook-ready billing module that can be connected to Stripe Checkout/Portal in production.

## Full-Stack Spatial Engineering

SiteLens demonstrates an end-to-end spatial pipeline: a drawn area-of-interest polygon is sent to a Fastify endpoint, looked up in a Redis cache, analyzed in PostGIS on a miss with `ST_Intersects`/`ST_DWithin`/`ST_Area(::geography)` against parcels, zoning, constraints, transit, and development activity, cached with a TTL, and returned as a typed result (with cache metadata) that the frontend renders as analytics and a planning summary — with a client-side Turf.js fallback for robustness. It reflects real performance/scalability thinking for geospatial products: expensive spatial queries are cached, cache status is surfaced to the UI, and the system degrades gracefully when the cache or backend is unavailable.

## Relevant To Geospatial Roles

SiteLens demonstrates the kind of frontend engineering needed for urban analytics, planning, property intelligence, logistics, and spatial decision-support tools. It focuses on turning complex spatial data into an intuitive map-based product that non-technical users can understand quickly.

## Worldwide Place Search (Geocoding Proxy)

SiteLens adds worldwide place search using Nominatim/OpenStreetMap through a Fastify backend proxy — the browser never calls Nominatim directly. The API caches repeat queries in Redis, spaces outbound requests to respect Nominatim's ~1 req/sec policy, sends an identifying User-Agent, and returns typed results with OSM attribution. The UI cleanly separates local planning-feature search (PostGIS dataset) from worldwide place search; selecting a place flies/fits the map, while AOI spatial analysis stays scoped to the local planning dataset. Production would self-host Nominatim (or use Mapbox/Pelias/commercial) with a distributed Redis-backed rate limiter.

## Full-Stack Geospatial Project Answer

SiteLens is a full-stack geospatial planning intelligence platform I built as a public portfolio project. The frontend uses React, TypeScript, MapLibre, Material UI, Recharts, and Turf-style interactions for spatial layers, feature inspection, search, AOI drawing, and analytics. The backend uses Fastify, PostgreSQL/PostGIS, Redis, GeoJSON ingestion scripts, role/plan-based entitlements, Stripe-style billing gates, and a backend-owned deterministic planning summary service.

The project demonstrates both frontend and backend ownership: map-centric UX, spatial data modeling, spatial SQL, API design, caching, ingestion pipelines, access control, billing-aware feature gates, and source-transparent AI-assisted summaries.
