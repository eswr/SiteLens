# Deployment

## Frontend (Vercel)

The web app (`apps/web`) is a static Vite build and can be deployed to Vercel.

1. Push the repo to GitHub.
2. Import the repo in Vercel.
3. Framework preset: Vite.
4. Root directory: `apps/web` (or build from the monorepo root with
   `npm run build:web`).
5. Build command: `npm run build` (in `apps/web`) → output directory: `dist`.
6. No environment variables are required for the current demo.

Notes:

- The web app uses static GeoJSON files from `apps/web/public/data`.
- It does not call the API yet, so no backend is required to deploy the frontend.
- No paid map token is required (public MapLibre demo style).
- The AI summary is deterministic and local (no LLM).

## Backend database (local, Docker)

The API (`apps/api`) is backed by PostgreSQL + PostGIS via Docker Compose.

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

Reset / teardown:

```bash
npm run db:reset       # drop tables + re-run migrations (dev only), then re-ingest
npm run db:down        # stop and remove the container
```

Configuration is read from `apps/api/.env` (see `apps/api/.env.example`):
`DATABASE_URL`, `DB_SSL`, `PORT`, `WEB_ORIGIN`, `NODE_ENV`.

## Roadmap

- PostGIS is now used for spatial storage; the frontend still reads static
  GeoJSON directly.
- Step 10 will connect the frontend AOI analysis to backend PostGIS.
- Redis, authentication, Stripe, and Azure deployment are future steps.
