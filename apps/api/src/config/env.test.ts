import { describe, expect, it } from 'vitest';
import { parseEnv } from './env';

const BASE = { DATABASE_URL: 'postgres://localhost/devascent', APP_ORIGIN: 'http://localhost:5173' };
const GITHUB = { GITHUB_CLIENT_ID: '<GITHUB_CLIENT_ID>', GITHUB_CLIENT_SECRET: '<GITHUB_CLIENT_SECRET>' };

describe('parseEnv', () => {
  it('applies defaults and parses the allowlist', () => {
    const config = parseEnv({ ...BASE, ALLOWED_GITHUB_IDS: '123, 456' });
    expect(config.allowedGithubIds).toEqual(new Set(['123', '456']));
    expect(config).toMatchObject({
      port: 3000,
      nodeEnv: 'development',
      testLogin: false,
      github: null,
      sessionTtlDays: 30,
      appOrigin: 'http://localhost:5173',
    });
  });

  it('refuses the test login in production', () => {
    expect(() => parseEnv({ ...BASE, ...GITHUB, NODE_ENV: 'production', AUTH_TEST_LOGIN: 'true' })).toThrow(
      /AUTH_TEST_LOGIN/,
    );
  });

  it('requires GitHub credentials in production', () => {
    expect(() => parseEnv({ ...BASE, NODE_ENV: 'production' })).toThrow(/GITHUB_CLIENT_ID/);
  });

  it('never echoes values in its errors', () => {
    let message = '';
    try {
      parseEnv({ ...BASE, DATABASE_URL: 'mysql://u:hunter2@x/db' });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain('DATABASE_URL');
    expect(message).not.toContain('hunter2');
  });
});
