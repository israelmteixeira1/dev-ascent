import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CSRF_HEADER, emptyGraph, type ArchitectureGraph, type Attempt, type AttemptSummary } from '@devascent/domain';
import { UsersService } from '../auth/users.service';
import { createTestApp, http } from '../test/app';
import { openTestDb, type TestDb } from '../test/db';
import { testDatabaseUrl } from '../test/db-url';
import { ATTEMPTS_STORE, type AttemptsStore } from './attempts.repository';

describe('attempts in PostgreSQL (CI)', () => {
  let ctx: TestDb;
  let app: INestApplication;
  let store: AttemptsStore;

  beforeAll(async () => {
    ctx = await openTestDb(testDatabaseUrl());
    app = await createTestApp({ env: { DATABASE_URL: testDatabaseUrl(), AUTH_TEST_LOGIN: 'true' } });
    store = app.get<AttemptsStore>(ATTEMPTS_STORE);
  });

  beforeEach(() => ctx.reset());

  afterAll(async () => {
    await app.close();
    await ctx.close();
  });

  /** Signs a test user in and returns the session cookie. */
  async function signIn(githubId: string): Promise<string> {
    const res = await http(app)
      .post('/api/auth/test-login')
      .set(CSRF_HEADER, '1')
      .send({ githubId, name: `User ${githubId}` });
    return (res.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!;
  }

  const saveDraft = (cookie: string, id: string, body: object) =>
    http(app).put(`/api/attempts/${id}/draft`).set(CSRF_HEADER, '1').set('Cookie', cookie).send(body);

  it('isolates attempts by user', async () => {
    const alice = await signIn('1');
    const bob = await signIn('2');
    const created = await http(app)
      .post('/api/attempts')
      .set(CSRF_HEADER, '1')
      .set('Cookie', alice)
      .send({ challengeSlug: 'payment-gateway' });
    const attempt = created.body as Attempt;

    expect((await http(app).get(`/api/attempts/${attempt.id}`).set('Cookie', bob)).status).toBe(404);
    const write = await saveDraft(bob, attempt.id, {
      graph: emptyGraph(),
      explanation: 'hijack',
      elapsedSeconds: 1,
      rowVersion: 1,
    });
    expect(write.status).toBe(404);
    const stillAlice = await http(app).get(`/api/attempts/${attempt.id}`).set('Cookie', alice);
    expect((stillAlice.body as Attempt).draft.explanation).toBe('');
    expect((await http(app).get('/api/attempts').set('Cookie', bob)).body).toEqual([]);
  });

  it('detects a concurrent save', async () => {
    const user = await app.get(UsersService).upsert({ provider: 'test', providerUserId: '1', displayName: 'Ada' });
    const row = await store.insert(user.id, 'payment-gateway');
    const content = { graph: emptyGraph(), explanation: 'x', elapsedSeconds: 1 };
    const first = await store.updateDraft(user.id, row.id, content, 1);
    const second = await store.updateDraft(user.id, row.id, content, 1);
    expect(first?.rowVersion).toBe(2);
    expect(second).toBeNull();
  });

  it('round-trips the graph exactly', async () => {
    const cookie = await signIn('1');
    const attempt = (
      await http(app)
        .post('/api/attempts')
        .set(CSRF_HEADER, '1')
        .set('Cookie', cookie)
        .send({ challengeSlug: 'payment-gateway' })
    ).body as Attempt;
    const graph: ArchitectureGraph = {
      schemaVersion: 1,
      nodes: [
        {
          id: 'z',
          kind: 'zone',
          label: 'PCI zone',
          position: { x: 0, y: 0 },
          size: { width: 200, height: 120 },
          props: { replicas: 1 },
        },
        {
          id: 'v',
          kind: 'token_vault',
          label: 'Vault',
          parentId: 'z',
          position: { x: 20.5, y: 30 },
          props: { replicas: 3, notes: 'Swaps card numbers for tokens.' },
        },
        { id: 's', kind: 'service', label: 'Payments', position: { x: -100, y: 40 }, props: { replicas: 4 } },
        { id: 'q', kind: 'queue', label: 'Events', position: { x: 0, y: 300 }, props: { replicas: 1 } },
      ],
      edges: [
        { id: 'e1', source: 's', target: 'v', kind: 'sync', intent: 'write' },
        { id: 'e2', source: 's', target: 'q', kind: 'async', intent: 'write', label: 'payment events' },
      ],
    };
    expect(
      (await saveDraft(cookie, attempt.id, { graph, explanation: 'Why', elapsedSeconds: 125, rowVersion: 1 })).status,
    ).toBe(200);
    const reloaded = (await http(app).get(`/api/attempts/${attempt.id}`).set('Cookie', cookie)).body as Attempt;
    expect(reloaded.draft).toEqual({ graph, explanation: 'Why', elapsedSeconds: 125 });
  });

  it('lists the most recently updated first', async () => {
    const cookie = await signIn('1');
    const create = async () =>
      (
        await http(app)
          .post('/api/attempts')
          .set(CSRF_HEADER, '1')
          .set('Cookie', cookie)
          .send({ challengeSlug: 'payment-gateway' })
      ).body as Attempt;
    const older = await create();
    const newer = await create();
    await saveDraft(cookie, older.id, {
      graph: emptyGraph(),
      explanation: 'touched',
      elapsedSeconds: 1,
      rowVersion: 1,
    });
    const list = (await http(app).get('/api/attempts').set('Cookie', cookie)).body as AttemptSummary[];
    expect(list.map((a) => a.id)).toEqual([older.id, newer.id]);
  });
});
