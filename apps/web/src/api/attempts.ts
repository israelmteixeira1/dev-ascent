import type { Attempt, AttemptSummary, SavedDraft, SaveDraftRequest } from '@devascent/domain';
import { api } from './client';

const path = (id: string) => `/api/attempts/${encodeURIComponent(id)}`;

export function createAttempt(challengeSlug: string): Promise<Attempt> {
  return api<Attempt>('/api/attempts', { method: 'POST', body: { challengeSlug } });
}

/** The user's attempts, most recently updated first. */
export function listAttempts(signal?: AbortSignal): Promise<AttemptSummary[]> {
  return api<AttemptSummary[]>('/api/attempts', { signal });
}

export function getAttempt(id: string, signal?: AbortSignal): Promise<Attempt> {
  return api<Attempt>(path(id), { signal });
}

export function saveDraft(
  id: string,
  body: SaveDraftRequest,
  options: { keepalive?: boolean } = {},
): Promise<SavedDraft> {
  return api<SavedDraft>(`${path(id)}/draft`, { method: 'PUT', body, keepalive: options.keepalive });
}
