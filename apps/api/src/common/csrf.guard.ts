import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { CSRF_HEADER } from '@devascent/domain';
import { AppConfig } from '../config/env';
import { ApiException } from './api-exception';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Requests that change data need the custom header, which a cross-site form cannot send, and,
 * when the browser sends an Origin, it must be the app's own. SameSite=Lax cookies are the first layer.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private readonly config: AppConfig) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(request.method)) return true;
    const origin = request.headers.origin;
    const fromApp = origin === undefined || origin === this.config.env.appOrigin;
    if (request.headers[CSRF_HEADER] !== '1' || !fromApp) {
      throw new ApiException(403, 'forbidden', 'Cross-site request blocked.');
    }
    return true;
  }
}
