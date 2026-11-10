import { z } from 'zod';
import { architectureGraphSchema, GRAPH_LIMITS, type ArchitectureGraph } from '../graph/schema';

/** A week of active time: far above any practice session, and it keeps the number bounded. */
export const MAX_ELAPSED_SECONDS = 604_800;

export const ATTEMPT_STATUSES = ['draft', 'submitted'] as const;
export type AttemptStatus = (typeof ATTEMPT_STATUSES)[number];

export const createAttemptRequestSchema = z.object({ challengeSlug: z.string().regex(/^[a-z0-9-]{1,64}$/) });
export type CreateAttemptRequest = z.infer<typeof createAttemptRequestSchema>;

/** `rowVersion` is the version the draft was loaded or last saved at (optimistic concurrency). */
export const saveDraftRequestSchema = z.object({
  graph: architectureGraphSchema,
  explanation: z.string().max(GRAPH_LIMITS.maxExplanationLength),
  elapsedSeconds: z.number().int().min(0).max(MAX_ELAPSED_SECONDS),
  rowVersion: z.number().int().min(1),
});
export type SaveDraftRequest = z.infer<typeof saveDraftRequestSchema>;

export type AttemptSummary = {
  id: string;
  challengeSlug: string;
  status: AttemptStatus;
  createdAt: string;
  updatedAt: string;
};

export type Attempt = AttemptSummary & {
  rowVersion: number;
  draft: { graph: ArchitectureGraph; explanation: string; elapsedSeconds: number };
};

export type SavedDraft = { rowVersion: number; updatedAt: string };

/** What a 409 `draft_conflict` carries: the attempt as it is now on the server. */
export type DraftConflictDetails = { current: Attempt };
