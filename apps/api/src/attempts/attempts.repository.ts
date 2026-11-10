import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';
import { emptyGraph, type SaveDraftRequest } from '@devascent/domain';
import { DB, type Db } from '../db/database.module';
import { attempts } from '../db/schema';

export type AttemptRow = typeof attempts.$inferSelect;
export type AttemptSummaryRow = Pick<AttemptRow, 'id' | 'challengeSlug' | 'status' | 'createdAt' | 'updatedAt'>;
export type DraftContent = Omit<SaveDraftRequest, 'rowVersion'>;

/** Every query is scoped to the user of the session: an id alone never reaches another user's row. */
export interface AttemptsStore {
  insert(userId: string, challengeSlug: string): Promise<AttemptRow>;
  /** Most recently updated first. Summaries only: listing never loads every draft graph. */
  listByUser(userId: string): Promise<AttemptSummaryRow[]>;
  findOwned(userId: string, id: string): Promise<AttemptRow | null>;
  /** Saves only if the row is still a draft at `expectedRowVersion`; null when nothing matched. */
  updateDraft(userId: string, id: string, draft: DraftContent, expectedRowVersion: number): Promise<AttemptRow | null>;
}

export const ATTEMPTS_STORE = Symbol('ATTEMPTS_STORE');

@Injectable()
export class AttemptsRepository implements AttemptsStore {
  constructor(@Inject(DB) private readonly db: Db) {}

  async insert(userId: string, challengeSlug: string): Promise<AttemptRow> {
    const [row] = await this.db
      .insert(attempts)
      .values({ userId, challengeSlug, draftGraph: emptyGraph() })
      .returning();
    return row!;
  }

  listByUser(userId: string): Promise<AttemptSummaryRow[]> {
    return this.db
      .select({
        id: attempts.id,
        challengeSlug: attempts.challengeSlug,
        status: attempts.status,
        createdAt: attempts.createdAt,
        updatedAt: attempts.updatedAt,
      })
      .from(attempts)
      .where(eq(attempts.userId, userId))
      .orderBy(desc(attempts.updatedAt));
  }

  async findOwned(userId: string, id: string): Promise<AttemptRow | null> {
    const [row] = await this.db
      .select()
      .from(attempts)
      .where(and(eq(attempts.id, id), eq(attempts.userId, userId)))
      .limit(1);
    return row ?? null;
  }

  async updateDraft(
    userId: string,
    id: string,
    draft: DraftContent,
    expectedRowVersion: number,
  ): Promise<AttemptRow | null> {
    const [row] = await this.db
      .update(attempts)
      .set({
        draftGraph: draft.graph,
        draftExplanation: draft.explanation,
        draftElapsedSeconds: draft.elapsedSeconds,
        rowVersion: sql`${attempts.rowVersion} + 1`,
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(attempts.id, id),
          eq(attempts.userId, userId),
          eq(attempts.status, 'draft'),
          eq(attempts.rowVersion, expectedRowVersion),
        ),
      )
      .returning();
    return row ?? null;
  }
}
