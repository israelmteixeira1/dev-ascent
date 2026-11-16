import type { ArenaProblem, ProblemAttempt, ProblemSummary, RecordAttemptRequest, RunReport } from '@devascent/domain';
import { api } from './client';

const problemPath = (slug: string) => `/api/arena/problems/${encodeURIComponent(slug)}`;

export function listProblems(track: string, signal?: AbortSignal): Promise<ProblemSummary[]> {
  return api<ProblemSummary[]>(`/api/arena/problems?${new URLSearchParams({ track })}`, { signal });
}

export function getProblem(slug: string, signal?: AbortSignal): Promise<ArenaProblem> {
  return api<ArenaProblem>(problemPath(slug), { signal });
}

export function runSolution(slug: string, source: string): Promise<RunReport> {
  return api<RunReport>(`${problemPath(slug)}/run`, { method: 'POST', body: { source } });
}

export function recordAttempt(slug: string, attempt: RecordAttemptRequest): Promise<ProblemAttempt> {
  return api<ProblemAttempt>(`${problemPath(slug)}/attempts`, { method: 'POST', body: attempt });
}
