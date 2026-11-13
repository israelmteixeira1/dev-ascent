import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import type { RecordAttemptRequest } from '@devascent/domain';
import { DB, type Db } from '../db/database.module';
import { problemAttempts } from '../db/schema';

export type ProblemAttemptRow = typeof problemAttempts.$inferSelect;
export type NewProblemAttempt = Omit<RecordAttemptRequest, 'startedAt'> & { startedAt: Date };

/** Every query is scoped to the user of the session. Attempts are only ever added. */
export interface ProblemAttemptsStore {
  insert(userId: string, problemSlug: string, attempt: NewProblemAttempt): Promise<ProblemAttemptRow>;
  /** Oldest first, across every problem. */
  listByUser(userId: string): Promise<ProblemAttemptRow[]>;
  /** Oldest first. */
  listByProblem(userId: string, problemSlug: string): Promise<ProblemAttemptRow[]>;
}

export const PROBLEM_ATTEMPTS_STORE = Symbol('PROBLEM_ATTEMPTS_STORE');

@Injectable()
export class ProblemAttemptsRepository implements ProblemAttemptsStore {
  constructor(@Inject(DB) private readonly db: Db) {}

  async insert(userId: string, problemSlug: string, attempt: NewProblemAttempt): Promise<ProblemAttemptRow> {
    const [row] = await this.db
      .insert(problemAttempts)
      .values({ userId, problemSlug, ...attempt })
      .returning();
    return row!;
  }

  listByUser(userId: string): Promise<ProblemAttemptRow[]> {
    return this.db
      .select()
      .from(problemAttempts)
      .where(eq(problemAttempts.userId, userId))
      .orderBy(asc(problemAttempts.startedAt), asc(problemAttempts.createdAt));
  }

  listByProblem(userId: string, problemSlug: string): Promise<ProblemAttemptRow[]> {
    return this.db
      .select()
      .from(problemAttempts)
      .where(and(eq(problemAttempts.userId, userId), eq(problemAttempts.problemSlug, problemSlug)))
      .orderBy(asc(problemAttempts.startedAt), asc(problemAttempts.createdAt));
  }
}
