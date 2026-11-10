import { randomBytes, timingSafeEqual } from 'node:crypto';
import { Body, Controller, Get, HttpCode, Post, Query, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { safeNext, type SessionUser } from '@devascent/domain';
import { ApiException } from '../common/api-exception';
import { parseBody } from '../common/parse-body';
import { Public } from '../common/public.decorator';
import { AppConfig } from '../config/env';
import {
  clearOptions,
  OAUTH_COOKIE,
  oauthCookieOptions,
  readCookie,
  SESSION_COOKIE,
  sessionCookieOptions,
} from './cookies';
import { CurrentUser } from './current-user.decorator';
import { GithubClient } from './github.client';
import { SessionsService } from './sessions.service';
import { UsersService } from './users.service';

const AUTH_RATE_LIMIT = { default: { limit: 20, ttl: 60_000 } };

const oauthCookieSchema = z.object({ state: z.string().min(1).max(100), next: z.string().max(512) });
type OauthCookie = z.infer<typeof oauthCookieSchema>;

const testLoginSchema = z.object({ githubId: z.string().regex(/^\d{1,20}$/), name: z.string().min(1).max(80) });

function encodeOauthCookie(value: OauthCookie): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function decodeOauthCookie(raw: string | undefined): OauthCookie | null {
  if (!raw) return null;
  try {
    const parsed = oauthCookieSchema.safeParse(JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** timingSafeEqual throws on buffers of different lengths, so the length is compared first. */
function sameState(received: string, stored: string): boolean {
  const a = Buffer.from(received);
  const b = Buffer.from(stored);
  return a.length === b.length && timingSafeEqual(a, b);
}

@Controller()
export class AuthController {
  constructor(
    private readonly config: AppConfig,
    private readonly users: UsersService,
    private readonly sessions: SessionsService,
    private readonly github: GithubClient,
  ) {}

  @Public()
  @Throttle(AUTH_RATE_LIMIT)
  @Get('auth/github')
  start(@Query('next') next: unknown, @Res() res: Response): void {
    if (!this.config.env.github) {
      throw new ApiException(503, 'service_unavailable', 'GitHub sign-in is not configured.');
    }
    const state = randomBytes(32).toString('base64url');
    res.cookie(OAUTH_COOKIE, encodeOauthCookie({ state, next: safeNext(next) }), oauthCookieOptions(this.config.env));
    res.redirect(302, this.github.authorizeUrl(state));
  }

  /** Always a redirect: back to where the user was going, or to the login page with a reason. */
  @Public()
  @Throttle(AUTH_RATE_LIMIT)
  @Get('auth/github/callback')
  async callback(
    @Query('code') code: unknown,
    @Query('state') state: unknown,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const redirect = (path: string) => res.redirect(302, `${this.config.env.appOrigin}${path}`);
    const stored = decodeOauthCookie(readCookie(req, OAUTH_COOKIE));
    res.clearCookie(OAUTH_COOKIE, clearOptions(oauthCookieOptions(this.config.env)));

    if (
      !stored ||
      typeof state !== 'string' ||
      typeof code !== 'string' ||
      code === '' ||
      !sameState(state, stored.state)
    ) {
      return redirect('/login?error=invalid_state');
    }
    if (!this.config.env.github) return redirect('/login?error=github_unavailable');

    let profile;
    try {
      // The access token lives only inside this request: it is never stored nor logged.
      profile = await this.github.fetchProfile(await this.github.exchangeCode(code));
    } catch {
      return redirect('/login?error=github_unavailable');
    }
    if (!this.config.env.allowedGithubIds.has(String(profile.id))) return redirect('/login?error=not_allowed');

    const user = await this.users.upsert({
      provider: 'github',
      providerUserId: String(profile.id),
      displayName: profile.name ?? profile.login,
    });
    await this.startSession(res, user.id);
    return redirect(safeNext(stored.next));
  }

  @Public()
  @Throttle(AUTH_RATE_LIMIT)
  @Post('auth/logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    const token = readCookie(req, SESSION_COOKIE);
    if (token) await this.sessions.delete(token);
    res.clearCookie(SESSION_COOKIE, clearOptions(sessionCookieOptions(this.config.env)));
  }

  @Get('me')
  me(@CurrentUser() user: SessionUser): { user: SessionUser } {
    return { user };
  }

  /** For end-to-end tests only: absent unless AUTH_TEST_LOGIN=true, which production refuses. */
  @Public()
  @Throttle(AUTH_RATE_LIMIT)
  @Post('auth/test-login')
  @HttpCode(204)
  async testLogin(@Body() body: unknown, @Res({ passthrough: true }) res: Response): Promise<void> {
    if (!this.config.env.testLogin) throw new ApiException(404, 'not_found', 'Not found.');
    const input = parseBody(testLoginSchema, body);
    const user = await this.users.upsert({ provider: 'test', providerUserId: input.githubId, displayName: input.name });
    await this.startSession(res, user.id);
  }

  private async startSession(res: Response, userId: string): Promise<void> {
    const { token } = await this.sessions.create(userId);
    res.cookie(SESSION_COOKIE, token, sessionCookieOptions(this.config.env));
  }
}
