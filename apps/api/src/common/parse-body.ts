import type { z } from 'zod';
import { ApiException } from './api-exception';

/** Validates a request body against a contract schema; a mismatch is a 400 with the issues. */
export function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (result.success) return result.data;
  const issues = result.error.issues.map((issue) =>
    issue.path.length > 0 ? `${issue.path.join('.')}: ${issue.message}` : issue.message,
  );
  throw new ApiException(400, 'invalid_request', 'The request is not valid.', { issues });
}
