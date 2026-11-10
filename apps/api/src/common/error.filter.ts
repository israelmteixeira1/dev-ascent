import { Catch, HttpException, Logger, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import type { ApiErrorBody, ApiErrorCode } from '@devascent/domain';
import { ApiException } from './api-exception';
import type { RequestContext } from './request';

const BY_STATUS: Record<number, { code: ApiErrorCode; message: string }> = {
  400: { code: 'invalid_request', message: 'The request is not valid.' },
  401: { code: 'unauthorized', message: 'Sign in to continue.' },
  403: { code: 'forbidden', message: 'This request is not allowed.' },
  404: { code: 'not_found', message: 'Not found.' },
  413: { code: 'payload_too_large', message: 'The request is too large.' },
  429: { code: 'rate_limited', message: 'Too many requests. Try again in a minute.' },
  503: { code: 'service_unavailable', message: 'The service is unavailable. Try again in a moment.' },
};

const INTERNAL = { status: 500, code: 'internal_error' as const, message: 'Something went wrong.' };

/** The body parser's own error when a body exceeds the limit: it never becomes an HttpException. */
function isBodyTooLarge(exception: unknown): boolean {
  return (
    typeof exception === 'object' && exception !== null && (exception as { type?: unknown }).type === 'entity.too.large'
  );
}

/**
 * Every error leaves the API as `ApiErrorBody`. Unexpected errors are logged by name with the
 * request id, never with their message, which may hold data; the client only gets a generic text.
 */
@Catch()
export class ErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger('error');

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const request = http.getRequest<RequestContext>();
    const { status, body } = this.toBody(exception, request);
    response.status(status).json(body);
  }

  private toBody(exception: unknown, request: RequestContext): { status: number; body: ApiErrorBody } {
    if (exception instanceof ApiException) {
      const error = { code: exception.code, message: exception.message };
      return {
        status: exception.getStatus(),
        body: { error: exception.details === undefined ? error : { ...error, details: exception.details } },
      };
    }
    if (isBodyTooLarge(exception)) return { status: 413, body: { error: BY_STATUS[413]! } };
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const known = BY_STATUS[status];
      if (known) return { status, body: { error: known } };
      if (status < 500) return { status, body: { error: BY_STATUS[400]! } };
    }
    const name = exception instanceof Error ? exception.name : typeof exception;
    this.logger.error({ requestId: request.requestId, error: name });
    return { status: INTERNAL.status, body: { error: { code: INTERNAL.code, message: INTERNAL.message } } };
  }
}
