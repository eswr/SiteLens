import { describe, expect, it } from 'vitest';
import type { SpatialAnalysisResult } from '@sitelens/shared';
import { generatePlanningSummary } from './generatePlanningSummary.js';

const richResult: SpatialAnalysisResult = {
  areaSqm: 120000,
  areaHectares: 12,
  parcelCount: 4,
  averageDevelopmentScore: 82,
  zoningBreakdown: [
    { zoneCode: 'R1', zoneName: 'General Residential', count: 3 },
    { zoneCode: 'B4', zoneName: 'Mixed Use', count: 1 },
  ],
  intersectingConstraints: [
    { id: 'c1', constraintType: 'Flood', riskLevel: 'high', description: 'x' },
  ],
  nearbyTransit: [
    { id: 't1', name: 'Central', mode: 'train', distanceMeters: 200 },
    { id: 't2', name: 'Town Hall', mode: 'train', distanceMeters: 500 },
    { id: 't3', name: 'Bus 1', mode: 'bus', distanceMeters: 700 },
  ],
  developmentActivityCount: 2,
  developmentActivityByStatus: [
    { status: 'Approved', count: 1 },
    { status: 'Lodged', count: 1 },
  ],
};

const emptyResult: SpatialAnalysisResult = {
  areaSqm: 5000,
  areaHectares: 0.5,
  parcelCount: 0,
  averageDevelopmentScore: null,
  zoningBreakdown: [],
  intersectingConstraints: [],
  nearbyTransit: [],
  developmentActivityCount: 0,
  developmentActivityByStatus: [],
};

describe('generatePlanningSummary', () => {
  it('produces the full deterministic shape with source metrics', () => {
    const summary = generatePlanningSummary({ analysisResult: richResult });
    expect(summary.executiveSummary).toContain('strong indicative');
    expect(summary.sections).toHaveLength(5);
    expect(summary.recommendedNextChecks.length).toBeGreaterThan(0);
    expect(summary.dataCaveats.length).toBeGreaterThan(0);
    expect(summary.dataCaveats.some((c) => /synthetic portfolio/i.test(c))).toBe(
      true,
    );
    expect(summary.sourceMetrics).toEqual({
      areaHectares: 12,
      parcelCount: 4,
      averageDevelopmentScore: 82,
      constraintCount: 1,
      nearbyTransitCount: 3,
      developmentActivityCount: 2,
    });
  });

  it('uses an external-context caveat when source is external-osm', () => {
    const summary = generatePlanningSummary({
      analysisResult: richResult,
      context: {
        planningContextId: 'external-osm:bengaluru:abc',
        planningContextSource: 'external-osm',
        label: 'Bengaluru external context',
      },
    });
    expect(
      summary.dataCaveats.some((c) => /external open map context/i.test(c)),
    ).toBe(true);
  });

  it('flags a high-risk constraint as risk severity', () => {
    const summary = generatePlanningSummary({ analysisResult: richResult });
    const constraints = summary.sections.find(
      (s) => s.title === 'Constraints & risk',
    );
    expect(constraints?.severity).toBe('risk');
  });

  it('is deterministic aside from the timestamp', () => {
    const a = generatePlanningSummary({ analysisResult: richResult });
    const b = generatePlanningSummary({ analysisResult: richResult });
    expect({ ...a, generatedAt: '' }).toEqual({ ...b, generatedAt: '' });
  });

  it('handles an empty result with neutral development potential', () => {
    const summary = generatePlanningSummary({ analysisResult: emptyResult });
    const dev = summary.sections.find(
      (s) => s.title === 'Development potential',
    );
    expect(dev?.severity).toBe('neutral');
    expect(summary.sourceMetrics.parcelCount).toBe(0);
  });
});
