import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiException } from '../common/api-exception';
import { IS_PUBLIC } from '../common/public.decorator';
import type { RequestContext } from '../common/request';
import { AppConfig, type Env } from '../config/env';
import { readCookie, SESSION_COOKIE } from './cookies';
import { SessionsService, type SessionAccount } from './sessions.service';

/**
 * Checked on every request, not only at sign-in: removing an id from the configuration cuts
 * access at once, and test-login sessions stop working when the test login is turned off.
 */
export function isAllowedAccount(account: SessionAccount, config: Env): boolean {
  if (account.provider === 'github') return config.allowedGithubIds.has(account.providerUserId);
  return config.testLogin;
}

/** Deny by default: every route needs a valid session unless it is marked @Public(). */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionsService,
    private readonly config: AppConfig,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<RequestContext>();
    const token = readCookie(request, SESSION_COOKIE);
    const account = token ? await this.sessions.findAccount(token) : null;
    if (!account || !isAllowedAccount(account, this.config.env)) {
      throw new ApiException(401, 'unauthorized', 'Sign in to continue.');
    }
    request.user = { id: account.id, name: account.name };
    return true;
  }
}
