import type { Server } from 'node:http';
import type { INestApplication, Type } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../app.module';
import { configureApp } from '../app.setup';
import { parseEnv } from '../config/env';

/** Defaults for test apps. The database URL is never connected to by unit tests. */
export const TEST_CONFIG: Record<string, string> = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgres://localhost:5432/devascent_test',
  APP_ORIGIN: 'http://localhost:5173',
};

export type TestAppOptions = {
  env?: Record<string, string>;
  controllers?: Type[];
  overrides?: { provide: unknown; useValue: unknown }[];
};

/** A real Nest app, configured like `main.ts`, with optional provider overrides. */
export async function createTestApp(options: TestAppOptions = {}): Promise<NestExpressApplication> {
  const config = parseEnv({ ...TEST_CONFIG, ...options.env });
  let builder = Test.createTestingModule({
    imports: [AppModule.register(config, { controllers: options.controllers ?? [] })],
  });
  for (const override of options.overrides ?? []) {
    builder = builder.overrideProvider(override.provide).useValue(override.useValue);
  }
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ logger: false });
  configureApp(app, config);
  await app.init();
  return app;
}

/** Supertest bound to a test app's HTTP server. */
export function http(app: INestApplication) {
  return request(app.getHttpServer() as Server);
}
