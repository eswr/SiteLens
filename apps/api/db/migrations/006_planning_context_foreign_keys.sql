-- Enforce referential integrity from spatial tables to planning_contexts.
-- CASCADE so deleting a generated context removes its features cleanly.

ALTER TABLE planning_layers
  DROP CONSTRAINT IF EXISTS planning_layers_context_fk;
ALTER TABLE planning_layers
  ADD CONSTRAINT planning_layers_context_fk
  FOREIGN KEY (planning_context_id)
  REFERENCES planning_contexts (id)
  ON DELETE CASCADE;

ALTER TABLE parcels
  DROP CONSTRAINT IF EXISTS parcels_context_fk;
ALTER TABLE parcels
  ADD CONSTRAINT parcels_context_fk
  FOREIGN KEY (planning_context_id)
  REFERENCES planning_contexts (id)
  ON DELETE CASCADE;

ALTER TABLE zoning_overlays
  DROP CONSTRAINT IF EXISTS zoning_overlays_context_fk;
ALTER TABLE zoning_overlays
  ADD CONSTRAINT zoning_overlays_context_fk
  FOREIGN KEY (planning_context_id)
  REFERENCES planning_contexts (id)
  ON DELETE CASCADE;

ALTER TABLE constraints
  DROP CONSTRAINT IF EXISTS constraints_context_fk;
ALTER TABLE constraints
  ADD CONSTRAINT constraints_context_fk
  FOREIGN KEY (planning_context_id)
  REFERENCES planning_contexts (id)
  ON DELETE CASCADE;

ALTER TABLE transit_points
  DROP CONSTRAINT IF EXISTS transit_points_context_fk;
ALTER TABLE transit_points
  ADD CONSTRAINT transit_points_context_fk
  FOREIGN KEY (planning_context_id)
  REFERENCES planning_contexts (id)
  ON DELETE CASCADE;

ALTER TABLE development_activity
  DROP CONSTRAINT IF EXISTS development_activity_context_fk;
ALTER TABLE development_activity
  ADD CONSTRAINT development_activity_context_fk
  FOREIGN KEY (planning_context_id)
  REFERENCES planning_contexts (id)
  ON DELETE CASCADE;
