/**
 * When an arena problem comes back. A cycle is an attempt followed by reviews 1, 3 and 7 days
 * apart; a failed attempt starts a new cycle. Pure on purpose: the schedule is derived from the
 * attempt history every time, so there is no stored due date to keep in sync.
 */

export const ATTEMPT_OUTCOMES = ['passed', 'failed'] as const;
export type AttemptOutcome = (typeof ATTEMPT_OUTCOMES)[number];

/** Days until the next review, after the 1st, 2nd and 3rd attempt of a cycle. */
export const PROBLEM_REVIEW_DAYS = [1, 3, 7] as const;

export type ScheduledAttempt = { startedAt: Date; outcome: AttemptOutcome };

const DAY_MS = 86_400_000;

/**
 * The next review, counted from the start of the latest attempt. Null when the problem was never
 * attempted, or when the last cycle ended with its 7-day review passed: the problem is done.
 * Attempts may come in any order; ties keep the order given.
 */
export function nextProblemReview(attempts: readonly ScheduledAttempt[]): Date | null {
  const history = [...attempts].sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
  const last = history.at(-1);
  if (!last) return null;
  const lastFailure = history.findLastIndex((attempt) => attempt.outcome === 'failed');
  // The cycle runs from the last failure, or from the first attempt when nothing failed.
  const position = history.length - Math.max(lastFailure, 0);
  const days = PROBLEM_REVIEW_DAYS[position - 1];
  return days === undefined ? null : new Date(last.startedAt.getTime() + days * DAY_MS);
}
