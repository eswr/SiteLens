# AGENTS.md

## Cursor Cloud specific instructions

SiteLens is an **npm-workspaces monorepo**: `apps/web` (React + TypeScript +
Vite dashboard with a MapLibre GL map), `apps/api` (Fastify + TypeScript API),
and `packages/shared` (`@sitelens/shared` shared types). Run `npm install` once
at the repo root; it installs and links all workspaces.

- Dev servers (run from the repo root): `npm run dev:web` (Vite, port `5173`;
  `npm run dev` is an alias) and `npm run dev:api` (Fastify via `tsx watch`,
  port `4000`). They run independently.
- Root scripts fan out to workspaces: `typecheck`, `lint` (oxlint), `test`
  (Vitest — API only), and `build` all use `-ws --if-present`.
- The web app still loads static mock GeoJSON from `apps/web/public/data`; the
  API serves its own copy from `apps/api/data`. The frontend does not call the
  API yet.
- The map uses the no-token public style `https://demotiles.maplibre.org/style.json`,
  so rendering the basemap requires outbound network access to that host.
- `@sitelens/shared` is a **source** package: its `exports` point at
  `src/index.ts` (no build step). Consumers use `moduleResolution: "bundler"`,
  so importing `@sitelens/shared` resolves to TypeScript source directly.
- The API is run with `tsx`; its `build`/`typecheck` are `tsc --noEmit` (no
  compiled output). Fastify v5 types the error-handler `error` as `unknown` —
  annotate it as `FastifyError`.
- The web app's `tsconfig.app.json` enables `verbatimModuleSyntax`, so type-only
  imports MUST use `import type { ... }` (this also applies to the API tsconfig).
- The web app uses a modern Material UI major version where `Typography` does
  not accept `lineHeight` as a direct prop — set it via the `sx` prop instead.

### Backend database (PostgreSQL + PostGIS)

The API is backed by PostGIS running in Docker (`infra/docker-compose.yml`,
image `postgis/postgis:16-3.4`, host port `54329`). The DB is NOT part of the
dependency update script — bring it up explicitly when working on the API.

- Full backend setup: `npm run db:up` → `npm run db:migrate` →
  `npm run ingest:geojson` → `npm run dev:api`.
- **Docker is required and may not be preinstalled.** If `docker` is missing,
  install Docker Engine (docker-in-docker), and because this is Docker 29 with
  fuse-overlayfs, set `/etc/docker/daemon.json` to
  `{"storage-driver":"fuse-overlayfs","features":{"containerd-snapshotter":false}}`,
  use `iptables-legacy`, and start `dockerd`. If `docker` commands hit a
  socket permission error as the non-root user, `sudo chmod 666 /var/run/docker.sock`.
- `npm run test` does NOT need the database — DB integration tests
  (`src/db/spatialRepository.test.ts`) are skipped unless `RUN_DB_TESTS=true`
  (`npm run test:db -w apps/api`, which needs the DB up). Route tests mock the
  repository, so they pass without Postgres.
- DB-backed routes (`/api/layers`, `/api/parcels`, `/api/search`) return `503`
  when the database is unavailable — bring the DB up rather than expecting a
  fallback. `analyze-area` / `planning-summary` remain `501` placeholders.
- `pg` is CommonJS; the API tsconfig uses `moduleResolution: "bundler"` and is
  run via `tsx`, so `import { Pool } from 'pg'` works at build and runtime.
