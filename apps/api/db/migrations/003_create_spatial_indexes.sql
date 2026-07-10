-- GIST indexes on geometry columns for spatial queries.
CREATE INDEX IF NOT EXISTS parcels_geom_gix ON parcels USING GIST (geom);
CREATE INDEX IF NOT EXISTS zoning_overlays_geom_gix ON zoning_overlays USING GIST (geom);
CREATE INDEX IF NOT EXISTS constraints_geom_gix ON constraints USING GIST (geom);
CREATE INDEX IF NOT EXISTS transit_points_geom_gix ON transit_points USING GIST (geom);
CREATE INDEX IF NOT EXISTS development_activity_geom_gix ON development_activity USING GIST (geom);

-- Full-text search indexes.
CREATE INDEX IF NOT EXISTS parcels_search_idx
  ON parcels USING GIN (
    to_tsvector('english', coalesce(name, '') || ' ' || coalesce(parcel_id, '') || ' ' || coalesce(zoning, '') || ' ' || coalesce(status, ''))
  );

CREATE INDEX IF NOT EXISTS development_activity_search_idx
  ON development_activity USING GIN (
    to_tsvector('english', coalesce(project_name, '') || ' ' || coalesce(status, '') || ' ' || coalesce(application_type, ''))
  );

-- Btree indexes for common lookups.
CREATE INDEX IF NOT EXISTS parcels_parcel_id_idx ON parcels (parcel_id);
CREATE INDEX IF NOT EXISTS parcels_zoning_idx ON parcels (zoning);
CREATE INDEX IF NOT EXISTS development_activity_status_idx ON development_activity (status);
CREATE INDEX IF NOT EXISTS constraints_risk_level_idx ON constraints (risk_level);
CREATE INDEX IF NOT EXISTS transit_points_mode_idx ON transit_points (mode);
