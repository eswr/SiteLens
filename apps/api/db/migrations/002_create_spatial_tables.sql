-- Spatial tables. Polygon layers use MultiPolygon; points use Point. SRID 4326.

CREATE TABLE IF NOT EXISTS planning_layers (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  description TEXT NOT NULL,
  geometry_type TEXT NOT NULL,
  default_visible BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS parcels (
  id TEXT PRIMARY KEY,
  parcel_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  zoning TEXT NOT NULL,
  current_use TEXT NOT NULL,
  development_score NUMERIC(5,2),
  area_sqm NUMERIC(12,2),
  status TEXT NOT NULL,
  properties JSONB NOT NULL DEFAULT '{}',
  geom geometry(MultiPolygon, 4326) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS zoning_overlays (
  id TEXT PRIMARY KEY,
  zone_code TEXT NOT NULL,
  zone_name TEXT NOT NULL,
  description TEXT NOT NULL,
  properties JSONB NOT NULL DEFAULT '{}',
  geom geometry(MultiPolygon, 4326) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS constraints (
  id TEXT PRIMARY KEY,
  constraint_type TEXT NOT NULL,
  risk_level TEXT NOT NULL,
  description TEXT NOT NULL,
  properties JSONB NOT NULL DEFAULT '{}',
  geom geometry(MultiPolygon, 4326) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS transit_points (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  mode TEXT NOT NULL,
  distance_category TEXT NOT NULL,
  properties JSONB NOT NULL DEFAULT '{}',
  geom geometry(Point, 4326) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS development_activity (
  id TEXT PRIMARY KEY,
  project_name TEXT NOT NULL,
  status TEXT NOT NULL,
  application_type TEXT NOT NULL,
  lodged_month TEXT NOT NULL,
  properties JSONB NOT NULL DEFAULT '{}',
  geom geometry(Point, 4326) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
