/** Standard success envelope returned by the SiteLens API. */
export interface ApiEnvelope<T> {
  data: T;
  meta?: {
    requestId?: string;
    cache?: 'hit' | 'miss' | 'none';
    computedAt?: string;
    /** Item count, when the payload is a collection. */
    count?: number;
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
