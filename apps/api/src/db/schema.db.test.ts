import type { INestApplication } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CSRF_HEADER, emptyGraph } from '@devascent/domain';
import { createTestApp, http } from '../test/app';
import { openTestDb, type TestDb } from '../test/db';
import { testDatabaseUrl } from '../test/db-url';
import { ProbeController } from '../test/probe.controller';
import { attempts, sessions, users } from './schema';

describe('database schema (CI)', () => {
  let ctx: TestDb;
  let app: INestApplication;

  beforeAll(async () => {
    ctx = await openTestDb(testDatabaseUrl());
    app = await createTestApp({ env: { DATABASE_URL: testDatabaseUrl() }, controllers: [ProbeController] });
  });

  beforeEach(() => ctx.reset());

  afterAll(async () => {
    await app.close();
    await ctx.close();
  });

  it('migrations create the three tables', async () => {
    const result = await ctx.db.execute<{ table_name: string }>(
      sql`select table_name from information_schema.tables where table_schema = 'public' and table_name in ('users', 'sessions', 'attempts') order by table_name`,
    );
    expect(result.rows.map((row) => row.table_name)).toEqual(['attempts', 'sessions', 'users']);
  });

  it('deleting a user cascades to sessions and attempts', async () => {
    const [user] = await ctx.db
      .insert(users)
      .values({ provider: 'github', providerUserId: '1', displayName: 'Ada' })
      .returning();
    await ctx.db.insert(sessions).values({ id: 'hash', userId: user!.id, expiresAt: new Date(Date.now() + 60_000) });
    await ctx.db
      .insert(attempts)
      .values({ userId: user!.id, challengeSlug: 'payment-gateway', draftGraph: emptyGraph() });

    await ctx.db.delete(users).where(eq(users.id, user!.id));

    expect(await ctx.db.select().from(sessions)).toEqual([]);
    expect(await ctx.db.select().from(attempts)).toEqual([]);
  });

  it('ready answers 200 against the real database', async () => {
    const res = await http(app).get('/api/ready');
    expect(res.status).toBe(200);
  });

  // Proves the SWC plugin also runs under vitest.db.config.ts: CsrfGuard gets AppConfig by type.
  it('boots with decorator metadata under the db config', async () => {
    const res = await http(app).post('/api/probe').set(CSRF_HEADER, '1').send({});
    expect(res.status).toBe(201);
  });
});
