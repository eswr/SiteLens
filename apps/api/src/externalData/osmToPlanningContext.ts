import type { ExternalFeature } from './externalDataTypes.js';
import type {
  NormalizedActivityRow,
  NormalizedConstraintRow,
  NormalizedOverlayRow,
  NormalizedPlanningLayers,
  NormalizedSiteRow,
  NormalizedTransitRow,
} from './externalDataTypes.js';

const MAJOR_HIGHWAYS = new Set([
  'motorway',
  'trunk',
  'primary',
  'secondary',
  'motorway_link',
  'trunk_link',
  'primary_link',
]);

function isPolygonish(geometry: { type: string }): boolean {
  return geometry.type === 'Polygon' || geometry.type === 'MultiPolygon';
}

function isPoint(geometry: { type: string }): boolean {
  return geometry.type === 'Point';
}

function landuseLabel(tags: Record<string, string>): {
  zoneCode: string;
  zoneName: string;
} {
  const landuse = (tags.landuse ?? '').toLowerCase();
  if (landuse === 'commercial' || landuse === 'retail') {
    return { zoneCode: 'commercial-context', zoneName: 'Commercial Context' };
  }
  if (landuse === 'residential') {
    return { zoneCode: 'residential-context', zoneName: 'Residential Context' };
  }
  if (landuse === 'industrial') {
    return { zoneCode: 'industrial-context', zoneName: 'Industrial Context' };
  }
  if (tags.leisure === 'park' || landuse === 'grass' || landuse === 'recreation_ground') {
    return { zoneCode: 'open-space', zoneName: 'Open Space' };
  }
  if (tags.natural === 'water' || landuse === 'basin' || landuse === 'reservoir') {
    return { zoneCode: 'water-body', zoneName: 'Water Body' };
  }
  return { zoneCode: 'context-overlay', zoneName: 'Context Overlay' };
}

function heuristicScore(tags: Record<string, string>): number {
  let score = 55;
  const building = (tags.building ?? '').toLowerCase();
  if (['commercial', 'retail', 'office', 'yes'].includes(building)) score += 15;
  if (['apartments', 'residential'].includes(building)) score += 8;
  if (tags.amenity) score += 5;
  if (tags.construction) score += 12;
  return Math.min(95, Math.max(20, score));
}

function lineEnvelope(
  coordinates: number[][],
): { type: 'Polygon'; coordinates: number[][][] } | null {
  if (coordinates.length < 2) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of coordinates) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  if (!Number.isFinite(minX) || minX === maxX || minY === maxY) {
    // Degenerate — expand slightly.
    const pad = 0.00015;
    minX -= pad;
    maxX += pad;
    minY -= pad;
    maxY += pad;
  } else {
    const pad = 0.00008;
    minX -= pad;
    maxX += pad;
    minY -= pad;
    maxY += pad;
  }
  return {
    type: 'Polygon',
    coordinates: [
      [
        [minX, minY],
        [maxX, minY],
        [maxX, maxY],
        [minX, maxY],
        [minX, minY],
      ],
    ],
  };
}

function asPolygonGeometry(
  geometry: ExternalFeature['geometry'],
): ExternalFeature['geometry'] | null {
  if (isPolygonish(geometry)) return geometry;
  if (geometry.type === 'LineString' && Array.isArray(geometry.coordinates)) {
    return lineEnvelope(geometry.coordinates as number[][]);
  }
  return null;
}

/**
 * Convert OSM/Overpass features into SiteLens layer rows.
 *
 * Mapping is intentionally honest: buildings → candidate sites, landuse →
 * context overlays, water/parks/major roads → context constraints, etc.
 */
export function osmToPlanningContext(
  features: ExternalFeature[],
): NormalizedPlanningLayers {
  const sites: NormalizedSiteRow[] = [];
  const landUse: NormalizedOverlayRow[] = [];
  const constraints: NormalizedConstraintRow[] = [];
  const transit: NormalizedTransitRow[] = [];
  const developmentActivity: NormalizedActivityRow[] = [];
  let skipped = 0;
  let siteIndex = 0;

  const MONTH = new Date().toISOString().slice(0, 7);

  for (const feature of features) {
    const tags = feature.tags;
    const name = feature.name;

    if (feature.kind === 'building') {
      const geom = asPolygonGeometry(feature.geometry);
      if (!geom) {
        skipped += 1;
        continue;
      }
      siteIndex += 1;
      const building = tags.building || 'yes';
      sites.push({
        id: feature.id,
        parcelId: `OSM-${feature.id.replace(/^osm-/, '')}`,
        name:
          name ||
          (building !== 'yes' ? `${building} building` : `Candidate Site ${siteIndex}`),
        zoning: 'External Context',
        currentUse: tags.amenity || tags.shop || building || 'Unknown',
        developmentScore: heuristicScore(tags),
        areaSqm: null,
        status: 'External Context',
        properties: {
          id: feature.id,
          source: 'osm-overpass',
          kind: 'building',
          tags,
        },
        geometry: geom,
      });
      continue;
    }

    if (feature.kind === 'landuse' || feature.kind === 'park' || feature.kind === 'water') {
      const geom = asPolygonGeometry(feature.geometry);
      if (!geom) {
        skipped += 1;
        continue;
      }
      const { zoneCode, zoneName } = landuseLabel({
        ...tags,
        leisure: feature.kind === 'park' ? tags.leisure || 'park' : tags.leisure,
        natural: feature.kind === 'water' ? tags.natural || 'water' : tags.natural,
      });
      landUse.push({
        id: `${feature.id}-landuse`,
        zoneCode,
        zoneName,
        description: name
          ? `${zoneName}: ${name}`
          : `Open-map ${zoneName.toLowerCase()} overlay (not official zoning).`,
        properties: {
          id: `${feature.id}-landuse`,
          source: 'osm-overpass',
          kind: feature.kind,
          tags,
        },
        geometry: geom,
      });

      if (feature.kind === 'water' || feature.kind === 'park') {
        constraints.push({
          id: `${feature.id}-constraint`,
          constraintType:
            feature.kind === 'water' ? 'Environmental / Water Edge' : 'Open Space Constraint',
          riskLevel: feature.kind === 'water' ? 'medium' : 'low',
          description: name
            ? `${feature.kind} context: ${name}`
            : `Open-map ${feature.kind} context constraint.`,
          properties: {
            id: `${feature.id}-constraint`,
            source: 'osm-overpass',
            kind: feature.kind,
            tags,
          },
          geometry: geom,
        });
      }
      continue;
    }

    if (feature.kind === 'road') {
      const highway = (tags.highway ?? '').toLowerCase();
      if (!MAJOR_HIGHWAYS.has(highway)) {
        skipped += 1;
        continue;
      }
      const geom = asPolygonGeometry(feature.geometry);
      if (!geom) {
        skipped += 1;
        continue;
      }
      constraints.push({
        id: `${feature.id}-corridor`,
        constraintType: 'Movement Corridor',
        riskLevel: highway === 'motorway' || highway === 'trunk' ? 'medium' : 'low',
        description: name
          ? `Major road corridor: ${name}`
          : `Major ${highway} corridor (open-map context).`,
        properties: {
          id: `${feature.id}-corridor`,
          source: 'osm-overpass',
          kind: 'road',
          tags,
        },
        geometry: geom,
      });
      continue;
    }

    if (feature.kind === 'transit' && isPoint(feature.geometry)) {
      const mode =
        tags.railway === 'station' || tags.station === 'subway'
          ? 'metro'
          : tags.amenity === 'bus_station'
            ? 'bus'
            : tags.public_transport || 'transit';
      transit.push({
        id: feature.id,
        name: name || `${mode} stop`,
        mode,
        distanceCategory: 'walkable',
        properties: {
          id: feature.id,
          source: 'osm-overpass',
          kind: 'transit',
          tags,
        },
        geometry: feature.geometry,
      });
      continue;
    }

    if (feature.kind === 'construction') {
      const geom =
        asPolygonGeometry(feature.geometry) ??
        (isPoint(feature.geometry) ? feature.geometry : null);
      if (!geom) {
        skipped += 1;
        continue;
      }
      constraints.push({
        id: `${feature.id}-construction-constraint`,
        constraintType: 'Construction Activity Context',
        riskLevel: 'medium',
        description: name
          ? `Construction context: ${name}`
          : 'Open-map construction activity proxy (not an official DA).',
        properties: {
          id: `${feature.id}-construction-constraint`,
          source: 'osm-overpass',
          kind: 'construction',
          tags,
        },
        geometry: isPolygonish(geom) || geom.type === 'LineString'
          ? (asPolygonGeometry(geom) ?? geom)
          : geom,
      });

      const activityGeom =
        geom.type === 'Point'
          ? geom
          : {
              type: 'Point',
              coordinates: centroidOf(geom),
            };
      if (activityGeom.coordinates) {
        developmentActivity.push({
          id: `${feature.id}-activity`,
          projectName: name || 'Construction activity proxy',
          status: 'External Proxy',
          applicationType: 'construction',
          lodgedMonth: MONTH,
          properties: {
            id: `${feature.id}-activity`,
            source: 'osm-overpass',
            kind: 'construction',
            note: 'Activity proxy from open map data — not an official development application.',
            tags,
          },
          geometry: activityGeom,
        });
      }
      continue;
    }

    if (feature.kind === 'amenity' && isPoint(feature.geometry)) {
      const amenity = (tags.amenity ?? '').toLowerCase();
      const notable = [
        'townhall',
        'university',
        'hospital',
        'marketplace',
        'conference_centre',
        'community_centre',
        'parking',
        'ferry_terminal',
      ];
      if (!notable.includes(amenity) && !name) {
        skipped += 1;
        continue;
      }
      developmentActivity.push({
        id: `${feature.id}-amenity`,
        projectName: name || `${amenity} amenity`,
        status: 'External Proxy',
        applicationType: amenity || 'amenity',
        lodgedMonth: MONTH,
        properties: {
          id: `${feature.id}-amenity`,
          source: 'osm-overpass',
          kind: 'amenity',
          note: 'Major amenity / POI proxy — not an official development application.',
          tags,
        },
        geometry: feature.geometry,
      });
      continue;
    }

    skipped += 1;
  }

  // Cap very dense extracts so ingestion stays demo-sized.
  const cappedSites = sites.slice(0, 120);
  const cappedLandUse = landUse.slice(0, 80);
  const cappedConstraints = constraints.slice(0, 80);
  const cappedTransit = transit.slice(0, 40);
  const cappedActivity = developmentActivity.slice(0, 40);
  skipped +=
    sites.length -
    cappedSites.length +
    (landUse.length - cappedLandUse.length) +
    (constraints.length - cappedConstraints.length) +
    (transit.length - cappedTransit.length) +
    (developmentActivity.length - cappedActivity.length);

  return {
    sites: cappedSites,
    landUse: cappedLandUse,
    constraints: cappedConstraints,
    transit: cappedTransit,
    developmentActivity: cappedActivity,
    skipped,
  };
}

function centroidOf(geometry: {
  type: string;
  coordinates: unknown;
}): [number, number] | null {
  if (geometry.type === 'Point' && Array.isArray(geometry.coordinates)) {
    const [lng, lat] = geometry.coordinates as number[];
    return Number.isFinite(lng) && Number.isFinite(lat) ? [lng, lat] : null;
  }
  if (geometry.type === 'Polygon' && Array.isArray(geometry.coordinates)) {
    const ring = (geometry.coordinates as number[][][])[0] ?? [];
    if (ring.length === 0) return null;
    let sx = 0;
    let sy = 0;
    let n = 0;
    for (const [x, y] of ring) {
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      sx += x;
      sy += y;
      n += 1;
    }
    return n > 0 ? [sx / n, sy / n] : null;
  }
  return null;
}
