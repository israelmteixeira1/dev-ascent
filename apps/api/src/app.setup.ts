import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { ErrorFilter } from './common/error.filter';
import { RequestLoggerMiddleware } from './common/request-logger.middleware';
import type { Env } from './config/env';

/** Everything the running API and the test apps share, applied before `init()`. */
export function configureApp(app: NestExpressApplication, _config: Env): void {
  // First, so that requests rejected by the body parser are logged too.
  app.use(new RequestLoggerMiddleware().use);
  app.setGlobalPrefix('api');
  // Every draft the contract accepts must fit. The limits are in characters and JSON escapes a control
  // character as 6 bytes, so the largest valid draft is ~2.45 MiB (test "accepts the largest valid
  // draft"). Express' default limit is 100 KB.
  app.useBodyParser('json', { limit: '3mb' });
  app.use(cookieParser());
  app.useGlobalFilters(new ErrorFilter());
}
