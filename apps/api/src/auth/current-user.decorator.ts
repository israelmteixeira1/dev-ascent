import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { SessionUser } from '@devascent/domain';
import type { RequestContext } from '../common/request';

/** The user the SessionGuard attached to the request. Only valid on private routes. */
export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext): SessionUser => {
  const user = context.switchToHttp().getRequest<RequestContext>().user;
  if (!user) throw new Error('CurrentUser used on a route without a session');
  return user;
});
