import { Module, type DynamicModule, type Type } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AttemptsModule } from './attempts/attempts.module';
import { AuthModule } from './auth/auth.module';
import { SessionGuard } from './auth/session.guard';
import { CsrfGuard } from './common/csrf.guard';
import { ConfigModule } from './config/config.module';
import type { Env } from './config/env';
import { DatabaseModule } from './db/database.module';
import { HealthController } from './health/health.controller';

/** In memory, per IP: one API instance today (spec §11.4). Auth routes set a stricter limit. */
const DEFAULT_RATE_LIMIT = { ttl: 60_000, limit: 300 };

@Module({})
export class AppModule {
  /** `extra.controllers` lets tests mount probe routes next to the real ones. */
  static register(config: Env, extra: { controllers?: Type[] } = {}): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ConfigModule.register(config),
        DatabaseModule,
        ThrottlerModule.forRoot([DEFAULT_RATE_LIMIT]),
        AuthModule,
        AttemptsModule,
      ],
      controllers: [HealthController, ...(extra.controllers ?? [])],
      providers: [
        // Global guards run in this order: rate limit, CSRF, then the session (deny by default).
        { provide: APP_GUARD, useClass: ThrottlerGuard },
        { provide: APP_GUARD, useClass: CsrfGuard },
        { provide: APP_GUARD, useClass: SessionGuard },
      ],
    };
  }
}
