# Environment Variables

SiteLens runs with safe defaults and degrades gracefully. All variables are
optional for the local demo; the table below documents each one and its effect.

## Web (`apps/web`)

Set these in `apps/web/.env.local` (see `apps/web/.env.example`).

```txt
VITE_API_BASE_URL=http://localhost:4000
VITE_DEMO_API_KEY=demo-planner-key
```

- **`VITE_API_BASE_URL`** — base URL of the API. **Omit it** to run the frontend
  in local-only fallback mode (Turf.js analysis + local deterministic summary,
  no backend calls). When set, the app calls the API and falls back locally on
  failure/403.
- **`VITE_DEMO_API_KEY`** — demo API key sent as `x-api-key`. Use one of:
  - `demo-viewer-key` → Viewer role, Free plan
  - `demo-planner-key` → Planner role, Pro plan
  - `demo-admin-key` → Admin role, Enterprise plan

  The in-app **Demo access** control overrides this at runtime (persisted to
  `localStorage`).

## API (`apps/api`)

Set these in `apps/api/.env` (see `apps/api/.env.example`).

```txt
NODE_ENV=development
PORT=4000
WEB_ORIGIN=http://localhost:5173
DATABASE_URL=postgres://sitelens:sitelens@localhost:54329/sitelens
DB_SSL=false
REDIS_URL=redis://localhost:6389
CACHE_ENABLED=true
CACHE_DEFAULT_TTL_SECONDS=300
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
ENABLE_DEMO_BILLING=true
```

| Variable | Default | Notes |
| --- | --- | --- |
| `NODE_ENV` | `development` | `production` enables prod behavior (e.g. gates demo billing). |
| `PORT` | `4000` | API listen port. |
| `WEB_ORIGIN` | `http://localhost:5173` | Allowed CORS origin. |
| `DATABASE_URL` | `postgres://sitelens:sitelens@localhost:54329/sitelens` | PostgreSQL/PostGIS connection string. |
| `DB_SSL` | `false` | Set `true` for managed Postgres requiring TLS. |
| `REDIS_URL` | _(empty)_ | **Optional.** Caching is disabled when unset; the API still works. |
| `CACHE_ENABLED` | `true` | Only effective when `REDIS_URL` is set. |
| `CACHE_DEFAULT_TTL_SECONDS` | `300` | Default cache TTL. |
| `STRIPE_SECRET_KEY` | _(empty)_ | **Optional.** Not required for the demo. |
| `STRIPE_WEBHOOK_SECRET` | _(empty)_ | **Optional.** When set, the webhook verifies signatures. |
| `ENABLE_DEMO_BILLING` | `true` | Allows demo plan switching. **Do not enable in production** unless intentionally configured. |

### Notes

- **Stripe secrets are optional** — the billing demo runs without them; the
  webhook accepts demo payloads in non-production and verifies signatures when a
  secret is configured.
- **Redis is optional** and degrades gracefully — cache reads report `disabled`
  and every request still computes a fresh result.
- **Demo billing** (`ENABLE_DEMO_BILLING`) should not be left on in production;
  `POST /api/billing/demo-plan` is refused in production unless it is explicitly
  set to `true`.

### CI

GitHub Actions (`.github/workflows/ci.yml`) runs the `quality` job with **no**
services (defaults apply), and the `integration` job with PostGIS + Redis using:

```txt
DATABASE_URL=postgres://sitelens:sitelens@localhost:5432/sitelens
REDIS_URL=redis://localhost:6379
```
