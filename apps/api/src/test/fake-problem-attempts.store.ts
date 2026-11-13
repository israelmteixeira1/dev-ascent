import { randomUUID } from 'node:crypto';
import type { NewProblemAttempt, ProblemAttemptRow, ProblemAttemptsStore } from '../arena/problem-attempts.repository';

/** In-memory ProblemAttemptsStore, ordered like the SQL one: by start time, then insertion. */
export class FakeProblemAttemptsStore implements ProblemAttemptsStore {
  readonly rows: ProblemAttemptRow[] = [];

  insert(userId: string, problemSlug: string, attempt: NewProblemAttempt): Promise<ProblemAttemptRow> {
    const row: ProblemAttemptRow = { id: randomUUID(), userId, problemSlug, ...attempt, createdAt: new Date() };
    this.rows.push(row);
    return Promise.resolve({ ...row });
  }

  listByUser(userId: string): Promise<ProblemAttemptRow[]> {
    return Promise.resolve(this.sorted(this.rows.filter((r) => r.userId === userId)));
  }

  listByProblem(userId: string, problemSlug: string): Promise<ProblemAttemptRow[]> {
    return Promise.resolve(this.sorted(this.rows.filter((r) => r.userId === userId && r.problemSlug === problemSlug)));
  }

  private sorted(rows: ProblemAttemptRow[]): ProblemAttemptRow[] {
    return rows.map((r) => ({ ...r })).sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
  }
}
