import { describe, expect, it } from 'vitest';
import { accessScope, getCapabilities } from './capabilities';
import { getUserForApiKey } from './demoUsers';

describe('getUserForApiKey', () => {
  it('resolves known demo keys', () => {
    expect(getUserForApiKey('demo-planner-key')?.role).toBe('planner');
    expect(getUserForApiKey('demo-admin-key')?.plan).toBe('enterprise');
  });

  it('returns null for unknown or missing keys', () => {
    expect(getUserForApiKey('nope')).toBeNull();
    expect(getUserForApiKey(undefined)).toBeNull();
  });
});

describe('getCapabilities', () => {
  it('gives anonymous read-only, limited access', () => {
    const caps = getCapabilities(null);
    expect(caps.canReadLayers).toBe(true);
    expect(caps.canReadParcels).toBe(true);
    expect(caps.canRunAnalysis).toBe(false);
    expect(caps.canGenerateSummary).toBe(false);
    expect(caps.canIngestData).toBe(false);
    expect(caps.canViewAllLayers).toBe(false);
  });

  it('viewer/free cannot run analysis', () => {
    const caps = getCapabilities(getUserForApiKey('demo-viewer-key'));
    expect(caps.canRunAnalysis).toBe(false);
    expect(caps.canViewAllLayers).toBe(false);
  });

  it('planner/pro can run analysis and view all layers', () => {
    const caps = getCapabilities(getUserForApiKey('demo-planner-key'));
    expect(caps.canRunAnalysis).toBe(true);
    expect(caps.canGenerateSummary).toBe(true);
    expect(caps.canViewAllLayers).toBe(true);
    expect(caps.canIngestData).toBe(false);
  });

  it('admin/enterprise can also ingest', () => {
    const caps = getCapabilities(getUserForApiKey('demo-admin-key'));
    expect(caps.canRunAnalysis).toBe(true);
    expect(caps.canIngestData).toBe(true);
  });
});

describe('accessScope', () => {
  it('maps capabilities to a cache scope', () => {
    expect(accessScope(getCapabilities(null))).toBe('free');
    expect(accessScope(getCapabilities(getUserForApiKey('demo-planner-key')))).toBe(
      'pro',
    );
  });
});
