# Seeds

Sample data for SiteLens is **not** raw SQL — it is loaded from the mock GeoJSON
in `apps/api/data` by the ingestion script, which upserts rows into the PostGIS
spatial tables.

## Load sample data

```bash
# from the repo root
npm run db:up          # start PostgreSQL + PostGIS
npm run db:migrate     # apply SQL migrations
npm run ingest:geojson # load apps/api/data/*.geojson into PostGIS
# (npm run db:seed is an alias for ingest:geojson)
```

## Reset everything

```bash
npm run db:reset       # drop spatial tables, re-run migrations (dev only)
npm run ingest:geojson # reload data
```

Datasets ingested:

| GeoJSON file | Table |
| ------------ | ----- |
| `parcels.geojson` | `parcels` |
| `zoning.geojson` | `zoning_overlays` |
| `constraints.geojson` | `constraints` |
| `transit.geojson` | `transit_points` |
| `development-activity.geojson` | `development_activity` |
