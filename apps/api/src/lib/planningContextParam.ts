import { LOCAL_DEMO_SYDNEY_CONTEXT_ID } from '@sitelens/shared';
import { getPlanningContext } from '../externalData/planningContextRepository';

/** Resolve planningContextId from query/body. Omitted → Sydney demo. */
export function resolvePlanningContextIdParam(
  value: unknown,
): { ok: true; planningContextId: string } | { ok: false; message: string } {
  if (value === undefined || value === null || value === '') {
    return { ok: true, planningContextId: LOCAL_DEMO_SYDNEY_CONTEXT_ID };
  }
  if (typeof value !== 'string' || value.trim().length === 0) {
    return {
      ok: false,
      message: 'planningContextId must be a non-empty string',
    };
  }
  const id = value.trim();
  if (id.length > 200 || !/^[a-zA-Z0-9_.:-]+$/.test(id)) {
    return {
      ok: false,
      message: 'Invalid planningContextId format',
    };
  }
  return { ok: true, planningContextId: id };
}

/** Ensure the planning context exists (ready or local demo). */
export async function assertPlanningContextExists(
  planningContextId: string,
): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  const context = await getPlanningContext(planningContextId);
  if (!context) {
    return {
      ok: false,
      status: 404,
      message: `Planning context not found: ${planningContextId}`,
    };
  }
  if (context.status === 'failed') {
    return {
      ok: false,
      status: 400,
      message: `Planning context "${planningContextId}" failed to build and has no usable features.`,
    };
  }
  if (context.status === 'building') {
    return {
      ok: false,
      status: 409,
      message: `Planning context "${planningContextId}" is still building. Try again shortly.`,
    };
  }
  return { ok: true };
}
