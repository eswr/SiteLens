/**
 * Tiny typed fetch wrapper for the SiteLens API.
 *
 * The API base URL comes from `VITE_API_BASE_URL`. When it is not configured,
 * the app stays fully client-side (local Turf analysis) and API calls are not
 * attempted.
 */
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').trim();

/** Whether an API base URL is configured. */
export function isApiConfigured(): boolean {
  return API_BASE_URL.length > 0;
}

/** The configured API base URL (may be an empty string). */
export function getApiBaseUrl(): string {
  return API_BASE_URL;
}

/** Error thrown for failed API requests, carrying status/code when available. */
export class ApiError extends Error {
  readonly status?: number;
  readonly code?: string;

  constructor(message: string, options: { status?: number; code?: string } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = options.status;
    this.code = options.code;
  }
}

/** Cache outcome reported by the API (mirrors `@sitelens/shared` CacheStatus). */
export type CacheStatus =
  | 'hit'
  | 'miss'
  | 'bypass'
  | 'disabled'
  | 'error'
  | 'none';

export interface ApiMeta {
  requestId?: string;
  cache?: CacheStatus;
  cacheKey?: string;
  computedAt?: string;
  count?: number;
}

interface ApiEnvelope<T> {
  data: T;
  meta?: ApiMeta;
}

interface ApiErrorBody {
  error?: { code?: string; message?: string };
}

/** POST JSON to `path` and return both the unwrapped `data` and `meta`. */
export async function apiPostWithMeta<T>(
  path: string,
  body: unknown,
): Promise<{ data: T; meta?: ApiMeta }> {
  if (!isApiConfigured()) {
    throw new ApiError('API base URL is not configured');
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (error) {
    throw new ApiError(
      error instanceof Error ? error.message : 'Network request failed',
    );
  }

  let json: unknown = null;
  try {
    json = await response.json();
  } catch {
    // Leave json as null; handled below.
  }

  if (!response.ok) {
    const errorBody = (json ?? {}) as ApiErrorBody;
    throw new ApiError(
      errorBody.error?.message ?? `Request failed (${response.status})`,
      { status: response.status, code: errorBody.error?.code },
    );
  }

  if (!json || typeof json !== 'object' || !('data' in json)) {
    throw new ApiError('Malformed API response');
  }

  const envelope = json as ApiEnvelope<T>;
  return { data: envelope.data, meta: envelope.meta };
}

/** POST JSON to `path` and unwrap just the `{ data }` payload. */
export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const { data } = await apiPostWithMeta<T>(path, body);
  return data;
}
