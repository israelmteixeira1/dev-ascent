import { Logger, type INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { CSRF_HEADER } from '@devascent/domain';
import { createTestApp, http as httpOf } from '../test/app';
import { ProbeController } from '../test/probe.controller';

describe('API foundation', () => {
  let app: INestApplication;
  const http = () => httpOf(app);

  beforeAll(async () => {
    app = await createTestApp({ controllers: [ProbeController] });
  });

  afterAll(async () => {
    await app.close();
  });

  it('answers unknown routes with the error format', async () => {
    const res = await http().get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: { code: 'not_found' } });
  });

  it('blocks a write without the CSRF header', async () => {
    const res = await http().post('/api/probe').send({ a: 1 });
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: { code: 'forbidden' } });
  });

  // Also proves that SWC emits decorator metadata: CsrfGuard receives AppConfig by type, without @Inject.
  it('blocks a write from another origin', async () => {
    const res = await http().post('/api/probe').set(CSRF_HEADER, '1').set('Origin', 'https://evil.example').send({});
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: { code: 'forbidden' } });
  });

  it('accepts a write with the header from the app origin', async () => {
    const res = await http()
      .post('/api/probe')
      .set(CSRF_HEADER, '1')
      .set('Origin', 'http://localhost:5173')
      .send({ a: 1 });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ ok: true });
  });

  it('logs path and status, never the query string', async () => {
    const spy = vi.spyOn(Logger.prototype, 'log');
    try {
      await http().get('/api/health?code=abc123&state=xyz');
      await vi.waitFor(() =>
        expect(spy).toHaveBeenCalledWith(expect.objectContaining({ path: '/api/health', status: 200 })),
      );
      expect(JSON.stringify(spy.mock.calls)).not.toContain('abc123');
    } finally {
      spy.mockRestore();
    }
  });

  it('returns a request id', async () => {
    const res = await http().get('/api/health');
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('hides internals of unexpected errors', async () => {
    const res = await http().get('/api/probe/boom');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: { code: 'internal_error', message: 'Something went wrong.' } });
    expect(JSON.stringify(res.body)).not.toContain('hunter2');
  });

  it('limits requests per route', async () => {
    await http().get('/api/probe/limited').expect(200);
    await http().get('/api/probe/limited').expect(200);
    const res = await http().get('/api/probe/limited');
    expect(res.status).toBe(429);
    expect(res.body).toMatchObject({ error: { code: 'rate_limited' } });
  });

  it('accepts a 900 KB JSON body and rejects 2 MB with 413', async () => {
    const ok = await http()
      .post('/api/probe')
      .set(CSRF_HEADER, '1')
      .send({ data: 'a'.repeat(900_000) });
    expect(ok.status).toBe(201);
    const tooLarge = await http()
      .post('/api/probe')
      .set(CSRF_HEADER, '1')
      .send({ data: 'a'.repeat(2_000_000) });
    expect(tooLarge.status).toBe(413);
    expect(tooLarge.body).toMatchObject({ error: { code: 'payload_too_large' } });
  });

  it('answers malformed JSON with 400', async () => {
    const res = await http()
      .post('/api/probe')
      .set(CSRF_HEADER, '1')
      .set('Content-Type', 'application/json')
      .send('{"a":');
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: { code: 'invalid_request' } });
  });
});
