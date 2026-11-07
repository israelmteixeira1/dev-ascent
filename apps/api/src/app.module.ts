import { Module, type DynamicModule, type Type } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { CsrfGuard } from './common/csrf.guard';
import { AppConfig, type Env } from './config/env';
import { HealthController } from './health/health.controller';

/** In memory, per IP: one API instance today (spec §11.4). Auth routes set a stricter limit. */
const DEFAULT_RATE_LIMIT = { ttl: 60_000, limit: 300 };

@Module({})
export class AppModule {
  /** `extra.controllers` lets tests mount probe routes next to the real ones. */
  static register(config: Env, extra: { controllers?: Type[] } = {}): DynamicModule {
    return {
      module: AppModule,
      imports: [ThrottlerModule.forRoot([DEFAULT_RATE_LIMIT])],
      controllers: [HealthController, ...(extra.controllers ?? [])],
      providers: [
        { provide: AppConfig, useValue: new AppConfig(config) },
        // Global guards run in this order.
        { provide: APP_GUARD, useClass: ThrottlerGuard },
        { provide: APP_GUARD, useClass: CsrfGuard },
      ],
    };
  }
}
