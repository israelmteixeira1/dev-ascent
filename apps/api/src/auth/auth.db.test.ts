import type { INestApplication } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CSRF_HEADER } from '@devascent/domain';
import { sessions } from '../db/schema';
import { createTestApp, http } from '../test/app';
import { openTestDb, type TestDb } from '../test/db';
import { testDatabaseUrl } from '../test/db-url';
import { SessionsService } from './sessions.service';
import { hashSessionToken } from './tokens';
import { UsersService } from './users.service';

describe('sessions and users (CI)', () => {
  let ctx: TestDb;
  let app: INestApplication;
  let usersService: UsersService;
  let sessionsService: SessionsService;

  beforeAll(async () => {
    ctx = await openTestDb(testDatabaseUrl());
    app = await createTestApp({ env: { DATABASE_URL: testDatabaseUrl(), AUTH_TEST_LOGIN: 'true' } });
    usersService = app.get(UsersService);
    sessionsService = app.get(SessionsService);
  });

  beforeEach(() => ctx.reset());

  afterAll(async () => {
    await app.close();
    await ctx.close();
  });

  const anUser = () => usersService.upsert({ provider: 'github', providerUserId: '123', displayName: 'Octo Cat' });

  it('stores only the hash of the token', async () => {
    const user = await anUser();
    const { token } = await sessionsService.create(user.id);
    const rows = await ctx.db.select().from(sessions);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe(hashSessionToken(token));
    expect(JSON.stringify(rows)).not.toContain(token);
  });

  it('refuses an expired session', async () => {
    const user = await anUser();
    const { token } = await sessionsService.create(user.id);
    await ctx.db
      .update(sessions)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(eq(sessions.id, hashSessionToken(token)));
    expect(await sessionsService.findAccount(token)).toBeNull();
  });

  it('signing out deletes the session', async () => {
    const user = await anUser();
    const { token } = await sessionsService.create(user.id);
    await sessionsService.delete(token);
    expect(await ctx.db.select().from(sessions)).toEqual([]);
  });

  it('upsert keeps the id and updates the display name', async () => {
    const first = await anUser();
    const second = await usersService.upsert({ provider: 'github', providerUserId: '123', displayName: 'Octocat' });
    expect(second).toEqual({ id: first.id, name: 'Octocat' });
  });

  it('the guard accepts a real session end to end', async () => {
    const login = await http(app)
      .post('/api/auth/test-login')
      .set(CSRF_HEADER, '1')
      .send({ githubId: '42', name: 'Tester' });
    expect(login.status).toBe(204);
    const cookie = (login.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!;
    const me = await http(app).get('/api/me').set('Cookie', cookie);
    expect(me.status).toBe(200);
    expect(me.body).toMatchObject({ user: { name: 'Tester' } });
  });
});
