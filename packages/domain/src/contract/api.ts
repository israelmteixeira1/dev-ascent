/**
 * The HTTP contract shared by the API and the web. Every error answers with `ApiErrorBody`.
 */
export const API_ERROR_CODES = [
  'invalid_request',
  'unauthorized',
  'forbidden',
  'not_found',
  'draft_conflict',
  'attempt_submitted',
  'payload_too_large',
  'rate_limited',
  'service_unavailable',
  'internal_error',
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export type ApiErrorBody = { error: { code: ApiErrorCode; message: string; details?: unknown } };

/** Every request that changes data carries this header with the value "1": a cross-site form cannot set it. */
export const CSRF_HEADER = 'x-devascent-csrf';
