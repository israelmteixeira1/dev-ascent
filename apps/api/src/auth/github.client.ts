import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { AppConfig } from '../config/env';

export type GithubProfile = { id: number; login: string; name: string | null };

const TIMEOUT_MS = 10_000;
const tokenResponse = z.object({ access_token: z.string().min(1) });
const profileResponse = z.object({
  id: z.number().int().positive(),
  login: z.string().min(1),
  name: z.string().nullable(),
});

/**
 * The GitHub OAuth web flow, by hand. No scope is requested: only the public profile is read.
 * Errors name the HTTP status only, never the token or the response body.
 */
@Injectable()
export class GithubClient {
  constructor(private readonly config: AppConfig) {}

  private get credentials() {
    const github = this.config.env.github;
    if (!github) throw new Error('GitHub sign-in is not configured.');
    return github;
  }

  private get callbackUrl() {
    return `${this.config.env.appOrigin}/api/auth/github/callback`;
  }

  authorizeUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.credentials.clientId,
      redirect_uri: this.callbackUrl,
      state,
      allow_signup: 'false',
    });
    return `https://github.com/login/oauth/authorize?${params.toString()}`;
  }

  async exchangeCode(code: string): Promise<string> {
    const res = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      // Without this header GitHub answers form-encoded.
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: this.credentials.clientId,
        client_secret: this.credentials.clientSecret,
        code,
        redirect_uri: this.callbackUrl,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`GitHub token exchange failed with status ${res.status}`);
    // A refused code answers 200 with an `error` field instead of a token.
    const parsed = tokenResponse.safeParse(await res.json());
    if (!parsed.success) throw new Error('GitHub token exchange did not return a token');
    return parsed.data.access_token;
  }

  async fetchProfile(accessToken: string): Promise<GithubProfile> {
    const res = await fetch('https://api.github.com/user', {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${accessToken}`,
        'User-Agent': 'DevAscent',
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`GitHub profile request failed with status ${res.status}`);
    const parsed = profileResponse.safeParse(await res.json());
    if (!parsed.success) throw new Error('GitHub profile has an unexpected shape');
    return parsed.data;
  }
}
