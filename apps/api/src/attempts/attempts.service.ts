import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { Attempt, AttemptSummary, DraftConflictDetails, SavedDraft, SaveDraftRequest } from '@devascent/domain';
import { CatalogService } from '../catalog/catalog.service';
import { ApiException } from '../common/api-exception';
import { ATTEMPTS_STORE, type AttemptRow, type AttemptsStore, type AttemptSummaryRow } from './attempts.repository';

const uuid = z.uuid();
const notFound = () => new ApiException(404, 'not_found', 'Attempt not found.');

const toSummary = (row: AttemptSummaryRow): AttemptSummary => ({
  id: row.id,
  challengeSlug: row.challengeSlug,
  status: row.status,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

const toAttempt = (row: AttemptRow): Attempt => ({
  ...toSummary(row),
  rowVersion: row.rowVersion,
  draft: { graph: row.draftGraph, explanation: row.draftExplanation, elapsedSeconds: row.draftElapsedSeconds },
});

@Injectable()
export class AttemptsService {
  constructor(
    @Inject(ATTEMPTS_STORE) private readonly store: AttemptsStore,
    private readonly catalog: CatalogService,
  ) {}

  async create(userId: string, challengeSlug: string): Promise<Attempt> {
    if (!this.catalog.findChallenge(challengeSlug)) throw new ApiException(404, 'not_found', 'Challenge not found.');
    return toAttempt(await this.store.insert(userId, challengeSlug));
  }

  async list(userId: string): Promise<AttemptSummary[]> {
    return (await this.store.listByUser(userId)).map(toSummary);
  }

  /** Another user's attempt answers 404, exactly like one that does not exist. */
  async get(userId: string, id: string): Promise<Attempt> {
    if (!uuid.safeParse(id).success) throw notFound();
    const row = await this.store.findOwned(userId, id);
    if (!row) throw notFound();
    return toAttempt(row);
  }

  async saveDraft(userId: string, id: string, request: SaveDraftRequest): Promise<SavedDraft> {
    if (!uuid.safeParse(id).success) throw notFound();
    const { rowVersion, ...draft } = request;
    const saved = await this.store.updateDraft(userId, id, draft, rowVersion);
    if (saved) return { rowVersion: saved.rowVersion, updatedAt: saved.updatedAt.toISOString() };

    // Nothing matched: tell apart a missing attempt, a submitted one and a stale row version.
    const current = await this.store.findOwned(userId, id);
    if (!current) throw notFound();
    if (current.status === 'submitted') {
      throw new ApiException(409, 'attempt_submitted', 'This attempt was submitted and can no longer change.');
    }
    const details: DraftConflictDetails = { current: toAttempt(current) };
    throw new ApiException(409, 'draft_conflict', 'This attempt changed in another tab.', details);
  }
}
