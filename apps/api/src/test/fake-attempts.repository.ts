import { randomUUID } from 'node:crypto';
import { emptyGraph } from '@devascent/domain';
import type { AttemptRow, AttemptsStore, AttemptSummaryRow, DraftContent } from '../attempts/attempts.repository';

/** In-memory AttemptsStore with the same conditional-update semantics as the SQL one. */
export class FakeAttemptsStore implements AttemptsStore {
  readonly rows: AttemptRow[] = [];
  private tick = 0;

  private now(): Date {
    this.tick += 1;
    return new Date(Date.UTC(2026, 10, 7, 12, 0, this.tick));
  }

  insert(userId: string, challengeSlug: string): Promise<AttemptRow> {
    const at = this.now();
    const row: AttemptRow = {
      id: randomUUID(),
      userId,
      challengeSlug,
      status: 'draft',
      draftGraph: emptyGraph(),
      draftExplanation: '',
      draftElapsedSeconds: 0,
      rowVersion: 1,
      createdAt: at,
      updatedAt: at,
    };
    this.rows.push(row);
    return Promise.resolve({ ...row });
  }

  listByUser(userId: string): Promise<AttemptSummaryRow[]> {
    return Promise.resolve(
      this.rows
        .filter((row) => row.userId === userId)
        .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
        .map(({ id, challengeSlug, status, createdAt, updatedAt }) => ({
          id,
          challengeSlug,
          status,
          createdAt,
          updatedAt,
        })),
    );
  }

  findOwned(userId: string, id: string): Promise<AttemptRow | null> {
    const row = this.rows.find((r) => r.id === id && r.userId === userId);
    return Promise.resolve(row ? { ...row } : null);
  }

  updateDraft(userId: string, id: string, draft: DraftContent, expectedRowVersion: number): Promise<AttemptRow | null> {
    const row = this.rows.find(
      (r) => r.id === id && r.userId === userId && r.status === 'draft' && r.rowVersion === expectedRowVersion,
    );
    if (!row) return Promise.resolve(null);
    Object.assign(row, {
      draftGraph: draft.graph,
      draftExplanation: draft.explanation,
      draftElapsedSeconds: draft.elapsedSeconds,
      rowVersion: row.rowVersion + 1,
      updatedAt: this.now(),
    });
    return Promise.resolve({ ...row });
  }
}
