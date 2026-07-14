# Frontend Deploy Verification

Open the deployed frontend URL (full-stack build with `VITE_API_BASE_URL` set).

## Expected

- Header shows Demo Planner · Pro.
- Map loads with MapLibre basemap.
- Sydney Demo is the default planning context; planning layers are visible.
- Planning features search works against the selected context.
- Places tab exists separately from Planning features.
- Searching "Bengaluru" (or "Dubai") returns either:
  - Provider: Nominatim, or
  - Provider: Demo fallback with clear fallback message.
- Browser Network tab shows no direct call to `nominatim.openstreetmap.org`.
- Selecting Bengaluru/Dubai shows the Place card (does not auto-build a context).
- With Planner · Pro, click **Build planning context for this place**.
- After build succeeds:
  - Context selector switches to the new ready external context.
  - Planning Context Health card shows provider (Overpass), status (ready),
    feature counts, last-built time, and data-quality badges
    (Open-map derived, Not official planning data).
  - Rebuilding the same place while fresh shows a Reused chip (no new Overpass call).
- Draw an AOI **over the generated context** (not over Sydney).
- Analysis uses PostGIS API scoped to that planning context.
- Repeat analysis shows cache hit.
- Generate planning summary for the AOI; summary uses the deterministic backend engine.
- Switch Viewer/Free:
  - Build external context is gated.
  - AOI analysis falls back locally with entitlement warning.

## CORS check

From the browser Network tab, these requests must succeed against
`VITE_API_BASE_URL` (not blocked by CORS):

- `GET /api/me`
- `GET /api/geocode/search?q=Bengaluru&limit=3`
- `GET /api/planning-contexts`
- `GET /api/planning-contexts/:id`
- `POST /api/planning-contexts/build`
- `POST /api/analyze-area`
- `POST /api/planning-summary`

If CORS fails, set API `WEB_ORIGIN` to the exact frontend origin, redeploy the
API, and hard-refresh the frontend.
