/** Cache outcome for a response. */
export type CacheStatus =
  | 'hit'
  | 'miss'
  | 'bypass'
  | 'disabled'
  | 'error'
  | 'none';

/** Access/entitlement metadata attached to some responses. */
export interface AccessMeta {
  role?: 'viewer' | 'planner' | 'admin';
  plan?: 'free' | 'pro' | 'enterprise';
  /** True when results were capped/simplified by the caller's entitlement. */
  limited?: boolean;
}

/** Standard success envelope returned by the SiteLens API. */
export interface ApiEnvelope<T> {
  data: T;
  meta?: {
    requestId?: string;
    cache?: CacheStatus;
    /** Safe/public cache key label (never contains raw geometry). */
    cacheKey?: string;
    computedAt?: string;
    /** Item count, when the payload is a collection. */
    count?: number;
    access?: AccessMeta;
  };
}

/** Standard error envelope returned by the SiteLens API. */
export interface ApiErrorEnvelope {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/** Response body for the health endpoints. */
export interface HealthResponse {
  status: 'ok';
  service: 'sitelens-api';
  version: string;
  timestamp: string;
}
