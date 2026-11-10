import type { INestApplication } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CSRF_HEADER } from '@devascent/domain';
import { AppConfig, parseEnv } from '../config/env';
import { createTestApp, http, TEST_CONFIG } from '../test/app';
import { GithubClient, type GithubProfile } from './github.client';
import { SessionsService, type SessionAccount } from './sessions.service';
import { UsersService } from './users.service';

const GITHUB_CONFIG = {
  GITHUB_CLIENT_ID: '<GITHUB_CLIENT_ID>',
  GITHUB_CLIENT_SECRET: '<GITHUB_CLIENT_SECRET>',
  ALLOWED_GITHUB_IDS: '123',
};

type Fakes = {
  users: { upsert: ReturnType<typeof vi.fn> };
  sessions: {
    create: ReturnType<typeof vi.fn>;
    findAccount: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
  github: {
    authorizeUrl: (state: string) => string;
    exchangeCode: ReturnType<typeof vi.fn>;
    fetchProfile: ReturnType<typeof vi.fn>;
  };
};

let app: INestApplication | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function start(
  extra: Record<string, string> = {},
  profile: GithubProfile = { id: 123, login: 'octo', name: 'Octo Cat' },
) {
  const configValues = { ...TEST_CONFIG, ...GITHUB_CONFIG, ...extra };
  const real = new GithubClient(new AppConfig(parseEnv(configValues)));
  const fakes: Fakes = {
    users: { upsert: vi.fn(() => Promise.resolve({ id: 'user-1', name: profile.name ?? profile.login })) },
    sessions: {
      create: vi.fn(() => Promise.resolve({ token: 'session-token', expiresAt: new Date(Date.now() + 1000) })),
      findAccount: vi.fn(() => Promise.resolve(null)),
      delete: vi.fn(() => Promise.resolve()),
    },
    github: {
      authorizeUrl: (state) => real.authorizeUrl(state),
      exchangeCode: vi.fn(() => Promise.resolve('github-access-token')),
      fetchProfile: vi.fn(() => Promise.resolve(profile)),
    },
  };
  app = await createTestApp({
    env: { ...GITHUB_CONFIG, ...extra },
    overrides: [
      { provide: UsersService, useValue: fakes.users },
      { provide: SessionsService, useValue: fakes.sessions },
      { provide: GithubClient, useValue: fakes.github },
    ],
  });
  return { app, fakes };
}

const setCookies = (headers: Record<string, unknown>): string[] => {
  const value = headers['set-cookie'];
  return Array.isArray(value) ? (value as string[]) : [];
};
const cookieNamed = (headers: Record<string, unknown>, name: string) =>
  setCookies(headers).find((cookie) => cookie.startsWith(`${name}=`));
const oauthCookieFor = (payload: unknown) =>
  `devascent_oauth=${Buffer.from(JSON.stringify(payload)).toString('base64url')}`;

/** Starts the OAuth flow and returns the state and the cookie the browser would send back. */
async function beginLogin(target: INestApplication, next = '/system-design') {
  const res = await http(target).get(`/api/auth/github?next=${encodeURIComponent(next)}`);
  const location = new URL(res.headers.location as string);
  const cookie = cookieNamed(res.headers, 'devascent_oauth')!;
  return { res, location, state: location.searchParams.get('state')!, cookie: cookie.split(';')[0]! };
}

describe('auth', () => {
  it('denies by default', async () => {
    const { app } = await start();
    const res = await http(app).get('/api/me');
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: { code: 'unauthorized' } });
  });

  it('keeps health public', async () => {
    const { app } = await start();
    expect((await http(app).get('/api/health')).status).toBe(200);
  });

  it('redirects to GitHub without scopes', async () => {
    const { app } = await start();
    const { res, location, state } = await beginLogin(app);
    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/^https:\/\/github\.com\/login\/oauth\/authorize\?/);
    expect(location.searchParams.get('client_id')).toBe('<GITHUB_CLIENT_ID>');
    expect(location.searchParams.get('redirect_uri')).toBe('http://localhost:5173/api/auth/github/callback');
    expect(location.searchParams.get('allow_signup')).toBe('false');
    expect(location.searchParams.has('scope')).toBe(false);
    expect(state).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const cookie = cookieNamed(res.headers, 'devascent_oauth')!;
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Lax/);
    expect(cookie).toMatch(/Path=\/api\/auth/);
    const stored = JSON.parse(Buffer.from(cookie.split(';')[0]!.split('=')[1]!, 'base64url').toString()) as {
      state: string;
    };
    expect(stored.state).toBe(state);
  });

  it('rejects a state that does not match the cookie', async () => {
    const { app, fakes } = await start();
    const { cookie } = await beginLogin(app);
    const res = await http(app)
      .get(`/api/auth/github/callback?code=abc&state=${'x'.repeat(43)}`)
      .set('Cookie', cookie);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('http://localhost:5173/login?error=invalid_state');
    expect(cookieNamed(res.headers, 'devascent_session')).toBeUndefined();
    expect(fakes.github.exchangeCode).not.toHaveBeenCalled();
  });

  it.each([
    ['without the OAuth cookie', () => undefined, 'state-of-43-characters-xxxxxxxxxxxxxxxxxxx', 'abc'],
    ['with a cookie that is not base64url JSON', () => 'devascent_oauth=%%%not-base64%%%', 'abc', 'abc'],
    ['with a cookie without state', () => oauthCookieFor({ next: '/' }), 'abc', 'abc'],
    ['with a state of another length', (state: string) => oauthCookieFor({ state, next: '/' }), 'short', 'abc'],
    ['without a code', (state: string) => oauthCookieFor({ state, next: '/' }), null, ''],
  ])('rejects malformed callbacks without a 500: %s', async (_case, cookieFor, stateParam, code) => {
    const { app, fakes } = await start();
    const state = 'y'.repeat(43);
    const cookie = cookieFor(state);
    const query = new URLSearchParams({ code, state: stateParam ?? state });
    let call = http(app).get(`/api/auth/github/callback?${query.toString()}`);
    if (cookie) call = call.set('Cookie', cookie);
    const res = await call;
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('http://localhost:5173/login?error=invalid_state');
    expect(cookieNamed(res.headers, 'devascent_session')).toBeUndefined();
    expect(fakes.github.exchangeCode).not.toHaveBeenCalled();
  });

  it('sanitizes next again on the way back', async () => {
    const { app } = await start();
    const state = 'z'.repeat(43);
    const res = await http(app)
      .get(`/api/auth/github/callback?code=abc&state=${state}`)
      .set('Cookie', oauthCookieFor({ state, next: '//evil.example' }));
    expect(res.headers.location).toBe('http://localhost:5173/');
  });

  it('rejects accounts outside the allowlist', async () => {
    const { app, fakes } = await start({}, { id: 999, login: 'mallory', name: null });
    const { state, cookie } = await beginLogin(app);
    const res = await http(app).get(`/api/auth/github/callback?code=abc&state=${state}`).set('Cookie', cookie);
    expect(res.headers.location).toBe('http://localhost:5173/login?error=not_allowed');
    expect(fakes.users.upsert).not.toHaveBeenCalled();
    expect(cookieNamed(res.headers, 'devascent_session')).toBeUndefined();
  });

  it('signs an allowed account in', async () => {
    const { app, fakes } = await start();
    const { state, cookie } = await beginLogin(app);
    const res = await http(app).get(`/api/auth/github/callback?code=abc&state=${state}`).set('Cookie', cookie);
    expect(fakes.github.exchangeCode).toHaveBeenCalledWith('abc');
    expect(fakes.users.upsert).toHaveBeenCalledWith({
      provider: 'github',
      providerUserId: '123',
      displayName: 'Octo Cat',
    });
    const session = cookieNamed(res.headers, 'devascent_session')!;
    expect(session).toMatch(/^devascent_session=session-token;/);
    expect(session).toMatch(/HttpOnly/);
    expect(session).toMatch(/SameSite=Lax/);
    expect(session).toMatch(/Path=\/;/);
    expect(session).toMatch(/Max-Age=2592000/);
    expect(session).not.toMatch(/Secure/);
    expect(res.headers.location).toBe('http://localhost:5173/system-design');
  });

  it('marks the session cookie Secure in production', async () => {
    const { app } = await start({ NODE_ENV: 'production' });
    const { state, cookie } = await beginLogin(app);
    const res = await http(app).get(`/api/auth/github/callback?code=abc&state=${state}`).set('Cookie', cookie);
    expect(cookieNamed(res.headers, 'devascent_session')).toMatch(/Secure/);
  });

  it('falls back to the login page when GitHub fails', async () => {
    const { app, fakes } = await start();
    fakes.github.exchangeCode.mockRejectedValueOnce(new Error('GitHub token exchange failed with status 502'));
    const { state, cookie } = await beginLogin(app);
    const res = await http(app).get(`/api/auth/github/callback?code=abc&state=${state}`).set('Cookie', cookie);
    expect(res.headers.location).toBe('http://localhost:5173/login?error=github_unavailable');
  });

  it('returns the signed-in user', async () => {
    const { app, fakes } = await start();
    const account: SessionAccount = { id: 'user-1', name: 'Octo Cat', provider: 'github', providerUserId: '123' };
    fakes.sessions.findAccount.mockResolvedValue(account);
    const res = await http(app).get('/api/me').set('Cookie', 'devascent_session=abc');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ user: { id: 'user-1', name: 'Octo Cat' } });
  });

  it('refuses a session whose account left the allowlist', async () => {
    const { app, fakes } = await start();
    fakes.sessions.findAccount.mockResolvedValue({
      id: 'u',
      name: 'Mallory',
      provider: 'github',
      providerUserId: '999',
    });
    const res = await http(app).get('/api/me').set('Cookie', 'devascent_session=abc');
    expect(res.status).toBe(401);
  });

  it('refuses test-login sessions when the test login is off', async () => {
    const { app, fakes } = await start();
    fakes.sessions.findAccount.mockResolvedValue({ id: 'u', name: 'Tester', provider: 'test', providerUserId: '42' });
    const res = await http(app).get('/api/me').set('Cookie', 'devascent_session=abc');
    expect(res.status).toBe(401);
  });

  it('hides the test login unless enabled', async () => {
    const { app } = await start();
    const res = await http(app)
      .post('/api/auth/test-login')
      .set(CSRF_HEADER, '1')
      .send({ githubId: '42', name: 'Tester' });
    expect(res.status).toBe(404);
  });

  it('signs in with the test login when enabled', async () => {
    const { app, fakes } = await start({ AUTH_TEST_LOGIN: 'true' });
    const res = await http(app)
      .post('/api/auth/test-login')
      .set(CSRF_HEADER, '1')
      .send({ githubId: '42', name: 'Tester' });
    expect(res.status).toBe(204);
    expect(fakes.users.upsert).toHaveBeenCalledWith({ provider: 'test', providerUserId: '42', displayName: 'Tester' });
    expect(cookieNamed(res.headers, 'devascent_session')).toMatch(/^devascent_session=session-token;/);
  });

  it('signs out', async () => {
    const { app, fakes } = await start();
    const res = await http(app).post('/api/auth/logout').set(CSRF_HEADER, '1').set('Cookie', 'devascent_session=abc');
    expect(res.status).toBe(204);
    expect(fakes.sessions.delete).toHaveBeenCalledWith('abc');
    expect(cookieNamed(res.headers, 'devascent_session')).toMatch(/Expires=Thu, 01 Jan 1970/);
  });
});
