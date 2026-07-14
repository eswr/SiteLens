# Frontend Deploy Verification

Open the deployed frontend URL (full-stack build with `VITE_API_BASE_URL` set).

## Expected

- Header shows Demo Planner · Pro.
- Map loads with MapLibre basemap.
- Sydney planning layers are visible.
- Planning features search works.
- Places tab exists separately.
- Searching "Bengaluru" returns either:
  - Provider: Nominatim, or
  - Provider: Demo fallback with clear fallback message.
- Browser Network tab shows no direct call to `nominatim.openstreetmap.org`.
- Selecting Bengaluru flies/fits map and shows Place card.
- Draw AOI over Sydney.
- Analysis uses PostGIS API.
- Repeat analysis shows cache hit.
- Generate planning summary.
- Summary uses deterministic backend engine.
- Switch Viewer/Free.
- AOI analysis falls back locally with entitlement warning.

## CORS check

From the browser Network tab, these requests must succeed against
`VITE_API_BASE_URL` (not blocked by CORS):

- `GET /api/me`
- `GET /api/geocode/search?q=Bengaluru&limit=3`
- `POST /api/analyze-area`
- `POST /api/planning-summary`

If CORS fails, set API `WEB_ORIGIN` to the exact frontend origin, redeploy the
API, and hard-refresh the frontend.
