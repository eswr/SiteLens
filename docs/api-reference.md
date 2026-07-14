# API Reference

Base URL: `http://localhost:4000` (configurable via `VITE_API_BASE_URL`).

All success responses use the envelope `{ data, meta? }`; errors use
`{ error: { code, message, details? } }`. Every response includes an
`x-request-id` header. Auth is a demo `x-api-key` header (or `Authorization:
Bearer <key>`): `demo-viewer-key` (Free), `demo-planner-key` (Pro),
`demo-admin-key` (Enterprise). Missing/unknown keys are treated as anonymous
(Free).

`meta.cache` is one of `hit | miss | error | disabled` for cached routes.

---

### `GET /health` and `GET /api/health`

- **Purpose:** liveness/readiness check.
- **Auth:** none.
- **Response:** `{ data: { status: "ok", version, uptime } }`.

### `GET /api/me`

- **Purpose:** current demo user, capabilities, and billing context.
- **Auth:** optional (anonymous → Free).
- **Response:** `{ data: { user, capabilities, billing: { plan, subscription, features } } }`.

### `GET /api/layers`

- **Purpose:** layer metadata + feature counts.
- **Auth:** optional. **Cache:** yes (`sitelens:layers:*`).
- **Response:** `{ data: Layer[], meta: { cache } }`.

### `GET /api/parcels`

- **Purpose:** parcels as a GeoJSON `FeatureCollection`.
- **Auth:** optional; **plan-limited** (`parcelLimit`, Free = 5, Pro/Enterprise = all).
- **Cache:** yes, plan-scoped (`sitelens:parcels:v1:<plan>`).
- **Response:** `{ data: FeatureCollection, meta: { count, cache, access } }`.

### `GET /api/parcels/:id`

- **Purpose:** a single parcel by `id`/`parcel_id`.
- **Auth:** optional. **Cache:** yes. Returns `404` if missing.

### `GET /api/search?q=`

- **Purpose:** search spatial features (`ILIKE`).
- **Auth:** optional; **plan-limited** result count (Free 5 / Pro 8 / Enterprise 20).
- **Cache:** yes, context + plan scoped
  (`sitelens:search:v1:<planningContextId>:<plan>:<hash>`).
- **Example:** `GET /api/search?q=central&planningContextId=local-demo-sydney`.
- **Response:** `{ data: SearchResultItem[], meta: { count, cache, access, planningContextId } }`.
- **Default:** `planningContextId` omitted → `local-demo-sydney`.

### `POST /api/analyze-area`

- **Purpose:** PostGIS spatial analysis of an AOI polygon within a planning context.
- **Auth + plan:** requires `analysis:run` (Pro/Enterprise) → `403` otherwise;
  metered per plan (`429 ENTITLEMENT_LIMIT_EXCEEDED` when exhausted).
- **Cache:** yes, context + plan scoped
  (`sitelens:analysis:v1:<planningContextId>:<plan>:<hash>`).
- **Request:**
  ```json
  {
    "planningContextId": "local-demo-sydney",
    "geometry": { "type": "Polygon", "coordinates": [[[151.205,-33.87],[151.215,-33.87],[151.215,-33.86],[151.205,-33.86],[151.205,-33.87]]] }
  }
  ```
- **Response:** `{ data: { result: SpatialAnalysisResult, engine: "postgis" }, meta: { cache, computedAt, access, planningContextId } }`.

### `POST /api/planning-summary`

- **Purpose:** backend-owned **deterministic** planning summary (no LLM).
- **Auth + plan:** requires `summary:generate` (Pro/Enterprise) → `403`
  otherwise; metered per plan (`429 ENTITLEMENT_LIMIT_EXCEEDED`). Invalid body → `400`.
- **Cache:** yes, context + plan scoped
  (`sitelens:summary:v1:<planningContextId>:<plan>:<hash>`).
- **Request:** `{ "analysisResult": SpatialAnalysisResult, "context": { "sourceEngine": "postgis", "planningContextId": "…" } }`.
- **Response:** `{ data: { summary: PlanningSummary, engine: "deterministic-backend" }, meta: { cache, computedAt, access, planningContextId } }`.

### `GET /api/planning-contexts`

- **Purpose:** list available planning contexts (Sydney Demo + generated external).
- **Auth:** none.
- **Response:** `{ data: PlanningContext[] }`.

### `GET /api/planning-contexts/:id`

- **Purpose:** fetch one planning context plus layer feature counts.
- **Response:** `{ data: { context: PlanningContext, counts: PlanningContextFeatureCounts } }`.
- **Errors:** unknown id → `404`.

### `POST /api/planning-contexts/build`

- **Purpose:** enqueue an **external OSM** planning context build for a
  selected worldwide place (async job → Overpass proxy → normalize → PostGIS).
- **Auth + plan:** requires `external-context:build` (Pro/Enterprise) → `403`
  otherwise. Free/Viewer cannot build. Builds are metered: Free `0` / Pro monthly
  quota / Enterprise unlimited. Quota is checked only before enqueueing a live
  Overpass job; usage is recorded by the worker after a successful **new** build
  (not fresh reuse).
- **Important:** live Overpass fetch happens only via the in-process worker after
  this explicit action — never on keystrokes or map moves, and never while holding
  a DB pool client. Fresh contexts return `{ status: "succeeded", reused: true }`
  immediately. Concurrent POSTs for the same context return the existing
  `queued`/`running` job.
- **Request:**
  ```json
  {
    "source": "external-osm",
    "place": {
      "id": "static-demo-bengaluru",
      "label": "Bengaluru, Karnataka, India",
      "displayName": "Bengaluru, Karnataka, India",
      "latitude": 12.9716,
      "longitude": 77.5946,
      "boundingBox": [12.7, 13.2, 77.3, 77.9],
      "provider": "static-demo"
    }
  }
  ```
- **Response:** `{ data: { jobId, contextId, status: "queued"|"running"|"succeeded", reused?: boolean } }`.
- **Errors:** invalid place/bbox → `400`; quota exceeded → `429`.

### `GET /api/planning-contexts/jobs/health`

- **Purpose:** job-queue observability for the in-process build worker.
- **Auth:**
  - **Portfolio demo** (`ENABLE_DEMO_BILLING=true`, including production Fly
    demo): public. Response is operational (not secret), with
    `Cache-Control: no-store`.
  - **Production-shaped** (`NODE_ENV=production` and `ENABLE_DEMO_BILLING=false`):
    requires an **admin** API key (`demo-admin-key` / admin role).
- **Response:** `{ data }` includes at least `workerEnabled`, `queued`,
  `running`, `failedLast24h`, `oldestQueuedAt`, plus lock/poll/heartbeat
  config and related counters.
- **Errors:** database unavailable → `503`.

### `GET /api/planning-contexts/jobs/:jobId`

- **Purpose:** poll async build job status (`queued` / `running` / `succeeded` /
  `failed`), including terminal `counts` / `errorMessage` / `reused`, plus
  `attempts` for debugging reclaimed / stuck jobs.
- **Response:** `{ data: { job: PlanningContextBuildJob } }`.
- **Errors:** unknown id → `404`.

### `GET /api/layers/:layerId/geojson?planningContextId=`

- **Purpose:** GeoJSON FeatureCollection for one layer within a planning context
  (used by the map + search index in API mode).

### `GET /api/geocode/search?q=&limit=`

- **Purpose:** worldwide place search (geocoding) via a backend **Nominatim /
  OpenStreetMap** proxy, with an optional bundled **static-demo** fallback when
  the live provider is blocked or unavailable. The browser never calls Nominatim
  directly. This route is for **explicit submit/search only** — the Places UI
  autocomplete is local (bundled demo places, recent selections, and this
  session’s explicit search results) and must not typeahead against public
  Nominatim.
- **Auth:** none (public).
- **Params:** `q` required, min 3 chars; `limit` default 5, max 10 (clamped).
- **Cache:** yes, Redis (`sitelens:place-search:v1:<provider>:<limit>:<hash>` —
  provider-scoped so live and fallback never mix; the raw query is hashed).
  Outbound Nominatim calls are rate-spaced and enter a process-local cooldown
  after 403/429/timeout/outage.
- **Example:** `GET /api/geocode/search?q=Bengaluru&limit=5`.
- **Response (live):**
  ```json
  {
    "data": {
      "results": [
        { "id": "123", "label": "Bengaluru, Karnataka, India", "displayName": "…", "latitude": 12.9768, "longitude": 77.5901, "boundingBox": [12.834, 13.143, 77.460, 77.784], "category": "place", "type": "city", "importance": 0.72, "provider": "nominatim" }
      ],
      "provider": "nominatim",
      "attribution": "© OpenStreetMap contributors; geocoding by Nominatim"
    },
    "meta": { "cache": "miss", "computedAt": "…" }
  }
  ```
- **Response (demo fallback):** `provider: "static-demo"` plus
  `fallback: { active, reason, message }` and static-demo attribution. Results
  are never mislabeled as Nominatim.
- **Errors:** short/missing `q` → `400`; disabled/misconfigured → `503`; when
  fallback is disabled, upstream failure → `502` / timeout → `504` / cooldown →
  `503`. With fallback enabled (dev default), those upstream failures return
  `200` static-demo results instead.

### `GET /api/billing/plans`

- **Purpose:** the public plan catalog (Free / Pro / Enterprise).
- **Auth:** none.
- **Response:** `{ data: BillingPlan[] }`.

### `GET /api/billing/current`

- **Purpose:** current billing context + capabilities (anonymous → Free).
- **Auth:** optional.
- **Response:** `{ data: { plan, subscription, features, capabilities } }`.

### `POST /api/billing/demo-plan`

- **Purpose:** switch the demo user's plan (portfolio-only).
- **Auth:** required (`401` if anonymous). Refused in production unless
  `ENABLE_DEMO_BILLING=true` (`403`).
- **Request:** `{ "plan": "pro" }`.
- **Response:** `{ data: { plan, subscription, features, capabilities } }`.

### `POST /api/billing/webhook`

- **Purpose:** Stripe-compatible webhook (demo-safe).
- **Auth:** signature-based. When `STRIPE_WEBHOOK_SECRET` is set, an invalid
  `stripe-signature` → `400`; in non-production without a secret, demo payloads
  are accepted. Maps `customer.subscription.*` and `invoice.payment_failed`.
- **Response:** `{ data: { received: true, type } }`.
