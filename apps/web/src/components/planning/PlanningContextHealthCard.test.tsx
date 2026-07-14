import { describe, expect, it } from 'vitest';
import type {
  PlanningContext,
  PlanningContextFeatureCounts,
} from '@sitelens/shared';
import { renderWithTheme } from '../../test/renderWithTheme';
import PlanningContextHealthCard from './PlanningContextHealthCard';

const baseContext: PlanningContext = {
  id: 'external-osm:london:1',
  label: 'London external context',
  source: 'external-osm',
  status: 'ready',
  center: [-0.1278, 51.5074],
  bbox: [-0.2, 51.4, 0.1, 51.6],
  disclaimer: 'External context generated from open map data.',
  createdAt: '2026-07-01T10:00:00.000Z',
  updatedAt: '2026-07-01T12:00:00.000Z',
};

const richCounts: PlanningContextFeatureCounts = {
  sites: 8,
  landUse: 4,
  constraints: 2,
  transit: 6,
  developmentActivity: 3,
};

describe('PlanningContextHealthCard badges', () => {
  it('shows provider, status, open-map, and not-official badges for external ready contexts', () => {
    const { getByText } = renderWithTheme(
      <PlanningContextHealthCard
        context={baseContext}
        counts={richCounts}
        lastBuildReused={false}
      />,
    );

    expect(getByText('Provider: Overpass')).toBeInTheDocument();
    expect(getByText('Status: ready')).toBeInTheDocument();
    expect(getByText('Newly built')).toBeInTheDocument();
    expect(getByText('Open-map derived')).toBeInTheDocument();
    expect(getByText('Not official planning data')).toBeInTheDocument();
    expect(getByText('Sites')).toBeInTheDocument();
  });

  it('shows Reused instead of Newly built when lastBuildReused is true', () => {
    const { getByText, queryByText } = renderWithTheme(
      <PlanningContextHealthCard
        context={baseContext}
        counts={richCounts}
        lastBuildReused={true}
      />,
    );

    expect(getByText('Reused')).toBeInTheDocument();
    expect(queryByText('Newly built')).not.toBeInTheDocument();
  });

  it('shows Synthetic demo for the Sydney bundled fixture', () => {
    const sydney: PlanningContext = {
      ...baseContext,
      id: 'local-demo-sydney',
      source: 'local-demo',
      label: 'Sydney Demo',
    };
    const { getByText, queryByText } = renderWithTheme(
      <PlanningContextHealthCard context={sydney} counts={richCounts} />,
    );

    expect(getByText('Provider: Bundled')).toBeInTheDocument();
    expect(getByText('Synthetic demo')).toBeInTheDocument();
    expect(queryByText('Open-map derived')).not.toBeInTheDocument();
    expect(getByText('Bundled fixture')).toBeInTheDocument();
  });

  it('shows Empty context when all feature counts are zero', () => {
    const empty: PlanningContextFeatureCounts = {
      sites: 0,
      landUse: 0,
      constraints: 0,
      transit: 0,
      developmentActivity: 0,
    };
    const { getByText, queryByText } = renderWithTheme(
      <PlanningContextHealthCard context={baseContext} counts={empty} />,
    );

    expect(getByText('Empty context')).toBeInTheDocument();
    expect(queryByText('Sparse context')).not.toBeInTheDocument();
  });

  it('shows Sparse context when the total is below the sparse threshold', () => {
    const sparse: PlanningContextFeatureCounts = {
      sites: 2,
      landUse: 1,
      constraints: 0,
      transit: 1,
      developmentActivity: 0,
    };
    const { getByText, queryByText } = renderWithTheme(
      <PlanningContextHealthCard context={baseContext} counts={sparse} />,
    );

    expect(getByText('Sparse context')).toBeInTheDocument();
    expect(queryByText('Empty context')).not.toBeInTheDocument();
  });

  it('shows building status chip and Build started caption while building', () => {
    const building: PlanningContext = {
      ...baseContext,
      status: 'building',
    };
    const { getByText } = renderWithTheme(
      <PlanningContextHealthCard
        context={building}
        counts={null}
        countsLoading
      />,
    );

    expect(getByText('Status: building')).toBeInTheDocument();
    expect(getByText(/Build started:/)).toBeInTheDocument();
    expect(getByText('Loading feature counts…')).toBeInTheDocument();
  });

  it('shows failed status caption when the context failed', () => {
    const failed: PlanningContext = {
      ...baseContext,
      status: 'failed',
    };
    const { getByText } = renderWithTheme(
      <PlanningContextHealthCard context={failed} counts={null} />,
    );

    expect(getByText('Status: failed')).toBeInTheDocument();
    expect(getByText(/Failed at:/)).toBeInTheDocument();
    expect(getByText('Feature counts unavailable offline.')).toBeInTheDocument();
  });
});
