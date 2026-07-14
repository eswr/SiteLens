# Production Readiness Checklist

SiteLens is a portfolio demo that is intentionally **production-shaped** but not
production-deployed. This checklist captures what would be required to run it as
a real geospatial SaaS. Items are grouped by concern.

## Security

- [ ] Replace demo API keys with real auth (OAuth/SSO, JWT, or session cookies)
- [ ] Add an organization/team membership model
- [ ] Verify and lock down CORS origins (`WEB_ORIGIN`)
- [ ] Use secure, `HttpOnly`, `SameSite` cookies / session storage if added
- [ ] Rate-limit sensitive endpoints (analysis, summary, webhook)
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

## Geocoding (worldwide place search)

- [ ] Replace public Nominatim with a self-hosted Nominatim, Mapbox Geocoding, Pelias, or a commercial provider
- [ ] Set a real identifying `NOMINATIM_USER_AGENT` (contact address)
- [ ] Replace the single-process request spacer + cooldown with a distributed Redis-backed rate limiter/circuit breaker
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
