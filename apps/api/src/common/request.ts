import type { Request } from 'express';

/** What the request carries once it passed the request logger and the session guard. */
export type RequestContext = Request & {
  requestId?: string;
  user?: { id: string; name: string };
};
