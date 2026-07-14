import { createHash } from 'node:crypto';
import type { ContextBbox } from './externalDataTypes';

/** Approx. half-size (degrees) for a ~2.5 km fallback box near the equator. */
const FALLBACK_HALF_DEG = 0.022;

export class BboxTooLargeError extends Error {
  readonly code = 'BBOX_TOO_LARGE';
  constructor(message = 'Selected place bbox is too large for external context fetch.') {
    super(message);
    this.name = 'BboxTooLargeError';
  }
}

/** Convert Nominatim `[south, north, west, east]` → `[west, south, east, north]`. */
export function nominatimBoxToContextBbox(
  boundingBox: [number, number, number, number],
): ContextBbox {
  const [south, north, west, east] = boundingBox;
  return [west, south, east, north];
}

export function bboxAreaDeg2(bbox: ContextBbox): number {
  const [west, south, east, north] = bbox;
  return Math.abs(east - west) * Math.abs(north - south);
}

/** Small bbox centered on a lon/lat point. */
export function fallbackBboxAroundCenter(
  longitude: number,
  latitude: number,
  halfDeg: number = FALLBACK_HALF_DEG,
): ContextBbox {
  return [
    longitude - halfDeg,
    latitude - halfDeg,
    longitude + halfDeg,
    latitude + halfDeg,
  ];
}

/**
 * Derive a safe Overpass bbox from a selected place.
 *
 * Uses the place bounding box when small enough; otherwise clamps to a
 * city-center box around the place center. Throws when the clamped area is
 * still above `maxAreaDeg2`.
 */
export function deriveContextBbox(input: {
  longitude: number;
  latitude: number;
  boundingBox?: [number, number, number, number];
  maxAreaDeg2: number;
}): ContextBbox {
  let bbox: ContextBbox;
  if (input.boundingBox) {
    bbox = nominatimBoxToContextBbox(input.boundingBox);
    if (bboxAreaDeg2(bbox) > input.maxAreaDeg2) {
      bbox = fallbackBboxAroundCenter(input.longitude, input.latitude);
    }
  } else {
    bbox = fallbackBboxAroundCenter(input.longitude, input.latitude);
  }

  if (bboxAreaDeg2(bbox) > input.maxAreaDeg2) {
    throw new BboxTooLargeError(
      `Unable to clamp place bbox under area limit ${input.maxAreaDeg2} deg². Try a smaller city or area.`,
    );
  }
  return bbox;
}

/** Slug suitable for context ids (lowercase, hyphenated, truncated). */
export function slugifyPlaceLabel(label: string): string {
  const slug = label
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 48);
  return slug.length > 0 ? slug : 'place';
}

/** Short fingerprint of provider + place + bbox for stable context ids. */
export function contextIdFingerprint(input: {
  provider: string;
  placeId: string;
  bbox: ContextBbox;
}): string {
  const payload = `${input.provider}|${input.placeId}|${input.bbox.map((n) => n.toFixed(5)).join(',')}`;
  return createHash('sha256').update(payload).digest('hex').slice(0, 12);
}

export function buildExternalContextId(input: {
  label: string;
  provider: string;
  placeId: string;
  bbox: ContextBbox;
}): string {
  const slug = slugifyPlaceLabel(input.label);
  const hash = contextIdFingerprint({
    provider: input.provider,
    placeId: input.placeId,
    bbox: input.bbox,
  });
  return `external-osm:${slug}:${hash}`;
}
