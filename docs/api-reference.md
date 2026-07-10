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
- **Cache:** yes, plan-scoped (`sitelens:search:v1:<plan>:<hash>`).
- **Example:** `GET /api/search?q=central`.
- **Response:** `{ data: SearchResultItem[], meta: { count, cache, access } }`.

### `POST /api/analyze-area`

- **Purpose:** PostGIS spatial analysis of an AOI polygon.
- **Auth + plan:** requires `analysis:run` (Pro/Enterprise) → `403` otherwise;
  metered per plan (`429 ENTITLEMENT_LIMIT_EXCEEDED` when exhausted).
- **Cache:** yes, plan-scoped (`sitelens:analysis:v1:<plan>:<hash>`).
- **Request:**
  ```json
  { "geometry": { "type": "Polygon", "coordinates": [[[151.205,-33.87],[151.215,-33.87],[151.215,-33.86],[151.205,-33.86],[151.205,-33.87]]] } }
  ```
- **Response:** `{ data: { result: SpatialAnalysisResult, engine: "postgis" }, meta: { cache, computedAt, access } }`.

### `POST /api/planning-summary`

- **Purpose:** backend-owned **deterministic** planning summary (no LLM).
- **Auth + plan:** requires `summary:generate` (Pro/Enterprise) → `403`
  otherwise; metered per plan (`429 ENTITLEMENT_LIMIT_EXCEEDED`). Invalid body → `400`.
- **Cache:** yes, plan-scoped (`sitelens:summary:v1:<plan>:<hash>`).
- **Request:** `{ "analysisResult": SpatialAnalysisResult, "context": { "sourceEngine": "postgis" } }`.
- **Response:** `{ data: { summary: PlanningSummary, engine: "deterministic-backend" }, meta: { cache, computedAt, access } }`.

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
