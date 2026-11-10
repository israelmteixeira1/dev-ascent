import { describe, expect, it } from 'vitest';
import { generateSessionToken, hashSessionToken } from './tokens';

describe('session tokens', () => {
  it('are 32 random bytes in base64url', () => {
    const a = generateSessionToken();
    const b = generateSessionToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(b);
  });

  it('are stored as a stable SHA-256 hash, never as themselves', () => {
    const token = generateSessionToken();
    const hash = hashSessionToken(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashSessionToken(token)).toBe(hash);
    expect(hash).not.toBe(token);
  });
});
