import type {
  ConstraintIntersection,
  DevelopmentActivitySummary,
  GeoJsonMultiPolygon,
  GeoJsonPolygon,
  LayerSummary,
  NearbyTransitItem,
  PlanningLayerId,
  SearchResultItem,
  SpatialAnalysisResult,
  ZoningBreakdownItem,
} from '@sitelens/shared';
import { getPool } from './pool';
import { isDbConnectionError } from './sql';
import {
  rowToFeature,
  rowsToFeatureCollection,
  type FeatureRow,
  type GeoFeature,
} from './sql';
import { getFeatureSubtitle, getFeatureTitle } from '../lib/featureText';

const DEFAULT_SEARCH_LIMIT = 8;

/** Layer metadata plus feature counts, from the database. */
export async function getLayers(): Promise<LayerSummary[]> {
  const pool = getPool();

  const layersResult = await pool.query<{
    id: PlanningLayerId;
    label: string;
    description: string;
    geometry_type: LayerSummary['geometryType'];
  }>(
    `SELECT id, label, description, geometry_type
       FROM planning_layers
      ORDER BY sort_order, id`,
  );

  const countsResult = await pool.query<{ id: string; n: number }>(
    `SELECT 'parcels' AS id, count(*)::int AS n FROM parcels
     UNION ALL SELECT 'zoning', count(*)::int FROM zoning_overlays
     UNION ALL SELECT 'constraints', count(*)::int FROM constraints
     UNION ALL SELECT 'transit', count(*)::int FROM transit_points
     UNION ALL SELECT 'developmentActivity', count(*)::int FROM development_activity`,
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

/** All parcels as a GeoJSON FeatureCollection. */
export async function getParcels(): Promise<{
  type: 'FeatureCollection';
  features: GeoFeature[];
}> {
  const pool = getPool();
  const result = await pool.query<FeatureRow>(
    `SELECT id, properties, ST_AsGeoJSON(geom)::json AS geometry
       FROM parcels
      ORDER BY id`,
  );
  return rowsToFeatureCollection(result.rows);
}

/** A single parcel by `id` or `parcel_id`, or `null` if not found. */
export async function getParcelById(
  idOrParcelId: string,
): Promise<GeoFeature | null> {
  const pool = getPool();
  const result = await pool.query<FeatureRow>(
    `SELECT id, properties, ST_AsGeoJSON(geom)::json AS geometry
       FROM parcels
      WHERE id = $1 OR parcel_id = $1
      LIMIT 1`,
    [idOrParcelId],
  );
  const row = result.rows[0];
  return row ? rowToFeature(row) : null;
}

interface SearchTable {
  layerId: PlanningLayerId;
  table: string;
  /** Columns to match with ILIKE. */
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

/** Search across all layers with ILIKE; returns up to `limit` results. */
export async function searchFeatures(
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
      .map((column) => `${column} ILIKE $1`)
      .join(' OR ');
    const result = await pool.query<SearchRow>(
      `SELECT id, properties,
              ST_AsGeoJSON(geom)::json AS geometry,
              ST_XMin(geom) AS xmin, ST_YMin(geom) AS ymin,
              ST_XMax(geom) AS xmax, ST_YMax(geom) AS ymax
         FROM ${source.table}
        WHERE ${whereClause}
        ORDER BY id
        LIMIT $2`,
      [like, limit],
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

/** Radius (meters) around the AOI centroid used for "nearby" transit. */
const TRANSIT_RADIUS_METERS = 1500;

/** Thrown when the supplied AOI geometry is not valid. */
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
 * Run the full AOI spatial analysis in PostGIS.
 *
 * Validates the geometry (`ST_IsValid`), computes area with `::geography`, and
 * uses `ST_Intersects` / `ST_DWithin` for parcel, zoning, constraint, transit,
 * and development-activity analysis. Throws `InvalidGeometryError` for invalid
 * input; connection errors propagate (handled as 503 by the route).
 */
export async function analyzeArea(
  geometry: GeoJsonPolygon | GeoJsonMultiPolygon,
): Promise<SpatialAnalysisResult> {
  const pool = getPool();
  const geomJson = JSON.stringify(geometry);

  // Validate first; a parse failure or invalid geometry becomes a clean 400.
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
           (SELECT count(*)::int FROM parcels p, input WHERE ST_Intersects(p.geom, input.geom)) AS parcel_count,
           (SELECT avg(p.development_score) FROM parcels p, input WHERE ST_Intersects(p.geom, input.geom)) AS avg_score,
           (SELECT count(*)::int FROM development_activity d, input WHERE ST_Intersects(d.geom, input.geom)) AS dev_count`,
        [geomJson],
      ),
      pool.query<{ zone_code: string; zone_name: string; count: number }>(
        `${inputCte}
         SELECT z.zone_code, z.zone_name, count(*)::int AS count
           FROM zoning_overlays z, input
          WHERE ST_Intersects(z.geom, input.geom)
          GROUP BY z.zone_code, z.zone_name
          ORDER BY count DESC, z.zone_code`,
        [geomJson],
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
          WHERE ST_Intersects(c.geom, input.geom)
          ORDER BY CASE lower(c.risk_level)
                     WHEN 'high' THEN 0 WHEN 'medium' THEN 1 WHEN 'low' THEN 2 ELSE 3
                   END, c.constraint_type`,
        [geomJson],
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
          WHERE ST_DWithin(t.geom::geography, (SELECT geom FROM centroid)::geography, $2)
          ORDER BY distance_meters ASC
          LIMIT 8`,
        [geomJson, TRANSIT_RADIUS_METERS],
      ),
      pool.query<{ status: string; count: number }>(
        `${inputCte}
         SELECT d.status, count(*)::int AS count
           FROM development_activity d, input
          WHERE ST_Intersects(d.geom, input.geom)
          GROUP BY d.status
          ORDER BY count DESC, d.status`,
        [geomJson],
      ),
    ]);

  const summaryRow = summary.rows[0];
  const areaSqm = Number(summaryRow?.area_sqm ?? 0);
  const avgScoreRaw = summaryRow?.avg_score;

  const zoningBreakdown: ZoningBreakdownItem[] = zoning.rows.map((row) => ({
    zoneCode: row.zone_code,
    zoneName: row.zone_name,
    count: row.count,
  }));

  const intersectingConstraints: ConstraintIntersection[] = constraints.rows.map(
    (row) => ({
      id: row.id,
      constraintType: row.constraint_type,
      riskLevel: row.risk_level,
      description: row.description,
    }),
  );

  const nearbyTransit: NearbyTransitItem[] = transit.rows.map((row) => ({
    id: row.id,
    name: row.name,
    mode: row.mode,
    distanceMeters: Math.round(Number(row.distance_meters)),
  }));

  const developmentActivityByStatus: DevelopmentActivitySummary[] =
    devByStatus.rows.map((row) => ({ status: row.status, count: row.count }));

  return {
    areaSqm: round(areaSqm, 2),
    areaHectares: round(areaSqm / 10000, 2),
    parcelCount: summaryRow?.parcel_count ?? 0,
    averageDevelopmentScore:
      avgScoreRaw === null || avgScoreRaw === undefined
        ? null
        : round(Number(avgScoreRaw), 1),
    zoningBreakdown,
    intersectingConstraints,
    nearbyTransit,
    developmentActivityCount: summaryRow?.dev_count ?? 0,
    developmentActivityByStatus,
  };
}
