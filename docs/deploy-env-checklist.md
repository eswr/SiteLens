# Deploy environment checklist

Use this when deploying the **full-stack** portfolio demo (API + PostGIS + Redis
+ frontend). For frontend-only demos, omit API/DB/Redis and leave web `VITE_*`
vars unset.

Documented portfolio hosts: **Fly.io** (API), **Vercel** (web), **Neon**
(PostGIS, via Vercel), **Upstash** (Redis). See
[`docs/deployment.md`](deployment.md) for the step-by-step.

## API environment

```txt
NODE_ENV=production
PORT=4000
WEB_ORIGIN=https://sitelens-demo.vercel.app

DATABASE_URL=<neon-postgres-url>
DB_SSL=true

# Private fly-*.upstash.io URL works on Fly machines only — not local cache:clear.
REDIS_URL=<upstash-redis-url-from-fly-redis-create>
CACHE_ENABLED=true
CACHE_DEFAULT_TTL_SECONDS=300

# Convenience for local verify script (apps/api/.env.production only; not read by API).
API_BASE=https://sitelens-api.fly.dev

ENABLE_DEMO_BILLING=true

GEOCODING_ENABLED=true
NOMINATIM_BASE_URL=https://nominatim.openstreetmap.org
NOMINATIM_USER_AGENT=SiteLens/0.1 (portfolio-demo; contact: easwarendra.ece@gmail.com)
GEOCODING_MIN_INTERVAL_MS=1100
GEOCODING_CACHE_TTL_SECONDS=86400
GEOCODING_STATIC_FALLBACK_ENABLED=true
GEOCODING_UPSTREAM_ERROR_COOLDOWN_MS=900000
GEOCODING_STATIC_FALLBACK_TTL_SECONDS=3600

STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
```

### Notes

- `WEB_ORIGIN` must **exactly** match the deployed frontend origin (e.g.
  `https://sitelens-demo.vercel.app`). Wrong CORS = browser API calls fail.
- `GEOCODING_STATIC_FALLBACK_ENABLED=true` is **intentional** for the public
  portfolio demo: some cloud/VPN/shared networks are blocked by public
  Nominatim (`403 Access denied`). The API then returns labeled `static-demo`
  places. Do not bypass Nominatim’s public-service restrictions.
- `NOMINATIM_USER_AGENT` must use a real contact (as above) before going public.
  Production refuses the placeholder `replace-with-your-email@example.com`.
- `ENABLE_DEMO_BILLING=true` is portfolio-only. Real production should disable
  demo plan switching and use real auth + Stripe Checkout/Portal.
- Leave Stripe secrets empty for the demo webhook path; set them only when
  verifying signed webhooks.
- Production (non-demo) would typically set
  `GEOCODING_STATIC_FALLBACK_ENABLED=false` once a self-hosted Nominatim or
  commercial geocoder is wired, and turn off `ENABLE_DEMO_BILLING`.

## Frontend environment (Vite — bake-in at build time)

```txt
VITE_API_BASE_URL=https://sitelens-api.fly.dev
VITE_DEMO_API_KEY=demo-planner-key
```

Omit both for a frontend-only static demo.

Vercel project settings: **Root Directory** `apps/web` (or deploy from
`apps/web` with the Vercel CLI). npm workspaces: Git imports may need files
outside the root directory for the lockfile; CLI deploys from `apps/web` work
as shipped. SPA rewrites:
[`apps/web/vercel.json`](../apps/web/vercel.json). Disable SSO protection for
a public demo (`vercel project protection disable --sso`).

Production demo URLs once deployed:

- Frontend: `https://sitelens-demo.vercel.app`
- API: `https://sitelens-api.fly.dev`

## Post-deploy seed (managed DATABASE_URL from a local shell)

```bash
npm run db:migrate -w apps/api
npm run db:seed:billing -w apps/api
npm run ingest:geojson -w apps/api
```

Fly-private Redis (`fly-*.upstash.io`) does not resolve on your laptop — run
`cache:clear` via `fly ssh console`, or use a public Upstash URL for local ops.

## Verify

Requires **`jq`** locally (`brew install jq` on macOS). Without it,
`verify:deployed:api` exits with an install hint. The script reads `API_BASE`
from the environment or from `apps/api/.env.production`.

```bash
API_BASE=https://sitelens-api.fly.dev npm run verify:deployed:api
```

Checks: health, identity, layers, local search, geocoding, cache hit behavior,
PostGIS analysis, planning summary, and Free-plan (Viewer) gating.

Then open the frontend and follow
[`docs/frontend-deploy-verification.md`](frontend-deploy-verification.md).
