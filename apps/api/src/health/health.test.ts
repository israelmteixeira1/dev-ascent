import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DB } from '../db/database.module';
import { createTestApp, http } from '../test/app';

describe('health', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/health is public and answers ok', async () => {
    const res = await http(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});

describe('readiness', () => {
  const withDatabase = (execute: () => Promise<unknown>) =>
    createTestApp({ overrides: [{ provide: DB, useValue: { execute } }] });

  it('GET /api/ready answers 200 when the database answers', async () => {
    const app = await withDatabase(() => Promise.resolve({ rows: [] }));
    const res = await http(app).get('/api/ready');
    await app.close();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ready' });
  });

  it('answers 503 service_unavailable when it does not', async () => {
    const app = await withDatabase(() => Promise.reject(new Error('connect ECONNREFUSED')));
    const res = await http(app).get('/api/ready');
    await app.close();
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ error: { code: 'service_unavailable' } });
  });
});
