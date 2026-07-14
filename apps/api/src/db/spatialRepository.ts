import type {
  GeoJsonMultiPolygon,
  GeoJsonPolygon,
  LayerSummary,
  PlanningLayerId,
  SearchResultItem,
  SpatialAnalysisResult,
} from '@sitelens/shared';
import { LOCAL_DEMO_SYDNEY_CONTEXT_ID } from '@sitelens/shared';
import { getPool } from './pool.js';
import { isDbConnectionError, LAYER_TABLE } from './sql.js';
import {
  rowToFeature,
  rowsToFeatureCollection,
  type FeatureRow,
  type GeoFeature,
} from './sql.js';
import { getFeatureSubtitle, getFeatureTitle } from '../lib/featureText.js';

const DEFAULT_SEARCH_LIMIT = 8;

/** Layer metadata plus feature counts for a planning context. */
export async function getLayers(
  planningContextId: string = LOCAL_DEMO_SYDNEY_CONTEXT_ID,
): Promise<LayerSummary[]> {
  const pool = getPool();

  const layersResult = await pool.query<{
    id: PlanningLayerId;
    label: string;
    description: string;
    geometry_type: LayerSummary['geometryType'];
  }>(
    `SELECT id, label, description, geometry_type
       FROM planning_layers
      WHERE planning_context_id = $1
      ORDER BY sort_order, id`,
    [planningContextId],
  );

  const countsResult = await pool.query<{ id: string; n: number }>(
    `SELECT 'parcels' AS id, count(*)::int AS n FROM parcels WHERE planning_context_id = $1
     UNION ALL SELECT 'zoning', count(*)::int FROM zoning_overlays WHERE planning_context_id = $1
     UNION ALL SELECT 'constraints', count(*)::int FROM constraints WHERE planning_context_id = $1
     UNION ALL SELECT 'transit', count(*)::int FROM transit_points WHERE planning_context_id = $1
     UNION ALL SELECT 'developmentActivity', count(*)::int FROM development_activity WHERE planning_context_id = $1`,
    [planningContextId],
  );
  const counts = new Map(countsResult.rows.map((row) => [row.id, row.n]));

  return layersResult.rows.map((row) => ({
    id: row.id,
    label: row.label,
    description: row.description,
    geometryType: row.geometry_type,
    featureCount: counts.get(row.id) ?? 0,
  }));
}

/** Layer GeoJSON FeatureCollection for a planning context. */
export async function getLayerFeatures(
  planningContextId: string,
  layerId: PlanningLayerId,
): Promise<{
  type: 'FeatureCollection';
  features: GeoFeature[];
}> {
  const table = LAYER_TABLE[layerId];
  if (!table) {
    throw new Error(`Unknown layer: ${layerId}`);
  }
  const pool = getPool();
  const result = await pool.query<FeatureRow>(
    `SELECT id, properties, ST_AsGeoJSON(geom)::json AS geometry
       FROM ${table}
      WHERE planning_context_id = $1
      ORDER BY id`,
    [planningContextId],
  );
  return rowsToFeatureCollection(result.rows);
}

/** All parcels for a planning context as a GeoJSON FeatureCollection. */
export async function getParcels(
  planningContextId: string = LOCAL_DEMO_SYDNEY_CONTEXT_ID,
): Promise<{
  type: 'FeatureCollection';
  features: GeoFeature[];
}> {
  return getLayerFeatures(planningContextId, 'parcels');
}

/** A single parcel by `id` or `parcel_id` within a planning context. */
export async function getParcelById(
  planningContextId: string,
  idOrParcelId: string,
): Promise<GeoFeature | null> {
  const pool = getPool();
  const result = await pool.query<FeatureRow>(
    `SELECT id, properties, ST_AsGeoJSON(geom)::json AS geometry
       FROM parcels
      WHERE planning_context_id = $1 AND (id = $2 OR parcel_id = $2)
      LIMIT 1`,
    [planningContextId, idOrParcelId],
  );
  const row = result.rows[0];
  return row ? rowToFeature(row) : null;
}

interface SearchTable {
  layerId: PlanningLayerId;
  table: string;
  columns: string[];
}

const SEARCH_TABLES: SearchTable[] = [
  { layerId: 'parcels', table: 'parcels', columns: ['name', 'parcel_id', 'zoning', 'current_use', 'status'] },
  { layerId: 'zoning', table: 'zoning_overlays', columns: ['zone_code', 'zone_name', 'description'] },
  { layerId: 'constraints', table: 'constraints', columns: ['constraint_type', 'risk_level', 'description'] },
  { layerId: 'transit', table: 'transit_points', columns: ['name', 'mode', 'distance_category'] },
  { layerId: 'developmentActivity', table: 'development_activity', columns: ['project_name', 'status', 'application_type'] },
];

interface SearchRow {
  id: string;
  properties: Record<string, unknown> | null;
  geometry: unknown;
  xmin: number;
  ymin: number;
  xmax: number;
  ymax: number;
}

/** Search across layers within a planning context. */
export async function searchFeatures(
  planningContextId: string,
  query: string,
  limit: number = DEFAULT_SEARCH_LIMIT,
): Promise<SearchResultItem[]> {
  const trimmed = query.trim();
  if (!trimmed) {
    return [];
  }

  const pool = getPool();
  const like = `%${trimmed}%`;
  const results: SearchResultItem[] = [];

  for (const source of SEARCH_TABLES) {
    if (results.length >= limit) {
      break;
    }
    const whereClause = source.columns
      .map((column) => `${column} ILIKE $2`)
      .join(' OR ');
    const result = await pool.query<SearchRow>(
      `SELECT id, properties,
              ST_AsGeoJSON(geom)::json AS geometry,
              ST_XMin(geom) AS xmin, ST_YMin(geom) AS ymin,
              ST_XMax(geom) AS xmax, ST_YMax(geom) AS ymax
         FROM ${source.table}
        WHERE planning_context_id = $1 AND (${whereClause})
        ORDER BY id
        LIMIT $3`,
      [planningContextId, like, limit],
    );

    for (const row of result.rows) {
      const props = row.properties ?? {};
      results.push({
        id: row.id,
        layerId: source.layerId,
        label: getFeatureTitle(source.layerId, props),
        subtitle: getFeatureSubtitle(source.layerId, props),
        properties: props,
        geometry: row.geometry,
        bbox: [
          Number(row.xmin),
          Number(row.ymin),
          Number(row.xmax),
          Number(row.ymax),
        ],
      });
      if (results.length >= limit) {
        break;
      }
    }
  }

  return results.slice(0, limit);
}

const TRANSIT_RADIUS_METERS = 1500;

export class InvalidGeometryError extends Error {
  constructor(message = 'Area geometry is invalid') {
    super(message);
    this.name = 'InvalidGeometryError';
  }
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * Run AOI spatial analysis against a single planning context only.
 */
export async function analyzeArea(
  planningContextId: string,
  geometry: GeoJsonPolygon | GeoJsonMultiPolygon,
): Promise<SpatialAnalysisResult> {
  const pool = getPool();
  const geomJson = JSON.stringify(geometry);

  let isValid = false;
  try {
    const validity = await pool.query<{ is_valid: boolean }>(
      `SELECT ST_IsValid(ST_SetSRID(ST_GeomFromGeoJSON($1), 4326)) AS is_valid`,
      [geomJson],
    );
    isValid = validity.rows[0]?.is_valid === true;
  } catch (error) {
    if (isDbConnectionError(error)) {
      throw error;
    }
    throw new InvalidGeometryError();
  }
  if (!isValid) {
    throw new InvalidGeometryError();
  }

  const inputCte = `WITH input AS (
      SELECT ST_SetSRID(ST_GeomFromGeoJSON($1), 4326) AS geom
    )`;

  const [summary, zoning, constraints, transit, devByStatus] =
    await Promise.all([
      pool.query<{
        area_sqm: string | number | null;
        parcel_count: number;
        avg_score: string | number | null;
        dev_count: number;
      }>(
        `${inputCte}
         SELECT
           ST_Area((SELECT geom FROM input)::geography) AS area_sqm,
           (SELECT count(*)::int FROM parcels p, input
             WHERE p.planning_context_id = $2 AND ST_Intersects(p.geom, input.geom)) AS parcel_count,
           (SELECT avg(p.development_score) FROM parcels p, input
             WHERE p.planning_context_id = $2 AND ST_Intersects(p.geom, input.geom)) AS avg_score,
           (SELECT count(*)::int FROM development_activity d, input
             WHERE d.planning_context_id = $2 AND ST_Intersects(d.geom, input.geom)) AS dev_count`,
        [geomJson, planningContextId],
      ),
      pool.query<{ zone_code: string; zone_name: string; count: number }>(
        `${inputCte}
         SELECT z.zone_code, z.zone_name, count(*)::int AS count
           FROM zoning_overlays z, input
          WHERE z.planning_context_id = $2 AND ST_Intersects(z.geom, input.geom)
          GROUP BY z.zone_code, z.zone_name
          ORDER BY count DESC, z.zone_code`,
        [geomJson, planningContextId],
      ),
      pool.query<{
        id: string;
        constraint_type: string;
        risk_level: string;
        description: string;
      }>(
        `${inputCte}
         SELECT c.id, c.constraint_type, c.risk_level, c.description
           FROM constraints c, input
          WHERE c.planning_context_id = $2 AND ST_Intersects(c.geom, input.geom)
          ORDER BY CASE lower(c.risk_level)
                     WHEN 'high' THEN 0 WHEN 'medium' THEN 1 WHEN 'low' THEN 2 ELSE 3
                   END, c.constraint_type`,
        [geomJson, planningContextId],
      ),
      pool.query<{
        id: string;
        name: string;
        mode: string;
        distance_meters: string | number;
      }>(
        `${inputCte},
         centroid AS (SELECT ST_Centroid((SELECT geom FROM input)) AS geom)
         SELECT t.id, t.name, t.mode,
                ST_Distance(t.geom::geography, (SELECT geom FROM centroid)::geography) AS distance_meters
           FROM transit_points t
          WHERE t.planning_context_id = $2
            AND ST_DWithin(t.geom::geography, (SELECT geom FROM centroid)::geography, $3)
          ORDER BY distance_meters ASC
          LIMIT 8`,
        [geomJson, planningContextId, TRANSIT_RADIUS_METERS],
      ),
      pool.query<{ status: string; count: number }>(
        `${inputCte}
         SELECT d.status, count(*)::int AS count
           FROM development_activity d, input
          WHERE d.planning_context_id = $2 AND ST_Intersects(d.geom, input.geom)
          GROUP BY d.status
          ORDER BY count DESC, d.status`,
        [geomJson, planningContextId],
      ),
    ]);

  const summaryRow = summary.rows[0];
  const areaSqm = Number(summaryRow?.area_sqm ?? 0);
  const avgScoreRaw = summaryRow?.avg_score;

  return {
    areaSqm: round(areaSqm, 2),
    areaHectares: round(areaSqm / 10000, 2),
    parcelCount: summaryRow?.parcel_count ?? 0,
    averageDevelopmentScore:
      avgScoreRaw === null || avgScoreRaw === undefined
        ? null
        : round(Number(avgScoreRaw), 1),
    zoningBreakdown: zoning.rows.map((row) => ({
      zoneCode: row.zone_code,
      zoneName: row.zone_name,
      count: row.count,
    })),
    intersectingConstraints: constraints.rows.map((row) => ({
      id: row.id,
      constraintType: row.constraint_type,
      riskLevel: row.risk_level,
      description: row.description,
    })),
    nearbyTransit: transit.rows.map((row) => ({
      id: row.id,
      name: row.name,
      mode: row.mode,
      distanceMeters: Math.round(Number(row.distance_meters)),
    })),
    developmentActivityCount: summaryRow?.dev_count ?? 0,
    developmentActivityByStatus: devByStatus.rows.map((row) => ({
      status: row.status,
      count: row.count,
    })),
    planningContextId,
  };
}
