import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyGraph, type ArchitectureGraph, type Attempt, type SavedDraft } from '@devascent/domain';
import { ApiError } from '../api/client';
import { useAutosave } from './useAutosave';

const graphWith = (...ids: string[]): ArchitectureGraph => ({
  ...emptyGraph(),
  nodes: ids.map((id) => ({ id, kind: 'service', label: id, position: { x: 0, y: 0 }, props: { replicas: 1 } })),
});

type Props = { graph: ArchitectureGraph; explanation: string; elapsedSeconds: number };
type Save = (id: string, body: unknown, options?: { keepalive?: boolean }) => Promise<SavedDraft>;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// Stable like the canvas history's graph: a new object would count as a change.
const EMPTY = emptyGraph();

const saved = (rowVersion: number): SavedDraft => ({ rowVersion, updatedAt: '2026-11-07T12:00:00.000Z' });

const conflictWith = (rowVersion: number): ApiError => {
  const current: Attempt = {
    id: 'a1',
    challengeSlug: 'payment-gateway',
    status: 'draft',
    createdAt: '2026-11-07T12:00:00.000Z',
    updatedAt: '2026-11-07T12:00:00.000Z',
    rowVersion,
    draft: { graph: graphWith('server'), explanation: 'from the other tab', elapsedSeconds: 5 },
  };
  return new ApiError(409, 'draft_conflict', 'This attempt changed in another tab.', { current });
};

function setup(save: Save, checkSession: () => Promise<boolean> = () => Promise.resolve(true)) {
  const spy = vi.fn(save);
  const hook = renderHook(
    (props: Props) => useAutosave({ attemptId: 'a1', rowVersion: 1, save: spy, checkSession, ...props }),
    {
      initialProps: { graph: EMPTY, explanation: '', elapsedSeconds: 0 },
    },
  );
  return { spy, ...hook };
}

const advance = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

const setVisibility = (state: DocumentVisibilityState) =>
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  setVisibility('visible');
});

describe('useAutosave', () => {
  it('waits 2 s after the last change', async () => {
    const { spy, rerender } = setup(() => Promise.resolve(saved(2)));
    rerender({ graph: graphWith('a'), explanation: '', elapsedSeconds: 0 });
    await advance(1500);
    rerender({ graph: graphWith('a', 'b'), explanation: '', elapsedSeconds: 1 });
    await advance(500);
    expect(spy).not.toHaveBeenCalled();
    await advance(1500);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]![1]).toMatchObject({ graph: graphWith('a', 'b'), rowVersion: 1 });
  });

  it('does not save when only the timer moves', async () => {
    const { spy, rerender } = setup(() => Promise.resolve(saved(2)));
    for (let second = 1; second <= 10; second++) {
      rerender({ graph: EMPTY, explanation: '', elapsedSeconds: second });
      await advance(1000);
    }
    expect(spy).not.toHaveBeenCalled();
  });

  it('sends the current elapsed time with the content', async () => {
    const { spy, rerender } = setup(() => Promise.resolve(saved(2)));
    rerender({ graph: EMPTY, explanation: 'Shard by merchant', elapsedSeconds: 42 });
    await advance(2000);
    expect(spy.mock.calls[0]![1]).toMatchObject({ explanation: 'Shard by merchant', elapsedSeconds: 42 });
  });

  it('keeps one request in flight', async () => {
    const first = deferred<SavedDraft>();
    let pending = 0;
    let maxPending = 0;
    const { spy, rerender, result } = setup((_id, _body) => {
      pending += 1;
      maxPending = Math.max(maxPending, pending);
      const promise = spy.mock.calls.length === 1 ? first.promise : Promise.resolve(saved(3));
      return promise.finally(() => {
        pending -= 1;
      });
    });
    rerender({ graph: graphWith('a'), explanation: '', elapsedSeconds: 0 });
    await advance(2000);
    rerender({ graph: graphWith('a', 'b'), explanation: '', elapsedSeconds: 0 });
    await advance(2000);
    expect(spy).toHaveBeenCalledTimes(1);
    await act(async () => {
      first.resolve(saved(2));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy.mock.calls[1]![1]).toMatchObject({ graph: graphWith('a', 'b'), rowVersion: 2 });
    await advance(0);
    expect(maxPending).toBe(1);
    expect(result.current.status).toBe('saved');
  });

  it('retries with backoff', async () => {
    let calls = 0;
    const { spy, rerender, result } = setup(() => {
      calls += 1;
      return calls === 1
        ? Promise.reject(new ApiError(0, 'service_unavailable', 'offline'))
        : Promise.resolve(saved(2));
    });
    rerender({ graph: graphWith('a'), explanation: '', elapsedSeconds: 0 });
    await advance(2000);
    expect(result.current.status).toBe('retrying');
    await advance(1999);
    expect(spy).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(spy).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe('saved');
  });

  it('stops on conflict and keepMine resends with the server row version', async () => {
    let calls = 0;
    const { spy, rerender, result } = setup(() => {
      calls += 1;
      return calls === 1 ? Promise.reject(conflictWith(7)) : Promise.resolve(saved(8));
    });
    rerender({ graph: graphWith('mine'), explanation: 'my tab', elapsedSeconds: 0 });
    await advance(2000);
    expect(result.current.status).toBe('conflict');
    expect(result.current.conflict?.rowVersion).toBe(7);
    await advance(60_000);
    expect(spy).toHaveBeenCalledTimes(1);

    await act(async () => {
      result.current.keepMine();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy.mock.calls[1]![1]).toMatchObject({ graph: graphWith('mine'), explanation: 'my tab', rowVersion: 7 });
    expect(result.current.status).toBe('saved');
    expect(result.current.conflict).toBeNull();

    rerender({ graph: graphWith('mine', 'more'), explanation: 'my tab', elapsedSeconds: 0 });
    expect(result.current.unsavedChanges).toBe(true);
  });

  it('stops when the session ends and retries after the session is back', async () => {
    let calls = 0;
    let sessionBack = false;
    const { spy, rerender, result } = setup(
      () => {
        calls += 1;
        return calls === 1
          ? Promise.reject(new ApiError(401, 'unauthorized', 'Sign in to continue.'))
          : Promise.resolve(saved(2));
      },
      () => Promise.resolve(sessionBack),
    );
    rerender({ graph: graphWith('a'), explanation: '', elapsedSeconds: 0 });
    await advance(2000);
    expect(result.current.status).toBe('signed_out');
    await advance(60_000);
    expect(spy).toHaveBeenCalledTimes(1);

    await act(async () => {
      window.dispatchEvent(new Event('focus'));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('signed_out');

    sessionBack = true;
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy.mock.calls[1]![1]).toMatchObject({ graph: graphWith('a') });
    expect(result.current.status).toBe('saved');
  });

  it('flushes with keepalive when the tab is hidden', async () => {
    const { spy, rerender } = setup(() => Promise.resolve(saved(2)));
    rerender({ graph: graphWith('a'), explanation: '', elapsedSeconds: 0 });
    await act(async () => {
      setVisibility('hidden');
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]![2]).toEqual({ keepalive: true });
  });

  it('does not chain a second request when the page hides during a save', async () => {
    const first = deferred<SavedDraft>();
    const { spy, rerender, result } = setup(() =>
      spy.mock.calls.length === 1 ? first.promise : Promise.resolve(saved(3)),
    );
    rerender({ graph: graphWith('a'), explanation: '', elapsedSeconds: 0 });
    await advance(2000);
    rerender({ graph: graphWith('a', 'b'), explanation: '', elapsedSeconds: 0 });
    await act(async () => {
      setVisibility('hidden');
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('pagehide'));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(result.current.unsavedChanges).toBe(true);

    await act(async () => {
      first.resolve(saved(2));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy.mock.calls[1]![1]).toMatchObject({ graph: graphWith('a', 'b'), rowVersion: 2 });
  });

  it('does not resend on pagehide after visibilitychange', async () => {
    const { spy, rerender } = setup(() => Promise.resolve(saved(2)));
    rerender({ graph: graphWith('a'), explanation: '', elapsedSeconds: 0 });
    await act(async () => {
      setVisibility('hidden');
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(0);
      window.dispatchEvent(new Event('pagehide'));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('keeps the unsaved warning when a save fails', async () => {
    const { rerender, result } = setup(() => Promise.reject(new ApiError(0, 'service_unavailable', 'offline')));
    rerender({ graph: graphWith('a'), explanation: '', elapsedSeconds: 0 });
    expect(result.current.unsavedChanges).toBe(true);
    await advance(2000);
    expect(result.current.unsavedChanges).toBe(true);
  });

  it('reports saved once the latest revision is confirmed', async () => {
    const { rerender, result } = setup(() => Promise.resolve(saved(2)));
    expect(result.current).toMatchObject({ status: 'saved', unsavedChanges: false });
    rerender({ graph: graphWith('a'), explanation: '', elapsedSeconds: 0 });
    expect(result.current.status).toBe('pending');
    await advance(2000);
    expect(result.current).toMatchObject({ status: 'saved', unsavedChanges: false });
  });
});
