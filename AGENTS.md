# AGENTS.md

## Cursor Cloud specific instructions

SiteLens is an **npm-workspaces monorepo**: `apps/web` (React + TypeScript +
Vite dashboard with a MapLibre GL map), `apps/api` (Fastify + TypeScript API),
and `packages/shared` (`@sitelens/shared` shared types). Run `npm install` once
at the repo root; it installs and links all workspaces (`postinstall` builds
`packages/shared` → `dist`).

### Full-stack architecture (default portfolio path)

When `VITE_API_BASE_URL` is set (e.g. `http://localhost:4000`) plus optional
`VITE_DEMO_API_KEY`, the **web client calls the Fastify API** for:

- `/api/me`, billing / entitlements
- layers GeoJSON, parcels, search
- `POST /api/analyze-area` (**PostGIS** implementation — Turf fallback only on
  failure/403 for Sydney Demo)
- `POST /api/planning-summary` (**deterministic** summary, gated/cached — local
  fallback on 403/failure; not a stub endpoint)
- `GET /api/geocode/search` (Nominatim proxy — browser never hits Nominatim)
- planning-context list / detail / build, and job poll
  (`GET /api/planning-contexts/jobs/:jobId`)
- queue health: `GET /api/planning-contexts/jobs/health`

**Planning contexts:** default `local-demo-sydney` (ingested GeoJSON) plus async
Overpass builds (`POST /api/planning-contexts/build`). An in-process worker
claims jobs with leases, optional lease heartbeat, structured JSON lifecycle
logs (`claim` / `retry` / `success` / `failure` / `metering_failure`), and
**context-scoped** Redis invalidation after a successful build.

### Dual mode

Omit `VITE_API_BASE_URL` → **frontend-only** offline demo (bundled Sydney Demo
GeoJSON under `apps/web/public/data` + local Turf + local deterministic
summary). That mode does not call the API; it is the fallback, not the primary
portfolio architecture.

### Dev / build / test

- Dev servers (repo root): `npm run dev:web` (Vite `:5173`; `npm run dev` alias)
  and `npm run dev:api` (builds `packages/shared` once, then Fastify via
  `tsx watch` on `:4000`). While editing shared sources, run `npm run dev:shared`
  (`tsc --watch`) in another terminal so API/web pick up `dist` changes.
- Root `build` order: `packages/shared` → `apps/api` → `apps/web`. Shared and
  API both emit `dist/` (`tsc`, NodeNext). Production/Docker runs
  `node dist/server.js` (`npm start`). `tsx` is a **devDependency** only —
  local DB helpers use `db:migrate` / `ingest:geojson` (tsx); the production
  image uses `db:migrate:prod`, `db:seed:billing:prod`, `ingest:geojson:prod`,
  `cache:clear:prod` (`node dist/...`).
- Root `typecheck` / `lint` / `test` fan out with `-ws --if-present`. Web has
  Vitest + Testing Library (`npm run test -w apps/web`); API uses Vitest.
- Relative ESM imports use `.js` extensions under API/shared
  `moduleResolution: "NodeNext"`.
- The web app's `tsconfig.app.json` enables `verbatimModuleSyntax`, so type-only
  imports MUST use `import type { ... }` (also on the API).
- MUI `Typography` does not accept `lineHeight` as a direct prop — use `sx`.
- Map basemap: `https://demotiles.maplibre.org/style.json` (needs network).

### Backend database (PostgreSQL + PostGIS)

The API is backed by PostGIS in Docker (`infra/docker-compose.yml`,
`postgis/postgis:16-3.4`, host port `54329`). Bring it up explicitly when
working on the API.

- Full backend setup: `npm run db:up` → `npm run db:migrate` →
  `npm run ingest:geojson` → `npm run db:seed:billing` → `npm run dev:api`.
  `db:up` starts PostgreSQL/PostGIS (`54329`) and Redis (`6389`).
  (`npm run db:seed` = ingest + billing seed.)
- Migrations are **raw SQL** under `apps/api/db/migrations/` (PostGIS / GIST /
  partial indexes). The runner (`apps/api/src/db/migrate.ts`) uses a session
  advisory lock, tracks `schema_migrations(filename, checksum, applied_at)`,
  fails if an applied file’s checksum drifts, and wraps each migration in a
  transaction when safe. Validate without applying: `npm run db:migrate:check`.
  Do **not** introduce an ORM rewrite for migrations.
- Billing/entitlements are DB-backed (migration `004`, Free/Pro/Enterprise).
  Demo plan switching: `POST /api/billing/demo-plan` (auth; prod-gated by
  `ENABLE_DEMO_BILLING`).
- Redis optional when `REDIS_URL` is set. Without Redis → `cache:"disabled"`;
  Redis down → DB results with `cache:"error"`. `npm run test` needs neither;
  `npm run test:redis` / `npm run test:db` cover live suites.
- **Docker** may need install (Engine 29 + fuse-overlayfs tips in prior cloud
  notes). `sudo chmod 666 /var/run/docker.sock` if socket perms block the user.
- Spatial routes return `503` when the DB is unavailable — bring the DB up;
  there is no silent API spatial fallback. `analyze-area` and
  `planning-summary` are implemented, not placeholders.
- `pg` is CommonJS; NodeNext ESM interop supports `import { Pool } from 'pg'`.
