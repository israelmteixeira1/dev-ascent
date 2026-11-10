import { CSRF_HEADER, type ApiErrorBody, type ApiErrorCode } from '@devascent/domain';

/** Browsers refuse keepalive requests above 64 KB in flight; this leaves room for headers. */
export const KEEPALIVE_LIMIT_BYTES = 60_000;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type ApiInit = {
  method?: 'GET' | 'POST' | 'PUT';
  body?: unknown;
  /** Ask for a request that survives the page closing. Sent without it when the body is too large. */
  keepalive?: boolean;
  signal?: AbortSignal;
};

/**
 * Calls the API on the same origin, with the session cookie and the CSRF header. Every failure
 * becomes an ApiError: a network failure has status 0.
 */
export async function api<T>(path: string, init: ApiInit = {}): Promise<T> {
  const text = init.body === undefined ? undefined : JSON.stringify(init.body);
  const keepalive =
    init.keepalive === true &&
    (text === undefined || new TextEncoder().encode(text).byteLength <= KEEPALIVE_LIMIT_BYTES);
  const headers: Record<string, string> = { Accept: 'application/json', [CSRF_HEADER]: '1' };
  if (text !== undefined) headers['Content-Type'] = 'application/json';

  let res: Response;
  try {
    res = await fetch(path, {
      method: init.method ?? 'GET',
      credentials: 'same-origin',
      headers,
      body: text,
      keepalive,
      signal: init.signal,
    });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause;
    throw new ApiError(0, 'service_unavailable', 'The server could not be reached.');
  }

  if (res.ok) {
    return (res.status === 204 ? undefined : await res.json()) as T;
  }
  const body = (await res.json().catch(() => null)) as Partial<ApiErrorBody> | null;
  if (body?.error?.code) throw new ApiError(res.status, body.error.code, body.error.message, body.error.details);
  throw new ApiError(
    res.status,
    res.status >= 500 ? 'service_unavailable' : 'invalid_request',
    'The server answered unexpectedly.',
  );
}
