import type {
  LayerSummary,
  PlanningLayerId,
  SearchResultItem,
} from '@sitelens/shared';
import { getPool } from './pool';
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
