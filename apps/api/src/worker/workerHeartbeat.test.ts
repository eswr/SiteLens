import { afterEach, describe, expect, it } from 'vitest';
import {
  formatWorkerHeartbeatFields,
  isWorkerHeartbeatHealthy,
  resetWorkerHeartbeatForTests,
  WORKER_HEARTBEAT_STALE_MS,
} from './workerHeartbeat.js';

describe('formatWorkerHeartbeatFields', () => {
  afterEach(() => {
    resetWorkerHeartbeatForTests();
  });

  it('formats a healthy recent heartbeat', () => {
    const now = Date.parse('2026-07-14T12:00:30.000Z');
    const at = Date.parse('2026-07-14T12:00:00.000Z');
    expect(formatWorkerHeartbeatFields(at, now, 'redis')).toEqual({
      workerHeartbeatAt: '2026-07-14T12:00:00.000Z',
      workerHeartbeatAgeSeconds: 30,
      workerHeartbeatSource: 'redis',
    });
    expect(isWorkerHeartbeatHealthy(at, now)).toBe(true);
  });

  it('formats a stale heartbeat (>60s)', () => {
    const now = Date.parse('2026-07-14T12:02:00.000Z');
    const at = Date.parse('2026-07-14T12:00:00.000Z');
    const fields = formatWorkerHeartbeatFields(at, now, 'memory');
    expect(fields.workerHeartbeatAgeSeconds).toBe(120);
    expect(fields.workerHeartbeatSource).toBe('memory');
    expect(isWorkerHeartbeatHealthy(at, now)).toBe(false);
    expect(now - at).toBeGreaterThan(WORKER_HEARTBEAT_STALE_MS);
  });

  it('formats a missing heartbeat as nulls / unhealthy', () => {
    expect(formatWorkerHeartbeatFields(null, Date.now())).toEqual({
      workerHeartbeatAt: null,
      workerHeartbeatAgeSeconds: null,
      workerHeartbeatSource: 'missing',
    });
    expect(isWorkerHeartbeatHealthy(null)).toBe(false);
    expect(isWorkerHeartbeatHealthy(undefined)).toBe(false);
  });
});
