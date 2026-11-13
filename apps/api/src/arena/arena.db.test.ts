import type { INestApplication } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CSRF_HEADER, type ArenaProblem } from '@devascent/domain';
import { UsersService } from '../auth/users.service';
import { problemAttempts, users } from '../db/schema';
import { createTestApp, http } from '../test/app';
import { openTestDb, type TestDb } from '../test/db';
import { testDatabaseUrl } from '../test/db-url';
import {
  PROBLEM_ATTEMPTS_STORE,
  type NewProblemAttempt,
  type ProblemAttemptsStore,
} from './problem-attempts.repository';

const attempt = (startedAt: string, change: Partial<NewProblemAttempt> = {}): NewProblemAttempt => ({
  startedAt: new Date(startedAt),
  durationSeconds: 1200,
  outcome: 'passed',
  failedTest: null,
  stuckNote: '',
  ...change,
});

describe('problem attempts in PostgreSQL (CI)', () => {
  let ctx: TestDb;
  let app: INestApplication;
  let store: ProblemAttemptsStore;

  beforeAll(async () => {
    ctx = await openTestDb(testDatabaseUrl());
    app = await createTestApp({ env: { DATABASE_URL: testDatabaseUrl(), AUTH_TEST_LOGIN: 'true' } });
    store = app.get<ProblemAttemptsStore>(PROBLEM_ATTEMPTS_STORE);
  });

  beforeEach(() => ctx.reset());

  afterAll(async () => {
    await app.close();
    await ctx.close();
  });

  async function signIn(githubId: string): Promise<string> {
    const res = await http(app)
      .post('/api/auth/test-login')
      .set(CSRF_HEADER, '1')
      .send({ githubId, name: `User ${githubId}` });
    return (res.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!;
  }

  const newUser = (id: string) =>
    app.get(UsersService).upsert({ provider: 'test', providerUserId: id, displayName: `User ${id}` });

  it('records an attempt through the API and keeps each user history apart', async () => {
    const alice = await signIn('1');
    const bob = await signIn('2');
    const recorded = await http(app)
      .post('/api/arena/problems/two-sum/attempts')
      .set(CSRF_HEADER, '1')
      .set('Cookie', alice)
      .send({
        startedAt: '2026-11-13T10:00:00.000Z',
        durationSeconds: 900,
        outcome: 'failed',
        failedTest: 'zeros',
        stuckNote: 'Mixed up the indices.',
      });
    expect(recorded.status).toBe(201);

    const aliceView = (await http(app).get('/api/arena/problems/two-sum').set('Cookie', alice)).body as ArenaProblem;
    expect(aliceView.attempts).toMatchObject([{ outcome: 'failed', failedTest: 'zeros', durationSeconds: 900 }]);
    expect(aliceView.progress.nextReviewAt).toBe('2026-11-14T10:00:00.000Z');

    const bobView = (await http(app).get('/api/arena/problems/two-sum').set('Cookie', bob)).body as ArenaProblem;
    expect(bobView.attempts).toEqual([]);
  });

  it('lists attempts by start time, not by insertion', async () => {
    const user = await newUser('1');
    await store.insert(user.id, 'two-sum', attempt('2026-11-13T10:00:00.000Z'));
    await store.insert(user.id, 'two-sum', attempt('2026-11-12T10:00:00.000Z', { outcome: 'failed' }));
    await store.insert(user.id, 'lru-cache', attempt('2026-11-11T10:00:00.000Z'));
    const starts = (await store.listByProblem(user.id, 'two-sum')).map((r) => r.startedAt.toISOString());
    expect(starts).toEqual(['2026-11-12T10:00:00.000Z', '2026-11-13T10:00:00.000Z']);
    expect((await store.listByUser(user.id)).map((r) => r.problemSlug)).toEqual(['lru-cache', 'two-sum', 'two-sum']);
  });

  it.each([
    ['an unknown outcome', { outcome: 'gave-up' }],
    ['a negative duration', { durationSeconds: -1 }],
    ['a passed attempt with a failed test', { failedTest: 'zeros' }],
  ])('refuses %s in the table itself', async (_, change) => {
    const user = await newUser('1');
    await expect(
      store.insert(user.id, 'two-sum', attempt('2026-11-13T10:00:00.000Z', change as Partial<NewProblemAttempt>)),
    ).rejects.toThrow();
    expect(await store.listByUser(user.id)).toEqual([]);
  });

  it('removes the attempts with the user', async () => {
    const user = await newUser('1');
    await store.insert(user.id, 'two-sum', attempt('2026-11-13T10:00:00.000Z'));
    await ctx.db.delete(users).where(eq(users.id, user.id));
    const [{ count }] = (await ctx.db.select({ count: sql<number>`count(*)::int` }).from(problemAttempts)) as [
      { count: number },
    ];
    expect(count).toBe(0);
  });
});
