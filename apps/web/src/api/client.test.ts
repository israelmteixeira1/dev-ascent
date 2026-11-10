import { afterEach, describe, expect, it, vi } from 'vitest';
import { callsOf, mockApi } from '../test/api';
import { api, ApiError } from './client';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('api client', () => {
  it('sends JSON with credentials and the CSRF header', async () => {
    const spy = mockApi({ 'POST /api/attempts': { status: 201, body: { id: 'a1' } } });
    await expect(api('/api/attempts', { method: 'POST', body: { challengeSlug: 'x' } })).resolves.toEqual({ id: 'a1' });
    const init = spy.mock.calls[0]![1]!;
    expect(init.credentials).toBe('same-origin');
    const [call] = callsOf(spy);
    expect(call!.headers.get('content-type')).toBe('application/json');
    expect(call!.headers.get('x-devascent-csrf')).toBe('1');
    expect(call!.body).toEqual({ challengeSlug: 'x' });
  });

  it('turns the error format into ApiError', async () => {
    mockApi({
      'PUT /api/x': {
        status: 409,
        body: { error: { code: 'draft_conflict', message: 'Changed elsewhere.', details: { current: 1 } } },
      },
    });
    const error = await api('/api/x', { method: 'PUT', body: {} }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 409, code: 'draft_conflict', details: { current: 1 } });
  });

  it('turns a non-JSON failure into service_unavailable', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('<html>Bad gateway</html>', { status: 502 }));
    await expect(api('/api/x')).rejects.toMatchObject({ status: 502, code: 'service_unavailable' });
  });

  it('turns a network failure into service_unavailable', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(api('/api/x')).rejects.toMatchObject({ status: 0, code: 'service_unavailable' });
  });

  it('uses keepalive only for small bodies, measured in bytes', async () => {
    const spy = mockApi({ 'PUT /api/x': { body: {} } });
    await api('/api/x', { method: 'PUT', body: { text: 'a'.repeat(50_000) }, keepalive: true });
    await api('/api/x', { method: 'PUT', body: { text: 'ç'.repeat(40_000) }, keepalive: true });
    expect(callsOf(spy).map((call) => call.keepalive)).toEqual([true, false]);
  });
});
