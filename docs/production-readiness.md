# Production Readiness Checklist

SiteLens is a portfolio demo that is intentionally **production-shaped** but not
production-deployed. This checklist captures what would be required to run it as
a real geospatial SaaS. Items are grouped by concern.

## Security

- [ ] Replace demo API keys with real auth (OAuth/SSO, JWT, or session cookies)
- [ ] Add an organization/team membership model
- [x] Verify and lock down CORS origins (`WEB_ORIGIN` required in production; fail closed)
- [ ] Use secure, `HttpOnly`, `SameSite` cookies / session storage if added
- [x] Rate-limit sensitive endpoints (`@fastify/rate-limit` + Helmet; inbound store is still **process-local** — production-shaped for the single-machine Fly demo)
- [x] Distributed Redis-backed **outbound** Nominatim/Overpass provider spacers (`PROVIDER_RATE_LIMIT_BACKEND=redis` in production; `auto`/`memory` only for local/demo)
- [ ] Sanitize inputs and log safely (no secrets/PII in logs)
- [ ] Disable demo billing in production (`ENABLE_DEMO_BILLING` unset/false)

## Data

- [ ] Use managed PostgreSQL/PostGIS with backups and PITR
- [ ] Automate migrations in the deploy pipeline
- [ ] Monitor ingestion jobs (success/failure, row counts, timing)
- [ ] Validate incoming spatial data (geometry validity, SRID, bounds)
- [ ] Add data freshness checks / staleness alerts

## Performance

- [ ] Redis cache enabled with sized TTLs
- [ ] Spatial indexes verified (GiST on geometry columns)
- [ ] Query plans reviewed (`EXPLAIN ANALYZE`) for heavy spatial endpoints
- [ ] Pagination for large feature collections
- [ ] Tile / vector-tile strategy for large spatial layers

## Billing

- [ ] Stripe Checkout for self-serve upgrades
- [ ] Stripe Customer Portal for plan management
- [ ] Verified webhooks (signature + raw body via the Stripe SDK)
- [ ] Idempotency keys on write operations
- [ ] Entitlement reconciliation (Stripe ↔ local subscriptions)

## AI

- [ ] Prompt/version logging if a real LLM is added
- [ ] Evaluation set for summary quality / regressions
- [ ] Source metrics always visible alongside generated text
- [ ] Human review for risky / high-impact outputs

## External planning contexts

- [ ] Replace public Overpass with self-hosted Overpass, Overture Maps ingestion, or official municipal open-data connectors per city
- [x] Distributed Redis-backed spacing/cooldown for Overpass fetches
- [x] Dedicated pg-boss execution queue + external worker process (ledger table `planning_context_build_jobs` remains the product-facing job state; local demos may still use `PLANNING_CONTEXT_WORKER_MODE=in-process`)
- [ ] Keep clear attribution and disclaimers that open-map context is not official zoning/cadastre/DAs
- [ ] Schedule freshness jobs (`EXTERNAL_CONTEXT_REBUILD_AFTER_DAYS` or equivalent)
- [ ] Confirm licensing/attribution for any commercial geospatial providers
- [ ] Monitor `external-context:build` metering (Free 0 / Pro monthly / Enterprise unlimited) and `planning_context_build_jobs` queue depth / failures
- [ ] Treat jobs/health `pgBoss` stats as approximate only; wire billing-grade queue metrics if needed
- [ ] Replace concurrency-1 Overpass cooldown sleeps with delayed re-enqueue when shared cooldown is active
- [ ] Decide whether Redis cooldown **write** failures should fail closed (today: warn only so the original provider error is not masked; slot waits already fail closed in production with `PROVIDER_RATE_LIMIT_BACKEND=redis`)

## Geocoding (worldwide place search)

- [ ] Replace public Nominatim with a self-hosted Nominatim, Mapbox Geocoding, Pelias, or a commercial provider
- [ ] Set a real identifying `NOMINATIM_USER_AGENT` (contact address)
- [x] Redis-backed Nominatim spacer + shared upstream cooldown (`PROVIDER_RATE_LIMIT_*`; keep a contracted/self-hosted geocoder for real traffic)
- [ ] Decide whether static-demo fallback stays enabled in production (default off) or is removed after a real provider is wired
- [ ] Keep visible provider attribution (OSM/Nominatim or static-demo copy) wherever place results appear
- [ ] Tune place-search cache TTL and monitor upstream error/latency / fallback rates
- [ ] If true remote place autocomplete is required, use a provider that allows it
  (self-hosted Nominatim, Pelias, Mapbox Search/Geocoding, Google Places, or
  another paid autocomplete API). Do **not** typeahead against public Nominatim;
  the demo Places UX keeps suggestions local and live geocoding on explicit submit.

## Observability

- [ ] Structured logs (request id, user, plan, route)
- [ ] Metrics (latency, cache hit rate, error rate, usage)
- [ ] Distributed tracing across web → API → DB/cache
- [ ] Error tracking (e.g. Sentry)
- [ ] Health checks wired to orchestration/liveness probes
- [ ] Deployment rollback plan (blue/green or canary)
