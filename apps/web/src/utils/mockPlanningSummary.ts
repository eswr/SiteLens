import type { SpatialAnalysisResult } from '../types/analysis';
import type {
  PlanningSummary,
  PlanningSummarySection,
} from '../types/aiSummary';

type ScoreBand = 'none' | 'low' | 'moderate' | 'high';

function scoreBandFor(score: number | null): ScoreBand {
  if (score === null) return 'none';
  if (score >= 70) return 'high';
  if (score >= 40) return 'moderate';
  return 'low';
}

function plural(count: number, singular: string, pluralForm?: string): string {
  return count === 1 ? singular : (pluralForm ?? `${singular}s`);
}

function developmentPotentialSection(
  band: ScoreBand,
  score: number | null,
  parcelCount: number,
  transitCount: number,
): PlanningSummarySection {
  if (band === 'none') {
    return {
      title: 'Development potential',
      severity: 'neutral',
      body: 'No parcels intersect the area, so an indicative development score could not be derived. Adjust the area to overlap mapped parcels for a potential read.',
    };
  }
  const across = `across ${parcelCount} ${plural(parcelCount, 'parcel')}`;
  const transitClause =
    transitCount > 0
      ? ` Proximity to ${transitCount} transit ${plural(transitCount, 'option')} within 1.5 km reinforces accessibility-led uplift potential.`
      : ' Limited nearby transit may temper accessibility-led uplift.';

  if (band === 'high') {
    return {
      title: 'Development potential',
      severity: 'positive',
      body: `An average development score of ${score} ${across} indicates strong indicative uplift potential in this demo dataset.${transitClause}`,
    };
  }
  if (band === 'moderate') {
    return {
      title: 'Development potential',
      severity: 'neutral',
      body: `An average development score of ${score} ${across} suggests moderate indicative potential; outcomes would depend on site-specific feasibility.${transitClause}`,
    };
  }
  return {
    title: 'Development potential',
    severity: 'warning',
    body: `A low average development score of ${score} ${across} points to limited indicative potential; any uplift case would need careful site-specific justification.`,
  };
}

function constraintSection(
  constraints: SpatialAnalysisResult['intersectingConstraints'],
): PlanningSummarySection {
  const highRisk = constraints.filter(
    (constraint) => constraint.riskLevel.toLowerCase() === 'high',
  );
  const types = constraints.map((constraint) => constraint.constraintType);
  const typeList = types.join(', ');

  if (constraints.length === 0) {
    return {
      title: 'Constraints & risk',
      severity: 'positive',
      body: 'No mapped planning constraints intersect the area in this dataset. Confirm against authoritative overlays before relying on this.',
    };
  }
  if (highRisk.length > 0) {
    return {
      title: 'Constraints & risk',
      severity: 'risk',
      body: `${constraints.length} ${plural(constraints.length, 'constraint')} intersect the area (${typeList}), including ${highRisk.length} high-risk (${highRisk
        .map((constraint) => constraint.constraintType)
        .join(', ')}). These would likely trigger additional assessment and may limit developable extent.`,
    };
  }
  return {
    title: 'Constraints & risk',
    severity: 'warning',
    body: `${constraints.length} ${plural(constraints.length, 'constraint')} intersect the area (${typeList}). None are high-risk, but each warrants review during due diligence.`,
  };
}

function transitSection(
  transit: SpatialAnalysisResult['nearbyTransit'],
): PlanningSummarySection {
  if (transit.length === 0) {
    return {
      title: 'Transit & accessibility',
      severity: 'warning',
      body: 'No transit stops fall within 1.5 km of the area centroid in this dataset, which may weaken accessibility-based planning arguments.',
    };
  }
  const nearest = transit[0];
  if (transit.length >= 3) {
    return {
      title: 'Transit & accessibility',
      severity: 'positive',
      body: `Well served by ${transit.length} transit ${plural(transit.length, 'stop')} within 1.5 km, the nearest being ${nearest.name} (${nearest.mode}) about ${nearest.distanceMeters} m away.`,
    };
  }
  return {
    title: 'Transit & accessibility',
    severity: 'neutral',
    body: `Modest transit coverage: ${transit.length} ${plural(transit.length, 'stop')} within 1.5 km, nearest ${nearest.name} (${nearest.mode}) about ${nearest.distanceMeters} m away.`,
  };
}

function zoningSection(
  zoning: SpatialAnalysisResult['zoningBreakdown'],
): PlanningSummarySection {
  if (zoning.length === 0) {
    return {
      title: 'Zoning & land use',
      severity: 'neutral',
      body: 'No zoning overlays intersect the area in this dataset.',
    };
  }
  const codes = zoning.map((zone) => zone.zoneCode).join(', ');
  if (zoning.length >= 3) {
    return {
      title: 'Zoning & land use',
      severity: 'warning',
      body: `Mixed zoning across ${zoning.length} zones (${codes}) adds planning complexity, as permissibility and controls vary parcel-by-parcel.`,
    };
  }
  return {
    title: 'Zoning & land use',
    severity: 'neutral',
    body: `Relatively consistent zoning (${codes}), which tends to simplify permissibility assessment.`,
  };
}

function activitySection(
  count: number,
  byStatus: SpatialAnalysisResult['developmentActivityByStatus'],
): PlanningSummarySection {
  if (count === 0) {
    return {
      title: 'Development activity',
      severity: 'neutral',
      body: 'No recent development applications are recorded within the area in this dataset.',
    };
  }
  const statusText = byStatus
    .map((item) => `${item.count} ${item.status.toLowerCase()}`)
    .join(', ');
  return {
    title: 'Development activity',
    severity: 'neutral',
    body: `${count} development ${plural(count, 'application')} recorded in-area (${statusText}), indicating active planning interest nearby that may inform precedent and market context.`,
  };
}

function buildExecutiveSummary(
  band: ScoreBand,
  constraintCount: number,
  highRiskCount: number,
  transitCount: number,
  activityCount: number,
): string {
  const potential =
    band === 'high'
      ? 'shows strong indicative development potential'
      : band === 'moderate'
        ? 'shows moderate indicative development potential'
        : band === 'low'
          ? 'shows limited indicative development potential'
          : 'has no parcel-based development score available';

  const risk =
    highRiskCount > 0
      ? ` It carries elevated constraint risk (${highRiskCount} high-risk ${plural(highRiskCount, 'overlay')}), which should be resolved early.`
      : constraintCount > 0
        ? ` A small number of manageable constraints (${constraintCount}) apply.`
        : ' No mapped constraints currently apply.';

  const access =
    transitCount > 0
      ? ` Accessibility is supported by ${transitCount} nearby transit ${plural(transitCount, 'option')}.`
      : ' Nearby transit coverage is limited.';

  const activity =
    activityCount > 0
      ? ` Recent development activity (${activityCount} ${plural(activityCount, 'application')}) signals active planning interest.`
      : '';

  return `This area ${potential}.${risk}${access}${activity}`;
}

function buildNextChecks(result: SpatialAnalysisResult): string[] {
  const checks: string[] = [
    'Confirm current zoning controls and permissible uses with the relevant consent authority.',
    'Verify parcel boundaries and areas against authoritative cadastral data.',
  ];
  if (result.intersectingConstraints.length > 0) {
    checks.push(
      `Review intersecting constraint overlays (${result.intersectingConstraints
        .map((constraint) => constraint.constraintType)
        .join(', ')}) and any required specialist assessments.`,
    );
  }
  if (result.nearbyTransit.length > 0) {
    checks.push(
      'Validate transit distances and service frequency before relying on accessibility claims.',
    );
  }
  if (result.developmentActivityCount > 0) {
    checks.push(
      'Check the status and conditions of nearby development applications for precedent.',
    );
  }
  if (result.averageDevelopmentScore !== null && result.averageDevelopmentScore >= 70) {
    checks.push(
      'Commission a site-specific feasibility study before acting on indicative potential.',
    );
  }
  return checks;
}

/**
 * Deterministically generate a planning-style summary from analysis metrics.
 *
 * Pure function, no external calls: the same `result` always yields the same
 * text (aside from the `generatedAt` timestamp).
 */
export function generateMockPlanningSummary(
  result: SpatialAnalysisResult,
): PlanningSummary {
  const band = scoreBandFor(result.averageDevelopmentScore);
  const highRiskCount = result.intersectingConstraints.filter(
    (constraint) => constraint.riskLevel.toLowerCase() === 'high',
  ).length;

  const topZone = result.zoningBreakdown[0];
  const siteContext =
    result.parcelCount === 0
      ? `This ~${result.areaHectares} ha area does not intersect any mapped parcels${
          topZone ? `, though it sits within ${topZone.zoneCode} · ${topZone.zoneName} zoning.` : '.'
        }`
      : `This ~${result.areaHectares} ha area covers ${result.parcelCount} ${plural(
          result.parcelCount,
          'parcel',
        )}${
          topZone
            ? `, with ${result.zoningBreakdown.length > 1 ? 'mixed zoning led by' : 'zoning of'} ${topZone.zoneCode} · ${topZone.zoneName}.`
            : ' and no mapped zoning overlays.'
        }`;

  const sections: PlanningSummarySection[] = [
    developmentPotentialSection(
      band,
      result.averageDevelopmentScore,
      result.parcelCount,
      result.nearbyTransit.length,
    ),
    constraintSection(result.intersectingConstraints),
    transitSection(result.nearbyTransit),
    zoningSection(result.zoningBreakdown),
    activitySection(
      result.developmentActivityCount,
      result.developmentActivityByStatus,
    ),
  ];

  return {
    generatedAt: new Date().toISOString(),
    siteContext,
    executiveSummary: buildExecutiveSummary(
      band,
      result.intersectingConstraints.length,
      highRiskCount,
      result.nearbyTransit.length,
      result.developmentActivityCount,
    ),
    sections,
    recommendedNextChecks: buildNextChecks(result),
    dataCaveats: [
      'Figures derive from bundled synthetic portfolio GeoJSON (Sydney Demo), not official cadastral or planning records.',
      'Spatial results use simple intersection and centroid-distance heuristics.',
      'This summary is generated deterministically on-device — no external AI service is called.',
    ],
    sourceMetrics: {
      areaHectares: result.areaHectares,
      parcelCount: result.parcelCount,
      averageDevelopmentScore: result.averageDevelopmentScore,
      constraintCount: result.intersectingConstraints.length,
      nearbyTransitCount: result.nearbyTransit.length,
      developmentActivityCount: result.developmentActivityCount,
    },
  };
}
