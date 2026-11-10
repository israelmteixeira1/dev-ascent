import { vi } from 'vitest';

export type ApiCall = { method: string; path: string; body: unknown; keepalive: boolean; headers: Headers };
type Reply = { status?: number; body?: unknown };
type Handler = Reply | ((call: ApiCall) => Reply | Promise<Reply>);

export const SIGNED_IN: Reply = { body: { user: { id: 'user-1', name: 'Ada Lovelace' } } };
export const SIGNED_OUT: Reply = {
  status: 401,
  body: { error: { code: 'unauthorized', message: 'Sign in to continue.' } },
};

/**
 * Replaces fetch with handlers keyed by "METHOD /path". Unknown routes answer 404 in the API's
 * error format. Returns the spy, whose calls can be inspected as `ApiCall`s with `callsOf`.
 */
export function mockApi(handlers: Record<string, Handler>) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const call = toCall(input, init);
    const handler = handlers[`${call.method} ${call.path}`];
    const reply: Reply = !handler
      ? { status: 404, body: { error: { code: 'not_found', message: 'Not found.' } } }
      : typeof handler === 'function'
        ? await handler(call)
        : handler;
    const status = reply.status ?? 200;
    return new Response(reply.body === undefined || status === 204 ? null : JSON.stringify(reply.body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  });
}

function toCall(input: RequestInfo | URL, init?: RequestInit): ApiCall {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const text = typeof init?.body === 'string' ? init.body : undefined;
  return {
    method: init?.method ?? 'GET',
    path: new URL(url, 'http://localhost').pathname,
    body: text === undefined ? undefined : (JSON.parse(text) as unknown),
    keepalive: Boolean(init?.keepalive),
    headers: new Headers(init?.headers),
  };
}

/** The calls a mockApi spy received, in order. */
export function callsOf(spy: ReturnType<typeof mockApi>): ApiCall[] {
  return spy.mock.calls.map(([input, init]) => toCall(input, init));
}
