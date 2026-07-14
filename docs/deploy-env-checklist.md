# Deploy environment checklist

Use this when deploying the **full-stack** portfolio demo (API + PostGIS + Redis
+ frontend). For frontend-only demos, omit API/DB/Redis and leave web `VITE_*`
vars unset.

## API environment

```txt
NODE_ENV=production
PORT=<provider-port>
WEB_ORIGIN=https://<frontend-domain>

DATABASE_URL=<managed-postgres-url>
DB_SSL=true

REDIS_URL=<managed-redis-url>
CACHE_ENABLED=true
CACHE_DEFAULT_TTL_SECONDS=300

ENABLE_DEMO_BILLING=true

GEOCODING_ENABLED=true
NOMINATIM_BASE_URL=https://nominatim.openstreetmap.org
NOMINATIM_USER_AGENT=SiteLens/0.1 (portfolio-demo; contact: <real-email>)
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
- Replace the placeholder contact in `NOMINATIM_USER_AGENT` with a real email
  or project contact before deploying.
- `ENABLE_DEMO_BILLING=true` is portfolio-only. Real production should disable
  demo plan switching and use real auth + Stripe Checkout/Portal.
- Leave Stripe secrets empty for the demo webhook path; set them only when
  verifying signed webhooks.
- Production (non-demo) would typically set
  `GEOCODING_STATIC_FALLBACK_ENABLED=false` once a self-hosted Nominatim or
  commercial geocoder is wired, and turn off `ENABLE_DEMO_BILLING`.

## Frontend environment (Vite — bake-in at build time)

```txt
VITE_API_BASE_URL=https://<api-host>
VITE_DEMO_API_KEY=demo-planner-key
```

Omit both for a frontend-only static demo.

## Post-deploy seed (API host / one-off with same DATABASE_URL + REDIS_URL)

```bash
npm run db:migrate -w apps/api
npm run db:seed:billing -w apps/api
npm run ingest:geojson -w apps/api
npm run cache:clear -w apps/api
```

## Verify

```bash
API_BASE=https://<api-host> npm run verify:deployed:api
```

Then open the frontend and follow
[`docs/frontend-deploy-verification.md`](frontend-deploy-verification.md).
