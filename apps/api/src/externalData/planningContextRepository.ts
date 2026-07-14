import type {
  PlanningContext,
  PlanningContextFeatureCounts,
  PlanningContextSource,
  PlanningContextStatus,
} from '@sitelens/shared';
import { EXTERNAL_OSM_DISCLAIMER, LOCAL_DEMO_SYDNEY_CONTEXT_ID } from '@sitelens/shared';
import type { PoolClient } from 'pg';
import { getPool } from '../db/pool.js';
import { LAYER_DEFS } from '../lib/layerConfig.js';
import type { NormalizedPlanningLayers } from './externalDataTypes.js';

interface ContextRow {
  id: string;
  label: string;
  source: PlanningContextSource;
  status: PlanningContextStatus;
  center_lng: string | number;
  center_lat: string | number;
  bbox_west: string | number;
  bbox_south: string | number;
  bbox_east: string | number;
  bbox_north: string | number;
  place: PlanningContext['place'] | null;
  disclaimer: string;
  error_message: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function rowToContext(row: ContextRow): PlanningContext {
  const place = row.place ?? undefined;
  return {
    id: row.id,
    label: row.label,
    source: row.source,
    status: row.status,
    center: [Number(row.center_lng), Number(row.center_lat)],
    bbox: [
      Number(row.bbox_west),
      Number(row.bbox_south),
      Number(row.bbox_east),
      Number(row.bbox_north),
    ],
    place,
    disclaimer: row.disclaimer,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

async function upsertContextRow(
  client: PoolClient,
  context: PlanningContext,
  errorMessage: string | null = null,
): Promise<void> {
  await client.query(
    `INSERT INTO planning_contexts (
       id, label, source, status,
       center_lng, center_lat,
       bbox_west, bbox_south, bbox_east, bbox_north,
       place, disclaimer, error_message, created_at, updated_at
     ) VALUES (
       $1, $2, $3, $4,
       $5, $6,
       $7, $8, $9, $10,
       $11::jsonb, $12, $13, $14::timestamptz, $15::timestamptz
     )
     ON CONFLICT (id) DO UPDATE SET
       label = EXCLUDED.label,
       source = EXCLUDED.source,
       status = EXCLUDED.status,
       center_lng = EXCLUDED.center_lng,
       center_lat = EXCLUDED.center_lat,
       bbox_west = EXCLUDED.bbox_west,
       bbox_south = EXCLUDED.bbox_south,
       bbox_east = EXCLUDED.bbox_east,
       bbox_north = EXCLUDED.bbox_north,
       place = EXCLUDED.place,
       disclaimer = EXCLUDED.disclaimer,
       error_message = EXCLUDED.error_message,
       updated_at = EXCLUDED.updated_at`,
    [
      context.id,
      context.label,
      context.source,
      context.status,
      context.center[0],
      context.center[1],
      context.bbox[0],
      context.bbox[1],
      context.bbox[2],
      context.bbox[3],
      JSON.stringify(context.place ?? null),
      context.disclaimer,
      errorMessage,
      context.createdAt,
      context.updatedAt,
    ],
  );
}

export async function getPlanningContext(
  contextId: string,
  client?: PoolClient,
): Promise<PlanningContext | null> {
  const db = client ?? getPool();
  const result = await db.query<ContextRow>(
    `SELECT id, label, source, status,
            center_lng, center_lat,
            bbox_west, bbox_south, bbox_east, bbox_north,
            place, disclaimer, error_message, created_at, updated_at
       FROM planning_contexts
      WHERE id = $1`,
    [contextId],
  );
  const row = result.rows[0];
  return row ? rowToContext(row) : null;
}

export async function listPlanningContexts(): Promise<PlanningContext[]> {
  const pool = getPool();
  const result = await pool.query<ContextRow>(
    `SELECT id, label, source, status,
            center_lng, center_lat,
            bbox_west, bbox_south, bbox_east, bbox_north,
            place, disclaimer, error_message, created_at, updated_at
       FROM planning_contexts
      WHERE status = 'ready' OR id = $1
      ORDER BY
        CASE WHEN id = $1 THEN 0 ELSE 1 END,
        updated_at DESC`,
    [LOCAL_DEMO_SYDNEY_CONTEXT_ID],
  );
  return result.rows.map(rowToContext);
}

export async function createOrUpdatePlanningContext(
  context: PlanningContext,
  errorMessage: string | null = null,
): Promise<void> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await upsertContextRow(client, context, errorMessage);
  } finally {
    client.release();
  }
}

/** Mark a context failed using the caller's session client. */
export async function markPlanningContextFailedOnClient(
  client: PoolClient,
  context: PlanningContext,
  errorMessage: string,
): Promise<void> {
  await upsertContextRow(
    client,
    { ...context, status: 'failed', updatedAt: new Date().toISOString() },
    errorMessage,
  );
}

/** Mark a context failed in its own short transaction (never rolled back with feature writes). */
export async function markPlanningContextFailed(
  context: PlanningContext,
  errorMessage: string,
): Promise<void> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await markPlanningContextFailedOnClient(client, context, errorMessage);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

const EXTERNAL_LAYER_LABELS: Record<
  string,
  { label: string; description: string }
> = {
  parcels: {
    label: 'Sites / Buildings',
    description: 'Candidate sites and buildings from open map data (not cadastre).',
  },
  zoning: {
    label: 'Land Use',
    description: 'Open-map land-use / park / water context overlays (not official zoning).',
  },
  constraints: {
    label: 'Context Constraints',
    description: 'Environmental, open-space, corridor, and construction context signals.',
  },
  transit: {
    label: 'Transit',
    description: 'Transit / public transport points from open map data.',
  },
  developmentActivity: {
    label: 'Activity Proxies',
    description:
      'Amenity / construction proxies — not official development applications.',
  },
};

async function upsertExternalLayerMetadata(
  client: PoolClient,
  contextId: string,
): Promise<void> {
  for (const def of LAYER_DEFS) {
    const labels = EXTERNAL_LAYER_LABELS[def.id] ?? {
      label: def.label,
      description: def.description,
    };
    await client.query(
      `INSERT INTO planning_layers (
         planning_context_id, id, label, description, geometry_type,
         default_visible, sort_order, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, now())
       ON CONFLICT (planning_context_id, id) DO UPDATE SET
         label = EXCLUDED.label,
         description = EXCLUDED.description,
         geometry_type = EXCLUDED.geometry_type,
         default_visible = EXCLUDED.default_visible,
         sort_order = EXCLUDED.sort_order,
         updated_at = now()`,
      [
        contextId,
        def.id,
        labels.label,
        labels.description,
        def.geometryType,
        def.defaultVisible,
        def.sortOrder,
      ],
    );
  }
}

async function clearContextFeaturesOnClient(
  client: PoolClient,
  contextId: string,
): Promise<void> {
  if (contextId === LOCAL_DEMO_SYDNEY_CONTEXT_ID) {
    throw new Error('Refusing to clear the local Sydney demo context features.');
  }
  await client.query(`DELETE FROM parcels WHERE planning_context_id = $1`, [contextId]);
  await client.query(`DELETE FROM zoning_overlays WHERE planning_context_id = $1`, [
    contextId,
  ]);
  await client.query(`DELETE FROM constraints WHERE planning_context_id = $1`, [
    contextId,
  ]);
  await client.query(`DELETE FROM transit_points WHERE planning_context_id = $1`, [
    contextId,
  ]);
  await client.query(
    `DELETE FROM development_activity WHERE planning_context_id = $1`,
    [contextId],
  );
  await client.query(`DELETE FROM planning_layers WHERE planning_context_id = $1`, [
    contextId,
  ]);
}

async function insertPolygonRows(
  client: PoolClient,
  table: string,
  contextId: string,
  rows: Array<{
    id: string;
    columns: unknown[];
    columnSql: string;
    updateSql: string;
    properties: Record<string, unknown>;
    geometry: { type: string; coordinates: unknown };
  }>,
): Promise<{ inserted: number; skipped: number }> {
  let inserted = 0;
  let skipped = 0;
  for (const row of rows) {
    try {
      const colCount = row.columns.length;
      await client.query(
        `INSERT INTO ${table} (planning_context_id, id, ${row.columnSql}, properties, geom, updated_at)
         VALUES ($1, $2, ${row.columns.map((_, i) => `$${i + 3}`).join(', ')}, $${colCount + 3}::jsonb,
                 ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($${colCount + 4}), 4326)), now())
         ON CONFLICT (planning_context_id, id) DO UPDATE SET
           ${row.updateSql},
           properties = EXCLUDED.properties,
           geom = EXCLUDED.geom,
           updated_at = now()`,
        [
          contextId,
          row.id,
          ...row.columns,
          JSON.stringify(row.properties),
          JSON.stringify(row.geometry),
        ],
      );
      inserted += 1;
    } catch {
      skipped += 1;
    }
  }
  return { inserted, skipped };
}

async function insertPointRows(
  client: PoolClient,
  table: string,
  contextId: string,
  rows: Array<{
    id: string;
    columns: unknown[];
    columnSql: string;
    updateSql: string;
    properties: Record<string, unknown>;
    geometry: { type: string; coordinates: unknown };
  }>,
): Promise<{ inserted: number; skipped: number }> {
  let inserted = 0;
  let skipped = 0;
  for (const row of rows) {
    try {
      const colCount = row.columns.length;
      await client.query(
        `INSERT INTO ${table} (planning_context_id, id, ${row.columnSql}, properties, geom, updated_at)
         VALUES ($1, $2, ${row.columns.map((_, i) => `$${i + 3}`).join(', ')}, $${colCount + 3}::jsonb,
                 ST_SetSRID(ST_GeomFromGeoJSON($${colCount + 4}), 4326), now())
         ON CONFLICT (planning_context_id, id) DO UPDATE SET
           ${row.updateSql},
           properties = EXCLUDED.properties,
           geom = EXCLUDED.geom,
           updated_at = now()`,
        [
          contextId,
          row.id,
          ...row.columns,
          JSON.stringify(row.properties),
          JSON.stringify(row.geometry),
        ],
      );
      inserted += 1;
    } catch {
      skipped += 1;
    }
  }
  return { inserted, skipped };
}

async function insertNormalizedFeatures(
  client: PoolClient,
  contextId: string,
  normalized: NormalizedPlanningLayers,
): Promise<PlanningContextFeatureCounts & { skipped: number }> {
  let skipped = normalized.skipped;
  await upsertExternalLayerMetadata(client, contextId);

  const sites = await insertPolygonRows(
    client,
    'parcels',
    contextId,
    normalized.sites.map((row) => ({
      id: row.id,
      columnSql:
        'parcel_id, name, zoning, current_use, development_score, area_sqm, status',
      updateSql: `parcel_id = EXCLUDED.parcel_id, name = EXCLUDED.name, zoning = EXCLUDED.zoning,
                  current_use = EXCLUDED.current_use, development_score = EXCLUDED.development_score,
                  area_sqm = EXCLUDED.area_sqm, status = EXCLUDED.status`,
      columns: [
        row.parcelId,
        row.name,
        row.zoning,
        row.currentUse,
        row.developmentScore,
        row.areaSqm,
        row.status,
      ],
      properties: row.properties,
      geometry: row.geometry,
    })),
  );
  skipped += sites.skipped;

  const landUse = await insertPolygonRows(
    client,
    'zoning_overlays',
    contextId,
    normalized.landUse.map((row) => ({
      id: row.id,
      columnSql: 'zone_code, zone_name, description',
      updateSql:
        'zone_code = EXCLUDED.zone_code, zone_name = EXCLUDED.zone_name, description = EXCLUDED.description',
      columns: [row.zoneCode, row.zoneName, row.description],
      properties: row.properties,
      geometry: row.geometry,
    })),
  );
  skipped += landUse.skipped;

  const constraints = await insertPolygonRows(
    client,
    'constraints',
    contextId,
    normalized.constraints.map((row) => ({
      id: row.id,
      columnSql: 'constraint_type, risk_level, description',
      updateSql:
        'constraint_type = EXCLUDED.constraint_type, risk_level = EXCLUDED.risk_level, description = EXCLUDED.description',
      columns: [row.constraintType, row.riskLevel, row.description],
      properties: row.properties,
      geometry: row.geometry,
    })),
  );
  skipped += constraints.skipped;

  const transit = await insertPointRows(
    client,
    'transit_points',
    contextId,
    normalized.transit.map((row) => ({
      id: row.id,
      columnSql: 'name, mode, distance_category',
      updateSql:
        'name = EXCLUDED.name, mode = EXCLUDED.mode, distance_category = EXCLUDED.distance_category',
      columns: [row.name, row.mode, row.distanceCategory],
      properties: row.properties,
      geometry: row.geometry,
    })),
  );
  skipped += transit.skipped;

  const activity = await insertPointRows(
    client,
    'development_activity',
    contextId,
    normalized.developmentActivity.map((row) => ({
      id: row.id,
      columnSql: 'project_name, status, application_type, lodged_month',
      updateSql:
        'project_name = EXCLUDED.project_name, status = EXCLUDED.status, application_type = EXCLUDED.application_type, lodged_month = EXCLUDED.lodged_month',
      columns: [row.projectName, row.status, row.applicationType, row.lodgedMonth],
      properties: row.properties,
      geometry: row.geometry,
    })),
  );
  skipped += activity.skipped;

  return {
    sites: sites.inserted,
    landUse: landUse.inserted,
    constraints: constraints.inserted,
    transit: transit.inserted,
    developmentActivity: activity.inserted,
    skipped,
  };
}

/**
 * Atomically replace context features and mark the context ready.
 * Redis cache must be invalidated by the caller only after this returns.
 *
 * When `manageTransaction` is false, the caller owns BEGIN/COMMIT so job
 * updates can share the same short transaction.
 */
export async function commitReadyExternalContext(input: {
  client: PoolClient;
  building: PlanningContext;
  normalized: NormalizedPlanningLayers;
  manageTransaction?: boolean;
}): Promise<PlanningContextFeatureCounts & { skipped: number; context: PlanningContext }> {
  const { client, building, normalized, manageTransaction = true } = input;
  const ready: PlanningContext = {
    ...building,
    status: 'ready',
    updatedAt: new Date().toISOString(),
  };

  if (manageTransaction) {
    await client.query('BEGIN');
  }
  try {
    await clearContextFeaturesOnClient(client, building.id);
    const counts = await insertNormalizedFeatures(client, building.id, normalized);
    await upsertContextRow(client, ready, null);
    if (manageTransaction) {
      await client.query('COMMIT');
    }
    return { ...counts, context: ready };
  } catch (error) {
    if (manageTransaction) {
      await client.query('ROLLBACK');
    }
    throw error;
  }
}

/** Mark context as building. Uses the caller's session client. */
export async function markPlanningContextBuilding(
  client: PoolClient,
  context: PlanningContext,
): Promise<void> {
  await upsertContextRow(client, { ...context, status: 'building' }, null);
}

export async function countContextFeatures(
  contextId: string,
  client?: PoolClient,
): Promise<PlanningContextFeatureCounts> {
  const db = client ?? getPool();
  const result = await db.query<{ key: string; n: number }>(
    `SELECT 'sites' AS key, count(*)::int AS n FROM parcels WHERE planning_context_id = $1
     UNION ALL SELECT 'landUse', count(*)::int FROM zoning_overlays WHERE planning_context_id = $1
     UNION ALL SELECT 'constraints', count(*)::int FROM constraints WHERE planning_context_id = $1
     UNION ALL SELECT 'transit', count(*)::int FROM transit_points WHERE planning_context_id = $1
     UNION ALL SELECT 'developmentActivity', count(*)::int FROM development_activity WHERE planning_context_id = $1`,
    [contextId],
  );
  const map = new Map(result.rows.map((row) => [row.key, row.n]));
  return {
    sites: map.get('sites') ?? 0,
    landUse: map.get('landUse') ?? 0,
    constraints: map.get('constraints') ?? 0,
    transit: map.get('transit') ?? 0,
    developmentActivity: map.get('developmentActivity') ?? 0,
  };
}

export { EXTERNAL_OSM_DISCLAIMER };
