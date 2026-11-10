import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';
import { mockApi, SIGNED_IN } from './api';

// Every page needs a session: by default the API answers that a user is signed in. Tests about
// other answers call mockApi again, which replaces these handlers.
beforeEach(() => {
  mockApi({ 'GET /api/me': SIGNED_IN });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// React Flow measures nodes with ResizeObserver, which jsdom does not provide.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;
