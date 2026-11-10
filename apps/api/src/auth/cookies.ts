import type { CookieOptions, Request } from 'express';
import type { Env } from '../config/env';

export const SESSION_COOKIE = 'devascent_session';
export const OAUTH_COOKIE = 'devascent_oauth';

const OAUTH_TTL_MS = 10 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** A cookie value parsed by cookie-parser, or undefined. */
export function readCookie(request: Request, name: string): string | undefined {
  const cookies = request.cookies as Record<string, unknown> | undefined;
  const value = cookies?.[name];
  return typeof value === 'string' && value !== '' ? value : undefined;
}

const base = (config: Env): CookieOptions => ({
  httpOnly: true,
  sameSite: 'lax',
  secure: config.nodeEnv === 'production',
});

export const sessionCookieOptions = (config: Env): CookieOptions => ({
  ...base(config),
  path: '/',
  maxAge: config.sessionTtlDays * DAY_MS,
});

/** Lax still sends it on the top-level GET that comes back from GitHub. */
export const oauthCookieOptions = (config: Env): CookieOptions => ({
  ...base(config),
  path: '/api/auth',
  maxAge: OAUTH_TTL_MS,
});

/** Options for clearing a cookie must match the path it was set with. */
export const clearOptions = (options: CookieOptions): CookieOptions => {
  const { maxAge: _maxAge, ...rest } = options;
  return rest;
};
