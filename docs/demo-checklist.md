# SiteLens Demo Checklist

## 2-Minute Walkthrough

1. Open the dashboard and explain the product: geospatial planning intelligence demo.
2. Toggle zoning, constraints, transit, and development activity layers.
3. Search for a parcel or transit feature.
4. Select a feature and inspect metadata in the right panel.
5. Draw an Area of Interest.
6. Review spatial analysis metrics.
7. Open Analytics and show Recharts visualizations.
8. Generate the deterministic AI Summary.
9. Point out source metrics and demo-data caveats.

## Access / Entitlement Demo

Use the sidebar **Demo access** switcher (or `VITE_DEMO_API_KEY`) to show roles
and plans:

1. Switch to **Viewer · Free**: search is capped at 5 results; drawing an AOI
   falls back to local Turf with an entitlement warning (backend returns 403).
2. Switch to **Planner · Pro**: AOI analysis runs on the backend (PostGIS API),
   search returns up to 8 results.
3. Switch to **Admin · Enterprise**: same as planner, plus admin-only ingestion
   capability (`/api/me` shows `canIngestData`).
4. Point out the header chip (e.g. "Demo Planner · Pro") and that cache keys are
   scoped by entitlement so lower tiers can't receive higher-tier cached data.

## Worldwide Place Search Demo

Requires backend API mode (`VITE_API_BASE_URL` set).

1. In the sidebar Search card, switch from **Planning features** to **Places**.
2. Type a worldwide place (e.g. "Bengaluru" or "London") and press Enter / click
   **Search places**. (Place search runs only on explicit submit, min 3 chars.)
3. First search shows `cache miss`; repeating the same search shows `cache hit`.
4. Selecting a result flies/fits the map to the place, drops a marker, and shows
   a Place card in the details panel with provider + attribution.
5. If public Nominatim blocks this network (`403`), expect a transparent
   **Demo fallback** chip (`provider: "static-demo"`), a short info message, and
   still-usable fly-to / details — not a broken Places tab.
6. Note the split: **Planning features** still searches the local PostGIS
   dataset, and AOI analysis still applies only to that local dataset — place
   search is independent. Open browser devtools → Network: no request goes to
   nominatim.openstreetmap.org from the browser (only the SiteLens API).

## Billing / Plan Demo

Use the sidebar **Demo access → Plan** select to switch plans (Stripe-style):

1. As Planner, keep **Pro**: AOI analysis runs on the backend (PostGIS).
2. Switch **Plan** to **Free**: the header chip and capabilities update; drawing
   an AOI now returns `403` and falls back to local Turf with a "gated by the
   Pro plan" warning — showing entitlements are billing-driven, not just role.
3. Switch back to **Pro** (or **Enterprise**): backend analysis works again.
4. Mention `GET /api/billing/plans`, `POST /api/billing/demo-plan`, the
   Stripe-compatible webhook, and that usage is metered in `usage_counters`.

## Backend Planning Summary Demo

1. As Planner/Pro, run an AOI analysis, then open the **AI Summary** tab and
   click **Generate backend summary**. The panel shows a `Backend deterministic
   summary` chip and a `cache miss` chip.
2. Regenerate the same summary: the chip now shows `cache hit` (Redis-cached,
   plan-scoped) — no recompute.
3. Switch **Plan** to **Free** and generate again: the backend returns `403` and
   the panel falls back to a `Local fallback summary` with the warning "Backend
   planning summary requires Pro or Enterprise; using local demo summary."
4. Clearing the AOI (or drawing a new one) clears the summary + its metadata.
5. Note it is deterministic (no LLM), gated by `summary:generate`, metered, and
   Redis-cached; production would swap in an LLM behind the same interface.

## Deployed full-stack demo

For a public portfolio deploy (Vercel web + hosted API/PostGIS/Redis):

1. Follow [`docs/deployment.md`](deployment.md) (API first → migrate/seed →
   verify API → deploy frontend with `VITE_API_BASE_URL`).
2. Env checklist: [`docs/deploy-env-checklist.md`](deploy-env-checklist.md).
3. API smoke: `API_BASE=https://<api-host> npm run verify:deployed:api`.
4. UI checklist: [`docs/frontend-deploy-verification.md`](frontend-deploy-verification.md).

Frontend-only demos need **no** `VITE_*` vars; full-stack demos **require**
`VITE_API_BASE_URL` (and usually `VITE_DEMO_API_KEY=demo-planner-key`).

## Talking Points

- React + TypeScript architecture
- MapLibre/Mapbox-style layer management
- GeoJSON rendering
- Turf.js spatial analysis
- Recharts analytics
- AI-assisted UX with visible source metrics
- Built as a public recreation of private geospatial/spatial-interface experience
- Full-stack portfolio deploy with Nominatim proxy + honest static-demo fallback
