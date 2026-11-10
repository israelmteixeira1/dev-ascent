const MAX_LENGTH = 512;

/**
 * Where to go after signing in. Only a path of this site is accepted: `//host`, `/\host`, absolute
 * URLs and control characters would let a crafted link redirect to another site (open redirect).
 * The API applies it when the flow starts and again when it comes back; the login page applies it too.
 */
export function safeNext(input: unknown): string {
  if (typeof input !== 'string' || input.length > MAX_LENGTH) return '/';
  if (!input.startsWith('/') || input.startsWith('//')) return '/';
  // eslint-disable-next-line no-control-regex -- control characters are exactly what is rejected here
  if (/[\\\u0000-\u001f\u007f]/.test(input)) return '/';
  return input;
}
