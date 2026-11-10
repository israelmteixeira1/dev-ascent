import { createHash, randomBytes } from 'node:crypto';

/** 32 bytes from the CSPRNG, in base64url: what the session cookie carries. */
export function generateSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

/** What the database stores in place of the token. */
export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
