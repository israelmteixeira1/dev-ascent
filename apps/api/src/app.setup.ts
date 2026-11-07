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
  // A full draft (150 nodes with 2,000-character notes and a 20,000-character explanation) is ~400 KB;
  // Express' default limit is 100 KB.
  app.useBodyParser('json', { limit: '1mb' });
  app.use(cookieParser());
  app.useGlobalFilters(new ErrorFilter());
}
