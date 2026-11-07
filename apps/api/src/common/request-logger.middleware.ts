import { randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import type { NextFunction, Response } from 'express';
import type { RequestContext } from './request';

/**
 * One JSON line per request: method, path, status, duration, request id and user id. Never the
 * query string (the OAuth callback carries `code` and `state` there), headers, cookies or bodies.
 */
export class RequestLoggerMiddleware {
  private readonly logger = new Logger('http');

  readonly use = (request: RequestContext, response: Response, next: NextFunction): void => {
    const requestId = randomUUID();
    const started = performance.now();
    // Captured now: routing may rewrite the URL while the request is handled.
    const method = request.method;
    const path = request.path;
    request.requestId = requestId;
    response.setHeader('x-request-id', requestId);
    response.on('finish', () => {
      this.logger.log({
        requestId,
        method,
        path,
        status: response.statusCode,
        durationMs: Math.round(performance.now() - started),
        userId: request.user?.id,
      });
    });
    next();
  };
}
