import type { INestApplication } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  CSRF_HEADER,
  emptyGraph,
  MAX_ELAPSED_SECONDS,
  saveDraftRequestSchema,
  type ApiErrorBody,
  type Attempt,
  type DraftConflictDetails,
  type SavedDraft,
} from '@devascent/domain';
import { SessionsService, type SessionAccount } from '../auth/sessions.service';
import { createTestApp, http } from '../test/app';
import { FakeAttemptsStore } from '../test/fake-attempts.repository';
import { ATTEMPTS_STORE } from './attempts.repository';

const account: SessionAccount = { id: 'user-a', name: 'Ada', provider: 'github', providerUserId: '123' };
const COOKIE = 'devascent_session=any';

describe('attempts API', () => {
  let app: INestApplication;
  let store: FakeAttemptsStore;

  beforeEach(async () => {
    store = new FakeAttemptsStore();
    app = await createTestApp({
      env: { ALLOWED_GITHUB_IDS: '123' },
      overrides: [
        { provide: ATTEMPTS_STORE, useValue: store },
        { provide: SessionsService, useValue: { findAccount: () => Promise.resolve(account) } },
      ],
    });
  });

  afterEach(async () => {
    await app.close();
  });

  const post = (path: string, body: unknown) =>
    http(app)
      .post(path)
      .set(CSRF_HEADER, '1')
      .set('Cookie', COOKIE)
      .send(body as object);
  const put = (path: string, body: unknown) =>
    http(app)
      .put(path)
      .set(CSRF_HEADER, '1')
      .set('Cookie', COOKIE)
      .send(body as object);
  const create = async () => (await post('/api/attempts', { challengeSlug: 'payment-gateway' })).body as Attempt;
  const draft = (rowVersion: number, graph: unknown = emptyGraph(), explanation = '') => ({
    graph,
    explanation,
    elapsedSeconds: 60,
    rowVersion,
  });

  it('creates an attempt for a known challenge', async () => {
    const res = await post('/api/attempts', { challengeSlug: 'payment-gateway' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      challengeSlug: 'payment-gateway',
      status: 'draft',
      rowVersion: 1,
      draft: { graph: emptyGraph(), explanation: '', elapsedSeconds: 0 },
    });
  });

  it('refuses an unknown challenge', async () => {
    const res = await post('/api/attempts', { challengeSlug: 'nope' });
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: { code: 'not_found' } });
  });

  it('refuses an invalid graph with the issues', async () => {
    const attempt = await create();
    const node = { id: 'a', kind: 'service', label: '', position: { x: 0, y: 0 }, props: { replicas: 1 } };
    const res = await put(
      `/api/attempts/${attempt.id}/draft`,
      draft(1, { schemaVersion: 1, nodes: [node, node], edges: [] }),
    );
    expect(res.status).toBe(400);
    const { error } = res.body as ApiErrorBody;
    expect(error.code).toBe('invalid_request');
    expect((error.details as { issues: string[] }).issues.some((issue) => issue.includes('graph'))).toBe(true);
  });

  it('saves the draft and bumps the row version', async () => {
    const attempt = await create();
    const res = await put(`/api/attempts/${attempt.id}/draft`, draft(1, emptyGraph(), 'First idea'));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ rowVersion: 2 });
    expect(typeof (res.body as SavedDraft).updatedAt).toBe('string');
    const reloaded = await http(app).get(`/api/attempts/${attempt.id}`).set('Cookie', COOKIE);
    expect(reloaded.body).toMatchObject({ rowVersion: 2, draft: { explanation: 'First idea', elapsedSeconds: 60 } });
  });

  it('reports a stale row version as a conflict with the current attempt', async () => {
    const attempt = await create();
    await put(`/api/attempts/${attempt.id}/draft`, draft(1, emptyGraph(), 'Saved from tab 1'));
    const res = await put(`/api/attempts/${attempt.id}/draft`, draft(1, emptyGraph(), 'Saved from tab 2'));
    expect(res.status).toBe(409);
    const { error } = res.body as ApiErrorBody;
    expect(error.code).toBe('draft_conflict');
    const details = error.details as DraftConflictDetails;
    expect(details.current.rowVersion).toBe(2);
    expect(details.current.draft.explanation).toBe('Saved from tab 1');
  });

  it('answers 404 for an id that is not a UUID', async () => {
    const res = await http(app).get('/api/attempts/not-a-uuid').set('Cookie', COOKIE);
    expect(res.status).toBe(404);
  });

  it('lists the attempts as summaries', async () => {
    const attempt = await create();
    const res = await http(app).get('/api/attempts').set('Cookie', COOKIE);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      {
        id: attempt.id,
        challengeSlug: 'payment-gateway',
        status: 'draft',
        createdAt: attempt.createdAt,
        updatedAt: attempt.updatedAt,
      },
    ]);
  });

  // Final review: the body limit must hold every draft the contract accepts. A control character is
  // escaped as \u0001 in JSON, 6 bytes per character: the worst case for every text field at its limit.
  it('accepts the largest valid draft', async () => {
    const attempt = await create();
    const worst = '\u0001';
    const id = (i: number) => `${i}`.padEnd(64, worst);
    const nodes = Array.from({ length: 150 }, (_, i) => ({
      id: id(i),
      kind: 'service',
      label: worst.repeat(80),
      position: { x: -123456.789, y: -123456.789 },
      props: { replicas: 50, shards: 32, cacheHitRatio: 0.99, notes: worst.repeat(2000) },
    }));
    // 300 distinct pairs without self-loops: i → i+1 for the first 150, i → i+2 for the rest.
    const edges = Array.from({ length: 300 }, (_, i) => ({
      id: id(1000 + i),
      source: id(i % 150),
      target: id(((i % 150) + (i < 150 ? 1 : 2)) % 150),
      kind: 'async',
      intent: 'cache_aside',
      label: worst.repeat(80),
    }));
    const body = {
      graph: { schemaVersion: 1, nodes, edges },
      explanation: worst.repeat(20_000),
      elapsedSeconds: MAX_ELAPSED_SECONDS,
      rowVersion: 1,
    };
    expect(saveDraftRequestSchema.safeParse(body).success).toBe(true);
    expect(Buffer.byteLength(JSON.stringify(body))).toBeGreaterThan(2_000_000);
    const res = await put(`/api/attempts/${attempt.id}/draft`, body);
    expect(res.status).toBe(200);
  });

  it('accepts a 400 KB draft', async () => {
    const attempt = await create();
    // Two-byte characters: with ASCII, 150 nodes of 2,000-character notes are only ~330 KB.
    const nodes = Array.from({ length: 150 }, (_, i) => ({
      id: `n${i}`,
      kind: 'service',
      label: `Service ${i}`,
      position: { x: i * 10, y: 0 },
      props: { replicas: 1, notes: 'é'.repeat(2000) },
    }));
    const body = draft(1, { schemaVersion: 1, nodes, edges: [] }, 'é'.repeat(20_000));
    expect(Buffer.byteLength(JSON.stringify(body))).toBeGreaterThan(400_000);
    const res = await put(`/api/attempts/${attempt.id}/draft`, body);
    expect(res.status).toBe(200);
  });
});
