import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import type { PoolClient } from 'pg';
import type { PlanningLayerId } from '@sitelens/shared';
import { getPool, closePool } from './pool';
import {
  assertFeatureCollection,
  resolveFeatureId,
  validateFeature,
  type IngestFeature,
} from './geojson';
import { LAYER_DEFS } from '../lib/layerConfig';

const DATA_DIR = fileURLToPath(new URL('../../data/', import.meta.url));

interface ColumnMap {
  column: string;
  prop: string;
}

interface IngestConfig {
  layerId: PlanningLayerId;
  table: string;
  file: string;
  geometryKind: 'polygon' | 'point';
  requiredProps: string[];
  columns: ColumnMap[];
}

const INGEST_CONFIGS: IngestConfig[] = [
  {
    layerId: 'parcels',
    table: 'parcels',
    file: 'parcels',
    geometryKind: 'polygon',
    requiredProps: ['parcelId', 'name', 'zoning', 'currentUse', 'status'],
    columns: [
      { column: 'parcel_id', prop: 'parcelId' },
      { column: 'name', prop: 'name' },
      { column: 'zoning', prop: 'zoning' },
      { column: 'current_use', prop: 'currentUse' },
      { column: 'development_score', prop: 'developmentScore' },
      { column: 'area_sqm', prop: 'areaSqm' },
      { column: 'status', prop: 'status' },
    ],
  },
  {
    layerId: 'zoning',
    table: 'zoning_overlays',
    file: 'zoning',
    geometryKind: 'polygon',
    requiredProps: ['zoneCode', 'zoneName', 'description'],
    columns: [
      { column: 'zone_code', prop: 'zoneCode' },
      { column: 'zone_name', prop: 'zoneName' },
      { column: 'description', prop: 'description' },
    ],
  },
  {
    layerId: 'constraints',
    table: 'constraints',
    file: 'constraints',
    geometryKind: 'polygon',
    requiredProps: ['constraintType', 'riskLevel', 'description'],
    columns: [
      { column: 'constraint_type', prop: 'constraintType' },
      { column: 'risk_level', prop: 'riskLevel' },
      { column: 'description', prop: 'description' },
    ],
  },
  {
    layerId: 'transit',
    table: 'transit_points',
    file: 'transit',
    geometryKind: 'point',
    requiredProps: ['name', 'mode', 'distanceCategory'],
    columns: [
      { column: 'name', prop: 'name' },
      { column: 'mode', prop: 'mode' },
      { column: 'distance_category', prop: 'distanceCategory' },
    ],
  },
  {
    layerId: 'developmentActivity',
    table: 'development_activity',
    file: 'development-activity',
    geometryKind: 'point',
    requiredProps: ['projectName', 'status', 'applicationType', 'lodgedMonth'],
    columns: [
      { column: 'project_name', prop: 'projectName' },
      { column: 'status', prop: 'status' },
      { column: 'application_type', prop: 'applicationType' },
      { column: 'lodged_month', prop: 'lodgedMonth' },
    ],
  },
];

interface LayerResult {
  layerId: PlanningLayerId;
  inserted: number;
  updated: number;
  skipped: number;
  failed: number;
}

async function upsertPlanningLayers(client: PoolClient): Promise<void> {
  for (const def of LAYER_DEFS) {
    await client.query(
      `INSERT INTO planning_layers (id, label, description, geometry_type, default_visible, sort_order, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, now())
       ON CONFLICT (id) DO UPDATE SET
         label = EXCLUDED.label,
         description = EXCLUDED.description,
         geometry_type = EXCLUDED.geometry_type,
         default_visible = EXCLUDED.default_visible,
         sort_order = EXCLUDED.sort_order,
         updated_at = now();`,
      [
        def.id,
        def.label,
        def.description,
        def.geometryType,
        def.defaultVisible,
        def.sortOrder,
      ],
    );
  }
  console.log(`planning_layers: upserted ${LAYER_DEFS.length} rows`);
}

function buildUpsertSql(config: IngestConfig): string {
  const insertCols = ['id', ...config.columns.map((c) => c.column)];
  // Value placeholders for id + mapped columns.
  const valuePlaceholders = insertCols.map((_, index) => `$${index + 1}`);
  const propsIndex = insertCols.length + 1;
  const geomIndex = insertCols.length + 2;
  const geomExpr =
    config.geometryKind === 'polygon'
      ? `ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($${geomIndex}), 4326))`
      : `ST_SetSRID(ST_GeomFromGeoJSON($${geomIndex}), 4326)`;

  const allCols = [...insertCols, 'properties', 'geom'];
  const allValues = [...valuePlaceholders, `$${propsIndex}::jsonb`, geomExpr];

  const updateAssignments = [
    ...config.columns.map((c) => `${c.column} = EXCLUDED.${c.column}`),
    'properties = EXCLUDED.properties',
    'geom = EXCLUDED.geom',
    'updated_at = now()',
  ];

  return `INSERT INTO ${config.table} (${allCols.join(', ')})
          VALUES (${allValues.join(', ')})
          ON CONFLICT (id) DO UPDATE SET ${updateAssignments.join(', ')}
          RETURNING (xmax = 0) AS inserted;`;
}

async function ingestLayer(
  client: PoolClient,
  config: IngestConfig,
  feature: IngestFeature,
  sql: string,
): Promise<'inserted' | 'updated'> {
  const props = feature.properties ?? {};
  const id = resolveFeatureId(feature);
  const columnValues = config.columns.map((c) => {
    const value = props[c.prop];
    return value === undefined ? null : value;
  });
  const params = [id, ...columnValues, JSON.stringify(props), JSON.stringify(feature.geometry)];
  const result = await client.query<{ inserted: boolean }>(sql, params);
  return result.rows[0]?.inserted ? 'inserted' : 'updated';
}

async function ingestFile(
  client: PoolClient,
  config: IngestConfig,
): Promise<LayerResult> {
  const filePath = path.join(DATA_DIR, `${config.file}.geojson`);
  let raw: string;
  try {
    raw = await readFile(filePath, 'utf8');
  } catch {
    throw new Error(`Required GeoJSON file missing: ${config.file}.geojson`);
  }
  const collection = assertFeatureCollection(JSON.parse(raw), config.file);
  const sql = buildUpsertSql(config);

  const result: LayerResult = {
    layerId: config.layerId,
    inserted: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
  };

  for (const feature of collection.features) {
    const validation = validateFeature(feature, config.requiredProps);
    if (!validation.ok) {
      result.failed += 1;
      console.warn(`  [${config.file}] invalid feature: ${validation.reason}`);
      continue;
    }
    if (!resolveFeatureId(feature)) {
      result.skipped += 1;
      console.warn(`  [${config.file}] skipped feature without id`);
      continue;
    }
    try {
      const outcome = await ingestLayer(client, config, feature, sql);
      result[outcome] += 1;
    } catch (error) {
      result.failed += 1;
      console.warn(
        `  [${config.file}] failed to upsert ${resolveFeatureId(feature)}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  console.log(
    `${config.table}: inserted ${result.inserted}, updated ${result.updated}, skipped ${result.skipped}, failed ${result.failed}`,
  );
  return result;
}

/** Ingest all mock GeoJSON datasets into PostGIS. Returns per-layer results. */
export async function ingestAll(): Promise<LayerResult[]> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await upsertPlanningLayers(client);
    const results: LayerResult[] = [];
    for (const config of INGEST_CONFIGS) {
      results.push(await ingestFile(client, config));
    }
    return results;
  } finally {
    client.release();
  }
}

const isMain =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  ingestAll()
    .then((results) => {
      const failed = results.reduce((sum, r) => sum + r.failed, 0);
      const total = results.reduce((sum, r) => sum + r.inserted + r.updated, 0);
      console.log(`Ingestion complete: ${total} rows, ${failed} failed.`);
      return closePool().then(() => process.exit(failed > 0 ? 1 : 0));
    })
    .catch((error) => {
      console.error(error);
      void closePool().finally(() => process.exit(1));
    });
}
