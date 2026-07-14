-- Planning contexts: local demo seed + generated external urban contexts.
-- Existing spatial rows default to local-demo-sydney.

CREATE TABLE IF NOT EXISTS planning_contexts (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  source TEXT NOT NULL,
  status TEXT NOT NULL,
  center_lng NUMERIC(12, 8) NOT NULL,
  center_lat NUMERIC(12, 8) NOT NULL,
  bbox_west NUMERIC(12, 8) NOT NULL,
  bbox_south NUMERIC(12, 8) NOT NULL,
  bbox_east NUMERIC(12, 8) NOT NULL,
  bbox_north NUMERIC(12, 8) NOT NULL,
  place JSONB,
  disclaimer TEXT NOT NULL,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO planning_contexts (
  id, label, source, status,
  center_lng, center_lat,
  bbox_west, bbox_south, bbox_east, bbox_north,
  place, disclaimer
) VALUES (
  'local-demo-sydney',
  'Sydney Demo',
  'local-demo',
  'ready',
  151.2093, -33.8688,
  151.199, -33.876, 151.22, -33.86,
  '{"id":"local-demo-sydney","label":"Sydney, Australia","displayName":"Sydney Demo (bundled synthetic portfolio data)","provider":"local-demo"}'::jsonb,
  'Sydney Demo is bundled synthetic portfolio data. It is not official planning or cadastral data.'
) ON CONFLICT (id) DO NOTHING;

ALTER TABLE planning_layers
  ADD COLUMN IF NOT EXISTS planning_context_id TEXT NOT NULL DEFAULT 'local-demo-sydney';

ALTER TABLE parcels
  ADD COLUMN IF NOT EXISTS planning_context_id TEXT NOT NULL DEFAULT 'local-demo-sydney';

ALTER TABLE zoning_overlays
  ADD COLUMN IF NOT EXISTS planning_context_id TEXT NOT NULL DEFAULT 'local-demo-sydney';

ALTER TABLE constraints
  ADD COLUMN IF NOT EXISTS planning_context_id TEXT NOT NULL DEFAULT 'local-demo-sydney';

ALTER TABLE transit_points
  ADD COLUMN IF NOT EXISTS planning_context_id TEXT NOT NULL DEFAULT 'local-demo-sydney';

ALTER TABLE development_activity
  ADD COLUMN IF NOT EXISTS planning_context_id TEXT NOT NULL DEFAULT 'local-demo-sydney';

-- Layer metadata is unique per planning context.
ALTER TABLE planning_layers DROP CONSTRAINT IF EXISTS planning_layers_pkey;
ALTER TABLE planning_layers ADD PRIMARY KEY (planning_context_id, id);

-- Feature ids are unique per planning context (same OSM id may exist in many contexts).
ALTER TABLE parcels DROP CONSTRAINT IF EXISTS parcels_pkey;
ALTER TABLE parcels ADD PRIMARY KEY (planning_context_id, id);

ALTER TABLE zoning_overlays DROP CONSTRAINT IF EXISTS zoning_overlays_pkey;
ALTER TABLE zoning_overlays ADD PRIMARY KEY (planning_context_id, id);

ALTER TABLE constraints DROP CONSTRAINT IF EXISTS constraints_pkey;
ALTER TABLE constraints ADD PRIMARY KEY (planning_context_id, id);

ALTER TABLE transit_points DROP CONSTRAINT IF EXISTS transit_points_pkey;
ALTER TABLE transit_points ADD PRIMARY KEY (planning_context_id, id);

ALTER TABLE development_activity DROP CONSTRAINT IF EXISTS development_activity_pkey;
ALTER TABLE development_activity ADD PRIMARY KEY (planning_context_id, id);

-- parcel_id uniqueness is per planning context.
ALTER TABLE parcels DROP CONSTRAINT IF EXISTS parcels_parcel_id_key;
DROP INDEX IF EXISTS parcels_parcel_id_idx;

CREATE UNIQUE INDEX IF NOT EXISTS parcels_context_parcel_id_uidx
  ON parcels (planning_context_id, parcel_id);

CREATE INDEX IF NOT EXISTS parcels_parcel_id_idx ON parcels (parcel_id);

CREATE INDEX IF NOT EXISTS planning_layers_context_idx ON planning_layers (planning_context_id);
CREATE INDEX IF NOT EXISTS parcels_context_idx ON parcels (planning_context_id);
CREATE INDEX IF NOT EXISTS zoning_overlays_context_idx ON zoning_overlays (planning_context_id);
CREATE INDEX IF NOT EXISTS constraints_context_idx ON constraints (planning_context_id);
CREATE INDEX IF NOT EXISTS transit_points_context_idx ON transit_points (planning_context_id);
CREATE INDEX IF NOT EXISTS development_activity_context_idx ON development_activity (planning_context_id);

CREATE INDEX IF NOT EXISTS planning_contexts_source_idx ON planning_contexts (source);
CREATE INDEX IF NOT EXISTS planning_contexts_status_idx ON planning_contexts (status);
