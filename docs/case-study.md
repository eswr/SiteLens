# SiteLens Case Study

## Problem

Planning and property users need to understand place-based decisions quickly, but raw spatial datasets are difficult for non-technical users to interpret.

## Solution

SiteLens is a full-stack geospatial planning intelligence platform that turns mock planning/property GeoJSON into searchable map layers, spatial analysis, analytics dashboards, and source-transparent planning summaries.

## Frontend Ownership

React, TypeScript, MapLibre, Material UI, AOI drawing, Recharts, responsive dashboard UX.

## Backend Ownership

Fastify, PostgreSQL/PostGIS, spatial SQL, GeoJSON ingestion, Redis caching, auth, billing/entitlements, usage metering.

## AI Feature Design

Backend-owned deterministic summary service using source metrics, cache, entitlement gates, and fallback behavior.

## Production Thinking

CI, tests, migrations, ingestion, caching, access control, billing gates, fallback modes, deployment docs.

## What I Would Add Next

OpenAPI, vector tiles, real SSO, Stripe Checkout, Azure deployment, observability, real LLM with evals.
