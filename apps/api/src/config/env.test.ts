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

  it('runs the judge locally outside production and turns it off in production', () => {
    expect(parseEnv(BASE).judge).toEqual({ mode: 'local', pythonBin: null, dockerImage: 'python:3.12-slim' });
    expect(parseEnv({ ...BASE, ...GITHUB, NODE_ENV: 'production' }).judge).toMatchObject({ mode: 'disabled' });
    expect(parseEnv({ ...BASE, JUDGE_MODE: 'disabled', PYTHON_BIN: 'C:\\Python311\\python.exe' }).judge).toMatchObject({
      mode: 'disabled',
      pythonBin: 'C:\\Python311\\python.exe',
    });
  });

  it('refuses to run the judge without isolation in production', () => {
    expect(() => parseEnv({ ...BASE, ...GITHUB, NODE_ENV: 'production', JUDGE_MODE: 'local' })).toThrow(
      /Invalid configuration: JUDGE_MODE$/,
    );
  });

  it('runs the judge in Docker in production, with the image it is given', () => {
    const server = { ...BASE, ...GITHUB, NODE_ENV: 'production', JUDGE_MODE: 'docker' };
    expect(parseEnv(server).judge).toEqual({ mode: 'docker', pythonBin: null, dockerImage: 'python:3.12-slim' });
    expect(parseEnv({ ...server, JUDGE_DOCKER_IMAGE: 'ghcr.io/me/judge@sha256:abc123' }).judge.dockerImage).toBe(
      'ghcr.io/me/judge@sha256:abc123',
    );
  });

  it('refuses an image that would be read as a docker option', () => {
    expect(() => parseEnv({ ...BASE, JUDGE_DOCKER_IMAGE: '--privileged' })).toThrow(/JUDGE_DOCKER_IMAGE/);
    expect(() => parseEnv({ ...BASE, JUDGE_DOCKER_IMAGE: 'python 3' })).toThrow(/JUDGE_DOCKER_IMAGE/);
  });

  it('refuses an unknown judge mode', () => {
    expect(() => parseEnv({ ...BASE, JUDGE_MODE: 'sandbox' })).toThrow(/JUDGE_MODE/);
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
